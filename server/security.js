import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
export const COOKIE = 'aqualator_session';
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export const digest = (value, secret) => createHmac('sha256', secret).update(value).digest('hex');
export const randomToken = () => randomBytes(32).toString('base64url');

export class HttpError extends Error {
  constructor(status, code, detail) { super(code); this.status = status; this.code = code; this.detail = detail; }
}
export function requireValue(condition, code = 'invalid_input', status = 400, detail) {
  if (!condition) throw new HttpError(status, code, detail);
}
export function validText(value, min, max) { return typeof value === 'string' && value.length >= min && value.length <= max; }
export function validInt(value, min = 0, max = Number.MAX_SAFE_INTEGER) { return Number.isSafeInteger(value) && value >= min && value <= max; }
export function normalizeEmail(value) {
  requireValue(typeof value === 'string');
  const email = value.trim().toLowerCase();
  requireValue(email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  return email;
}
export function validatePassword(password) { requireValue(validText(password, 8, 128)); return password; }
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function checkPassword(password, record) {
  const [, salt, expected] = (record || `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`).split('$');
  if (!salt || !expected) return false;
  const key = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const other = Buffer.from(expected, 'hex');
  return other.length === key.length && timingSafeEqual(other, key);
}
function equalText(a, b) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function readSession(req, state, secret, now) {
  const cookie = String(req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`));
  if (!cookie) return null;
  const [token, signature] = cookie.slice(COOKIE.length + 1).split('.');
  if (!token || !signature || token.length !== 43 || !equalText(signature, digest(token, secret))) return null;
  const key = digest(token, secret);
  const session = state.sessions[key];
  if (!session || session.expiresAt <= now || !state.users[session.userId]) return null;
  return { key, ...session, user: state.users[session.userId] };
}
export function issueSession(state, userId, secret, now, token = randomToken()) {
  for (const [key, value] of Object.entries(state.sessions)) if (value.expiresAt <= now) delete state.sessions[key];
  const key = digest(token, secret);
  state.sessions[key] = { userId, createdAt: now, expiresAt: now + SESSION_MS };
  const active = Object.entries(state.sessions).filter(([, value]) => value.userId === userId).sort((a, b) => b[1].createdAt - a[1].createdAt);
  for (const [oldKey] of active.slice(20)) delete state.sessions[oldKey];
  return `${token}.${digest(token, secret)}`;
}
export function sessionCookie(value, secure = true) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${value ? SESSION_MS / 1000 : 0}${secure ? '; Secure' : ''}`;
}
export const publicUser = user => ({ id: user.id, email: user.email, displayName: user.displayName, emailVerified: user.emailVerified, createdAt: user.createdAt });

export function checkOrigin(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  requireValue(req.headers['sec-fetch-site'] !== 'cross-site', 'forbidden', 403);
  const origin = req.headers.origin;
  if (origin) {
    let parsed;
    try { parsed = new URL(origin); } catch { throw new HttpError(403, 'forbidden'); }
    requireValue(parsed.host === req.headers.host && ['http:', 'https:'].includes(parsed.protocol), 'forbidden', 403);
  }
}

export async function parseBody(req) {
  const limit = 2 * 1024 * 1024;
  const length = Number(req.headers['content-length'] || 0);
  requireValue(length <= limit, 'save_too_large', 413);
  if (req.body !== undefined) {
    if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
      requireValue(Buffer.byteLength(req.body) <= limit, 'save_too_large', 413);
      try { return JSON.parse(String(req.body)); } catch { throw new HttpError(400, 'invalid_input'); }
    }
    requireValue(Buffer.byteLength(JSON.stringify(req.body)) <= limit, 'save_too_large', 413);
    return req.body;
  }
  const chunks = []; let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length; requireValue(bytes <= limit, 'save_too_large', 413); chunks.push(chunk);
  }
  if (!bytes) return {};
  requireValue(String(req.headers['content-type'] || '').toLowerCase().includes('application/json'));
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new HttpError(400, 'invalid_input'); }
}
