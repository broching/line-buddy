// AES-256-GCM encryption for credentials stored at rest (WhatsApp session keys).
// Uses the Web Crypto API, which is available in both the V8 and Node Convex
// runtimes — so this file must NOT contain "use node".
//
// CREDENTIALS_ENCRYPTION_KEY must decode to 32 bytes — accepted as either a
// 64-char hex string or base64. Generate with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

const IV_BYTES = 12; // standard GCM nonce length

function parseKey(raw: string): Uint8Array {
  const clean = raw.trim();
  // 64-char hex
  if (/^[0-9a-fA-F]{64}$/.test(clean)) {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return bytes;
  }
  // base64 (must decode to exactly 32 bytes)
  try {
    const bytes = fromBase64(clean);
    if (bytes.length === 32) return bytes;
  } catch { /* fall through */ }
  throw new Error("CREDENTIALS_ENCRYPTION_KEY must be 32 bytes (64-char hex or base64)");
}

async function getKey(): Promise<CryptoKey> {
  const keyStr = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!keyStr) throw new Error("CREDENTIALS_ENCRYPTION_KEY is not set");
  return crypto.subtle.importKey("raw", parseKey(keyStr), { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Returns base64(iv ‖ ciphertext+tag).
export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encoded = new TextEncoder().encode(plaintext);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const cipherBytes = new Uint8Array(cipher);
  const combined = new Uint8Array(iv.length + cipherBytes.length);
  combined.set(iv, 0);
  combined.set(cipherBytes, iv.length);
  return toBase64(combined);
}

export async function decryptSecret(payload: string): Promise<string> {
  const key = await getKey();
  const combined = fromBase64(payload);
  const iv = combined.slice(0, IV_BYTES);
  const cipherBytes = combined.slice(IV_BYTES);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipherBytes);
  return new TextDecoder().decode(plain);
}
