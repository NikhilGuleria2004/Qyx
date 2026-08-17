import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { getOrganizationSettings, updateOrganizationSettings } from '../api/adminApi';

type Props = {
  orgId: string;
  token: string;
  onClose: () => void;
};

type OrgPolicy = {
  mfa_required_roles: string;
  allowed_file_types: string;
  max_file_size_mb: number;
  external_sharing: number;
  notification_preview: number;
  recovery_policy: string;
};

export default function OrgSettingsScreen({ orgId, token, onClose }: Props) {
  const [policy, setPolicy] = useState<OrgPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getOrganizationSettings(orgId, token);
      setPolicy((data as { policy: OrgPolicy }).policy || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [orgId, token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!policy) return;
    setSaving(true);
    setSaved(false);
    try {
      await updateOrganizationSettings(orgId, {
        mfa_required_roles: policy.mfa_required_roles,
        allowed_file_types: policy.allowed_file_types,
        max_file_size_mb: policy.max_file_size_mb,
        external_sharing: policy.external_sharing ? 1 : 0,
        notification_preview: policy.notification_preview ? 1 : 0,
        recovery_policy: policy.recovery_policy,
      }, token);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full w-full flex-col bg-void text-text-primary font-mono">
        <div className="flex h-9 items-center border-b border-hairline px-3">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Org Settings</span>
          <button onClick={onClose} className="ml-auto text-text-dim hover:text-text-primary" aria-label="Close">
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-xs text-text-dim">&gt; loading...</div>
        </div>
      </div>
    );
  }

  if (!policy) {
    return (
      <div className="flex h-full w-full flex-col bg-void text-text-primary font-mono">
        <div className="flex h-9 items-center border-b border-hairline px-3">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Org Settings</span>
          <button onClick={onClose} className="ml-auto text-text-dim hover:text-text-primary" aria-label="Close">
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-xs text-signal-red">&gt; failed to load settings</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-void text-text-primary font-mono">
      <div className="flex h-9 items-center border-b border-hairline px-3">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Org Settings</span>
        <button onClick={onClose} className="ml-auto text-text-dim hover:text-text-primary" aria-label="Close">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {error && (
          <div className="mb-3 text-xs text-signal-red">&gt; {error}</div>
        )}

        {saved && (
          <div className="mb-3 text-xs text-signal-cipher">&gt; settings saved</div>
        )}

        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="text-[10px] text-text-dim block mb-1">MFA required roles (CSV)</label>
            <input
              type="text"
              value={policy.mfa_required_roles}
              onChange={(e) => setPolicy({ ...policy, mfa_required_roles: e.target.value })}
              className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
            />
          </div>

          <div>
            <label className="text-[10px] text-text-dim block mb-1">Allowed file types (CSV)</label>
            <input
              type="text"
              value={policy.allowed_file_types}
              onChange={(e) => setPolicy({ ...policy, allowed_file_types: e.target.value })}
              className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
            />
          </div>

          <div>
            <label className="text-[10px] text-text-dim block mb-1">Max file size (MB)</label>
            <input
              type="number"
              value={policy.max_file_size_mb}
              onChange={(e) => setPolicy({ ...policy, max_file_size_mb: parseInt(e.target.value, 10) || 0 })}
              className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="external_sharing"
              checked={policy.external_sharing === 1}
              onChange={(e) => setPolicy({ ...policy, external_sharing: e.target.checked ? 1 : 0 })}
              className="h-3 w-3 rounded border-hairline bg-transparent"
            />
            <label htmlFor="external_sharing" className="text-xs text-text-primary">Allow external sharing</label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="notification_preview"
              checked={policy.notification_preview === 1}
              onChange={(e) => setPolicy({ ...policy, notification_preview: e.target.checked ? 1 : 0 })}
              className="h-3 w-3 rounded border-hairline bg-transparent"
            />
            <label htmlFor="notification_preview" className="text-xs text-text-primary">Enable notification previews</label>
          </div>

          <div>
            <label className="text-[10px] text-text-dim block mb-1">Recovery policy</label>
            <select
              value={policy.recovery_policy}
              onChange={(e) => setPolicy({ ...policy, recovery_policy: e.target.value })}
              className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-focus"
            >
              <option value="device_only">device_only</option>
              <option value="enterprise_key">enterprise_key</option>
              <option value="user_backup">user_backup</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="border border-hairline px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-focus disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save settings'}
          </button>
        </form>
      </div>
    </div>
  );
}
