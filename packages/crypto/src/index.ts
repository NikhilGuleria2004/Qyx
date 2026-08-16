function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

export async function generateKeyPair(
  type: 'x25519' | 'ed25519'
): Promise<{ publicKey: Uint8Array; privateKey: CryptoKey }> {
  const algorithm = type === 'x25519'
    ? { name: 'X25519' }
    : { name: 'Ed25519' };

  const keyPair = (await crypto.subtle.generateKey(
    algorithm,
    true,
    type === 'x25519'
      ? ['deriveKey', 'deriveBits']
      : ['sign', 'verify']
  )) as CryptoKeyPair;

  const publicKeyBuffer = await crypto.subtle.exportKey('raw', keyPair.publicKey);

  return {
    publicKey: new Uint8Array(publicKeyBuffer),
    privateKey: keyPair.privateKey,
  };
}

export async function sharedSecret(
  privateKey: CryptoKey,
  publicKey: Uint8Array | CryptoKey
): Promise<Uint8Array> {
  let publicKeyCrypto: CryptoKey;
  if (publicKey instanceof Uint8Array) {
    publicKeyCrypto = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(publicKey),
      { name: 'X25519' },
      false,
      []
    );
  } else {
    publicKeyCrypto = publicKey;
  }

  const bits = await crypto.subtle.deriveBits(
    { name: 'X25519', public: publicKeyCrypto },
    privateKey,
    256
  );

  return new Uint8Array(bits);
}

export async function encrypt(
  key: CryptoKey,
  plaintext: Uint8Array,
  nonce?: Uint8Array
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
  const actualNonce = nonce ?? randomBytes(12);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(actualNonce) },
    key,
    toArrayBuffer(plaintext)
  );

  return {
    ciphertext: new Uint8Array(ciphertextBuffer),
    nonce: actualNonce,
  };
}

export async function decrypt(
  key: CryptoKey,
  ciphertext: Uint8Array,
  nonce: Uint8Array
): Promise<Uint8Array> {
  const plaintextBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(nonce) },
    key,
    toArrayBuffer(ciphertext)
  );

  return new Uint8Array(plaintextBuffer);
}

export async function sign(
  privateKey: CryptoKey,
  message: Uint8Array
): Promise<Uint8Array> {
  const signatureBuffer = await crypto.subtle.sign('Ed25519', privateKey, toArrayBuffer(message));
  return new Uint8Array(signatureBuffer);
}

export async function verify(
  publicKey: Uint8Array | CryptoKey,
  signature: Uint8Array,
  message: Uint8Array
): Promise<boolean> {
  let publicKeyCrypto: CryptoKey;
  if (publicKey instanceof Uint8Array) {
    publicKeyCrypto = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(publicKey),
      { name: 'Ed25519' },
      false,
      ['verify']
    );
  } else {
    publicKeyCrypto = publicKey;
  }

  return crypto.subtle.verify('Ed25519', publicKeyCrypto, toArrayBuffer(signature), toArrayBuffer(message));
}

export async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(ikm),
    { name: 'HKDF' },
    false,
    ['deriveKey', 'deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: toArrayBuffer(salt), info: toArrayBuffer(info) },
    baseKey,
    length * 8
  );

  return new Uint8Array(derivedBits);
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export async function fingerprint(publicKey: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', toArrayBuffer(publicKey));
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function securityNumber(fingerprint: string): string {
  const groups = fingerprint.match(/.{1,4}/g) || [];
  return groups.slice(0, 5).join(' ');
}

export async function encryptFile(
  key: CryptoKey,
  plaintext: Uint8Array,
  chunkSize = 1024 * 1024
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
  const nonce = randomBytes(12);
  const chunks: Uint8Array[] = [];

  for (let i = 0; i < plaintext.length; i += chunkSize) {
    const chunk = plaintext.slice(i, Math.min(i + chunkSize, plaintext.length));
    const encrypted = await encrypt(key, chunk);
    chunks.push(encrypted.ciphertext);
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return {
    ciphertext: result,
    nonce,
  };
}

export async function decryptFile(
  key: CryptoKey,
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  originalSize: number
): Promise<Uint8Array> {
  const plaintext = await decrypt(key, ciphertext, nonce);
  return plaintext.slice(0, originalSize);
}
