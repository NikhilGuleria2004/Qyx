const { subtle } = crypto;

export async function generateTOTPSecret(): Promise<string> {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

export async function generateTOTPCode(secret: string): Promise<string> {
  const key = await subtle.importKey('raw', decodeBase32Sync(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  let time = Math.floor(Date.now() / 30000);
  const timeBytes = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    timeBytes[i] = time & 0xff;
    time = time >>> 8;
  }

  const hmac = await subtle.sign('HMAC', key, timeBytes);
  const hmacBytes = new Uint8Array(hmac);
  const offset = hmacBytes[19] & 0x0f;
  const code = ((hmacBytes[offset] & 0x7f) << 24 | (hmacBytes[offset + 1] & 0xff) << 16 | (hmacBytes[offset + 2] & 0xff) << 8 | (hmacBytes[offset + 3] & 0xff)) % 1000000;
  return code.toString().padStart(6, '0');
}

export async function verifyTOTP(secret: string, token: string): Promise<boolean> {
  const expectedCode = await generateTOTPCode(secret);
  return expectedCode === token;
}

export function generateTOTPUri(secret: string, email: string, issuer: string): string {
  const encodedSecret = secret.replace(/=+$/, '');
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${encodedSecret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

function base32Encode(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32Sync(secret: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of secret.toUpperCase()) {
    if (char === '=') break;
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}
