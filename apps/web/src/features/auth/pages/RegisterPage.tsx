import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Input } from '@qyx/ui';
import { setSession } from '../../../lib/auth';
import { apiUrl } from '../../../lib/config';
import { bucketOf, ROLE_HOME_PATH } from '../../../lib/roles';

interface ApiErrorShape {
  error?: { code?: string; message?: string };
  message?: string;
}

type Flow = 'create' | 'join';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialFlow: Flow = searchParams.get('flow') === 'join' ? 'join' : 'create';
  const [flow, setFlow] = useState<Flow>(initialFlow);
  const [form, setForm] = useState({ organization_name: '', domain: '', display_name: '', email: '', password: '', confirm_password: '', invite_code: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(key: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (flow === 'join') {
      if (form.password !== form.confirm_password) {
        setError('Passwords do not match');
        return;
      }
      if (!form.invite_code.trim()) {
        setError('Invite code is required');
        return;
      }
    }

    setLoading(true);
    try {
      const body: Record<string, string> = {
        email: form.email,
        password: form.password,
        display_name: form.display_name,
      };

      if (flow === 'create') {
        body.organization_name = form.organization_name;
        body.domain = form.domain;
      } else {
        body.invite_code = form.invite_code.trim().toUpperCase();
      }

      const res = await fetch(apiUrl('/v1/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as ApiErrorShape & { user?: { id: string; organization_id: string; role: string; email?: string; display_name?: string }; org_created?: boolean; access_token?: string; refresh_token?: string };
      if (!res.ok) {
        setError(data.error?.message || data.message || `HTTP ${res.status}`);
        setLoading(false);
        return;
      }
      if (data.org_created) {
        if (data.access_token && data.refresh_token && data.user) {
          setSession(data.access_token, data.refresh_token, { id: data.user.id, organization_id: data.user.organization_id, role: data.user.role });
        }
        navigate('/onboarding?flow=create');
        return;
      }
      if (data.user?.role) {
        const bucket = bucketOf(data.user.role);
        navigate(ROLE_HOME_PATH[bucket]);
        return;
      }
      navigate('/login');
    } catch {
      setError('Network error');
    }
    setLoading(false);
  }

  const isCreate = flow === 'create';

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Link to="/" className="text-2xl font-bold tracking-tight text-text-primary">Qyx</Link>
          <p className="mt-2 text-sm text-text-secondary">{isCreate ? 'Create your organization and account' : 'Join an organization with an invite code'}</p>
        </div>

        <div className="flex border border-hairline rounded-sm overflow-hidden">
          <button type="button" onClick={() => setFlow('create')} className={`flex-1 px-3 py-1.5 text-xs transition-colors ${isCreate ? 'bg-raised text-text-primary' : 'text-text-dim hover:text-text-secondary'}`}>Create org</button>
          <button type="button" onClick={() => setFlow('join')} className={`flex-1 px-3 py-1.5 text-xs transition-colors ${!isCreate ? 'bg-raised text-text-primary' : 'text-text-dim hover:text-text-secondary'}`}>Join with invite</button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {error && <div className="text-xs text-signal-amber">{error}</div>}

          {isCreate ? (
            <>
              <div>
                <label className="text-xs text-text-secondary block mb-1">Organization name</label>
                <Input type="text" value={form.organization_name} onChange={update('organization_name')} required autoFocus />
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">Domain</label>
                <Input type="text" value={form.domain} onChange={update('domain')} placeholder="acme.com" required />
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">Display name</label>
                <Input type="text" value={form.display_name} onChange={update('display_name')} required />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs text-text-secondary block mb-1">Invite code</label>
                <Input type="text" value={form.invite_code} onChange={update('invite_code')} required autoFocus placeholder="e.g. ABCD-1234" />
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">Display name</label>
                <Input type="text" value={form.display_name} onChange={update('display_name')} required />
              </div>
            </>
          )}

          <div>
            <label className="text-xs text-text-secondary block mb-1">Email</label>
            <Input type="email" value={form.email} onChange={update('email')} required />
          </div>
          <div>
            <label className="text-xs text-text-secondary block mb-1">Password</label>
            <Input type="password" value={form.password} onChange={update('password')} required />
          </div>
          {!isCreate && (
            <div>
              <label className="text-xs text-text-secondary block mb-1">Confirm password</label>
              <Input type="password" value={form.confirm_password} onChange={update('confirm_password')} required />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating account…' : (isCreate ? 'Create account' : 'Join organization')}
          </Button>
        </form>
        <p className="text-center text-xs text-text-dim">
          Already have an account? <Link to="/login" className="text-text-secondary hover:text-text-primary">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
