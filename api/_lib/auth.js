import crypto from 'crypto';

const COOKIE_NAME = 'domus_session';
const SESSION_SECONDS = 12 * 60 * 60;

function getSecret() {
  const secret = process.env.AUTH_SECRET || 'chave-secreta-padrao-com-no-minimo-32-caracteres-domus';
  return secret;
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(encoded) {
  return crypto.createHmac('sha256', getSecret()).update(encoded).digest('base64url');
}

export function createSession(user) {
  const payload = encode({ ...user, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS });
  return `${payload}.${sign(payload)}`;
}

function readCookies(request) {
  try {
    const raw = request?.headers?.cookie || (typeof request?.headers?.get === 'function' ? request.headers.get('cookie') : '') || '';
    if (!raw) return {};
    return Object.fromEntries(
      raw.split(';')
        .map(item => item.trim().split('='))
        .filter(parts => parts.length === 2)
        .map(([k, v]) => [decodeURIComponent(k), decodeURIComponent(v)])
    );
  } catch {
    return {};
  }
}

export function verifySession(request) {
  try {
    const cookies = readCookies(request);
    const token = cookies[COOKIE_NAME];
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payload, signature] = parts;
    const expected = sign(payload);
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.exp > Math.floor(Date.now() / 1000) ? data : null;
  } catch {
    return null;
  }
}

export function sessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`;
}

export function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

