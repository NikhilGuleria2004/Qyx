import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockGetPlatformSummary = vi.fn();
vi.mock('../../admin/api/adminApi', () => ({
  getPlatformSummary: (...args: unknown[]) => mockGetPlatformSummary(...args),
}));

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
vi.stubGlobal('localStorage', localStorageMock);

import { useAuthStore } from '../../../stores/authStore';
import SuperAdminHome from './SuperAdminHome';

function renderSuperAdminHome() {
  return render(
    <MemoryRouter initialEntries={['/superadmin']}>
      <SuperAdminHome />
    </MemoryRouter>
  );
}

describe('SuperAdminHome dashboard data (Phase 7)', () => {
  beforeEach(() => {
    localStorageMock.clear();
    useAuthStore.setState({
      user: { id: 'usr_1', email: 'super@test.com', name: 'Super', role: 'super_admin', orgId: 'org_1' },
      accessToken: 'test-token',
      refreshToken: null,
      mfaRequired: false,
      roleBucket: 'superadmin',
      meVerifiedAt: null,
    });
    mockGetPlatformSummary.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders real API data, not hardcoded values', async () => {
    mockGetPlatformSummary.mockResolvedValue({
      summary: {
        total_organizations: 42,
        active_users: 1500,
        pending_verifications: 8,
        failed_logins_24h: 23,
        pending_device_authorizations: 5,
      },
    });

    renderSuperAdminHome();

    await waitFor(() => expect(mockGetPlatformSummary).toHaveBeenCalledWith('test-token'));

    expect(screen.getByText('organizations: 42')).toBeDefined();
    expect(screen.getByText('active users: 1500')).toBeDefined();
    expect(screen.getByText('pending verifications: 8')).toBeDefined();
    expect(screen.getByText('failed logins (24h): 23')).toBeDefined();
    expect(screen.getByText('pending device authorizations: 5')).toBeDefined();

    expect(screen.queryByText('12')).toBeNull();
    expect(screen.queryByText('1,248')).toBeNull();
  });

  it('renders zero values distinctly from loading', async () => {
    mockGetPlatformSummary.mockResolvedValue({
      summary: {
        total_organizations: 0,
        active_users: 0,
        pending_verifications: 0,
        failed_logins_24h: 0,
        pending_device_authorizations: 0,
      },
    });

    renderSuperAdminHome();

    await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());

    expect(screen.getByText('organizations: 0')).toBeDefined();
    expect(screen.getByText('active users: 0')).toBeDefined();
    expect(screen.getByText('pending verifications: 0')).toBeDefined();
    expect(screen.getByText('failed logins (24h): 0')).toBeDefined();
    expect(screen.getByText('pending device authorizations: 0')).toBeDefined();
  });

  it('shows loading state initially', () => {
    mockGetPlatformSummary.mockReturnValue(new Promise(() => {}));

    renderSuperAdminHome();

    expect(screen.getByText('Loading...')).toBeDefined();
  });
});
