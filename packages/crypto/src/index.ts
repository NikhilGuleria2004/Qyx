export function generateKeyPair(): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }> {
  throw new Error('Not implemented');
}

export function encrypt(_publicKey: Uint8Array, _plaintext: Uint8Array): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
  throw new Error('Not implemented');
}

export function decrypt(_privateKey: Uint8Array, _ciphertext: Uint8Array, _nonce: Uint8Array): Promise<Uint8Array> {
  throw new Error('Not implemented');
}

export function sign(_privateKey: Uint8Array, _message: Uint8Array): Promise<Uint8Array> {
  throw new Error('Not implemented');
}

export function verify(_publicKey: Uint8Array, _signature: Uint8Array, _message: Uint8Array): Promise<boolean> {
  throw new Error('Not implemented');
}

export function hkdf(_salt: Uint8Array, _ikm: Uint8Array, _info: Uint8Array, _length: number): Promise<Uint8Array> {
  throw new Error('Not implemented');
}

export function randomBytes(_length: number): Uint8Array {
  throw new Error('Not implemented');
}
