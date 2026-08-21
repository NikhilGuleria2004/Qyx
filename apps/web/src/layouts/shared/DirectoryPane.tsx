import { useState } from 'react';
import { ChevronRight, Users, Hash, MessageSquare, X, Settings, Shield, FileText, Monitor, KeyRound, Bell } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { InspectorContent } from './InspectorPane';

function AdminNav({ userRole }: { userRole?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const role = userRole || 'employee';

  if (role !== 'super_admin' && role !== 'admin') return null;

  const items: { view: string; label: string; icon: React.ReactNode }[] = [
    { view: '/admin/members', label: 'Members', icon: <Users size={12} className="mr-2" /> },
    { view: '/admin/groups', label: 'Groups', icon: <Users size={12} className="mr-2" /> },
    { view: '/admin/channels', label: 'Channels', icon: <Hash size={12} className="mr-2" /> },
    { view: '/admin/requests', label: 'Requests', icon: <Shield size={12} className="mr-2" /> },
    { view: '/admin/settings', label: 'Org Settings', icon: <Settings size={12} className="mr-2" /> },
    { view: '/admin/security', label: 'Security Center', icon: <Shield size={12} className="mr-2" /> },
    { view: '/admin/audit', label: 'Audit Log', icon: <FileText size={12} className="mr-2" /> },
    { view: '/admin/devices', label: 'Devices', icon: <Monitor size={12} className="mr-2" /> },
    { view: '/admin/sso', label: 'SSO', icon: <KeyRound size={12} className="mr-2" /> },
    { view: '/admin/alerts', label: 'Alerts', icon: <Bell size={12} className="mr-2" /> },
  ];

  return (
    <div className="mb-2">
      <div className="flex items-center px-2 py-1 text-xs font-medium text-text-secondary">
        <Shield size={12} className="mr-1" />
        <span>Admin</span>
      </div>
      <div className="ml-4 mt-1 space-y-1">
        {items.map((item) => (
          <button key={item.view} onClick={() => navigate(item.view)} className={`flex items-center w-full px-2 py-1 text-xs ${location.pathname === item.view ? 'text-text-primary bg-raised' : 'text-text-dim hover:text-text-primary'}`}>
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function DirectoryPane({ userRole }: { userRole?: string }) {
  const [open, setOpen] = useState(true);
  const [mobileView, setMobileView] = useState<'directory' | 'buffer' | 'inspector'>('buffer');

  return (
    <>
      <div className="hidden lg:flex lg:w-64">
        {open && (
          <div className="flex h-full w-full flex-col border-r border-hairline bg-surface">
            <div className="flex h-9 items-center border-b border-hairline px-3">
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Directory</span>
              <button onClick={() => setOpen(false)} className="ml-auto text-text-dim hover:text-text-primary" aria-label="Close directory pane">
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <div className="mb-2">
                <div className="flex items-center px-2 py-1 text-xs font-medium text-text-secondary">
                  <ChevronRight size={12} className="mr-1" />
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
                  <ChevronRight size={12} className="mr-1" />
                  <span>Groups</span>
                </div>
                <div className="ml-4 mt-1">
                  <div className="flex items-center px-2 py-1 text-xs text-text-dim">
                    <Users size={12} className="mr-2" />
                    <span>Engineering Lead</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center px-2 py-1 text-xs font-medium text-text-secondary">
                  <ChevronRight size={12} className="mr-1" />
                  <span>Direct</span>
                </div>
                <div className="ml-4 mt-1">
                  <div className="flex items-center px-2 py-1 text-xs text-text-dim">
                    <MessageSquare size={12} className="mr-2" />
                    <span>sarah.w</span>
                  </div>
                </div>
              </div>
              <AdminNav userRole={userRole} />
            </div>
          </div>
        )}
        {!open && (
          <button onClick={() => setOpen(true)} className="flex h-full w-8 flex-col items-center justify-center border-r border-hairline bg-surface text-text-dim hover:text-text-primary" aria-label="Open directory pane">
            <Settings size={14} />
          </button>
        )}
      </div>
      <div className="fixed inset-0 z-40 bg-void lg:hidden">
        {mobileView === 'directory' && (
          <div className="flex h-full w-full flex-col">
            <div className="flex h-9 items-center border-b border-hairline px-3">
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Directory</span>
              <button onClick={() => setMobileView('buffer')} className="ml-auto text-text-dim hover:text-text-primary">
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <div className="mb-2">
                <div className="flex items-center px-2 py-1 text-xs font-medium text-text-secondary">
                  <ChevronRight size={12} className="mr-1" />
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
                  <ChevronRight size={12} className="mr-1" />
                  <span>Groups</span>
                </div>
                <div className="ml-4 mt-1">
                  <div className="flex items-center px-2 py-1 text-xs text-text-dim">
                    <Users size={12} className="mr-2" />
                    <span>Engineering Lead</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center px-2 py-1 text-xs font-medium text-text-secondary">
                  <ChevronRight size={12} className="mr-1" />
                  <span>Direct</span>
                </div>
                <div className="ml-4 mt-1">
                  <div className="flex items-center px-2 py-1 text-xs text-text-dim">
                    <MessageSquare size={12} className="mr-2" />
                    <span>sarah.w</span>
                  </div>
                </div>
              </div>
              <AdminNav userRole={userRole} />
            </div>
          </div>
        )}
        {mobileView === 'inspector' && (
          <div className="flex h-full w-full flex-col">
            <div className="flex h-9 items-center border-b border-hairline px-3">
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Inspector</span>
              <button onClick={() => setMobileView('buffer')} className="ml-auto text-text-dim hover:text-text-primary">
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              <InspectorContent />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
