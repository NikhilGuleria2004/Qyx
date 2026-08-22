import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { RoleMismatchBanner } from '../../../layouts/shared/RoleMismatchBanner';
import { ADMIN_NAV_ITEMS, can } from '../../../lib/roles';
import { logout } from '../../../lib/auth';
import { useAuthStore } from '../../../stores/authStore';
import { getSecuritySummary } from '../../admin/api/adminApi';

interface OrgSecuritySummary {
  org_id: string;
  mfa_adoption: { total: number; enabled: number; percentage: number };
  device_verification: { total: number; active: number; pending: number; percentage: number };
  suspended_accounts: number;
  active_sessions: number;
}

export default function AdminHome() {
  const role = useAuthStore((s) => s.user?.role) ?? 'employee';
  const orgId = useAuthStore((s) => s.user?.orgId);
  const [summary, setSummary] = useState<OrgSecuritySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  async function handleLogout() { await logout(); navigate('/login'); }

  const quickLinks = ADMIN_NAV_ITEMS.filter((item) => can(role, item.permission));
  const showSecurityStats = can(role, 'security:read');

  useEffect(() => {
    if (!showSecurityStats || !orgId) return;
    const capturedOrgId = orgId;
    let cancelled = false;
    async function fetchSummary() {
      setLoading(true);
      try {
        const token = useAuthStore.getState().accessToken;
        if (!token) return;
        const res = await getSecuritySummary(capturedOrgId, token);
        if (!cancelled) setSummary(res);
      } catch {
        // silently fail — stats are non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchSummary();
    return () => { cancelled = true; };
  }, [orgId, showSecurityStats]);

  return (
    <div className="flex h-full w-full flex-col bg-void text-text-primary font-mono">
      <div className="p-3">
        <div className="flex items-center justify-between mb-3">
          <RoleMismatchBanner />
          <button onClick={handleLogout} className="text-xs text-text-dim hover:text-text-primary border border-hairline rounded px-2 py-1">Logout</button>
        </div>
        <div className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">Admin Home</div>
        {showSecurityStats && (
          <div className="mb-4 rounded-sm border border-hairline bg-surface p-3">
            <div className="text-xs font-medium text-text-secondary mb-2">ORG SECURITY</div>
            {loading ? (
              <div className="text-xs text-text-dim">Loading...</div>
            ) : summary ? (
              <div className="space-y-1 text-xs text-text-dim">
                <div>MFA adoption: {summary.mfa_adoption.percentage}% ({summary.mfa_adoption.enabled}/{summary.mfa_adoption.total})</div>
                <div>device verification: {summary.device_verification.percentage}% ({summary.device_verification.active}/{summary.device_verification.total})</div>
                <div>pending devices: {summary.device_verification.pending}</div>
                <div>active sessions: {summary.active_sessions}</div>
                <div>suspended accounts: {summary.suspended_accounts}</div>
              </div>
            ) : (
              <div className="text-xs text-text-dim">No security data available</div>
            )}
          </div>
        )}
        <div className="text-xs text-text-dim mb-3">Welcome back. Here are the areas you have access to:</div>
        <div className="space-y-1">
          {quickLinks.map((item) => (
            <Link key={item.segment} to={`/admin/${item.segment}`} className="block rounded-sm border border-hairline px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-raised">
              {item.label}
            </Link>
          ))}
          {quickLinks.length === 0 && (
            <div className="text-xs text-text-dim">No admin areas available for your role.</div>
          )}
        </div>
      </div>
    </div>
  );
}
