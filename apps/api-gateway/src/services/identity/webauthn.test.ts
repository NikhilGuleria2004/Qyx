import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import webauthnRoutes from './webauthn.routes';

describe('webauthn', () => {
  it('rejects invalid register body', async () => {
    const app = new Hono();
    app.route('/v1/auth/webauthn', webauthnRoutes);
    const res = await app.request('http://localhost/v1/auth/webauthn/register/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'invalid' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects invalid login body', async () => {
    const app = new Hono();
    app.route('/v1/auth/webauthn', webauthnRoutes);
    const res = await app.request('http://localhost/v1/auth/webauthn/login/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'invalid' }),
    });
    expect(res.status).toBe(400);
  });
});
