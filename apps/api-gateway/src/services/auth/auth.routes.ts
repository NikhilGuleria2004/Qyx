import { Hono } from 'hono';
import { auth, optionalAuth } from '../../middleware/auth';
import { orgScope } from '../../middleware/orgScope';
import { rbac, requirePermission } from '../../middleware/rbac';
import { createRateLimit, getClientIp } from '../../middleware/rateLimit';
import { BruteForceProtection, getBruteForceIdentifier } from '../../middleware/bruteForce';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';
import { RegisterSchema, LoginSchema, MfaVerifySchema, RefreshSchema } from './auth.schema';

type AuthBindings = {
  PRIMARY_DB: D1Database;
  SESSION_KV: KVNamespace;
  RATE_LIMIT_KV: KVNamespace;
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

const setRefreshCookie = (refreshToken: string) => {
  return `refresh_token=${encodeURIComponent(refreshToken)}; HttpOnly; Secure; SameSite=Strict; Max-Age=${7 * 24 * 60 * 60}; Path=/`;
};

const clearRefreshCookie = () => 'refresh_token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/';

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
    expires_in: 900,
  }, 201, {
    'Set-Cookie': setRefreshCookie(refreshToken),
  });
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

  const bruteForce = new BruteForceProtection(c.env.RATE_LIMIT_KV);
  const identifier = getBruteForceIdentifier(c, parsed.data.email);

  const lockStatus = await bruteForce.isLocked(identifier);
  if (lockStatus.locked) {
    c.header('Retry-After', String(lockStatus.retryAfter));
    return c.json(
      { error: { code: 'BRUTE_FORCE_LOCKED', message: `Too many failed login attempts. Try again in ${lockStatus.retryAfter} seconds.`, request_id: c.get('requestId') as string } },
      429
    );
  }

  const service = new AuthService(c.env.PRIMARY_DB, c.env.SESSION_KV);
  try {
    const result = await service.login(parsed.data);

    if (result.state.state === 'MFA_CHALLENGE_ISSUED') {
      await bruteForce.recordSuccess(identifier);
      const audit = new AuditService(c.env.PRIMARY_DB);
      await audit.log({
        organization_id: result.state.organizationId!,
        actor_id: result.state.userId,
        event_type: 'login_mfa_required',
        metadata: { email: parsed.data.email },
      });
      const challenge = await service.createMfaChallenge(result.state.userId!, result.state.organizationId!, result.state.role!);
      return c.json({ state: result.state.state, mfa_required: true, mfa_challenge: challenge });
    }

    await bruteForce.recordSuccess(identifier);
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
      expires_in: 900,
      user: {
        id: result.state.userId,
        organization_id: result.state.organizationId,
        role: result.state.role,
      },
    }, 200, {
      'Set-Cookie': setRefreshCookie(refreshToken),
    });
  } catch (err) {
    await bruteForce.recordFailure(identifier);
    const audit = new AuditService(c.env.PRIMARY_DB);
    await audit.log({
      organization_id: '',
      actor_id: undefined,
      event_type: 'login_failed',
      metadata: { email: parsed.data.email, reason: 'Invalid credentials' },
    });
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

  const service = new AuthService(c.env.PRIMARY_DB, c.env.SESSION_KV);
  const challengeData = await service.resolveMfaChallenge(parsed.data.mfa_challenge);
  if (!challengeData) {
    return c.json(
      { error: { code: 'INVALID_CHALLENGE', message: 'MFA challenge expired or invalid', request_id: c.get('requestId') as string } },
      400
    );
  }

  let state;
  try {
    state = await service.verifyMfa(challengeData.user_id, parsed.data.mfa_code);
  } catch (err) {
    return c.json(
      { error: { code: 'INVALID_MFA_CODE', message: err instanceof Error ? err.message : 'MFA verification failed', request_id: c.get('requestId') as string } },
      401
    );
  }
  
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
    expires_in: 900,
    user: {
      id: state.userId,
      organization_id: state.organizationId,
      role: state.role,
    },
  }, 200, {
    'Set-Cookie': setRefreshCookie(refreshToken),
  });
});

app.post('/refresh', async (c) => {
  const body = await c.req.json();
  const parsed = RefreshSchema.safeParse(body);
  
  // Also check cookie for refresh token
  const cookieHeader = c.req.header('Cookie') || '';
  const cookieToken = cookieHeader.split(';').find((c) => c.trim().startsWith('refresh_token='))?.split('=')?.slice(1).join('=');
  
  if (!parsed.success && !cookieToken) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error?.message || 'Missing refresh token', request_id: c.get('requestId') as string } },
      400
    );
  }

  const refreshToken = parsed.success ? parsed.data.refresh_token : decodeURIComponent(cookieToken!.trim());

  const service = new AuthService(c.env.PRIMARY_DB, c.env.SESSION_KV);
  const tokens = await service.refreshSession(refreshToken);
  
  if (!tokens) {
    return c.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired refresh token', request_id: c.get('requestId') as string } },
      401,
      { 'Set-Cookie': clearRefreshCookie() }
    );
  }

  return c.json({
    access_token: tokens.accessToken,
    expires_in: 900,
  }, 200, {
    'Set-Cookie': setRefreshCookie(tokens.refreshToken),
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
  
  return c.json({ status: 'logged_out' }, 200, {
    'Set-Cookie': clearRefreshCookie(),
  });
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
