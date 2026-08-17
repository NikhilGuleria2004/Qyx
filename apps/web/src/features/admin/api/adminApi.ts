const API_BASE = '/v1';

interface ApiError {
  message: string;
  error?: {
    message: string;
  };
}

async function request(path: string, options: RequestInit = {}, token?: string): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    let error: ApiError = { message: text };
    try {
      error = JSON.parse(text);
    } catch {
      // keep raw text as message
    }
    throw new Error(error.error?.message || error.message || `HTTP ${res.status}`);
  }

  if (res.status === 204) {
    return null;
  }

  return res.json();
}

export async function getOrganizationSettings(orgId: string, token: string) {
  return request(`/organizations/${orgId}/settings`, { method: 'GET' }, token);
}

export async function updateOrganizationSettings(orgId: string, data: Record<string, unknown>, token: string) {
  return request(`/organizations/${orgId}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }, token);
}

export async function listMembers(orgId: string, token: string) {
  return request(`/organizations/${orgId}/members`, { method: 'GET' }, token);
}

export async function createMember(orgId: string, data: { email: string; display_name: string; role: string }, token: string) {
  return request(`/organizations/${orgId}/members`, {
    method: 'POST',
    body: JSON.stringify(data),
  }, token);
}

export async function updateMemberRole(orgId: string, userId: string, role: string, token: string) {
  return request(`/organizations/${orgId}/members/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  }, token);
}

export async function updateMemberStatus(orgId: string, userId: string, status: string, token: string) {
  return request(`/organizations/${orgId}/members/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }, token);
}

export async function listGroups(_orgId: string, token: string) {
  return request(`/groups`, { method: 'GET' }, token);
}

export async function createGroup(_orgId: string, data: { name: string; description?: string }, token: string) {
  return request(`/groups`, {
    method: 'POST',
    body: JSON.stringify(data),
  }, token);
}

export async function deleteGroup(groupId: string, token: string) {
  return request(`/groups/${groupId}`, { method: 'DELETE' }, token);
}

export async function listChannels(_orgId: string, token: string) {
  return request(`/channels`, { method: 'GET' }, token);
}

export async function createChannel(_orgId: string, data: { name: string; description?: string }, token: string) {
  return request(`/channels`, {
    method: 'POST',
    body: JSON.stringify(data),
  }, token);
}

export async function deleteChannel(channelId: string, token: string) {
  return request(`/channels/${channelId}`, { method: 'DELETE' }, token);
}

export async function listGroupRequests(groupId: string, token: string) {
  return request(`/groups/${groupId}/requests`, { method: 'GET' }, token);
}

export async function approveGroupRequest(groupId: string, reqId: string, token: string) {
  return request(`/groups/${groupId}/requests/${reqId}/approve`, {
    method: 'POST',
    body: JSON.stringify({}),
  }, token);
}

export async function rejectGroupRequest(groupId: string, reqId: string, token: string) {
  return request(`/groups/${groupId}/requests/${reqId}/reject`, {
    method: 'POST',
    body: JSON.stringify({}),
  }, token);
}

export async function listChannelRequests(channelId: string, token: string) {
  return request(`/channels/${channelId}/requests`, { method: 'GET' }, token);
}

export async function approveChannelRequest(channelId: string, reqId: string, token: string) {
  return request(`/channels/${channelId}/requests/${reqId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ reaction: 'yes' }),
  }, token);
}

export async function rejectChannelRequest(channelId: string, reqId: string, token: string) {
  return request(`/channels/${channelId}/requests/${reqId}/reject`, {
    method: 'POST',
    body: JSON.stringify({}),
  }, token);
}

export async function getSecuritySummary(orgId: string, token: string) {
  return request(`/organizations/${orgId}/security-summary`, { method: 'GET' }, token);
}

export async function getMetrics(orgId: string, type: string, token: string) {
  return request(`/organizations/${orgId}/metrics?type=${type}`, { method: 'GET' }, token);
}

export async function listAuditEvents(orgId: string, options: { event_type?: string; actor_id?: string; cursor?: number; limit?: number } = {}, token: string) {
  const params = new URLSearchParams();
  if (options.event_type) params.set('event_type', options.event_type);
  if (options.actor_id) params.set('actor_id', options.actor_id);
  if (options.cursor) params.set('cursor', String(options.cursor));
  if (options.limit) params.set('limit', String(options.limit));
  const query = params.toString();
  return request(`/organizations/${orgId}/audit${query ? '?' + query : ''}`, { method: 'GET' }, token);
}

export async function listOrgDevices(orgId: string, token: string) {
  return request(`/organizations/${orgId}/devices`, { method: 'GET' }, token);
}

export async function revokeOrgDevice(orgId: string, deviceId: string, token: string) {
  return request(`/organizations/${orgId}/devices/${deviceId}/revoke`, { method: 'POST' }, token);
}

export async function listOrgSessions(orgId: string, token: string) {
  return request(`/organizations/${orgId}/sessions`, { method: 'GET' }, token);
}

export async function revokeOrgSession(orgId: string, sessionId: string, token: string) {
  return request(`/organizations/${orgId}/sessions/${sessionId}/revoke`, { method: 'POST' }, token);
}

export async function listAlertRules(orgId: string, token: string) {
  return request(`/organizations/${orgId}/alerts`, { method: 'GET' }, token);
}

export async function createAlertRule(orgId: string, data: Record<string, unknown>, token: string) {
  return request(`/organizations/${orgId}/alerts`, {
    method: 'POST',
    body: JSON.stringify(data),
  }, token);
}

export async function updateAlertRule(orgId: string, ruleId: string, data: Record<string, unknown>, token: string) {
  return request(`/organizations/${orgId}/alerts/${ruleId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }, token);
}

export async function deleteAlertRule(orgId: string, ruleId: string, token: string) {
  return request(`/organizations/${orgId}/alerts/${ruleId}`, { method: 'DELETE' }, token);
}

export async function getAlertEvents(orgId: string, ruleId: string, token: string) {
  return request(`/organizations/${orgId}/alerts/${ruleId}/events`, { method: 'GET' }, token);
}

export async function evaluateAlertRules(orgId: string, token: string) {
  return request(`/organizations/${orgId}/alerts/evaluate`, { method: 'POST' }, token);
}

export async function listSsoProviders(orgId: string, token: string) {
  return request(`/organizations/${orgId}/sso/providers`, { method: 'GET' }, token);
}

export async function createSsoProvider(orgId: string, data: Record<string, unknown>, token: string) {
  return request(`/organizations/${orgId}/sso/providers`, {
    method: 'POST',
    body: JSON.stringify(data),
  }, token);
}

export async function updateSsoProvider(orgId: string, providerId: string, data: Record<string, unknown>, token: string) {
  return request(`/organizations/${orgId}/sso/providers/${providerId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }, token);
}

export async function deleteSsoProvider(orgId: string, providerId: string, token: string) {
  return request(`/organizations/${orgId}/sso/providers/${providerId}`, { method: 'DELETE' }, token);
}
