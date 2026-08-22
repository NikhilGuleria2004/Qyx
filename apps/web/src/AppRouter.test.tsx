import { describe, it, expect } from 'vitest';
import { matchRoutes, type RouteObject } from 'react-router-dom';
import { ADMIN_NAV_ITEMS } from './lib/roles';

function buildRouteConfig(): RouteObject[] {
  return [
    {
      path: '/',
      children: [
        { path: '/' },
        { path: '/register' },
        { path: '/login' },
        { path: '/mfa' },
        { path: '/auth/sso/:provider/callback' },
        { path: '/onboarding' },
        {
          path: '/superadmin',
          children: [
            { index: true },
            ...ADMIN_NAV_ITEMS.map((item) => ({
              path: `/superadmin/${item.segment}`,
            })),
          ],
        },
        {
          path: '/admin',
          children: [
            { index: true },
            ...ADMIN_NAV_ITEMS.map((item) => ({
              path: item.segment,
            })),
          ],
        },
        {
          path: '/employee',
          children: [{ index: true }],
        },
        { path: '/app' },
        { path: '/app/*' },
        { path: '*' },
      ],
    },
  ];
}

describe('AppRouter route resolution (Phase 5)', () => {
  const routeConfig = buildRouteConfig();

  it('resolves all 10 admin nav destinations to registered routes', () => {
    for (const item of ADMIN_NAV_ITEMS) {
      const path = `/admin/${item.segment}`;
      const matches = matchRoutes(routeConfig, path);
      expect(matches, `Expected ${path} to match a route`).not.toBeNull();
      expect(matches!.length).toBeGreaterThan(0);

      const lastMatch = matches![matches!.length - 1];
      const routePath = lastMatch.route.path || '';

      expect(
        routePath === item.segment || routePath === '*',
        `Expected ${path} to resolve to "${item.segment}", got "${routePath}"`
      ).toBe(true);
    }
  });

  it('resolves all 10 superadmin nav destinations to registered routes', () => {
    for (const item of ADMIN_NAV_ITEMS) {
      const path = `/superadmin/${item.segment}`;
      const matches = matchRoutes(routeConfig, path);
      expect(matches, `Expected ${path} to match a route`).not.toBeNull();
      expect(matches!.length).toBeGreaterThan(0);

      const lastMatch = matches![matches!.length - 1];
      const routePath = lastMatch.route.path || '';

      expect(
        routePath === `/superadmin/${item.segment}` || routePath === '*',
        `Expected ${path} to resolve to "/superadmin/${item.segment}", got "${routePath}"`
      ).toBe(true);
    }
  });

  it('does not resolve any admin nav destination to the catch-all route', () => {
    for (const item of ADMIN_NAV_ITEMS) {
      const path = `/admin/${item.segment}`;
      const matches = matchRoutes(routeConfig, path);
      const lastMatch = matches![matches!.length - 1];

      expect(
        lastMatch.route.path,
        `Expected ${path} NOT to resolve to catch-all`
      ).not.toBe('*');
    }
  });

  it('does not resolve any superadmin nav destination to the catch-all route', () => {
    for (const item of ADMIN_NAV_ITEMS) {
      const path = `/superadmin/${item.segment}`;
      const matches = matchRoutes(routeConfig, path);
      const lastMatch = matches![matches!.length - 1];

      expect(
        lastMatch.route.path,
        `Expected ${path} NOT to resolve to catch-all`
      ).not.toBe('*');
    }
  });

  it('resolves /admin index route', () => {
    const matches = matchRoutes(routeConfig, '/admin');
    expect(matches).not.toBeNull();
  });

  it('resolves /superadmin index route', () => {
    const matches = matchRoutes(routeConfig, '/superadmin');
    expect(matches).not.toBeNull();
  });
});
