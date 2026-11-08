// Encryption for the hosted sign-in handoff, using only WebCrypto so it runs in Node and on Workers.
// The user's Mac makes a one-time key pair and sends the public half; the sign-in service encrypts
// the tokens to it. Only that Mac can read them, even though they travel through a browser redirect.

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;
const text = new TextEncoder();

export function b64u(data: ArrayBuffer | Uint8Array) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64u(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
export const randomToken = (length = 32) => b64u(crypto.getRandomValues(new Uint8Array(length)));
export const sha256 = async (value: string) => b64u(await crypto.subtle.digest('SHA-256', text.encode(value)));

export async function newHandoffKey() {
  const pair = await crypto.subtle.generateKey(ECDH, false, ['deriveKey']) as { privateKey: CryptoKey; publicKey: CryptoKey };
  return { privateKey: pair.privateKey, publicKey: b64u(await crypto.subtle.exportKey('raw', pair.publicKey)) };
}

async function agree(privateKey: CryptoKey, publicRaw: Uint8Array<ArrayBuffer>, use: 'encrypt' | 'decrypt') {
  const publicKey = await crypto.subtle.importKey('raw', publicRaw, ECDH, false, []);
  return crypto.subtle.deriveKey({ name: 'ECDH', public: publicKey }, privateKey, { name: 'AES-GCM', length: 256 }, false, [use]);
}

export async function sealFor(recipientPublicKey: string, value: unknown) {
  const mine = await crypto.subtle.generateKey(ECDH, false, ['deriveKey']) as { privateKey: CryptoKey; publicKey: CryptoKey };
  const key = await agree(mine.privateKey, unb64u(recipientPublicKey), 'encrypt');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, text.encode(JSON.stringify(value)));
  return [b64u(await crypto.subtle.exportKey('raw', mine.publicKey)), b64u(iv), b64u(data)].join('.');
}

export async function openSealed<T>(privateKey: CryptoKey, payload: string): Promise<T> {
  const [publicRaw, iv, data] = payload.split('.').map(unb64u);
  const key = await agree(privateKey, publicRaw, 'decrypt');
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data))) as T;
}

// The sign-in service keeps no storage, so its OAuth state is an encrypted, expiring blob.
async function stateKey(secret: string) {
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', text.encode(secret)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function sealState(secret: string, value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await stateKey(secret), text.encode(JSON.stringify(value)));
  return `${b64u(iv)}.${b64u(data)}`;
}
export async function openState<T>(secret: string, sealed: string): Promise<T> {
  const [iv, data] = sealed.split('.').map(unb64u);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await stateKey(secret), data))) as T;
}
