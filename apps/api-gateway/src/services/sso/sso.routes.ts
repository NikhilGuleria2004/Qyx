import { Hono } from 'hono';
import { auth, optionalAuth } from '../../middleware/auth';
import { orgScope } from '../../middleware/orgScope';
import { rbac, requirePermission } from '../../middleware/rbac';
import { createRateLimit } from '../../middleware/rateLimit';
import { AuditService } from '../audit/audit.service';
import { MetricsService } from '../metrics/metrics.service';
import { SsoService } from './sso.service';
import { CreateSsoProviderSchema, UpdateSsoProviderSchema } from './sso.schema';

type SsoBindings = {
  PRIMARY_DB: D1Database;
  SESSION_KV: KVNamespace;
};

type SsoVariables = {
  permission?: string;
  user?: { user_id: string; organization_id: string; role: string };
  requestId?: string;
};

const app = new Hono<{ Bindings: SsoBindings; Variables: SsoVariables }>();

const adminRateLimit = createRateLimit({
  category: 'admin',
  getIdentifier: (c) => (c.get('user') as { user_id?: string } | undefined)?.user_id || 'unknown',
  getOrgId: (c) => (c.get('user') as { organization_id?: string } | undefined)?.organization_id,
});

const setCookie = (name: string, value: string, maxAge: number) => {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}; Path=/`;
};

const clearCookie = (name: string) => setCookie(name, '', 0);

app.get('/:provider/start', optionalAuth, async (c) => {
  const providerName = c.req.param('provider') as string;
  const state = crypto.randomUUID().replace(/-/g, '');
  const redirectUri = `${new URL(c.req.url).origin}/v1/auth/sso/${providerName}/callback`;

  const user = c.get('user') as { user_id: string; organization_id: string } | undefined;
  const queryOrgId = c.req.query('org_id');

  let orgId: string;
  if (user) {
    orgId = user.organization_id;
  } else if (queryOrgId && typeof queryOrgId === 'string') {
    orgId = queryOrgId;
  } else {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'org_id query parameter required', request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new SsoService(c.env.PRIMARY_DB, c.env.SESSION_KV);
  const provider = await service.getProviderByName(orgId, providerName);

  if (!provider || !provider.enabled) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'SSO provider not found or disabled', request_id: c.get('requestId') as string } },
      404
    );
  }

  const authUrl = service.buildAuthorizationUrl(provider, redirectUri, state);
  c.header('Set-Cookie', setCookie('sso_state', state, 600));
  c.header('Set-Cookie', setCookie('sso_redirect_uri', redirectUri, 600));
  c.header('Set-Cookie', setCookie('sso_org_id', orgId, 600));
  return c.redirect(authUrl);
});

app.get('/:provider/callback', optionalAuth, async (c) => {
  const providerName = c.req.param('provider') as string;
  const code = c.req.query('code');
  const state = c.req.query('state');
  const errorParam = c.req.query('error');
  const requestId = c.get('requestId') as string;

  if (errorParam) {
    return c.json(
      { error: { code: 'SSO_ERROR', message: `IdP error: ${errorParam}`, request_id: c.get('requestId') as string } },
      400
    );
  }

  if (!code || typeof code !== 'string') {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Missing authorization code', request_id: c.get('requestId') as string } },
      400
    );
  }

  if (!state || typeof state !== 'string') {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Missing state parameter', request_id: c.get('requestId') as string } },
      400
    );
  }

  const cookieHeader = c.req.header('Cookie') || '';
  const ssoState = cookieHeader.match(/sso_state=([^;]+)/)?.[1] ?? '';
  const redirectUri = cookieHeader.match(/sso_redirect_uri=([^;]+)/)?.[1] ?? '';
  const orgId = cookieHeader.match(/sso_org_id=([^;]+)/)?.[1] ?? '';

  if (!ssoState || !redirectUri || !orgId) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Missing SSO state cookies', request_id: c.get('requestId') as string } },
      400
    );
  }

  if (state !== ssoState) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid SSO state', request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new SsoService(c.env.PRIMARY_DB, c.env.SESSION_KV);
  const provider = await service.getProviderByName(orgId, providerName);

  if (!provider || !provider.enabled) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'SSO provider not found or disabled', request_id: c.get('requestId') as string } },
      404
    );
  }

  try {
    const result = await service.handleCallback(provider, code, redirectUri);

    c.header('Set-Cookie', clearCookie('sso_state'));
    c.header('Set-Cookie', clearCookie('sso_redirect_uri'));
    c.header('Set-Cookie', clearCookie('sso_org_id'));

    if (c.env && c.env.PRIMARY_DB) {
      const metricsService = new MetricsService(c.env.PRIMARY_DB);
      metricsService.recordEvent({
        service: 'identity',
        operation: 'sso_callback',
        organization_id: provider.organization_id,
        user_id: result.user.id,
        status: 'success',
        latency_ms: 0,
        metadata: { provider_name: provider.provider_name },
      }).catch(() => {});
    }

    return c.json({
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      expires_in: 900,
      user: result.user,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'SSO callback failed';
    if (c.env && c.env.PRIMARY_DB) {
      const metricsService = new MetricsService(c.env.PRIMARY_DB);
      metricsService.recordEvent({
        service: 'identity',
        operation: 'sso_callback',
        organization_id: orgId,
        status: 'error',
        latency_ms: 0,
        metadata: { provider_name: providerName, error: message },
      }).catch(() => {});
    }
    return c.json(
      { error: { code: 'SSO_ERROR', message, request_id: requestId } },
      400
    );
  }
});


app.post('/:orgId/providers', auth, orgScope, requirePermission('org:update'), rbac, adminRateLimit, async (c) => {
  const orgId = c.req.param('orgId')!;
  const user = c.get('user') as { user_id: string };
  const body = await c.req.json();
  const parsed = CreateSsoProviderSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new SsoService(c.env.PRIMARY_DB, c.env.SESSION_KV);
  const provider = await service.createProvider(orgId, parsed.data);

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: orgId,
    actor_id: user.user_id,
    event_type: 'sso_provider_added',
    metadata: { provider_id: provider.id, provider_name: provider.provider_name },
  });

  return c.json(provider, 201);
});

app.get('/:orgId/providers', auth, orgScope, requirePermission('org:read'), rbac, async (c) => {
  const orgId = c.req.param('orgId')!;

  const service = new SsoService(c.env.PRIMARY_DB, c.env.SESSION_KV);
  const providers = await service.listProviders(orgId);

  const safeProviders = providers.map((p) => ({
    id: p.id,
    organization_id: p.organization_id,
    provider_type: p.provider_type,
    provider_name: p.provider_name,
    issuer_url: p.issuer_url,
    client_id: p.client_id,
    authorization_url: p.authorization_url,
    token_url: p.token_url,
    userinfo_url: p.userinfo_url,
    jwks_url: p.jwks_url,
    attribute_mapping: p.attribute_mapping,
    enabled: p.enabled,
    created_at: p.created_at,
  }));

  return c.json({ providers: safeProviders });
});

app.patch('/:orgId/providers/:providerId', auth, orgScope, requirePermission('org:update'), rbac, adminRateLimit, async (c) => {
  const orgId = c.req.param('orgId')!;
  const providerId = c.req.param('providerId')!;
  const user = c.get('user') as { user_id: string };
  const body = await c.req.json();
  const parsed = UpdateSsoProviderSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new SsoService(c.env.PRIMARY_DB, c.env.SESSION_KV);
  const provider = await service.updateProvider(orgId, providerId, parsed.data);

  if (!provider) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'SSO provider not found', request_id: c.get('requestId') as string } },
      404
    );
  }

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: orgId,
    actor_id: user.user_id,
    event_type: 'sso_provider_updated',
    metadata: { provider_id: providerId, provider_name: provider.provider_name },
  });

  return c.json(provider);
});

app.delete('/:orgId/providers/:providerId', auth, orgScope, requirePermission('org:update'), rbac, adminRateLimit, async (c) => {
  const orgId = c.req.param('orgId')!;
  const providerId = c.req.param('providerId')!;
  const user = c.get('user') as { user_id: string };

  const service = new SsoService(c.env.PRIMARY_DB, c.env.SESSION_KV);
  const deleted = await service.deleteProvider(orgId, providerId);

  if (!deleted) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'SSO provider not found', request_id: c.get('requestId') as string } },
      404
    );
  }

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: orgId,
    actor_id: user.user_id,
    event_type: 'sso_provider_removed',
    metadata: { provider_id: providerId },
  });

  return c.json({ status: 'deleted' });
});

export default app;
