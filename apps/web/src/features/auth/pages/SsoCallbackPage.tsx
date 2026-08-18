import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { setSession } from '../../../lib/auth';

interface SsoCallbackResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: {
    id: string;
    email: string;
    display_name: string;
    organization_id: string;
    role: string;
  };
}

interface ApiErrorShape {
  error?: { code?: string; message?: string };
  message?: string;
}

export default function SsoCallbackPage() {
  const navigate = useNavigate();
  const { provider } = useParams<{ provider: string }>();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    async function handleCallback() {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const errorParam = searchParams.get('error');

      if (errorParam) {
        setError('SSO login was cancelled or failed: ' + errorParam);
        setProcessing(false);
        return;
      }

      if (!code || !state || !provider) {
        setError('Invalid SSO callback: missing code, state, or provider');
        setProcessing(false);
        return;
      }

      try {
        const res = await fetch(`/v1/auth/sso/${encodeURIComponent(provider)}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = (await res.json()) as SsoCallbackResponse & ApiErrorShape;
        if (!res.ok) {
          setError(data.error?.message || data.message || `HTTP ${res.status}`);
          setProcessing(false);
          return;
        }
        if (data.access_token && data.refresh_token && data.user) {
          setSession(data.access_token, data.refresh_token, { id: data.user.id, organization_id: data.user.organization_id, role: data.user.role, email: data.user.email, display_name: data.user.display_name });
          navigate('/app', { replace: true });
          return;
        }
        setError('Unexpected response from SSO callback');
      } catch {
        setError('Network error during SSO callback');
      }
      setProcessing(false);
    }
    handleCallback();
  }, [provider, searchParams, navigate]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="text-2xl font-bold tracking-tight text-text-primary">Qyx</div>
          <p className="mt-2 text-sm text-text-secondary">Completing SSO sign-in…</p>
        </div>
        {processing && <div className="text-xs text-text-dim">&gt; processing SSO callback...</div>}
        {error && (
          <div className="space-y-3">
            <div className="text-xs text-signal-amber">&gt; {error}</div>
            <button onClick={() => navigate('/login', { replace: true })} className="border border-hairline px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-focus">
              Back to login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
