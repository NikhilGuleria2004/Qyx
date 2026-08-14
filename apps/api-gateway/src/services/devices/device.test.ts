import { describe, it, expect } from 'vitest';
import { RegisterDeviceSchema, AuthorizeDeviceSchema, ResolvePairingCodeSchema } from './device.schema';

describe('device schemas', () => {
  it('validates register device', () => {
    const result = RegisterDeviceSchema.parse({
      device_name: 'MacBook Pro',
      platform: 'web',
      public_key: 'dGVzdA==',
      signing_key: 'c2lnbg==',
    });
    expect(result.device_name).toBe('MacBook Pro');
    expect(result.platform).toBe('web');
  });

  it('rejects empty device name', () => {
    expect(() => RegisterDeviceSchema.parse({
      device_name: '',
      public_key: 'dGVzdA==',
      signing_key: 'c2lnbg==',
    })).toThrow();
  });

  it('requires public_key', () => {
    expect(() => RegisterDeviceSchema.parse({
      device_name: 'Device',
      signing_key: 'c2lnbg==',
    })).toThrow();
  });

  it('requires signing_key', () => {
    expect(() => RegisterDeviceSchema.parse({
      device_name: 'Device',
      public_key: 'dGVzdA==',
    })).toThrow();
  });

  it('rejects invalid platform', () => {
    expect(() => RegisterDeviceSchema.parse({
      device_name: 'Device',
      platform: 'windows',
      public_key: 'dGVzdA==',
      signing_key: 'c2lnbg==',
    })).toThrow();
  });

  it('validates authorize device', () => {
    const result = AuthorizeDeviceSchema.parse({
      payload: 'dGVzdCBwYXlsb2Fk',
    });
    expect(result.payload).toBe('dGVzdCBwYXlsb2Fk');
  });

  it('requires payload for authorize', () => {
    expect(() => AuthorizeDeviceSchema.parse({})).toThrow();
  });

  it('validates resolve pairing code', () => {
    const result = ResolvePairingCodeSchema.parse({
      pairing_code: 'ABC12345',
    });
    expect(result.pairing_code).toBe('ABC12345');
  });

  it('rejects empty pairing code', () => {
    expect(() => ResolvePairingCodeSchema.parse({
      pairing_code: '',
    })).toThrow();
  });
});
