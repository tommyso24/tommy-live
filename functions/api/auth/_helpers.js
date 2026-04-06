export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_HASH = 'SHA-256';
const SALT_BYTES = 16;
const JWT_EXP_SECONDS = 7 * 24 * 60 * 60;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export function jsonResponse(data, status = 200) {
  return Response.json(data, {
    status,
    headers: CORS_HEADERS,
  });
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const value = Number.parseInt(hex.slice(i, i + 2), 16);
    if (Number.isNaN(value)) {
      throw new Error('Invalid hex string');
    }
    bytes[i / 2] = value;
  }

  return bytes;
}

async function pbkdf2(password, saltBytes) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    256
  );

  return new Uint8Array(derivedBits);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt);
  return `${bytesToHex(salt)}:${bytesToHex(hash)}`;
}

export async function verifyPassword(password, stored) {
  try {
    const parts = typeof stored === 'string' ? stored.split(':') : [];
    if (parts.length !== 2) {
      return false;
    }

    const [saltHex, hashHex] = parts;
    const salt = hexToBytes(saltHex);
    const expectedHash = hexToBytes(hashHex);
    const actualHash = await pbkdf2(password, salt);

    return timingSafeEqual(actualHash, expectedHash);
  } catch {
    return false;
  }
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlEncodeBytes(bytes) {
  return bytesToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecodeToBytes(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return base64ToBytes(padded);
}

export function base64UrlEncode(input) {
  const bytes = typeof input === 'string' ? textEncoder.encode(input) : input;
  return base64UrlEncodeBytes(bytes);
}

export function base64UrlDecode(input) {
  return textDecoder.decode(base64UrlDecodeToBytes(input));
}

function base64UrlEncodeJson(value) {
  return base64UrlEncode(JSON.stringify(value));
}

function base64UrlDecodeJson(value) {
  return JSON.parse(base64UrlDecode(value));
}

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signJWT(payload, secret) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = {
    ...payload,
    iat: now,
    exp: now + JWT_EXP_SECONDS,
  };

  const encodedHeader = base64UrlEncodeJson(header);
  const encodedPayload = base64UrlEncodeJson(body);
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    textEncoder.encode(signingInput)
  );

  const encodedSignature = base64UrlEncodeBytes(new Uint8Array(signature));
  return `${signingInput}.${encodedSignature}`;
}

export async function verifyJWT(token, secret) {
  try {
    if (typeof token !== 'string') {
      return null;
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const header = base64UrlDecodeJson(encodedHeader);
    if (!header || header.alg !== 'HS256' || header.typ !== 'JWT') {
      return null;
    }

    const key = await importHmacKey(secret);
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecodeToBytes(encodedSignature),
      textEncoder.encode(signingInput)
    );

    if (!isValid) {
      return null;
    }

    const payload = base64UrlDecodeJson(encodedPayload);
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp <= now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function extractUser(request, env) {
  try {
    const authHeader = request.headers.get('Authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return null;
    }

    const secret = env?.JWT_SECRET;
    if (!secret) {
      return null;
    }

    return await verifyJWT(match[1], secret);
  } catch {
    return null;
  }
}
