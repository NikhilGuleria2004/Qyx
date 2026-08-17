import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { listGroups, createGroup, deleteGroup } from '../api/adminApi';

type Group = {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  key_epoch: number;
  created_at: number;
};

type Props = {
  orgId: string;
  token: string;
  onClose: () => void;
};

export default function GroupsScreen({ orgId, token, onClose }: Props) {
  const [groups, setGroups] = useState<Group[]>([]);
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
      const data = await listGroups(orgId, token);
      setGroups((data as { groups: Group[] }).groups || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load groups');
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
      await createGroup(orgId, { name, description: description || undefined }, token);
      setName('');
      setDescription('');
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (groupId: string) => {
    if (!confirm('Delete this group? This action is audited.')) return;
    try {
      await deleteGroup(groupId, token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete group');
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-void text-text-primary font-mono">
      <div className="flex h-9 items-center border-b border-hairline px-3">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Groups</span>
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
            {showCreate ? 'Cancel' : '+ Create group'}
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
                placeholder="Engineering"
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
              {saving ? 'Creating...' : 'Create group'}
            </button>
          </form>
        )}

        {loading ? (
          <div className="text-xs text-text-dim">&gt; loading...</div>
        ) : (
          <div className="space-y-1">
            {groups.map((g) => (
              <div key={g.id} className="flex items-center justify-between border border-hairline bg-raised px-2 py-1.5">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-text-primary">{g.name}</div>
                  <div className="text-[10px] text-text-dim">
                    {g.description || 'no description'} · epoch {g.key_epoch}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(g.id)}
                  className="ml-2 border border-hairline px-1 py-0.5 text-[10px] text-text-secondary hover:text-signal-red hover:border-focus"
                >
                  Delete
                </button>
              </div>
            ))}
            {groups.length === 0 && (
              <div className="text-xs text-text-dim">&gt; no groups found</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
