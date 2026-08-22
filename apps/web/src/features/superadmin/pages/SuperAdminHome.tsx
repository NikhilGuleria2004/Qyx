import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { RoleMismatchBanner } from '../../../layouts/shared/RoleMismatchBanner';
import { ADMIN_NAV_ITEMS } from '../../../lib/roles';
import { logout } from '../../../lib/auth';
import { useAuthStore } from '../../../stores/authStore';
import { getPlatformSummary } from '../../admin/api/adminApi';

interface PlatformSummary {
  total_organizations: number;
  active_users: number;
  pending_verifications: number;
  failed_logins_24h: number;
  pending_device_authorizations: number;
}

export default function SuperAdminHome() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  async function handleLogout() { await logout(); navigate('/login'); }

  useEffect(() => {
    let cancelled = false;
    async function fetchSummary() {
      try {
        const token = useAuthStore.getState().accessToken;
        if (!token) { setError('Not authenticated'); setLoading(false); return; }
        const res = await getPlatformSummary(token);
        if (!cancelled) {
          setSummary(res.summary);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : 'Failed to load'); setLoading(false); }
      }
    }
    fetchSummary();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex h-full w-full flex-col bg-void text-text-primary font-mono">
      <div className="p-3">
        <div className="flex items-center justify-between mb-3">
          <RoleMismatchBanner />
          <button onClick={handleLogout} className="text-xs text-text-dim hover:text-text-primary border border-hairline rounded px-2 py-1">Logout</button>
        </div>
        <div className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">Super Admin Home</div>
        <div className="mb-4 rounded-sm border border-hairline bg-surface p-3">
          <div className="text-xs font-medium text-text-secondary mb-2">ORG HEALTH SUMMARY</div>
          {loading ? (
            <div className="text-xs text-text-dim">Loading...</div>
          ) : error ? (
            <div className="text-xs text-text-dim">{error}</div>
          ) : summary ? (
            <div className="space-y-1 text-xs text-text-dim">
              <div>organizations: {summary.total_organizations}</div>
              <div>active users: {summary.active_users}</div>
              <div>pending verifications: {summary.pending_verifications}</div>
              <div>failed logins (24h): {summary.failed_logins_24h}</div>
              <div>pending device authorizations: {summary.pending_device_authorizations}</div>
            </div>
          ) : (
            <div className="text-xs text-text-dim">No data available</div>
          )}
        </div>
        <div className="text-xs font-medium text-text-secondary mb-2">QUICK LINKS</div>
        <div className="space-y-1">
          {ADMIN_NAV_ITEMS.map((item) => (
            <Link key={item.segment} to={`/superadmin/${item.segment}`} className="block rounded-sm border border-hairline px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-raised">
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
