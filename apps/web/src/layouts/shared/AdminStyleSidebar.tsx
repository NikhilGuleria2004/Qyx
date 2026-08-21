import { useNavigate, useLocation } from 'react-router-dom';
import { Users, Hash, Shield, Settings, FileText, Monitor, KeyRound, Bell, Plus, MessageSquare } from 'lucide-react';
import { ADMIN_NAV_ITEMS } from '../../lib/roles';
import { can, type BackendRole } from '../../lib/roles';

const ICONS: Record<string, React.ReactNode> = {
  Members: <Users size={12} className="mr-2" />,
  Groups: <Users size={12} className="mr-2" />,
  Channels: <Hash size={12} className="mr-2" />,
  Requests: <Shield size={12} className="mr-2" />,
  'Org Settings': <Settings size={12} className="mr-2" />,
  'Security Center': <Shield size={12} className="mr-2" />,
  'Audit Log': <FileText size={12} className="mr-2" />,
  Devices: <Monitor size={12} className="mr-2" />,
  SSO: <KeyRound size={12} className="mr-2" />,
  Alerts: <Bell size={12} className="mr-2" />,
};

export function AdminStyleSidebar({ basePath, userRole }: { basePath: string; userRole?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const role = userRole || 'employee';

  const items = ADMIN_NAV_ITEMS.filter((item) => can(role as BackendRole, item.permission));

  return (
    <div className="hidden lg:flex lg:w-64">
      <div className="flex h-full w-full flex-col border-r border-hairline bg-surface">
        <div className="flex h-9 items-center border-b border-hairline px-3">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Directory</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <div className="mb-2">
            <div className="flex items-center px-2 py-1 text-xs font-medium text-text-secondary">
              <span>ACME CORP</span>
            </div>
            <div className="ml-4 mt-1">
              <div className="flex items-center px-2 py-1 text-xs text-text-dim">
                <Hash size={12} className="mr-2" />
                <span>general</span>
              </div>
              <div className="flex items-center px-2 py-1 text-xs text-text-primary bg-raised">
                <Hash size={12} className="mr-2" />
                <span>engineering</span>
              </div>
            </div>
          </div>
          <div className="mb-2">
            <div className="flex items-center px-2 py-1 text-xs font-medium text-text-secondary">
              <span>Groups</span>
            </div>
            <div className="ml-4 mt-1">
              <div className="flex items-center px-2 py-1 text-xs text-text-dim">
                <Users size={12} className="mr-2" />
                <span>Engineering Lead</span>
              </div>
            </div>
          </div>
          <div className="mb-2">
            <div className="flex items-center px-2 py-1 text-xs font-medium text-text-secondary">
              <span>Direct</span>
            </div>
            <div className="ml-4 mt-1">
              <div className="flex items-center px-2 py-1 text-xs text-text-dim">
                <MessageSquare size={12} className="mr-2" />
                <span>sarah.w</span>
              </div>
            </div>
          </div>
          {role === 'super_admin' && (
            <div className="mb-2">
              <button
                onClick={() => navigate('/superadmin/organizations')}
                className="flex items-center w-full px-2 py-1 text-xs text-text-dim hover:text-text-primary"
              >
                <Plus size={12} className="mr-2" />
                <span>Create Organization</span>
              </button>
            </div>
          )}
          <div className="mb-2">
            <div className="flex items-center px-2 py-1 text-xs font-medium text-text-secondary">
              <Shield size={12} className="mr-1" />
              <span>Admin</span>
            </div>
            <div className="ml-4 mt-1 space-y-1">
              {items.map((item) => {
                const path = `${basePath}${item.path.replace('/admin', '')}`;
                const isActive = location.pathname === path;
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(path)}
                    className={`flex items-center w-full px-2 py-1 text-xs ${
                      isActive ? 'text-text-primary bg-raised' : 'text-text-dim hover:text-text-primary'
                    }`}
                  >
                    {ICONS[item.label]}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
