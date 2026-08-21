import { RoleMismatchBanner } from '../../../layouts/shared/RoleMismatchBanner';
import { ADMIN_NAV_ITEMS } from '../../../lib/roles';
import { can, type BackendRole } from '../../../lib/roles';

export default function AdminHome() {
  const role = (typeof window !== 'undefined' ? (JSON.parse(localStorage.getItem('qyx-auth') || '{}')?.user?.role as BackendRole) : undefined) || 'admin';

  const quickLinks = ADMIN_NAV_ITEMS.filter((item) => can(role, item.permission));

  return (
    <div className="flex h-full w-full flex-col bg-void text-text-primary font-mono">
      <div className="p-3">
        <RoleMismatchBanner />
        <div className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">Admin Home</div>
        <div className="text-xs text-text-dim mb-3">Welcome back. Here are the areas you have access to:</div>
        <div className="space-y-1">
          {quickLinks.map((item) => (
            <a key={item.path} href={item.path} className="block rounded-sm border border-hairline px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-raised">
              {item.label}
            </a>
          ))}
          {quickLinks.length === 0 && (
            <div className="text-xs text-text-dim">No admin areas available for your role.</div>
          )}
        </div>
      </div>
    </div>
  );
}
