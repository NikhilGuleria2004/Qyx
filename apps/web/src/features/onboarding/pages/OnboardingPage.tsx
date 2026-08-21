import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Input } from '@qyx/ui';
import { useAuthStore, type AuthState } from '../../../stores/authStore';
import { listDomains, addDomain, verifyDomain, createInvite, listInvites, acceptInvite, lookupInvites } from '../../../features/admin/api/adminApi';
import { ROLE_HOME_PATH, bucketOf } from '../../../lib/roles';

type Flow = 'create' | 'join';

interface Domain {
  id: string;
  domain: string;
  verified: boolean;
  verification_token: string | null;
  created_at: number;
}

interface Invite {
  id: string;
  organization_id: string;
  org_name: string | null;
  email: string | null;
  code: string;
  role: string;
  status: string;
  expires_at: number;
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const accessToken = useAuthStore((s: AuthState) => s.accessToken);
  const user = useAuthStore((s: AuthState) => s.user);

  const initialFlow = searchParams.get('flow') === 'join' ? 'join' : 'create';
  const [flow, setFlow] = useState<Flow>(initialFlow);

  const [orgStatus] = useState('');
  const [domains, setDomains] = useState<Domain[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [newDomain, setNewDomain] = useState('');
  const [verifyDomainId, setVerifyDomainId] = useState('');
  const [txtRecord, setTxtRecord] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [lookupDomain, setLookupDomain] = useState('');
  const [lookupEmail, setLookupEmail] = useState('');

  useEffect(() => {
    if (!accessToken || !user) return;
    loadOrgData();
  }, [accessToken, user]);

  async function loadOrgData() {
    if (!accessToken || !user) return;
    setLoading(true);
    setError('');
    try {
      const [domainsRes, invitesRes] = await Promise.all([
        listDomains(user.orgId, accessToken),
        listInvites(user.orgId, accessToken),
      ]) as [ { domains: Domain[] }, { invites: Invite[] } ];
      setDomains(domainsRes.domains || []);
      setInvites(invitesRes.invites || []);
    } catch {
      setError('Failed to load organization data');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddDomain(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !user) return;
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await addDomain(user.orgId, newDomain, accessToken);
      setDomains((prev) => [...prev, res]);
      setNewDomain('');
      setSuccess('Domain added');
    } catch {
      setError('Failed to add domain');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyDomain(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !user) return;
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await verifyDomain(user.orgId, verifyDomainId, txtRecord, accessToken);
      setDomains((prev) => prev.map((d) => d.id === res.id ? { ...d, verified: res.verified } : d));
      setVerifyDomainId('');
      setTxtRecord('');
      if (res.verified) {
        const bucket = bucketOf(user?.role);
        navigate(ROLE_HOME_PATH[bucket]);
        return;
      }
      setSuccess(res.verified ? 'Domain verified' : 'Domain verification failed');
    } catch {
      setError('Failed to verify domain');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !user) return;
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await createInvite(user.orgId, null, 'employee', accessToken);
      setInvites((prev) => [...prev, { ...res, org_name: null }]);
      setSuccess(`Invite code: ${res.code}`);
    } catch {
      setError('Failed to create invite');
    } finally {
      setLoading(false);
    }
  }

