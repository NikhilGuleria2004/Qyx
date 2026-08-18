import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Input } from '@qyx/ui';

interface ApiErrorShape {
  error?: { code?: string; message?: string };
  message?: string;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ organization_name: '', domain: '', display_name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(key: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as ApiErrorShape & { user?: { id: string; organization_id: string; role: string; email?: string; display_name?: string }; org_created?: boolean };
      if (!res.ok) {
        setError(data.error?.message || data.message || `HTTP ${res.status}`);
        setLoading(false);
        return;
      }
      if (data.org_created) {
        navigate('/onboarding?flow=create');
        return;
      }
      navigate('/login');
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
          <p className="mt-2 text-sm text-text-secondary">Create your organization and account</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <div className="text-xs text-signal-amber">{error}</div>}
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
          <div>
            <label className="text-xs text-text-secondary block mb-1">Email</label>
            <Input type="email" value={form.email} onChange={update('email')} required />
          </div>
          <div>
            <label className="text-xs text-text-secondary block mb-1">Password</label>
            <Input type="password" value={form.password} onChange={update('password')} required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
        <p className="text-center text-xs text-text-dim">
          Already have an account? <Link to="/login" className="text-text-secondary hover:text-text-primary">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
