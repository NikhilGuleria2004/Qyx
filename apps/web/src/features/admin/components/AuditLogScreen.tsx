import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { listAuditEvents } from '../api/adminApi';

type AuditEvent = {
  id: string;
  organization_id: string;
  actor_id?: string;
  event_type: string;
  metadata?: Record<string, unknown>;
  created_at: number;
};

type Props = {
  orgId: string;
  token: string;
  onClose: () => void;
};

const EVENT_TYPES = [
  'user_registered',
  'login_success',
  'login_failed',
  'login_mfa_required',
  'mfa_verified',
  'logout',
  'user_added',
  'role_changed',
  'user_suspended',
  'user_reactivated',
  'org_created',
  'domain_added',
  'domain_verified',
  'org_settings_updated',
  'group_created',
  'group_deleted',
  'group_join_requested',
  'group_request_approved',
  'group_request_rejected',
  'group_member_removed',
  'channel_created',
  'channel_deleted',
  'channel_join_requested',
  'channel_request_approved',
  'channel_request_rejected',
  'channel_post_created',
  'device_registered',
  'device_authorized',
  'device_revoked',
  'passkey_registered',
  'passkey_login',
  'conversation_created',
  'message_sent',
  'file_upload_requested',
  'file_upload_completed',
  'cross_org_access_denied',
];

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `[${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}]`;
}

function formatMetadata(metadata?: Record<string, unknown>): string {
  if (!metadata || Object.keys(metadata).length === 0) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined) continue;
    parts.push(`${key}=${value}`);
  }
  return ` (${parts.join(', ')})`;
}

export default function AuditLogScreen({ orgId, token, onClose }: Props) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nextCursor, setNextCursor] = useState<number | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [actorIdFilter, setActorIdFilter] = useState('');

  const load = async (cursor?: number) => {
    setLoading(true);
    setError('');
    try {
      const data = await listAuditEvents(orgId, {
        event_type: eventTypeFilter || undefined,
        actor_id: actorIdFilter || undefined,
        cursor,
        limit: 50,
      }, token);
      const result = data as { events: AuditEvent[]; next_cursor?: number };
      if (cursor) {
        setEvents((prev) => [...prev, ...result.events]);
      } else {
        setEvents(result.events);
      }
      setNextCursor(result.next_cursor);
      setHasMore(!!result.next_cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [orgId, token]);

  const handleFilter = () => {
    load();
  };

  const handleLoadMore = () => {
    if (nextCursor) {
      load(nextCursor);
    }
  };

  const eventTypeColor = (eventType: string): string => {
    if (eventType.includes('user_added') || eventType.includes('role_changed')) return 'text-signal-amber';
    if (eventType.includes('login') || eventType.includes('mfa')) return 'text-signal-cipher';
    if (eventType.includes('revoked') || eventType.includes('deleted') || eventType.includes('suspended')) return 'text-signal-red';
    if (eventType.includes('group') || eventType.includes('channel')) return 'text-signal-violet';
    if (eventType.includes('device')) return 'text-text-secondary';
    return 'text-text-primary';
  };

  return (
    <div className="flex h-full w-full flex-col bg-void text-text-primary font-mono">
      <div className="flex h-9 items-center border-b border-hairline px-3">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Audit Log</span>
        <button onClick={onClose} className="ml-auto text-text-dim hover:text-text-primary" aria-label="Close">
          <X size={14} />
        </button>
      </div>

      <div className="flex items-center gap-2 border-b border-hairline px-3 py-2">
        <select
          value={eventTypeFilter}
          onChange={(e) => setEventTypeFilter(e.target.value)}
          className="bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-focus"
        >
          <option value="">All event types</option>
          {EVENT_TYPES.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="actor_id filter"
          value={actorIdFilter}
          onChange={(e) => setActorIdFilter(e.target.value)}
          className="bg-transparent border border-hairline px-2 py-1 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-focus"
        />
        <button
          onClick={handleFilter}
          className="border border-hairline px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-focus"
        >
          Apply
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {error && (
          <div className="mb-3 text-xs text-signal-red">&gt; {error}</div>
        )}

        {loading && events.length === 0 ? (
          <div className="text-xs text-text-dim">&gt; loading...</div>
        ) : (
          <div className="space-y-0.5">
            {events.map((event) => (
              <div key={event.id} className="flex items-start gap-2 text-xs">
                <span className="text-text-dim shrink-0">{formatTimestamp(event.created_at)}</span>
                <span className={`shrink-0 ${eventTypeColor(event.event_type)}`}>{event.event_type}</span>
                <span className="text-text-dim shrink-0">&gt;</span>
                <span className="text-text-secondary shrink-0">{event.actor_id || 'system'}</span>
                {formatMetadata(event.metadata) && (
                  <span className="text-text-dim truncate">{formatMetadata(event.metadata)}</span>
                )}
              </div>
            ))}
            {events.length === 0 && !loading && (
              <div className="text-xs text-text-dim">&gt; no audit events found</div>
            )}
          </div>
        )}

        {hasMore && (
          <div className="mt-3">
            <button
              onClick={handleLoadMore}
              disabled={loading}
              className="border border-hairline px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-focus disabled:opacity-50"
            >
              {loading ? 'loading...' : 'load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
