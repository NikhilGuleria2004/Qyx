import { Hono } from 'hono';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { WebAuthnService } from './webauthn.service';

type WebAuthnBindings = {
  PRIMARY_DB: D1Database;
  CHALLENGE_KV: KVNamespace;
};

type WebAuthnVariables = {
  validatedBody?: Record<string, unknown>;
};

const app = new Hono<{ Bindings: WebAuthnBindings; Variables: WebAuthnVariables }>();

app.post('/register/start', async (c) => {
  const body = await c.req.json();
  const parsed = z.object({
    email: z.string().email(),
    display_name: z.string().min(1).max(255),
    device_name: z.string().min(1).max(255),
    platform: z.enum(['web', 'ios', 'android', 'desktop']).optional(),
  }).safeParse(body);
  
  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: crypto.randomUUID() } },
      400
    );
  }

  const service = new WebAuthnService(c.env.PRIMARY_DB, c.env.CHALLENGE_KV);
  const userId = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const { challenge } = await service.startRegistration(userId, parsed.data.email, parsed.data.display_name, parsed.data.device_name, parsed.data.platform);
  
  return c.json({
    challenge,
    userId,
    rp: {
      name: 'Qyx',
      id: new URL(c.req.url).hostname,
    },
    user: {
      id: btoa(userId),
      name: parsed.data.email,
      displayName: parsed.data.display_name,
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'preferred',
    },
    timeout: 60000,
  });
});

app.post('/register/finish', async (c) => {
  const body = await c.req.json();
  const parsed = z.object({
    userId: z.string(),
    credential_id: z.string(),
    public_key: z.string(),
    sign_count: z.number(),
    challenge: z.string(),
  }).safeParse(body);
  
  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: crypto.randomUUID() } },
      400
    );
  }

  const service = new WebAuthnService(c.env.PRIMARY_DB, c.env.CHALLENGE_KV);
  
  const challengeData = await c.env.CHALLENGE_KV.get(`webauthn:register:${parsed.data.challenge}`, 'json');
  if (!challengeData) {
    return c.json(
      { error: { code: 'INVALID_CHALLENGE', message: 'Challenge expired or invalid', request_id: crypto.randomUUID() } },
      400
    );
  }

  const credential = await service.verifyAndStoreCredential(
    parsed.data.userId,
    parsed.data.credential_id,
    parsed.data.public_key,
    parsed.data.sign_count,
    (challengeData as { deviceName: string }).deviceName,
    (challengeData as { platform?: string }).platform || undefined
  );
  
  await c.env.CHALLENGE_KV.delete(`webauthn:register:${parsed.data.challenge}`);
  
  const userOrg = await c.env.PRIMARY_DB.prepare('SELECT organization_id FROM users WHERE id = ?').bind(parsed.data.userId).first() as { organization_id: string } | null;
  if (userOrg) {
    const audit = new AuditService(c.env.PRIMARY_DB);
    await audit.log({
      organization_id: userOrg.organization_id,
      actor_id: parsed.data.userId,
      event_type: 'passkey_registered',
      metadata: { credential_id: parsed.data.credential_id },
    });
  }
  
  return c.json({ status: 'registered', credential_id: credential.credential_id });
});

app.post('/login/start', async (c) => {
  const body = await c.req.json();
  const parsed = z.object({
    email: z.string().email(),
    device_name: z.string().min(1).max(255),
    platform: z.enum(['web', 'ios', 'android', 'desktop']).optional(),
  }).safeParse(body);
  
  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: crypto.randomUUID() } },
      400
    );
  }

  const service = new WebAuthnService(c.env.PRIMARY_DB, c.env.CHALLENGE_KV);
  
  const userResult = await c.env.PRIMARY_DB.prepare('SELECT id FROM users WHERE email = ?').bind(parsed.data.email).first();
  if (!userResult) {
    return c.json(
      { error: { code: 'USER_NOT_FOUND', message: 'User not found', request_id: crypto.randomUUID() } },
      404
    );
  }

  const userId = (userResult as { id: string }).id;
  const credentials = await service.getCredentialsByUser(userId);
  
  if (credentials.length === 0) {
    return c.json(
      { error: { code: 'NO_CREDENTIALS', message: 'No passkeys registered', request_id: crypto.randomUUID() } },
      400
    );
  }

  const { challenge } = await service.startAuthentication(userId, parsed.data.email, parsed.data.device_name, parsed.data.platform);
  
  return c.json({
    challenge,
    userId,
    allowCredentials: credentials.map(cred => ({
      type: 'public-key',
      id: cred.credential_id,
      transports: ['internal', 'hybrid'],
    })),
    timeout: 60000,
    userVerification: 'preferred',
  });
});

app.post('/login/finish', async (c) => {
  const body = await c.req.json();
  const parsed = z.object({
    userId: z.string(),
    credential_id: z.string(),
    authenticatorData: z.string(),
    clientDataJSON: z.string(),
    signature: z.string(),
    challenge: z.string(),
  }).safeParse(body);
  
  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.message, request_id: crypto.randomUUID() } },
      400
    );
  }

  const service = new WebAuthnService(c.env.PRIMARY_DB, c.env.CHALLENGE_KV);
  
  const challengeData = await c.env.CHALLENGE_KV.get(`webauthn:auth:${parsed.data.challenge}`, 'json');
  if (!challengeData) {
    return c.json(
      { error: { code: 'INVALID_CHALLENGE', message: 'Challenge expired or invalid', request_id: crypto.randomUUID() } },
      400
    );
  }

  const credential = await service.verifyAuthentication(parsed.data.userId, parsed.data.credential_id);
  if (!credential) {
    return c.json(
      { error: { code: 'INVALID_CREDENTIAL', message: 'Invalid credential', request_id: crypto.randomUUID() } },
      400
    );
  }

  await c.env.CHALLENGE_KV.delete(`webauthn:auth:${parsed.data.challenge}`);
  
  const audit = new AuditService(c.env.PRIMARY_DB);
  await audit.log({
    organization_id: credential.organization_id,
    actor_id: parsed.data.userId,
    event_type: 'passkey_login',
    metadata: { credential_id: credential.credential_id },
  });
  
  return c.json({ status: 'authenticated', credential_id: credential.credential_id });
});

export default app;
