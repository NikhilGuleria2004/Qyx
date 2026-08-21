import { useNavigate } from 'react-router-dom';
import { RoleMismatchBanner } from '../../../layouts/shared/RoleMismatchBanner';
import { ADMIN_NAV_ITEMS } from '../../../lib/roles';
import { logout } from '../../../lib/auth';

export default function SuperAdminHome() {
  const navigate = useNavigate();
  async function handleLogout() { await logout(); navigate('/login'); }
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
          <div className="space-y-1 text-xs text-text-dim">
            <div>organizations: 12</div>
            <div>active users: 1,248</div>
            <div>pending verifications: 3</div>
            <div>failed logins (24h): 7</div>
            <div>pending device authorizations: 2</div>
          </div>
        </div>
        <div className="text-xs font-medium text-text-secondary mb-2">QUICK LINKS</div>
        <div className="space-y-1">
          {ADMIN_NAV_ITEMS.map((item) => (
            <a key={item.path} href={item.path.replace('/admin', '/superadmin')} className="block rounded-sm border border-hairline px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-raised">
              {item.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
