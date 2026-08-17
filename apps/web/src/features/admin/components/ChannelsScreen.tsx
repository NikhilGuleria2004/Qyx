import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { listChannels, createChannel, deleteChannel } from '../api/adminApi';

type Channel = {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: number;
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
              <div key={ch.id} className="flex items-center justify-between border border-hairline bg-raised px-2 py-1.5">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-text-primary"># {ch.name}</div>
                  <div className="text-[10px] text-text-dim">
                    {ch.description || 'no description'}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(ch.id)}
                  className="ml-2 border border-hairline px-1 py-0.5 text-[10px] text-text-secondary hover:text-signal-red hover:border-focus"
                >
                  Delete
                </button>
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
