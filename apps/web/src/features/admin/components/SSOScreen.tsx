import { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { listSsoProviders, createSsoProvider, updateSsoProvider, deleteSsoProvider } from '../api/adminApi';

type SsoProvider = {
  id: string;
  provider_type: string;
  provider_name: string;
  issuer_url: string | null;
  client_id: string;
  authorization_url: string | null;
  token_url: string | null;
  userinfo_url: string | null;
  jwks_url: string | null;
  attribute_mapping: string;
  enabled: number;
  created_at: number;
};

type Props = {
  orgId: string;
  token: string;
  onClose: () => void;
};

type FormState = {
  provider_name: string;
  provider_type: string;
  issuer_url: string;
  client_id: string;
  client_secret: string;
  authorization_url: string;
  token_url: string;
  userinfo_url: string;
  jwks_url: string;
  attribute_mapping: string;
};

const EMPTY_FORM: FormState = {
  provider_name: '',
  provider_type: 'oidc',
  issuer_url: '',
  client_id: '',
  client_secret: '',
  authorization_url: '',
  token_url: '',
  userinfo_url: '',
  jwks_url: '',
  attribute_mapping: '{"email":"email","name":"name"}',
};

const PRESETS: Record<string, Partial<FormState>> = {
  entra: {
    provider_name: 'entra',
    authorization_url: 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize',
    token_url: 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token',
    userinfo_url: 'https://graph.microsoft.com/oidc/userinfo',
    jwks_url: 'https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys',
  },
  google: {
    provider_name: 'google',
    authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth',
    token_url: 'https://oauth2.googleapis.com/token',
    userinfo_url: 'https://openidconnect.googleapis.com/v1/userinfo',
    jwks_url: 'https://www.googleapis.com/oauth2/v3/certs',
  },
  okta: {
    provider_name: 'okta',
    authorization_url: 'https://{domain}/oauth2/v1/authorize',
    token_url: 'https://{domain}/oauth2/v1/token',
    userinfo_url: 'https://{domain}/oauth2/v1/userinfo',
    jwks_url: 'https://{domain}/oauth2/v1/keys',
  },
};

export default function SSOScreen({ orgId, token, onClose }: Props) {
  const [providers, setProviders] = useState<SsoProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listSsoProviders(orgId, token);
      setProviders((data as { providers: SsoProvider[] }).providers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load SSO providers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [orgId, token]);

  const handlePreset = (preset: string) => {
    const p = PRESETS[preset];
    if (p) {
      setForm((prev) => ({ ...prev, ...p }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        provider_name: form.provider_name,
        provider_type: form.provider_type,
        issuer_url: form.issuer_url || null,
        client_id: form.client_id,
        client_secret: form.client_secret,
        authorization_url: form.authorization_url || null,
        token_url: form.token_url || null,
        userinfo_url: form.userinfo_url || null,
        jwks_url: form.jwks_url || null,
        attribute_mapping: form.attribute_mapping,
      };

      if (editingId) {
        await updateSsoProvider(orgId, editingId, payload, token);
      } else {
        await createSsoProvider(orgId, payload, token);
      }

      setForm(EMPTY_FORM);
      setShowForm(false);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save SSO provider');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (provider: SsoProvider) => {
    setForm({
      provider_name: provider.provider_name,
      provider_type: provider.provider_type,
      issuer_url: provider.issuer_url || '',
      client_id: provider.client_id,
      client_secret: '',
      authorization_url: provider.authorization_url || '',
      token_url: provider.token_url || '',
      userinfo_url: provider.userinfo_url || '',
      jwks_url: provider.jwks_url || '',
      attribute_mapping: provider.attribute_mapping,
    });
    setEditingId(provider.id);
    setShowForm(true);
  };

  const handleDelete = async (providerId: string) => {
    if (!confirm('Delete this SSO provider?')) return;
    try {
      await deleteSsoProvider(orgId, providerId, token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete provider');
    }
  };

  const handleToggle = async (provider: SsoProvider) => {
    try {
      await updateSsoProvider(orgId, provider.id, { enabled: !provider.enabled }, token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle provider');
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-void text-text-primary font-mono">
      <div className="flex h-9 items-center border-b border-hairline px-3">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">SSO Providers</span>
        <button onClick={onClose} className="ml-auto text-text-dim hover:text-text-primary" aria-label="Close">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {error && (
          <div className="mb-3 text-xs text-signal-red">&gt; {error}</div>
        )}

        {loading ? (
          <div className="text-xs text-text-dim">&gt; loading...</div>
        ) : (
          <div className="space-y-2">
            {providers.map((provider) => (
              <div key={provider.id} className="flex items-center justify-between border border-hairline bg-raised px-2 py-1.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-primary">{provider.provider_name}</span>
                    <span className="text-[10px] text-text-dim">{provider.provider_type}</span>
                    <span className={`text-[10px] ${provider.enabled ? 'text-signal-cipher' : 'text-signal-red'}`}>
                      {provider.enabled ? 'enabled' : 'disabled'}
                    </span>
                  </div>
                  <div className="text-[10px] text-text-dim">
                    {provider.client_id} · {provider.issuer_url || 'no issuer'}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={() => handleToggle(provider)}
                    className="border border-hairline px-1 py-0.5 text-[10px] text-text-secondary hover:text-text-primary hover:border-focus"
                  >
                    {provider.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => handleEdit(provider)}
                    className="border border-hairline px-1 py-0.5 text-[10px] text-text-secondary hover:text-text-primary hover:border-focus"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(provider.id)}
                    className="border border-hairline px-1 py-0.5 text-[10px] text-text-secondary hover:text-signal-red hover:border-focus"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {providers.length === 0 && (
              <div className="text-xs text-text-dim">&gt; no SSO providers configured</div>
            )}
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="mt-3 space-y-2 border border-hairline bg-raised p-2">
            <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">
              {editingId ? 'Edit Provider' : 'Add Provider'}
            </div>
            <div className="flex gap-2 mb-2">
              <button type="button" onClick={() => handlePreset('entra')} className="border border-hairline px-1 py-0.5 text-[10px] text-text-secondary hover:text-text-primary">Entra ID</button>
              <button type="button" onClick={() => handlePreset('google')} className="border border-hairline px-1 py-0.5 text-[10px] text-text-secondary hover:text-text-primary">Google</button>
              <button type="button" onClick={() => handlePreset('okta')} className="border border-hairline px-1 py-0.5 text-[10px] text-text-secondary hover:text-text-primary">Okta</button>
            </div>
            <div>
              <label className="text-[10px] text-text-dim block mb-1">Provider name</label>
              <input
                type="text"
                value={form.provider_name}
                onChange={(e) => setForm({ ...form, provider_name: e.target.value })}
                className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
                placeholder="entra, google, okta"
                required
              />
            </div>
            <div>
              <label className="text-[10px] text-text-dim block mb-1">Provider type</label>
              <select
                value={form.provider_type}
                onChange={(e) => setForm({ ...form, provider_type: e.target.value })}
                className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-focus"
              >
                <option value="oidc">OIDC</option>
                <option value="saml">SAML</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-text-dim block mb-1">Issuer URL</label>
              <input
                type="text"
                value={form.issuer_url}
                onChange={(e) => setForm({ ...form, issuer_url: e.target.value })}
                className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
                placeholder="https://login.microsoftonline.com/{tenant}/v2.0"
              />
            </div>
            <div>
              <label className="text-[10px] text-text-dim block mb-1">Client ID</label>
              <input
                type="text"
                value={form.client_id}
                onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
                required
              />
            </div>
            <div>
              <label className="text-[10px] text-text-dim block mb-1">Client Secret</label>
              <input
                type="password"
                value={form.client_secret}
                onChange={(e) => setForm({ ...form, client_secret: e.target.value })}
                className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
                required
              />
            </div>
            <div>
              <label className="text-[10px] text-text-dim block mb-1">Authorization URL</label>
              <input
                type="text"
                value={form.authorization_url}
                onChange={(e) => setForm({ ...form, authorization_url: e.target.value })}
                className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
              />
            </div>
            <div>
              <label className="text-[10px] text-text-dim block mb-1">Token URL</label>
              <input
                type="text"
                value={form.token_url}
                onChange={(e) => setForm({ ...form, token_url: e.target.value })}
                className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
              />
            </div>
            <div>
              <label className="text-[10px] text-text-dim block mb-1">Userinfo URL</label>
              <input
                type="text"
                value={form.userinfo_url}
                onChange={(e) => setForm({ ...form, userinfo_url: e.target.value })}
                className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
              />
            </div>
            <div>
              <label className="text-[10px] text-text-dim block mb-1">JWKS URL</label>
              <input
                type="text"
                value={form.jwks_url}
                onChange={(e) => setForm({ ...form, jwks_url: e.target.value })}
                className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
              />
            </div>
            <div>
              <label className="text-[10px] text-text-dim block mb-1">Attribute mapping (JSON)</label>
              <input
                type="text"
                value={form.attribute_mapping}
                onChange={(e) => setForm({ ...form, attribute_mapping: e.target.value })}
                className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="border border-hairline px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-focus disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); }}
                className="border border-hairline px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-focus"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); }}
            className="mt-2 flex items-center border border-hairline px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-focus"
          >
            <Plus size={12} className="mr-1" />
            Add SSO Provider
          </button>
        )}
      </div>
    </div>
  );
}
