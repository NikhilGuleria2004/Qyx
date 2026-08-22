import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button, Input, SegmentedControl } from '@qyx/ui';
import { setSession } from '../../../lib/auth';
import { apiUrl } from '../../../lib/config';
import { BUCKET_LABEL, ROLE_HOME_PATH, bucketOf, type RoleBucket } from '../../../lib/roles';

interface LoginResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id: string; organization_id: string; role: string };
  state?: string;
  mfa_required?: boolean;
  mfa_challenge?: string;
}

interface ApiErrorShape {
  error?: { code?: string; message?: string };
  message?: string;
}

interface LocationState {
  roleMismatch?: { selected: RoleBucket; actual: RoleBucket };
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '', device_name: 'web-browser', bypass_mfa: false });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ssoOrgId, setSsoOrgId] = useState('');
  const [ssoProvider, setSsoProvider] = useState('google');
  const [selectedBucket, setSelectedBucket] = useState<RoleBucket>('employee');
  const [roleMismatch, setRoleMismatch] = useState<{ selected: RoleBucket; actual: RoleBucket } | null>(
    (location.state as LocationState | null)?.roleMismatch || null
  );
  const bypassMfa = import.meta.env.VITE_BYPASS_MFA === 'true';

  function update(key: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const body = { ...form, bypass_mfa: bypassMfa };
      const res = await fetch(apiUrl('/v1/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as LoginResponse & ApiErrorShape;
      if (!res.ok) {
        setError(data.error?.message || data.message || `HTTP ${res.status}`);
        setLoading(false);
        return;
      }
      if (data.state === 'MFA_CHALLENGE_ISSUED' || data.mfa_required) {
        if (data.mfa_challenge && typeof localStorage !== 'undefined') {
          localStorage.setItem('qyx-mfa-challenge', data.mfa_challenge);
        }
        navigate('/mfa');
        return;
      }
      if (data.access_token && data.user) {
        setSession(data.access_token, { id: data.user.id, organization_id: data.user.organization_id, role: data.user.role });
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
        const actualBucket = bucketOf(data.user.role);
        if (actualBucket !== selectedBucket) {
          setRoleMismatch({ selected: selectedBucket, actual: actualBucket });
          navigate(ROLE_HOME_PATH[actualBucket], { replace: true, state: { roleMismatch: { selected: selectedBucket, actual: actualBucket } } });
          return;
        }
        navigate(ROLE_HOME_PATH[actualBucket]);
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
        {roleMismatch && (
          <div className="text-xs text-signal-amber border border-signal-amber/40 bg-signal-amber/10 px-3 py-2 rounded-sm">
            You selected {BUCKET_LABEL[roleMismatch.selected]}, but this account is a {BUCKET_LABEL[roleMismatch.actual]} account. We've signed you in to your {BUCKET_LABEL[roleMismatch.actual]} home.
          </div>
        )}
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <div className="text-xs text-signal-amber">{error}</div>}
          <div>
            <label className="text-xs text-text-secondary block mb-1">Sign in as</label>
            <SegmentedControl
              options={[
                { value: 'superadmin', label: BUCKET_LABEL.superadmin },
                { value: 'admin', label: BUCKET_LABEL.admin },
                { value: 'employee', label: BUCKET_LABEL.employee },
              ]}
              value={selectedBucket}
              onChange={setSelectedBucket}
            />
          </div>
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
