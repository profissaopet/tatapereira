const crypto = require('crypto');

const COOKIE_NAME = 'domus_session';
const SESSION_SECONDS = 12 * 60 * 60;

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('AUTH_SECRET precisa ter pelo menos 32 caracteres.');
  return secret;
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(encoded) {
  return crypto.createHmac('sha256', getSecret()).update(encoded).digest('base64url');
}

function createSession(user) {
  const payload = encode({ ...user, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS });
  return `${payload}.${sign(payload)}`;
}

function readCookies(request) {
  return Object.fromEntries((request.headers.cookie || '').split(';').map(item => item.trim().split('=').map(decodeURIComponent)).filter(parts => parts.length === 2));
}

function verifySession(request) {
  try {
    const token = readCookies(request)[COOKIE_NAME];
    if (!token) return null;
    const [payload, signature] = token.split('.');
    const expected = sign(payload);
    const valid = signature && signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.exp > Math.floor(Date.now() / 1000) ? data : null;
  } catch {
    return null;
  }
}

function sessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`;
}

function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

module.exports = { createSession, verifySession, sessionCookie, clearCookie };
