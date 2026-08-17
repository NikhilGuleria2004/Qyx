import { useState, useEffect } from 'react';
import { X, Bell, Plus } from 'lucide-react';
import { listAlertRules, createAlertRule, updateAlertRule, deleteAlertRule, getAlertEvents, evaluateAlertRules } from '../api/adminApi';

type AlertRule = {
  id: string;
  rule_name: string;
  severity: string;
  service?: string;
  threshold: string;
  status: string;
  last_fired_at?: number;
  created_at: number;
};

type AlertEvent = {
  id: string;
  alert_id: string;
  triggered_at: number;
  resolved_at?: number;
  metric_value?: string;
  status: string;
};

type AlertSummary = {
  total_alerts: number;
  active_alerts: number;
  firing_alerts: number;
  critical_alerts: number;
  high_alerts: number;
  medium_alerts: number;
  low_alerts: number;
};

type Props = {
  orgId: string;
  token: string;
  onClose: () => void;
};

type FormState = {
  rule_name: string;
  severity: string;
  service: string;
  threshold: string;
};

const EMPTY_FORM: FormState = {
  rule_name: '',
  severity: 'high',
  service: '',
  threshold: '{"metric":"error_rate","operator":">","value":5,"window_minutes":5}',
};

const PRESETS = [
  { rule_name: 'Elevated error rate', severity: 'high', service: 'api-gateway', threshold: '{"metric":"error_rate","operator":">","value":5,"window_minutes":5}' },
  { rule_name: 'Cross-org access-denial spike', severity: 'high', service: 'api-gateway', threshold: '{"metric":"cross_org_denial_count","operator":">","value":10,"window_minutes":5}' },
  { rule_name: 'Auth failure spike', severity: 'high', service: 'identity', threshold: '{"metric":"failed_login_rate","operator":">","value":5,"window_minutes":5}' },
  { rule_name: 'SSO integration failure', severity: 'medium', service: 'identity', threshold: '{"metric":"sso_error_rate","operator":">","value":3,"window_minutes":5}' },
  { rule_name: 'D1 error rate', severity: 'high', service: 'api-gateway', threshold: '{"metric":"d1_error_rate","operator":">","value":0.05,"window_minutes":5}' },
  { rule_name: 'Queue backlog growth', severity: 'medium', service: 'offline-delivery', threshold: '{"metric":"queue_depth","operator":">","value":100,"window_minutes":5}' },
];

