import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../admin/api/adminApi', () => ({
  getSecuritySummary: vi.fn().mockResolvedValue(null),
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
import AdminHome from './AdminHome';

function renderAdminHome() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <AdminHome />
    </MemoryRouter>
  );
}

describe('AdminHome SPA navigation (Phase 9)', () => {
  beforeEach(() => {
    localStorageMock.clear();
    useAuthStore.setState({
      user: { id: 'usr_1', email: 'admin@test.com', name: 'Admin', role: 'admin', orgId: 'org_1' },
      accessToken: 'test-token',
      mfaRequired: false,
      roleBucket: 'admin',
      meVerifiedAt: null,
    });
  });

  it('renders quick-links as anchor elements with correct hrefs', () => {
    renderAdminHome();

    const membersLink = screen.getByText('Members');
    expect(membersLink.tagName).toBe('A');
    expect(membersLink.getAttribute('href')).toBe('/admin/members');

    const groupsLink = screen.getByText('Groups');
    expect(groupsLink.tagName).toBe('A');
    expect(groupsLink.getAttribute('href')).toBe('/admin/groups');
  });

  it('renders multiple quick-links for admin role', () => {
    renderAdminHome();

    const expectedLinks = ['Members', 'Groups', 'Channels', 'Requests', 'Org Settings', 'Security Center', 'Audit Log', 'SSO', 'Alerts'];
    expectedLinks.forEach((label) => {
      const link = screen.getByText(label);
      expect(link.tagName).toBe('A');
      expect(link.getAttribute('href')).toMatch(/^\/admin\//);
    });
  });
});
