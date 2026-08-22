import { Hono } from 'hono';
import { auth, optionalAuth } from '../../middleware/auth';
import { orgScope } from '../../middleware/orgScope';
import { rbac, requirePermission } from '../../middleware/rbac';
import { createRateLimit, getClientIp } from '../../middleware/rateLimit';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';
import { RegisterSchema, LoginSchema, MfaVerifySchema, RefreshSchema } from './auth.schema';

type AuthBindings = {
  PRIMARY_DB: D1Database;
  SESSION_KV: KVNamespace;
};

type AuthVariables = {
  permission?: string;
  validatedBody?: Record<string, unknown>;
  user?: { user_id: string; organization_id: string; role: string };
  requestId?: string;
};

const app = new Hono<{ Bindings: AuthBindings; Variables: AuthVariables }>();

const authRateLimit = createRateLimit({
  category: 'auth',
  getIdentifier: (c) => getClientIp(c),
});

app.use('*', authRateLimit);

app.post('/register', optionalAuth, async (c) => {
  const body = await c.req.json();
  const parsed = RegisterSchema.safeParse(body);
  
  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new AuthService(c.env.PRIMARY_DB, c.env.SESSION_KV);
  let result;
  try {
    result = await service.register(parsed.data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    if (message === 'ORG_JOIN_REQUIRES_INVITE_OR_VERIFIED_DOMAIN') {
      return c.json(
        { error: { code: 'ORG_JOIN_REQUIRES_INVITE_OR_VERIFIED_DOMAIN', message: 'Joining an existing organization requires a valid invite code or a verified email domain', request_id: c.get('requestId') as string } },
        403
      );
    }
    if (message === 'Invalid or expired invite code') {
      return c.json(
        { error: { code: 'INVALID_INVITE_CODE', message: message, request_id: c.get('requestId') as string } },
        400
      );
    }
    throw err;
  }

  const { accessToken, refreshToken } = await service.issueSession(result.user.id, result.user.organization_id, result.user.role);

  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: result.user.organization_id,
    actor_id: result.user.id,
    event_type: 'user_registered',
    metadata: { email: result.user.email, org_created: result.orgCreated },
  });

  return c.json({
    user: result.user,
    org_created: result.orgCreated,
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: 900,
  }, 201);
});

app.post('/login', optionalAuth, async (c) => {
  const body = await c.req.json();
  const parsed = LoginSchema.safeParse(body);
  
  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new AuthService(c.env.PRIMARY_DB, c.env.SESSION_KV);
  try {
    const result = await service.login(parsed.data);

    if (result.state.state === 'MFA_CHALLENGE_ISSUED') {
      const audit = new AuditService(c.env.PRIMARY_DB);
      await audit.log({
        organization_id: result.state.organizationId!,
        actor_id: result.state.userId,
        event_type: 'login_mfa_required',
        metadata: { email: parsed.data.email },
      });
      return c.json({ state: result.state.state, mfa_required: true, user_id: result.state.userId });
    }

    const { accessToken, refreshToken } = await service.issueSession(result.state.userId!, result.state.organizationId!, result.state.role!);

    const audit = new AuditService(c.env.PRIMARY_DB);
    await audit.log({
      organization_id: result.state.organizationId!,
      actor_id: result.state.userId,
      event_type: 'login_success',
      metadata: { email: parsed.data.email },
    });

    return c.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 900,
      user: {
        id: result.state.userId,
        organization_id: result.state.organizationId,
        role: result.state.role,
      },
    });
  } catch (err) {
    return c.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Invalid credentials', request_id: c.get('requestId') as string } },
      401
    );
  }
});

app.post('/mfa/verify', async (c) => {
  const body = await c.req.json();
  const parsed = MfaVerifySchema.safeParse(body);
  
  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: c.get('requestId') as string } },
      400
    );
  }

  const userId = c.req.header('X-Qyx-User-Id');
  if (!userId) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Missing user ID', request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new AuthService(c.env.PRIMARY_DB, c.env.SESSION_KV);
  const state = await service.verifyMfa(userId, parsed.data.mfa_code);
  
  const { accessToken, refreshToken } = await service.issueSession(state.userId!, state.organizationId!, state.role!);
  
  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: state.organizationId!,
    actor_id: state.userId,
    event_type: 'mfa_verified',
    metadata: {},
  });
  
  return c.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: 900,
    user: {
      id: state.userId,
      organization_id: state.organizationId,
      role: state.role,
    },
  });
});

app.post('/refresh', async (c) => {
  const body = await c.req.json();
  const parsed = RefreshSchema.safeParse(body);
  
  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: c.get('requestId') as string } },
      400
    );
  }

  const service = new AuthService(c.env.PRIMARY_DB, c.env.SESSION_KV);
  const tokens = await service.refreshSession(parsed.data.refresh_token);
  
  if (!tokens) {
    return c.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired refresh token', request_id: c.get('requestId') as string } },
      401
    );
  }

  return c.json({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expires_in: 900,
  });
});

app.post('/logout', auth, async (c) => {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.slice(7);
  const user = c.get('user') as { user_id: string; organization_id: string };
  
  if (token) {
    const service = new AuthService(c.env.PRIMARY_DB, c.env.SESSION_KV);
    await service.logout(token, user.user_id);
  }
  
  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: user.organization_id,
    actor_id: user.user_id,
    event_type: 'logout',
    metadata: {},
  });
  
  return c.json({ status: 'logged_out' });
});

app.get('/me', auth, orgScope, requirePermission('org:read'), rbac, async (c) => {
  const user = c.get('user') as { user_id: string };
  const service = new AuthService(c.env.PRIMARY_DB, c.env.SESSION_KV);
  const me = await service.getMe(user.user_id);
  
  if (!me) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'User not found', request_id: c.get('requestId') as string } },
      404
    );
  }

  return c.json({
    id: me.id,
    email: me.email,
    display_name: me.display_name,
    role: me.role,
    organization_id: me.organization_id,
    created_at: me.created_at,
    last_active_at: me.last_active_at,
  });
});

export default app;
