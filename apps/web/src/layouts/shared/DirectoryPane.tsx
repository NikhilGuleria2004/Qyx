import { useState, useEffect } from 'react';
import { ChevronRight, Users, Hash, MessageSquare, X, Settings } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { listChannels, listGroups, listConversations, type Channel, type Group, type Conversation } from '../../features/app/api/directoryApi';
import { InspectorContent } from './InspectorPane';

export function DirectoryPane({ userRole: _userRole }: { userRole?: string }) {
  const [open, setOpen] = useState(true);
  const [mobileView, setMobileView] = useState<'directory' | 'buffer' | 'inspector'>('buffer');
  const orgId = useAuthStore((s) => s.user?.orgId);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchDirectory() {
      try {
        const [ch, gr, conv] = await Promise.all([
          listChannels().catch(() => [] as Channel[]),
          listGroups().catch(() => [] as Group[]),
          listConversations().catch(() => [] as Conversation[]),
        ]);
        if (!cancelled) {
          setChannels(ch);
          setGroups(gr);
          setConversations(conv.filter((c) => c.type === 'direct'));
        }
      } catch {
        // silently fail — directory is non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchDirectory();
    return () => { cancelled = true; };
  }, []);

  const renderDirectoryContent = () => (
    <div className="flex-1 overflow-y-auto p-2">
      <div className="mb-2">
        <div className="flex items-center px-2 py-1 text-xs font-medium text-text-secondary">
          <ChevronRight size={12} className="mr-1" />
          <span>{orgId || 'Organization'}</span>
        </div>
        <div className="ml-4 mt-1">
          {loading ? (
            <div className="px-2 py-1 text-xs text-text-dim">Loading channels...</div>
          ) : channels.length === 0 ? (
            <div className="px-2 py-1 text-xs text-text-dim">No channels</div>
          ) : (
            channels.map((ch) => (
              <div key={ch.id} className="flex items-center px-2 py-1 text-xs text-text-dim">
                <Hash size={12} className="mr-2" />
                <span>{ch.name}</span>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="mb-2">
        <div className="flex items-center px-2 py-1 text-xs font-medium text-text-secondary">
          <ChevronRight size={12} className="mr-1" />
          <span>Groups</span>
        </div>
        <div className="ml-4 mt-1">
          {loading ? (
            <div className="px-2 py-1 text-xs text-text-dim">Loading groups...</div>
          ) : groups.length === 0 ? (
            <div className="px-2 py-1 text-xs text-text-dim">No groups</div>
          ) : (
            groups.map((g) => (
              <div key={g.id} className="flex items-center px-2 py-1 text-xs text-text-dim">
                <Users size={12} className="mr-2" />
                <span>{g.name}</span>
              </div>
            ))
          )}
        </div>
      </div>
      <div>
        <div className="flex items-center px-2 py-1 text-xs font-medium text-text-secondary">
          <ChevronRight size={12} className="mr-1" />
          <span>Direct</span>
        </div>
        <div className="ml-4 mt-1">
          {loading ? (
            <div className="px-2 py-1 text-xs text-text-dim">Loading conversations...</div>
          ) : conversations.length === 0 ? (
            <div className="px-2 py-1 text-xs text-text-dim">No direct messages</div>
          ) : (
            conversations.map((c) => (
              <div key={c.id} className="flex items-center px-2 py-1 text-xs text-text-dim">
                <MessageSquare size={12} className="mr-2" />
                <span>{c.id}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

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
            {renderDirectoryContent()}
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
            {renderDirectoryContent()}
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
