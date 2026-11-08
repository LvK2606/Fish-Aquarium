import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createHandler } from '../server/handler.js';
import { createMemoryStore, createBlobStore, StorageConflict, StorageUnavailable } from '../server/storage.js';

const secret = 'test-only-auth-secret-32-characters-at-least';
async function fixture(options = {}) {
  const store = options.store || createMemoryStore();
  const sent = [];
  const email = options.email || { configured: false, async send(message) { sent.push(message); } };
  const handler = createHandler({ store, secret, secureCookies: true, email, ...options });
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function request(path, { method = 'GET', body, cookie, headers = {} } = {}) {
    const response = await fetch(`${origin}/api${path}`, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const raw = await response.text();
    let data; try { data = JSON.parse(raw); } catch { data = raw; }
    return { status: response.status, headers: response.headers, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function signup(name = 'Keeper', address = `${randomUUID()}@example.com`) {
    const response = await request('/auth/register', { method: 'POST', body: { email: address, displayName: name, password: 'long-password-123!' } });
    assert.equal(response.status, 201, JSON.stringify(response.data));
    return { ...response, email: address };
  }
  return { store, sent, request, signup, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
const save = (baseRevision = 0, data = { tank: 'main', fish: [] }) => ({ version: 1, baseRevision, clientSavedAt: 1234, data, summary: { day: 1, coins: 50, fish: 0 }, device: 'test browser' });
const showcase = title => ({ title, version: 1, stats: { stars: 3, score: 70, species: 2, fish: 3, lengthCm: 60 }, data: { part: { cfg: { lengthCm: 60 }, state: { fish: [] } } } });

test('account authentication, signed secure cookies, password hashing and session revocation', async t => {
  const f = await fixture(); t.after(f.close);
  assert.equal((await f.request('/auth/me')).status, 401);
  const owner = await f.signup();
  assert.match(owner.headers.get('set-cookie'), /HttpOnly; SameSite=Lax; Max-Age=2592000; Secure/);
  assert.equal(owner.data.user.emailVerified, false);
  assert.equal(owner.data.user.passwordHash, undefined);
  const { state } = await f.store.read();
  assert.match(state.users[owner.data.user.id].passwordHash, /^scrypt\$/);
  assert.ok(!JSON.stringify(state).includes('long-password-123!'));
  assert.equal((await f.request('/auth/me', { cookie: owner.cookie })).data.user.id, owner.data.user.id);
  const forged = owner.cookie.slice(0, -2) + 'aa';
  assert.equal((await f.request('/auth/me', { cookie: forged })).status, 401);
  const bad = await f.request('/auth/login', { method: 'POST', body: { email: owner.email, password: 'bad' } });
  assert.equal(bad.data.error.code, 'invalid_credentials');
  const login = await f.request('/auth/login', { method: 'POST', body: { email: owner.email.toUpperCase(), password: 'long-password-123!' } });
  assert.equal(login.status, 200);
  assert.equal((await f.request('/auth/logout-all', { method: 'POST', cookie: login.cookie })).status, 204);
  assert.equal((await f.request('/auth/me', { cookie: owner.cookie })).status, 401);
  assert.equal((await f.request('/auth/me', { cookie: login.cookie })).status, 401);
});

test('cross-origin changes are rejected and expired sessions cannot read private saves', async t => {
  let now = Date.now(); const f = await fixture({ clock: () => now }); t.after(f.close);
  const owner = await f.signup();
  const blocked = await f.request('/saves/0', { method: 'PUT', cookie: owner.cookie, body: save(), headers: { Origin: 'https://evil.example' } });
  assert.equal(blocked.status, 403);
  assert.equal((await f.request('/saves', { cookie: owner.cookie })).data.saves.length, 0);
  now += 31 * 86_400_000;
  assert.equal((await f.request('/saves', { cookie: owner.cookie })).status, 401);
});

test('save slots isolate owners; optimistic revision prevents lost changes and restore creates a revision', async t => {
  const f = await fixture(); t.after(f.close);
  const first = await f.signup('First'); const second = await f.signup('Second');
  const create = await f.request('/saves/0', { method: 'PUT', cookie: first.cookie, body: save() });
  assert.equal(create.data.meta.revision, 1);
  assert.equal((await f.request('/saves/0', { cookie: second.cookie })).status, 404);
  const races = await Promise.all([1, 2].map(index => f.request('/saves/0', { method: 'PUT', cookie: first.cookie, body: save(1, { changed: index }) })));
  assert.deepEqual(races.map(item => item.status).sort(), [200, 409]);
  assert.equal(races.find(item => item.status === 409).data.error.code, 'save_conflict');
  const history = await f.request('/saves/0/history', { cookie: first.cookie });
  assert.deepEqual(history.data.history.map(item => item.revision), [2, 1]);
  const restore = await f.request('/saves/0/restore', { method: 'POST', cookie: first.cookie, body: { revision: 1, baseRevision: 2 } });
  assert.equal(restore.data.meta.revision, 3);
  assert.deepEqual((await f.request('/saves/0', { cookie: first.cookie })).data.data, save().data);
  assert.equal((await f.request('/saves/3', { method: 'PUT', cookie: first.cookie, body: save() })).status, 404);
  assert.equal((await f.request('/saves/1', { method: 'PUT', cookie: first.cookie, body: save(0, { enormous: 'x'.repeat(1024 * 1024) }) })).status, 413);
});

test('independent community publishing, likes, rankings, thumbnails, reports and ownership', async t => {
  const f = await fixture(); t.after(f.close);
  const owner = await f.signup('Owner'); const visitor = await f.signup('Visitor');
  assert.deepEqual((await f.request('/showcases')).data, { showcases: [], nextCursor: null });
  const published = await f.request('/showcases/mine/main', { method: 'PUT', cookie: owner.cookie, body: showcase('My aquarium') });
  assert.equal(published.status, 200);
  const id = published.data.showcase.id;
  const visited = await f.request(`/showcases/${id}`, { cookie: visitor.cookie });
  assert.equal(visited.data.version, 1); assert.equal(visited.data.showcase.views, 1);
  assert.equal((await f.request('/showcases/mine', { cookie: visitor.cookie })).data.visited, 1);
  assert.equal((await f.request(`/showcases/${id}/like`, { method: 'POST' })).status, 401);
  assert.equal((await f.request(`/showcases/${id}/like`, { method: 'POST', cookie: owner.cookie })).status, 403);
  for (let i = 0; i < 2; i++) assert.deepEqual((await f.request(`/showcases/${id}/like`, { method: 'POST', cookie: visitor.cookie })).data, { likes: 1, likedByMe: true });
  const leaderboard = await f.request('/showcases/leaderboard?board=likes', { cookie: owner.cookie });
  assert.equal(leaderboard.data.entries[0].rank, 1); assert.equal(leaderboard.data.entries[0].value, 1); assert.equal(leaderboard.data.mine.length, 1);
  assert.equal((await f.request('/showcases/featured')).data.weekLikes, 1);
  assert.equal((await f.request('/showcases/hall-of-fame')).data.weeks[0].current, true);
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(100)]).toString('base64');
  assert.equal((await f.request('/showcases/mine/main/thumb', { method: 'PUT', cookie: visitor.cookie, body: { jpeg } })).status, 404);
  assert.equal((await f.request('/showcases/mine/main/thumb', { method: 'PUT', cookie: owner.cookie, body: { jpeg } })).status, 200);
  const thumb = await f.request(`/showcases/${id}/thumb`); assert.equal(thumb.status, 200); assert.equal(thumb.headers.get('content-type'), 'image/jpeg');
  assert.equal((await f.request(`/showcases/${id}/report`, { method: 'POST', cookie: visitor.cookie, body: { reason: 'spam' } })).status, 204);
  assert.deepEqual((await f.request(`/showcases/${id}/like`, { method: 'DELETE', cookie: visitor.cookie })).data, { likes: 0, likedByMe: false });
  assert.equal((await f.request('/showcases/mine/main', { method: 'DELETE', cookie: visitor.cookie })).status, 204);
  assert.equal((await f.request(`/showcases/${id}`)).status, 200);
  assert.equal((await f.request('/showcases/mine/main', { method: 'DELETE', cookie: owner.cookie })).status, 204);
  assert.equal((await f.request(`/showcases/${id}`)).status, 404);
});

test('email tokens remain private, verification is single-use, password reset revokes all sessions', async t => {
  const sent = [];
  const email = { configured: true, async send(message) { sent.push(message); } };
  const f = await fixture({ email, appUrl: 'https://fish.example' }); t.after(f.close);
  const owner = await f.signup();
  assert.equal(sent.length, 1); assert.equal(sent[0].origin, 'https://fish.example');
  assert.ok(!JSON.stringify(owner.data).includes(sent[0].token));
  const verify = await f.request('/auth/email/verify', { method: 'POST', body: { token: sent[0].token } });
  assert.equal(verify.status, 204);
  assert.equal((await f.request('/auth/me', { cookie: owner.cookie })).data.user.emailVerified, true);
  assert.equal((await f.request('/auth/email/verify', { method: 'POST', body: { token: sent[0].token } })).data.error.code, 'invalid_token');
  const unknown = await f.request('/auth/password/forgot', { method: 'POST', body: { email: 'missing@example.com' } });
  const exists = await f.request('/auth/password/forgot', { method: 'POST', body: { email: owner.email } });
  assert.equal(unknown.status, exists.status); assert.equal(unknown.data, exists.data);
  assert.equal((await f.request('/auth/password/reset', { method: 'POST', body: { token: sent[1].token, password: 'replacement-password' } })).status, 204);
  assert.equal((await f.request('/auth/me', { cookie: owner.cookie })).status, 401);
  assert.equal((await f.request('/auth/login', { method: 'POST', body: { email: owner.email, password: 'long-password-123!' } })).status, 401);
  assert.equal((await f.request('/auth/login', { method: 'POST', body: { email: owner.email, password: 'replacement-password' } })).status, 200);
  const snapshot = JSON.stringify((await f.store.read()).state);
  for (const message of sent) assert.ok(!snapshot.includes(message.token));
});

test('unconfigured storage and email fail honestly, telemetry remains local', async t => {
  const unavailable = await fixture({ store: createBlobStore({ token: '' }) }); t.after(unavailable.close);
  assert.equal((await unavailable.request('/health')).status, 503);
  const f = await fixture(); t.after(f.close);
  assert.equal((await f.request('/auth/password/forgot', { method: 'POST', body: { email: 'test@example.com' } })).status, 503);
  const response = await f.request('/play/beat', { method: 'POST', body: { anonId: randomUUID(), sessionId: randomUUID(), start: { device: 'desktop', quality: 'low', lang: 'vi', source: 'direct' }, milestones: ['first_feed'] } });
  assert.equal(response.status, 204);
  assert.equal(Object.keys((await f.store.read()).state.play).length, 1);
  assert.equal((await f.request('/client-error', { method: 'POST', body: { where: 'test', message: 'error', url: '/?private=value' } })).status, 204);
  assert.ok(!JSON.stringify((await f.store.read()).state).includes('private=value'));
});

test('Blob adapter disables cached reads and uses conditional private writes', async () => {
  const calls = [];
  const sdk = {
    async get(pathname, options) { calls.push({ pathname, options }); return null; },
    async put(pathname, content, options) { calls.push({ pathname, content, options }); return { etag: 'next-etag' }; },
  };
  const blob = createBlobStore({ token: 'test-token', sdk });
  const first = await blob.read();
  await blob.write(first.state, null); await blob.write(first.state, 'previous-etag');
  assert.equal(calls[0].options.useCache, false);
  assert.equal(calls[1].options.access, 'private'); assert.equal(calls[1].options.allowOverwrite, false);
  assert.equal(calls[2].options.ifMatch, 'previous-etag');
  assert.equal(calls[2].options.addRandomSuffix, false);
  assert.ok(calls[2].options.cacheControlMaxAge >= 60);
  await assert.rejects(createBlobStore({ token: '' }).read(), StorageUnavailable);
});

test('forgot-password does not enumerate accounts when email provider fails', async t => {
  const f = await fixture({ email: { configured: true, async send() { throw new Error('provider unavailable'); } } }); t.after(f.close);
  const owner = await f.signup();
  const exists = await f.request('/auth/password/forgot', { method: 'POST', body: { email: owner.email } });
  const missing = await f.request('/auth/password/forgot', { method: 'POST', body: { email: 'missing@example.com' } });
  assert.equal(exists.status, 204); assert.equal(missing.status, 204); assert.equal(exists.data, missing.data);
});

test('guest showcase reads and repeated telemetry do not rewrite persistent state', async t => {
  const memory = createMemoryStore(); let writes = 0;
  const store = { read: () => memory.read(), write: (...args) => { writes++; return memory.write(...args); } };
  const f = await fixture({ store }); t.after(f.close);
  const owner = await f.signup();
  const published = await f.request('/showcases/mine/main', { method: 'PUT', cookie: owner.cookie, body: showcase('Public tank') });
  const before = writes;
  assert.equal((await f.request(`/showcases/${published.data.showcase.id}`)).status, 200);
  assert.equal((await f.request(`/showcases/${published.data.showcase.id}`, { cookie: owner.cookie })).status, 200);
  assert.equal(writes, before);
  const heartbeat = { anonId: randomUUID(), sessionId: randomUUID(), milestones: ['first_feed'] };
  assert.equal((await f.request('/play/beat', { method: 'POST', body: heartbeat })).status, 204);
  const first = writes;
  assert.equal((await f.request('/play/beat', { method: 'POST', body: heartbeat })).status, 204);
  assert.equal(writes, first);
  assert.equal((await f.request('/play/beat', { method: 'POST', body: { ...heartbeat, milestones: ['first_feed', 'quest_3'] } })).status, 204);
  assert.equal(writes, first + 1);
});

test('Blob conditional-write errors from provider map to StorageConflict', async () => {
  const store = createBlobStore({
    token: 'mock-token',
    pathname: 'isolated/check.json',
    sdk: {
      async put() {
        const error = new Error('Vercel Blob: The conditional request cannot succeed due to a conflicting operation against this resource.');
        error.name = 'BlobError';
        throw error;
      },
    },
  });
  await assert.rejects(store.write({ probe: true }, 'stale-etag'), StorageConflict);
});

