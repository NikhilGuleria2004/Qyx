import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Input } from '@qyx/ui';
import { setSession } from '../../../lib/auth';
import { apiUrl } from '../../../lib/config';
import { ROLE_HOME_PATH, bucketOf } from '../../../lib/roles';

interface MfaResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id: string; organization_id: string; role: string };
}

interface ApiErrorShape {
  error?: { code?: string; message?: string };
  message?: string;
}

export default function MfaPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const userId = typeof localStorage !== 'undefined' ? localStorage.getItem('qyx-mfa-user-id') : null;
      if (!userId) {
        setError('Missing user ID. Please go back to login.');
        setLoading(false);
        return;
      }
      const res = await fetch(apiUrl('/v1/auth/mfa/verify'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Qyx-User-Id': userId,
        },
        body: JSON.stringify({ mfa_code: code }),
      });
      const data = (await res.json()) as MfaResponse & ApiErrorShape;
      if (!res.ok) {
        setError(data.error?.message || data.message || `HTTP ${res.status}`);
        setLoading(false);
        return;
      }
      if (data.access_token && data.refresh_token && data.user) {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('qyx-mfa-user-id');
        }
        setSession(data.access_token, data.refresh_token, { id: data.user.id, organization_id: data.user.organization_id, role: data.user.role });
        const bucket = bucketOf(data.user.role);
        navigate(ROLE_HOME_PATH[bucket]);
        return;
      }
      setError('Unexpected response from server');
    } catch {
      setError('Network error');
    }
    setLoading(false);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Link to="/" className="text-2xl font-bold tracking-tight text-text-primary">Qyx</Link>
          <p className="mt-2 text-sm text-text-secondary">Enter your MFA code</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <div className="text-xs text-signal-amber">{error}</div>}
          <div>
            <label className="text-xs text-text-secondary block mb-1">TOTP code</label>
            <Input type="text" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus autoComplete="one-time-code" />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Verifying…' : 'Verify'}
          </Button>
        </form>
        <button type="button" onClick={() => navigate('/login')} className="w-full text-xs text-text-dim hover:text-text-primary border border-hairline rounded px-2 py-1.5">
          Skip for testing
        </button>
      </div>
    </div>
  );
}
