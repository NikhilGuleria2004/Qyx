import { useAuthStore } from '../stores/authStore';

export function getAccessToken(): string | null {
  return useAuthStore.getState().accessToken;
}

export function getRefreshToken(): string | null {
  return useAuthStore.getState().refreshToken;
}

export function getUser() {
  return useAuthStore.getState().user;
}

export function setSession(accessToken: string, refreshToken: string, user: { id: string; organization_id: string; role: string; email?: string; display_name?: string }) {
  useAuthStore.getState().setTokens(accessToken, refreshToken);
  useAuthStore.getState().setUser({
    id: user.id,
    email: user.email || '',
    name: user.display_name || user.email || '',
    role: user.role,
    orgId: user.organization_id,
  });
}

export function clearSession() {
  useAuthStore.getState().logout();
}

let refreshing = false;
let refreshPromise: Promise<string | null> | null = null;

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res = await fetch(`/v1${path}`, { ...options, headers });

  if (res.status === 401 && !(options as { _retry?: boolean })._retry) {
    if (!refreshing) {
      refreshing = true;
      refreshPromise = useAuthStore.getState().refreshAccessToken();
      try {
        const newToken = await refreshPromise;
        if (newToken) {
          const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
          res = await fetch(`/v1${path}`, { ...options, headers: retryHeaders, _retry: true } as RequestInit);
        }
      } catch {
        clearSession();
      } finally {
        refreshing = false;
        refreshPromise = null;
      }
    } else if (refreshPromise) {
      await refreshPromise;
      const newToken = getAccessToken();
      if (newToken) {
        const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
        res = await fetch(`/v1${path}`, { ...options, headers: retryHeaders, _retry: true } as RequestInit);
      }
    }
  }

  return res;
}

export async function getMe(): Promise<{ id: string; email: string; display_name: string; role: string; organization_id: string } | null> {
  const res = await apiFetch('/auth/me');
  if (!res.ok) return null;
  const data = await res.json();
  if (data.error) return null;
  return data;
}

export async function refreshAccessToken(): Promise<string | null> {
  return useAuthStore.getState().refreshAccessToken();
}

export async function logout(): Promise<void> {
  const token = getAccessToken();
  try {
    await fetch('/v1/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  } catch {
    // ignore network errors during logout
  }
  clearSession();
}
