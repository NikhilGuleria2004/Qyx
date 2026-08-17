import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { listGroups, listChannels, listGroupRequests, approveGroupRequest, rejectGroupRequest, listChannelRequests, approveChannelRequest, rejectChannelRequest } from '../api/adminApi';

type Request = {
  id: string;
  user_id: string;
  status: string;
  requested_at: number;
};

type Props = {
  orgId: string;
  token: string;
  onClose: () => void;
};

export default function RequestsScreen({ orgId, token, onClose }: Props) {
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [groupRequests, setGroupRequests] = useState<Record<string, Request[]>>({});
  const [channelRequests, setChannelRequests] = useState<Record<string, Request[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [groupsData, channelsData] = await Promise.all([
        listGroups(orgId, token),
        listChannels(orgId, token),
      ]);

      const groupsList = (groupsData as { groups: { id: string; name: string }[] }).groups || [];
      const channelsList = (channelsData as { channels: { id: string; name: string }[] }).channels || [];

      setGroups(groupsList);
      setChannels(channelsList);

      const groupReqs: Record<string, Request[]> = {};
      for (const g of groupsList) {
        try {
          const reqs = await listGroupRequests(g.id, token);
          groupReqs[g.id] = (reqs as { requests: Request[] }).requests || [];
        } catch {
          groupReqs[g.id] = [];
        }
      }
      setGroupRequests(groupReqs);

      const channelReqs: Record<string, Request[]> = {};
      for (const ch of channelsList) {
        try {
          const reqs = await listChannelRequests(ch.id, token);
          channelReqs[ch.id] = (reqs as { requests: Request[] }).requests || [];
        } catch {
          channelReqs[ch.id] = [];
        }
      }
      setChannelRequests(channelReqs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [orgId, token]);

  const handleApproveGroup = async (groupId: string, reqId: string) => {
    setProcessing(`${groupId}-${reqId}`);
    try {
      await approveGroupRequest(groupId, reqId, token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setProcessing(null);
    }
  };

  const handleRejectGroup = async (groupId: string, reqId: string) => {
    setProcessing(`${groupId}-${reqId}`);
    try {
      await rejectGroupRequest(groupId, reqId, token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setProcessing(null);
    }
  };

  const handleApproveChannel = async (channelId: string, reqId: string) => {
    setProcessing(`${channelId}-${reqId}`);
    try {
      await approveChannelRequest(channelId, reqId, token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setProcessing(null);
    }
  };

  const handleRejectChannel = async (channelId: string, reqId: string) => {
    setProcessing(`${channelId}-${reqId}`);
    try {
      await rejectChannelRequest(channelId, reqId, token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setProcessing(null);
    }
  };

  const totalGroupRequests = Object.values(groupRequests).reduce((sum, reqs) => sum + reqs.length, 0);
  const totalChannelRequests = Object.values(channelRequests).reduce((sum, reqs) => sum + reqs.length, 0);

  return (
    <div className="flex h-full w-full flex-col bg-void text-text-primary font-mono">
      <div className="flex h-9 items-center border-b border-hairline px-3">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Requests</span>
        <button onClick={onClose} className="ml-auto text-text-dim hover:text-text-primary" aria-label="Close">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {error && (
          <div className="mb-3 text-xs text-signal-red">&gt; {error}</div>
        )}

        {loading ? (
          <div className="text-xs text-text-dim">&gt; loading...</div>
        ) : (
          <div className="space-y-4">
            {totalGroupRequests === 0 && totalChannelRequests === 0 && (
              <div className="text-xs text-text-dim">&gt; no pending requests</div>
            )}

            {totalGroupRequests > 0 && (
              <div>
                <div className="text-xs font-medium text-text-secondary mb-2">GROUP REQUESTS ({totalGroupRequests})</div>
                <div className="space-y-2">
                  {groups.map((g) => {
                    const reqs = groupRequests[g.id] || [];
                    if (reqs.length === 0) return null;
                    return (
                      <div key={g.id} className="border border-hairline bg-raised">
                        <div className="px-2 py-1 text-xs text-text-primary border-b border-hairline"># {g.name}</div>
                        <div className="p-2 space-y-1">
                          {reqs.map((r) => (
                            <div key={r.id} className="flex items-center justify-between">
                              <span className="text-xs text-text-dim">{r.user_id}</span>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleApproveGroup(g.id, r.id)}
                                  disabled={processing === `${g.id}-${r.id}`}
                                  className="border border-hairline px-1 py-0.5 text-[10px] text-text-secondary hover:text-signal-cipher hover:border-focus disabled:opacity-50"
                                >
                                  {processing === `${g.id}-${r.id}` ? '...' : 'Approve'}
                                </button>
                                <button
                                  onClick={() => handleRejectGroup(g.id, r.id)}
                                  disabled={processing === `${g.id}-${r.id}`}
                                  className="border border-hairline px-1 py-0.5 text-[10px] text-text-secondary hover:text-signal-red hover:border-focus disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {totalChannelRequests > 0 && (
              <div>
                <div className="text-xs font-medium text-text-secondary mb-2">CHANNEL REQUESTS ({totalChannelRequests})</div>
                <div className="space-y-2">
                  {channels.map((ch) => {
                    const reqs = channelRequests[ch.id] || [];
                    if (reqs.length === 0) return null;
                    return (
                      <div key={ch.id} className="border border-hairline bg-raised">
                        <div className="px-2 py-1 text-xs text-text-primary border-b border-hairline"># {ch.name}</div>
                        <div className="p-2 space-y-1">
                          {reqs.map((r) => (
                            <div key={r.id} className="flex items-center justify-between">
                              <span className="text-xs text-text-dim">{r.user_id}</span>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleApproveChannel(ch.id, r.id)}
                                  disabled={processing === `${ch.id}-${r.id}`}
                                  className="border border-hairline px-1 py-0.5 text-[10px] text-text-secondary hover:text-signal-cipher hover:border-focus disabled:opacity-50"
                                >
                                  {processing === `${ch.id}-${r.id}` ? '...' : 'Approve'}
                                </button>
                                <button
                                  onClick={() => handleRejectChannel(ch.id, r.id)}
                                  disabled={processing === `${ch.id}-${r.id}`}
                                  className="border border-hairline px-1 py-0.5 text-[10px] text-text-secondary hover:text-signal-red hover:border-focus disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
