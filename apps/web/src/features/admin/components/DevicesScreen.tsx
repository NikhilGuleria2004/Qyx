import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { listOrgDevices, revokeOrgDevice, listOrgSessions, revokeOrgSession } from '../api/adminApi';

type OrgDevice = {
  id: string;
  user_id: string;
  organization_id: string;
  device_name: string;
  platform?: string;
  status: string;
  created_at: number;
  last_seen_at?: number;
};

type OrgSession = {
  id: string;
  user_id: string;
  organization_id: string;
  device_id?: string;
  expires_at: number;
  created_at: number;
  last_seen_at: number;
};

type Props = {
  orgId: string;
  token: string;
  onClose: () => void;
};

type Tab = 'devices' | 'sessions';

export default function DevicesScreen({ orgId, token, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('devices');
  const [devices, setDevices] = useState<OrgDevice[]>([]);
  const [sessions, setSessions] = useState<OrgSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revoking, setRevoking] = useState<string | null>(null);

  const loadDevices = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listOrgDevices(orgId, token);
      setDevices((data as { devices: OrgDevice[] }).devices || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  const loadSessions = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listOrgSessions(orgId, token);
      setSessions((data as { sessions: OrgSession[] }).sessions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'devices') {
      loadDevices();
    } else {
      loadSessions();
    }
  }, [orgId, token, tab]);

  const handleRevokeDevice = async (deviceId: string) => {
    if (!confirm('Revoke this device? The user will be logged out from this device immediately.')) return;
    setRevoking(deviceId);
    try {
      await revokeOrgDevice(orgId, deviceId, token);
      await loadDevices();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke device');
    } finally {
      setRevoking(null);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    if (!confirm('Revoke this session? The user will need to log in again.')) return;
    setRevoking(sessionId);
    try {
      await revokeOrgSession(orgId, sessionId, token);
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke session');
    } finally {
      setRevoking(null);
    }
  };

  const statusColor = (status: string) => {
    if (status === 'active') return 'text-signal-cipher';
    if (status === 'pending') return 'text-signal-amber';
    if (status === 'revoked') return 'text-signal-red';
    return 'text-text-secondary';
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const isExpired = (expiresAt: number) => expiresAt < Date.now();

  return (
    <div className="flex h-full w-full flex-col bg-void text-text-primary font-mono">
      <div className="flex h-9 items-center border-b border-hairline px-3">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Devices & Sessions</span>
        <button onClick={onClose} className="ml-auto text-text-dim hover:text-text-primary" aria-label="Close">
          <X size={14} />
        </button>
      </div>

      <div className="flex border-b border-hairline">
        <button
          onClick={() => setTab('devices')}
          className={`px-3 py-1.5 text-xs ${tab === 'devices' ? 'text-text-primary border-b-2 border-signal-cipher' : 'text-text-dim hover:text-text-primary'}`}
        >
          Devices ({devices.length})
        </button>
        <button
          onClick={() => setTab('sessions')}
          className={`px-3 py-1.5 text-xs ${tab === 'sessions' ? 'text-text-primary border-b-2 border-signal-cipher' : 'text-text-dim hover:text-text-primary'}`}
        >
          Sessions ({sessions.length})
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {error && (
          <div className="mb-3 text-xs text-signal-red">&gt; {error}</div>
        )}

        {loading ? (
          <div className="text-xs text-text-dim">&gt; loading...</div>
        ) : tab === 'devices' ? (
          <div className="space-y-1">
            {devices.map((device) => (
              <div key={device.id} className="flex items-center justify-between border border-hairline bg-raised px-2 py-1.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-primary">{device.device_name}</span>
                    <span className={`text-[10px] ${statusColor(device.status)}`}>{device.status}</span>
                    {device.platform && <span className="text-[10px] text-text-dim">{device.platform}</span>}
                  </div>
                  <div className="text-[10px] text-text-dim">
                    {device.id} · user: {device.user_id} · created: {formatDate(device.created_at)}
                    {device.last_seen_at && ` · last seen: ${formatDate(device.last_seen_at)}`}
                  </div>
                </div>
                {device.status === 'active' && (
                  <button
                    onClick={() => handleRevokeDevice(device.id)}
                    disabled={revoking === device.id}
                    className="ml-2 border border-hairline px-1 py-0.5 text-[10px] text-text-secondary hover:text-signal-red hover:border-focus disabled:opacity-50"
                  >
                    {revoking === device.id ? '...' : 'Revoke'}
                  </button>
                )}
              </div>
            ))}
            {devices.length === 0 && (
              <div className="text-xs text-text-dim">&gt; no devices found</div>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.map((session) => (
              <div key={session.id} className="flex items-center justify-between border border-hairline bg-raised px-2 py-1.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-primary">{session.id}</span>
                    {isExpired(session.expires_at) && (
                      <span className="text-[10px] text-signal-amber">expired</span>
                    )}
                  </div>
                  <div className="text-[10px] text-text-dim">
                    user: {session.user_id} · device: {session.device_id || 'none'} · expires: {formatDate(session.expires_at)} · last seen: {formatDate(session.last_seen_at)}
                  </div>
                </div>
                {!isExpired(session.expires_at) && (
                  <button
                    onClick={() => handleRevokeSession(session.id)}
                    disabled={revoking === session.id}
                    className="ml-2 border border-hairline px-1 py-0.5 text-[10px] text-text-secondary hover:text-signal-red hover:border-focus disabled:opacity-50"
                  >
                    {revoking === session.id ? '...' : 'Revoke'}
                  </button>
                )}
              </div>
            ))}
            {sessions.length === 0 && (
              <div className="text-xs text-text-dim">&gt; no sessions found</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
