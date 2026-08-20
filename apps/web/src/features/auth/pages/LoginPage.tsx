import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Input } from '@qyx/ui';
import { setSession } from '../../../lib/auth';
import { apiUrl } from '../../../lib/config';

interface LoginResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id: string; organization_id: string; role: string };
  state?: string;
  mfa_required?: boolean;
  user_id?: string;
}

interface ApiErrorShape {
  error?: { code?: string; message?: string };
  message?: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', device_name: 'web-browser' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ssoOrgId, setSsoOrgId] = useState('');
  const [ssoProvider, setSsoProvider] = useState('google');

  function update(key: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/v1/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as LoginResponse & ApiErrorShape;
      if (!res.ok) {
        setError(data.error?.message || data.message || `HTTP ${res.status}`);
        setLoading(false);
        return;
      }
      if (data.state === 'MFA_CHALLENGE_ISSUED' || data.mfa_required) {
        if (data.user_id && typeof localStorage !== 'undefined') {
          localStorage.setItem('qyx-mfa-user-id', data.user_id);
        }
        navigate('/mfa');
        return;
      }
      if (data.access_token && data.refresh_token && data.user) {
        setSession(data.access_token, data.refresh_token, { id: data.user.id, organization_id: data.user.organization_id, role: data.user.role });
        try {
          const orgRes = await fetch(apiUrl(`/v1/organizations/${data.user.organization_id}`), {
            headers: { Authorization: `Bearer ${data.access_token}` },
          });
          if (orgRes.ok) {
            const orgData = await orgRes.json();
            if (orgData.status === 'pending_verification') {
              navigate('/onboarding?flow=create');
              return;
            }
          }
        } catch {
          // ignore org status check failure
        }
        navigate('/app');
        return;
      }
      setError('Unexpected response from server');
    } catch {
      setError('Network error');
    }
    setLoading(false);
  }

  function handleSsoSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ssoOrgId.trim() || !ssoProvider.trim()) return;
    window.location.href = apiUrl(`/v1/auth/sso/${encodeURIComponent(ssoProvider)}/start?org_id=${encodeURIComponent(ssoOrgId.trim())}`);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Link to="/" className="text-2xl font-bold tracking-tight text-text-primary">Qyx</Link>
          <p className="mt-2 text-sm text-text-secondary">Sign in to your workspace</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <div className="text-xs text-signal-amber">{error}</div>}
          <div>
            <label className="text-xs text-text-secondary block mb-1">Email</label>
            <Input type="email" value={form.email} onChange={update('email')} required autoFocus />
          </div>
          <div>
            <label className="text-xs text-text-secondary block mb-1">Password</label>
            <Input type="password" value={form.password} onChange={update('password')} required />
          </div>
          <div>
            <label className="text-xs text-text-secondary block mb-1">Device name</label>
            <Input type="text" value={form.device_name} onChange={update('device_name')} required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-hairline" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-void px-2 text-text-dim">or sign in with SSO</span>
          </div>
        </div>

        <form onSubmit={handleSsoSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-text-secondary block mb-1">Organization ID</label>
            <Input type="text" value={ssoOrgId} onChange={(e) => setSsoOrgId(e.target.value)} placeholder="org_..." required />
          </div>
          <div>
            <label className="text-xs text-text-secondary block mb-1">Provider</label>
            <select value={ssoProvider} onChange={(e) => setSsoProvider(e.target.value)} className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-focus">
              <option value="google">Google</option>
              <option value="entra">Entra ID</option>
              <option value="okta">Okta</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <Button type="submit" variant="ghost" className="w-full">
            Sign in with SSO
          </Button>
        </form>

        <p className="text-center text-xs text-text-dim">
          Don't have an account? <Link to="/register" className="text-text-secondary hover:text-text-primary">Register</Link>
        </p>
      </div>
    </div>
  );
}