  async function handleAcceptInvite() {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await acceptInvite(inviteCode.trim().toUpperCase());
      setSuccess(`Join ${res.organization_id ? 'organization' : 'request accepted'}`);
      setInviteCode('');
    } catch {
      setError('Invalid invite code');
    } finally {
      setLoading(false);
    }
  }

  async function handleDomainLookup() {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await lookupInvites(lookupDomain || undefined, lookupEmail || undefined);
      setInvites(res.invites || []);
    } catch {
      setError('Lookup failed');
    } finally {
      setLoading(false);
    }
  }

  const unverifiedDomains = domains.filter((d) => !d.verified);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <div className="text-2xl font-bold tracking-tight text-text-primary">Onboarding</div>
          <p className="mt-2 text-sm text-text-secondary">
            {accessToken ? 'Set up your organization' : 'Create or join an organization'}
          </p>
        </div>

        {accessToken && (
          <div className="space-y-1">
            <div className="text-xs text-text-dim uppercase tracking-widest">{'>'} organization</div>
            <div className="text-sm text-text-primary">{user?.name || user?.email}</div>
            <div className="text-xs text-text-secondary">status: {orgStatus || 'loading...'}</div>
          </div>
        )}

        {!accessToken && (
          <div className="flex border-b border-hairline">
            <button
              onClick={() => setFlow('create')}
              className={`flex-1 pb-2 text-xs font-medium ${flow === 'create' ? 'text-text-primary border-b-2 border-signal-cipher' : 'text-text-dim hover:text-text-secondary'}`}
            >
              Create organization
            </button>
            <button
              onClick={() => setFlow('join')}
              className={`flex-1 pb-2 text-xs font-medium ${flow === 'join' ? 'text-text-primary border-b-2 border-signal-cipher' : 'text-text-dim hover:text-text-secondary'}`}
            >
              Join organization
            </button>
          </div>
        )}

        {error && <div className="text-xs text-signal-amber">{error}</div>}
        {success && <div className="text-xs text-signal-cipher">{success}</div>}

        {flow === 'create' && accessToken && (
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="text-xs text-text-dim uppercase tracking-widest">{'>'} domain verification</div>
              {domains.length === 0 && (
                <div className="text-xs text-text-secondary">No domains configured. Add a domain to verify ownership.</div>
              )}
              {domains.map((domain) => (
                <div key={domain.id} className="flex items-center justify-between border border-hairline bg-raised px-3 py-2">
                  <div>
                    <div className="text-xs text-text-primary">{domain.domain}</div>
                    <div className="text-[10px] text-text-dim">
                      {domain.verified ? (
                        <span className="text-signal-cipher">verified</span>
                      ) : (
                        <span className="text-signal-amber">pending verification</span>
                      )}
                    </div>
                  </div>
                  {!domain.verified && domain.verification_token && (
                    <div className="text-[10px] text-text-dim">
                      TXT: {domain.verification_token}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {unverifiedDomains.length > 0 && (
              <form onSubmit={handleVerifyDomain} className="space-y-3 border border-hairline bg-raised p-3">
                <div className="text-xs text-text-secondary">Verify a domain</div>
                <select
                  value={verifyDomainId}
                  onChange={(e) => setVerifyDomainId(e.target.value)}
                  className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-focus"
                  required
                >
                  <option value="">Select domain</option>
                  {unverifiedDomains.map((d) => (
                    <option key={d.id} value={d.id}>{d.domain}</option>
                  ))}
                </select>
                <Input
                  type="text"
                  value={txtRecord}
                  onChange={(e) => setTxtRecord(e.target.value)}
                  placeholder="Paste TXT record value"
                  required
                />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Verifying…' : 'Verify domain'}
                </Button>
              </form>
            )}

            <form onSubmit={handleAddDomain} className="space-y-3 border border-hairline bg-raised p-3">
              <div className="text-xs text-text-secondary">Add a domain</div>
              <Input
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="acme.com"
                required
              />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Adding…' : 'Add domain'}
              </Button>
            </form>

            <div className="space-y-3">
              <div className="text-xs text-text-dim uppercase tracking-widest">{'>'} invites</div>
              <form onSubmit={handleCreateInvite} className="flex gap-2">
                <Button type="submit" variant="ghost" disabled={loading}>
                  {loading ? 'Creating…' : 'Generate invite code'}
                </Button>
              </form>
              {invites.length > 0 && (
                <div className="space-y-1">
                  {invites.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between border border-hairline bg-raised px-3 py-2">
                      <div>
                        <div className="text-xs text-text-primary">code: {inv.code}</div>
                        <div className="text-[10px] text-text-dim">role: {inv.role} | expires: {new Date(inv.expires_at).toLocaleDateString()}</div>
                      </div>
                      <span className={`text-[10px] ${inv.status === 'pending' ? 'text-signal-cipher' : 'text-text-dim'}`}>{inv.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {flow === 'create' && !accessToken && (
          <div className="space-y-4">
            <div className="text-sm text-text-secondary">
              Create a new organization and start collaborating with your team.
            </div>
            <Button onClick={() => navigate('/register')} className="w-full">
              Create organization
            </Button>
          </div>
        )}

        {flow === 'join' && (
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="text-xs text-text-dim uppercase tracking-widest">{'>'} enter invite code</div>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  className="flex-1"
                />
                <Button onClick={handleAcceptInvite} disabled={loading || !inviteCode.trim()}>
                  Join
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-xs text-text-dim uppercase tracking-widest">{'>'} search by domain</div>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={lookupDomain}
                  onChange={(e) => setLookupDomain(e.target.value)}
                  placeholder="acme.com"
                  className="flex-1"
                />
                <Button onClick={handleDomainLookup} variant="ghost" disabled={loading}>
                  Search
                </Button>
              </div>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={lookupEmail}
                  onChange={(e) => setLookupEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="flex-1"
                />
                <Button onClick={handleDomainLookup} variant="ghost" disabled={loading}>
                  Lookup
                </Button>
              </div>
            </div>

            {invites.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-text-secondary">Available invites</div>
                {invites.map((inv) => (
                  <div key={inv.code} className="flex items-center justify-between border border-hairline bg-raised px-3 py-2">
                    <div>
                      <div className="text-xs text-text-primary">{inv.org_name || inv.organization_id}</div>
                      <div className="text-[10px] text-text-dim">role: {inv.role} | code: {inv.code}</div>
                    </div>
                    <Button onClick={() => { setInviteCode(inv.code); handleAcceptInvite(); }}>
                      Join
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
