import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { listMembers, createMember, updateMemberRole, updateMemberStatus } from '../api/adminApi';

type Member = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  status: string;
  created_at: number;
};

type Props = {
  orgId: string;
  token: string;
  onClose: () => void;
};

export default function MembersScreen({ orgId, token, onClose }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('employee');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listMembers(orgId, token);
      setMembers(data as Member[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [orgId, token]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createMember(orgId, { email: newEmail, display_name: newName, role: newRole }, token);
      setNewEmail('');
      setNewName('');
      setNewRole('employee');
      setShowAdd(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await updateMemberRole(orgId, userId, role, token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleStatusChange = async (userId: string, status: string) => {
    try {
      await updateMemberStatus(orgId, userId, status, token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const roleColor = (role: string) => {
    if (role === 'super_admin') return 'text-signal-red';
    if (role === 'admin') return 'text-signal-amber';
    return 'text-text-secondary';
  };

  const statusColor = (status: string) => {
    if (status === 'active') return 'text-signal-cipher';
    if (status === 'suspended') return 'text-signal-amber';
    return 'text-text-dim';
  };

  return (
    <div className="flex h-full w-full flex-col bg-void text-text-primary font-mono">
      <div className="flex h-9 items-center border-b border-hairline px-3">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Members</span>
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
            onClick={() => setShowAdd(!showAdd)}
            className="border border-hairline px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-focus"
          >
            {showAdd ? 'Cancel' : '+ Add member'}
          </button>
        </div>

        {showAdd && (
          <form onSubmit={handleAdd} className="mb-4 space-y-2 border border-hairline bg-raised p-3">
            <div>
              <label className="text-[10px] text-text-dim block mb-1">Email</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
                placeholder="user@org.com"
                required
              />
            </div>
            <div>
              <label className="text-[10px] text-text-dim block mb-1">Display name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
                placeholder="Jane Doe"
                required
              />
            </div>
            <div>
              <label className="text-[10px] text-text-dim block mb-1">Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-focus"
              >
                <option value="employee">employee</option>
                <option value="admin">admin</option>
                <option value="manager">manager</option>
                <option value="security_admin">security_admin</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="border border-hairline px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-focus disabled:opacity-50"
            >
              {saving ? 'Adding...' : 'Add member'}
            </button>
          </form>
        )}

        {loading ? (
          <div className="text-xs text-text-dim">&gt; loading...</div>
        ) : (
          <div className="space-y-1">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between border border-hairline bg-raised px-2 py-1.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-primary truncate">{m.display_name}</span>
                    <span className={`text-[10px] ${roleColor(m.role)}`}>{m.role}</span>
                    <span className={`text-[10px] ${statusColor(m.status)}`}>{m.status}</span>
                  </div>
                  <div className="text-[10px] text-text-dim">{m.email}</div>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <select
                    value={m.role}
                    onChange={(e) => handleRoleChange(m.id, e.target.value)}
                    className="bg-transparent border border-hairline px-1 py-0.5 text-[10px] text-text-primary focus:outline-none focus:border-focus"
                  >
                    <option value="employee">employee</option>
                    <option value="admin">admin</option>
                    <option value="manager">manager</option>
                    <option value="security_admin">security_admin</option>
                  </select>
                  {m.status === 'active' ? (
                    <button
                      onClick={() => handleStatusChange(m.id, 'suspended')}
                      className="border border-hairline px-1 py-0.5 text-[10px] text-text-secondary hover:text-signal-amber hover:border-focus"
                    >
                      Suspend
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStatusChange(m.id, 'active')}
                      className="border border-hairline px-1 py-0.5 text-[10px] text-text-secondary hover:text-signal-cipher hover:border-focus"
                    >
                      Reactivate
                    </button>
                  )}
                </div>
              </div>
            ))}
            {members.length === 0 && (
              <div className="text-xs text-text-dim">&gt; no members found</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
