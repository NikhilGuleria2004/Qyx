import { useState, useEffect } from 'react';
import { X, Shield } from 'lucide-react';
import { getMetrics } from '../api/adminApi';

type SecurityMetrics = {
  mfa_adoption_percentage: number;
  device_verification_percentage: number;
  active_sessions: number;
  suspended_accounts: number;
  unrecognized_devices: number;
  failed_login_rate: number;
  cross_org_access_denial_count: number;
  sso_error_count: number;
};

type Props = {
  orgId: string;
  token: string;
  onClose: () => void;
};

function BarMeter({ value, max = 100, color = 'text-signal-cipher' }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, Math.round((value / max) * 100)));
  const filled = Math.round(pct / 10);
  const empty = 10 - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs font-mono ${color}`}>{bar}</span>
      <span className="text-xs text-text-secondary w-10 text-right">{pct}%</span>
    </div>
  );
}

export default function SecurityCenterScreen({ orgId, token, onClose }: Props) {
  const [metrics, setMetrics] = useState<SecurityMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getMetrics(orgId, 'security', token);
      setMetrics((data as { metrics: SecurityMetrics }).metrics || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load security metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [orgId, token]);

  if (loading) {
    return (
      <div className="flex h-full w-full flex-col bg-void text-text-primary font-mono">
        <div className="flex h-9 items-center border-b border-hairline px-3">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Security Center</span>
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

  if (error || !metrics) {
    return (
      <div className="flex h-full w-full flex-col bg-void text-text-primary font-mono">
        <div className="flex h-9 items-center border-b border-hairline px-3">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Security Center</span>
          <button onClick={onClose} className="ml-auto text-text-dim hover:text-text-primary" aria-label="Close">
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-xs text-signal-red">&gt; {error || 'failed to load security metrics'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-void text-text-primary font-mono">
      <div className="flex h-9 items-center border-b border-hairline px-3">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Security Center</span>
        <button onClick={onClose} className="ml-auto text-text-dim hover:text-text-primary" aria-label="Close">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <div className="text-xs text-text-dim mb-2">
          organization: <span className="text-text-primary">{orgId}</span>
        </div>

        <div className="border border-hairline bg-raised p-3">
          <div className="text-xs font-medium text-text-secondary mb-2">MFA ADOPTION</div>
          <div className="text-xs text-text-dim mb-1">
            {metrics.mfa_adoption_percentage}% enrolled
          </div>
          <BarMeter value={metrics.mfa_adoption_percentage} max={100} color="text-signal-cipher" />
        </div>

        <div className="border border-hairline bg-raised p-3">
          <div className="text-xs font-medium text-text-secondary mb-2">DEVICE VERIFICATION</div>
          <div className="text-xs text-text-dim mb-1">
            {metrics.device_verification_percentage}% verified
          </div>
          <BarMeter value={metrics.device_verification_percentage} max={100} color="text-signal-cipher" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="border border-hairline bg-raised p-3">
            <div className="text-xs font-medium text-text-secondary mb-1">ACTIVE SESSIONS</div>
            <div className="text-lg text-text-primary font-mono">{metrics.active_sessions}</div>
          </div>
          <div className="border border-hairline bg-raised p-3">
            <div className="text-xs font-medium text-text-secondary mb-1">SUSPENDED ACCOUNTS</div>
            <div className="text-lg text-signal-amber font-mono">{metrics.suspended_accounts}</div>
          </div>
        </div>

        <div className="border border-hairline bg-raised p-3">
          <div className="text-xs font-medium text-text-secondary mb-1">UNRECOGNIZED DEVICES</div>
          <div className={`text-lg font-mono ${metrics.unrecognized_devices > 0 ? 'text-signal-amber' : 'text-signal-cipher'}`}>
            {metrics.unrecognized_devices}
          </div>
          {metrics.unrecognized_devices > 0 && (
            <div className="text-xs text-text-dim mt-1">pending devices awaiting authorization</div>
          )}
        </div>

        <div className="border border-hairline bg-raised p-3">
          <div className="text-xs font-medium text-text-secondary mb-2">SECURITY SIGNALS</div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">Failed login rate (1h)</span>
              <span className={`font-mono ${metrics.failed_login_rate > 10 ? 'text-signal-red' : 'text-text-primary'}`}>{metrics.failed_login_rate}/min</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">Cross-org access denials (1h)</span>
              <span className={`font-mono ${metrics.cross_org_access_denial_count > 0 ? 'text-signal-amber' : 'text-signal-cipher'}`}>{metrics.cross_org_access_denial_count}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">SSO errors (1h)</span>
              <span className={`font-mono ${metrics.sso_error_count > 0 ? 'text-signal-amber' : 'text-signal-cipher'}`}>{metrics.sso_error_count}</span>
            </div>
          </div>
        </div>

        <div className="border border-hairline bg-raised p-3">
          <div className="text-xs font-medium text-text-secondary mb-2">SYSTEM STATUS</div>
          <div className="flex items-center gap-2">
            <Shield size={12} className="text-signal-cipher" />
            <span className="text-xs text-signal-cipher">security posture nominal</span>
          </div>
        </div>
      </div>
    </div>
  );
}