export default function AlertsScreen({ orgId, token, onClose }: Props) {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [evaluating, setEvaluating] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listAlertRules(orgId, token);
      setRules((data as { rules: AlertRule[] }).rules || []);
      setSummary((data as { summary: AlertSummary }).summary || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alert rules');
    } finally {
      setLoading(false);
    }
  };

  const loadEvents = async (ruleId: string) => {
    try {
      const data = await getAlertEvents(orgId, ruleId, token);
      setEvents((data as { events: AlertEvent[] }).events || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alert events');
    }
  };

  useEffect(() => {
    load();
  }, [orgId, token]);

  const handlePreset = (preset: typeof PRESETS[0]) => {
    setForm({
      rule_name: preset.rule_name,
      severity: preset.severity,
      service: preset.service,
      threshold: preset.threshold,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        rule_name: form.rule_name,
        severity: form.severity,
        service: form.service || null,
        threshold: form.threshold,
        organization_id: orgId,
      };

      if (editingId) {
        await updateAlertRule(orgId, editingId, payload, token);
      } else {
        await createAlertRule(orgId, payload, token);
      }

      setForm(EMPTY_FORM);
      setShowForm(false);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save alert rule');
    }
  };

  const handleEdit = (rule: AlertRule) => {
    setForm({
      rule_name: rule.rule_name,
      severity: rule.severity,
      service: rule.service || '',
      threshold: rule.threshold,
    });
    setEditingId(rule.id);
    setShowForm(true);
  };

  const handleDelete = async (ruleId: string) => {
    if (!confirm('Delete this alert rule?')) return;
    try {
      await deleteAlertRule(orgId, ruleId, token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rule');
    }
  };

  const handleEvaluate = async () => {
    setEvaluating(true);
    setError('');
    try {
      await evaluateAlertRules(orgId, token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to evaluate rules');
    } finally {
      setEvaluating(false);
    }
  };

  const severityColor = (severity: string) => {
    if (severity === 'critical') return 'text-signal-red';
    if (severity === 'high') return 'text-signal-amber';
    if (severity === 'medium') return 'text-signal-cipher';
    return 'text-text-secondary';
  };

  const statusColor = (status: string) => {
    if (status === 'active') return 'text-signal-cipher';
    if (status === 'firing') return 'text-signal-red';
    if (status === 'suppressed') return 'text-signal-amber';
    return 'text-text-secondary';
  };

  return (
    <div className="flex h-full w-full flex-col bg-void text-text-primary font-mono">
      <div className="flex h-9 items-center border-b border-hairline px-3">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Alerts</span>
        <button onClick={onClose} className="ml-auto text-text-dim hover:text-text-primary" aria-label="Close">
          <X size={14} />
        </button>
      </div>

      {summary && (
        <div className="flex items-center gap-3 border-b border-hairline px-3 py-2">
          <div className="flex items-center gap-1">
            <Bell size={12} className="text-text-secondary" />
            <span className="text-[10px] text-text-dim">{summary.active_alerts} active</span>
          </div>
          <span className={`text-[10px] ${severityColor('critical')}`}>{summary.critical_alerts} critical</span>
          <span className={`text-[10px] ${severityColor('high')}`}>{summary.high_alerts} high</span>
          <span className={`text-[10px] ${severityColor('medium')}`}>{summary.medium_alerts} medium</span>
          <span className={`text-[10px] ${severityColor('low')}`}>{summary.low_alerts} low</span>
          <button
            onClick={handleEvaluate}
            disabled={evaluating}
            className="ml-auto border border-hairline px-2 py-0.5 text-[10px] text-text-secondary hover:text-text-primary hover:border-focus disabled:opacity-50"
          >
            {evaluating ? 'Evaluating...' : 'Evaluate'}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {error && (
          <div className="mb-3 text-xs text-signal-red">&gt; {error}</div>
        )}

        {loading ? (
          <div className="text-xs text-text-dim">&gt; loading...</div>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div key={rule.id} className="border border-hairline bg-raised px-2 py-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-primary">{rule.rule_name}</span>
                      <span className={`text-[10px] ${severityColor(rule.severity)}`}>{rule.severity}</span>
                      <span className={`text-[10px] ${statusColor(rule.status)}`}>{rule.status}</span>
                    </div>
                    <div className="text-[10px] text-text-dim">
                      {rule.service || 'all services'} · threshold: {rule.threshold}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={() => loadEvents(rule.id)}
                      className="border border-hairline px-1 py-0.5 text-[10px] text-text-secondary hover:text-text-primary hover:border-focus"
                    >
                      Events
                    </button>
                    <button
                      onClick={() => handleEdit(rule)}
                      className="border border-hairline px-1 py-0.5 text-[10px] text-text-secondary hover:text-text-primary hover:border-focus"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="border border-hairline px-1 py-0.5 text-[10px] text-text-secondary hover:text-signal-red hover:border-focus"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {rules.length === 0 && (
              <div className="text-xs text-text-dim">&gt; no alert rules configured</div>
            )}
          </div>
        )}

        {events.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-medium text-text-secondary mb-2">RECENT EVENTS</div>
            <div className="space-y-1">
              {events.map((event) => (
                <div key={event.id} className="flex items-center justify-between border border-hairline bg-raised px-2 py-1">
                  <div className="flex-1 min-w-0">
                    <span className={`text-[10px] ${statusColor(event.status)}`}>{event.status}</span>
                    <span className="text-[10px] text-text-dim ml-2">
                      {new Date(event.triggered_at).toLocaleString()}
                    </span>
                  </div>
                  {event.metric_value && (
                    <span className="text-[10px] text-text-secondary ml-2 truncate max-w-[200px]">
                      {event.metric_value}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="mt-3 space-y-2 border border-hairline bg-raised p-2">
            <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">
              {editingId ? 'Edit Rule' : 'Add Rule'}
            </div>
            <div className="flex gap-2 mb-2 flex-wrap">
              {PRESETS.map((preset, idx) => (
                <button key={idx} type="button" onClick={() => handlePreset(preset)} className="border border-hairline px-1 py-0.5 text-[10px] text-text-secondary hover:text-text-primary">
                  {preset.rule_name}
                </button>
              ))}
            </div>
            <div>
              <label className="text-[10px] text-text-dim block mb-1">Rule name</label>
              <input
                type="text"
                value={form.rule_name}
                onChange={(e) => setForm({ ...form, rule_name: e.target.value })}
                className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
                required
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-text-dim block mb-1">Severity</label>
                <select
                  value={form.severity}
                  onChange={(e) => setForm({ ...form, severity: e.target.value })}
                  className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-focus"
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="critical">critical</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-text-dim block mb-1">Service</label>
                <input
                  type="text"
                  value={form.service}
                  onChange={(e) => setForm({ ...form, service: e.target.value })}
                  className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
                  placeholder="api-gateway"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-text-dim block mb-1">Threshold (JSON)</label>
              <textarea
                value={form.threshold}
                onChange={(e) => setForm({ ...form, threshold: e.target.value })}
                className="w-full bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
                rows={3}
                required
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="border border-hairline px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-focus"
              >
                Save
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
            Add Alert Rule
          </button>
        )}
      </div>
    </div>
  );
}
