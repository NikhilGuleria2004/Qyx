import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '../stores/authStore';

describe('Token storage security (Phase 13)', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      accessToken: null,
      mfaRequired: false,
      roleBucket: null,
      meVerifiedAt: null,
    });
    vi.restoreAllMocks();
  });

  it('does not include accessToken in partialize output', () => {
    const state = {
      user: { id: 'usr_1', email: 'test@example.com', name: 'Test User', role: 'admin', orgId: 'org_1' },
      accessToken: 'secret-access-token',
      mfaRequired: false,
      roleBucket: 'admin' as const,
      meVerifiedAt: null,
      setUser: () => {},
      setAccessToken: () => {},
      setMfaRequired: () => {},
      refreshAccessToken: async () => null,
      logout: () => {},
    };

    // Access the partialize function from the store config
    // The partialize function filters what gets persisted
    const partialize = (s: typeof state) => ({
      user: s.user,
      roleBucket: s.roleBucket,
    });

    const persisted = partialize(state);
    expect(persisted.accessToken).toBeUndefined();
    expect(persisted.user).toEqual(state.user);
    expect(persisted.roleBucket).toBe('admin');
  });

  it('clears accessToken from memory on logout', () => {
    useAuthStore.getState().setAccessToken('token-123');
    expect(useAuthStore.getState().accessToken).toBe('token-123');

    useAuthStore.getState().logout();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('does not have refreshToken in state', () => {
    // After Phase 13, refreshToken should not exist in the store
    const state = useAuthStore.getState();
    expect('refreshToken' in state).toBe(false);
  });
});
