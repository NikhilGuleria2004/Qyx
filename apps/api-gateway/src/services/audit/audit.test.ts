import { describe, it, expect, beforeEach } from 'vitest';
import { AuditService } from './audit.service';

describe('Audit log creation for sensitive mutations', () => {
  let db: D1Database;
  let service: AuditService;
  let auditEvents: Record<string, unknown>[];

  let timestampCounter = 0;

  beforeEach(() => {
    auditEvents = [];
    timestampCounter = 0;

    db = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => null,
          all: async () => {
            if (sql.includes('SELECT id, organization_id, actor_id, event_type, metadata, created_at FROM audit_events')) {
              let filtered = auditEvents.filter((e) => e.organization_id === args[0]);
              if (sql.includes('event_type = ?')) {
                filtered = filtered.filter((e) => e.event_type === args[1]);
              }
              if (sql.includes('actor_id = ?')) {
                filtered = filtered.filter((e) => e.actor_id === args[args.indexOf('actor_id = ?') + 1]);
              }
              if (sql.includes('created_at < ?')) {
                filtered = filtered.filter((e) => (e.created_at as number) < (args[args.length - 2] as number));
              }
              const limit = args[args.length - 1] as number;
              const rows = filtered.sort((a, b) => (b.created_at as number) - (a.created_at as number)).slice(0, limit);
              return {
                results: rows.map((e) => ({
                  ...e,
                  metadata: e.metadata ? JSON.stringify(e.metadata) : undefined,
                })),
              };
            }
            return { results: [] };
          },
          run: async () => {
            if (sql.includes('INSERT INTO audit_events')) {
              auditEvents.push({
                id: args[0] as string,
                organization_id: args[1] as string,
                actor_id: args[2] as string | undefined,
                event_type: args[3] as string,
                metadata: args[4] ? JSON.parse(args[4] as string) : undefined,
                created_at: (args[5] as number) + timestampCounter++,
              });
            }
            return { changes: 1 };
          },
        }),
      }),
    } as unknown as D1Database;

    service = new AuditService(db);
  });

  it('logs user registration', async () => {
    await service.log({
      organization_id: 'org_123',
      actor_id: 'usr_123',
      event_type: 'user_registered',
      metadata: { email: 'test@example.com', org_created: true },
    });

    expect(auditEvents.length).toBe(1);
    expect(auditEvents[0].event_type).toBe('user_registered');
    expect(auditEvents[0].organization_id).toBe('org_123');
    expect(auditEvents[0].actor_id).toBe('usr_123');
  });

  it('logs role changes', async () => {
    await service.log({
      organization_id: 'org_123',
      actor_id: 'admin_123',
      event_type: 'role_changed',
      metadata: { target_user: 'usr_456', old_role: 'employee', new_role: 'manager' },
    });

    expect(auditEvents.length).toBe(1);
    expect(auditEvents[0].event_type).toBe('role_changed');
    expect((auditEvents[0].metadata as Record<string, unknown>).target_user).toBe('usr_456');
  });

  it('logs failed login attempts', async () => {
    await service.log({
      organization_id: '',
      actor_id: undefined,
      event_type: 'login_failed',
      metadata: { email: 'test@example.com', reason: 'Invalid credentials' },
    });

    expect(auditEvents.length).toBe(1);
    expect(auditEvents[0].event_type).toBe('login_failed');
  });

  it('logs device registration', async () => {
    await service.log({
      organization_id: 'org_123',
      actor_id: 'usr_123',
      event_type: 'device_registered',
      metadata: { device_id: 'dev_123', platform: 'web' },
    });

    expect(auditEvents.length).toBe(1);
    expect(auditEvents[0].event_type).toBe('device_registered');
  });

  it('logs device revocation', async () => {
    await service.log({
      organization_id: 'org_123',
      actor_id: 'admin_123',
      event_type: 'device_revoked',
      metadata: { device_id: 'dev_123' },
    });

    expect(auditEvents.length).toBe(1);
    expect(auditEvents[0].event_type).toBe('device_revoked');
  });

  it('logs SSO config changes', async () => {
    await service.log({
      organization_id: 'org_123',
      actor_id: 'admin_123',
      event_type: 'sso_provider_added',
      metadata: { provider_id: 'sso_123', provider_name: 'google' },
    });

    expect(auditEvents.length).toBe(1);
    expect(auditEvents[0].event_type).toBe('sso_provider_added');
  });

  it('logs org settings updates', async () => {
    await service.log({
      organization_id: 'org_123',
      actor_id: 'admin_123',
      event_type: 'org_settings_updated',
      metadata: { setting: 'file_policy', value: 'restricted' },
    });

    expect(auditEvents.length).toBe(1);
    expect(auditEvents[0].event_type).toBe('org_settings_updated');
  });

  it('logs cross-org access denials', async () => {
    await service.log({
      organization_id: 'org_123',
      actor_id: 'usr_123',
      event_type: 'cross_org_access_denied',
      metadata: { target_org_id: 'org_456', route: '/v1/organizations/org_456/members' },
    });

    expect(auditEvents.length).toBe(1);
    expect(auditEvents[0].event_type).toBe('cross_org_access_denied');
  });

  it('sanitizes sensitive metadata', async () => {
    await service.log({
      organization_id: 'org_123',
      actor_id: 'usr_123',
      event_type: 'user_registered',
      metadata: {
        email: 'test@example.com',
        password: 'secret123',
        mfa_secret: 'ABCDEFG',
        access_token: 'token123',
        nested: { private_key: 'key123', safe_value: 'visible' },
      },
    });

    expect(auditEvents.length).toBe(1);
    const metadata = auditEvents[0].metadata as Record<string, unknown>;
    expect(metadata.password).toBe('[REDACTED]');
    expect(metadata.mfa_secret).toBe('[REDACTED]');
    expect(metadata.access_token).toBe('[REDACTED]');
    expect((metadata.nested as Record<string, unknown>).private_key).toBe('[REDACTED]');
    expect((metadata.nested as Record<string, unknown>).safe_value).toBe('visible');
    expect(metadata.email).toBe('test@example.com');
  });

  it('lists audit events by organization', async () => {
    for (let i = 0; i < 5; i++) {
      await service.log({
        organization_id: 'org_123',
        actor_id: `usr_${i}`,
        event_type: 'login_success',
        metadata: { email: `user${i}@example.com` },
      });
    }

    for (let i = 0; i < 3; i++) {
      await service.log({
        organization_id: 'org_456',
        actor_id: `usr_${i}`,
        event_type: 'login_success',
        metadata: { email: `user${i}@example.com` },
      });
    }

    const { events } = await service.listByOrg('org_123');
    expect(events.length).toBe(5);
    events.forEach((event) => {
      expect(event.organization_id).toBe('org_123');
    });
  });

  it('filters audit events by event type', async () => {
    await service.log({
      organization_id: 'org_123',
      actor_id: 'usr_1',
      event_type: 'login_success',
    });
    await service.log({
      organization_id: 'org_123',
      actor_id: 'usr_2',
      event_type: 'logout',
    });
    await service.log({
      organization_id: 'org_123',
      actor_id: 'usr_3',
      event_type: 'login_success',
    });

    const { events } = await service.listByOrg('org_123', { eventType: 'login_success' });
    expect(events.length).toBe(2);
    events.forEach((event) => {
      expect(event.event_type).toBe('login_success');
    });
  });

  it('supports pagination with cursor', async () => {
    for (let i = 0; i < 10; i++) {
      await service.log({
        organization_id: 'org_123',
        actor_id: 'usr_1',
        event_type: 'login_success',
        metadata: { index: i },
      });
    }

    const { events, nextCursor } = await service.listByOrg('org_123', { limit: 5 });
    expect(events.length).toBe(5);
    expect(nextCursor).toBeDefined();

    if (nextCursor) {
      const { events: moreEvents } = await service.listByOrg('org_123', { limit: 5, cursor: nextCursor });
      expect(moreEvents.length).toBe(5);
    }
  });
});
