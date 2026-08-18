import { useState, useEffect } from 'react';
import { X, ChevronDown, ChevronRight, UserMinus } from 'lucide-react';
import { listChannels, createChannel, deleteChannel, listChannelMembers, removeChannelMember } from '../api/adminApi';

type Channel = {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: number;
};

type ChannelMember = {
  user_id: string;
  can_post: boolean;
  status: string;
  requested_at: number;
  joined_at?: number;
};

type Props = {
  orgId: string;
  token: string;
  onClose: () => void;
};

export default function ChannelsScreen({ orgId, token, onClose }: Props) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, ChannelMember[]>>({});
  const [loadingMembers, setLoadingMembers] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listChannels(orgId, token);
      setChannels((data as { channels: Channel[] }).channels || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load channels');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [orgId, token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createChannel(orgId, { name, description: description || undefined }, token);
      setName('');
      setDescription('');
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create channel');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (channelId: string) => {
    if (!confirm('Delete this channel? This action is audited.')) return;
    try {
      await deleteChannel(channelId, token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete channel');
    }
  };

  const toggleMembers = async (channelId: string) => {
    if (expandedChannel === channelId) {
      setExpandedChannel(null);
      return;
    }
    setExpandedChannel(channelId);
    if (!members[channelId]) {
      setLoadingMembers(channelId);
      try {
        const data = await listChannelMembers(channelId, token);
        setMembers((prev) => ({ ...prev, [channelId]: (data as { members: ChannelMember[] }).members || [] }));
      } catch {
        setError(err => err || 'Failed to load members');
      } finally {
        setLoadingMembers(null);
      }
    }
  };

  const handleRemoveMember = async (channelId: string, userId: string) => {
    if (!confirm('Remove this member from the channel? This action is audited.')) return;
    const key = `${channelId}-${userId}`;
    setRemoving(key);
    try {
      await removeChannelMember(channelId, userId, token);
      setMembers((prev) => ({
        ...prev,
        [channelId]: (prev[channelId] || []).filter((m) => m.user_id !== userId),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-void text-text-primary font-mono">
      <div className="flex h-9 items-center border-b border-hairline px-3">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Channels</span>
        <button onClick={onClose} className="ml-auto text-text-dim hover:text-text-primary" aria-label="Close">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {error && (
          <div className="mb-3 text-xs text-signal-red">&gt; {error}</div>
        )}

        <div className="mb-3">
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="border border-hairline px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-focus"
          >
            {showCreate ? 'Cancel' : '+ Create channel'}
          </button>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} className="mb-4 space-y-2 border border-hairline bg-raised p-3">
            <div>
              <label className="text-[10px] text-text-dim block mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
                placeholder="announcements"
                required
              />
            </div>
            <div>
              <label className="text-[10px] text-text-dim block mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
                placeholder="Optional description"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="border border-hairline px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-focus disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create channel'}
            </button>
          </form>
        )}

        {loading ? (
          <div className="text-xs text-text-dim">&gt; loading...</div>
        ) : (
          <div className="space-y-1">
            {channels.map((ch) => (
              <div key={ch.id} className="border border-hairline bg-raised">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-text-primary"># {ch.name}</div>
                    <div className="text-[10px] text-text-dim">
                      {ch.description || 'no description'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={() => toggleMembers(ch.id)}
                      className="text-text-dim hover:text-text-primary"
                      aria-label={expandedChannel === ch.id ? 'Collapse members' : 'Expand members'}
                    >
                      {expandedChannel === ch.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </button>
                    <button
                      onClick={() => handleDelete(ch.id)}
                      className="border border-hairline px-1 py-0.5 text-[10px] text-text-secondary hover:text-signal-red hover:border-focus"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {expandedChannel === ch.id && (
                  <div className="border-t border-hairline px-2 py-2">
                    {loadingMembers === ch.id ? (
                      <div className="text-xs text-text-dim">&gt; loading members...</div>
                    ) : (
                      <div className="space-y-1">
                        {(members[ch.id] || []).map((m) => (
                          <div key={m.user_id} className="flex items-center justify-between">
                            <span className="text-xs text-text-primary">{m.user_id}</span>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] ${m.status === 'active' ? 'text-signal-cipher' : 'text-signal-amber'}`}>{m.status}</span>
                              {m.can_post && <span className="text-[10px] text-text-dim">can post</span>}
                              <button
                                onClick={() => handleRemoveMember(ch.id, m.user_id)}
                                disabled={removing === `${ch.id}-${m.user_id}`}
                                className="text-text-secondary hover:text-signal-red disabled:opacity-50"
                                aria-label="Remove member"
                              >
                                <UserMinus size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                        {(members[ch.id] || []).length === 0 && (
                          <div className="text-xs text-text-dim">&gt; no members</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {channels.length === 0 && (
              <div className="text-xs text-text-dim">&gt; no channels found</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
