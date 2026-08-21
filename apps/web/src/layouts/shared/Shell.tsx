import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { logout } from '../../lib/auth';
import { can, type BackendRole } from '../../lib/roles';

function StatusBar({ user, onLogout }: { user: { display_name?: string; email?: string; role?: string } | null; onLogout: () => void }) {
  const display = user?.display_name || user?.email || 'local';
  return (
    <div className="h-7 bg-surface border-t border-hairline flex items-center px-3 text-xs text-text-dim shrink-0">
      <span className="text-signal-cipher mr-2">●</span>
      <span>connected</span>
      <span className="mx-3">│</span>
      <span>e2ee active</span>
      <span className="mx-3">│</span>
      <span className="mr-2">{display}</span>
      <button onClick={onLogout} className="text-text-dim hover:text-text-primary" aria-label="Logout">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>
      <span className="ml-auto">local</span>
    </div>
  );
}

const COMMAND_ITEMS = [
  { label: 'Jump to conversation...', permission: 'conversations:read' },
  { label: 'Open directory', permission: 'org:read' },
  { label: 'Admin dashboard', permission: 'org:read', path: (role: BackendRole) => role === 'super_admin' ? '/superadmin' : '/admin' },
  { label: 'Security center', permission: 'security:read', path: (role: BackendRole) => role === 'super_admin' ? '/superadmin/security' : '/admin/security' },
];

function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const role = (user?.role as BackendRole) || 'employee';

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!open) return null;

  const filtered = COMMAND_ITEMS.filter((item) => can(role, item.permission));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg">
        <div className="rounded-sm border border-hairline bg-surface shadow-lg">
          <input
            autoFocus
            placeholder="Type a command or search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-dim focus:outline-none"
          />
          <div className="border-t border-hairline">
            {filtered.map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  if (item.path) {
                    navigate(item.path(role));
                  }
                  setOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-xs text-text-secondary hover:bg-raised hover:text-text-primary"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setOpen(false)} className="absolute -top-2 -right-2 text-text-dim hover:text-text-primary" aria-label="Close command palette">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
  );
}

export function Shell({ sidebar, children, inspector }: { sidebar: React.ReactNode; children: React.ReactNode; inspector?: React.ReactNode }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  async function handleLogout() { await logout(); navigate('/login'); }
  return (
    <div className="h-screen w-screen bg-void text-text-primary font-mono flex flex-col">
      <div className="flex flex-1 overflow-hidden">
        {sidebar}
        <div className="flex flex-1 flex-col lg:flex-row">
          <div className="flex-1">{children}</div>
          {inspector}
        </div>
      </div>
      <StatusBar user={user} onLogout={handleLogout} />
      <CommandPalette />
    </div>
  );
}
