import { randomUUID } from 'node:crypto';
import { createBlobStore, StorageUnavailable, transact } from './storage.js';
import { createEmailSender } from './email.js';
import {
  HttpError, requireValue, validText, validInt, normalizeEmail, validatePassword,
  hashPassword, checkPassword, randomToken, digest, readSession, issueSession,
  sessionCookie, publicUser, checkOrigin, parseBody,
} from './security.js';

const MILESTONES = ['first_feed', 'quest_3', 'tutorial_done', 'game_day_3', 'game_day_7', 'first_purchase', 'account'];
const DAY = 86_400_000;
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const jsonBytes = value => Buffer.byteLength(JSON.stringify(value));
function monday(time) {
  const date = new Date(time); const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day); date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}
function validateSummary(summary) {
  requireValue(object(summary) && validInt(summary.day) && Number.isFinite(summary.coins) && validInt(summary.fish));
  return { day: summary.day, coins: summary.coins, fish: summary.fish };
}
function validateSave(body) {
  requireValue(object(body) && validInt(body.version, 1, 1000) && validInt(body.baseRevision) && validInt(body.clientSavedAt));
  requireValue(object(body.data));
  requireValue(body.device === undefined || validText(body.device, 0, 80));
  const bytes = jsonBytes(body.data);
  requireValue(bytes <= 1024 * 1024, 'save_too_large', 413);
  return { bytes, ...(body.summary === undefined ? {} : { summary: validateSummary(body.summary) }) };
}
function validateShowcase(body) {
  requireValue(object(body));
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  requireValue(validText(title, 1, 40) && /^[\p{L}\p{N} .,'!?&()_-]+$/u.test(title));
  requireValue(body.version === 1 && object(body.data) && object(body.data.part) && object(body.data.part.cfg) && object(body.data.part.state) && Array.isArray(body.data.part.state.fish));
  requireValue(jsonBytes(body.data) <= 1024 * 1024, 'save_too_large', 413);
  const stats = body.stats;
  requireValue(object(stats) && validInt(stats.stars, 0, 5) && validInt(stats.score, 0, 100) && validInt(stats.species, 0, 200) && validInt(stats.fish, 0, 2000) && validInt(stats.lengthCm, 10, 300));
  return { title, stats: { stars: stats.stars, score: stats.score, species: stats.species, fish: stats.fish, lengthCm: stats.lengthCm } };
}
function card(showcase, state, user) {
  return {
    id: showcase.id, tankKey: showcase.tankKey, title: showcase.title,
    ownerName: state.users[showcase.userId]?.displayName || 'Aquarist',
    mine: user?.id === showcase.userId, likedByMe: Boolean(user && hasOwn(showcase.likes, user.id)),
    likes: Object.keys(showcase.likes).length, views: showcase.views || 0,
    stats: showcase.stats, thumbAt: showcase.thumbAt || null,
    publishedAt: showcase.createdAt, updatedAt: showcase.updatedAt,
  };
}
function weekLikes(showcase, week) { return Object.values(showcase.likes).filter(at => monday(at) === week).length; }
function ranking(state, user, board, now) {
  const entries = Object.values(state.showcases).map(showcase => ({
    card: card(showcase, state, user),
    value: board === 'score' ? showcase.stats.score : board === 'likes' ? Object.keys(showcase.likes).length : Object.values(showcase.likes).reduce((sum, at) => sum + 2 ** (-(now - at) / (3 * DAY)), 0),
  })).sort((a, b) => b.value - a.value || a.card.id.localeCompare(b.card.id));
  for (let i = 0; i < entries.length; i++) entries[i].rank = i > 0 && entries[i - 1].value === entries[i].value ? entries[i - 1].rank : i + 1;
  return entries;
}
function archiveWeeks(state, now) {
  state.fame ||= {};
  const current = monday(now);
  for (const showcase of Object.values(state.showcases)) {
    for (const week of new Set(Object.values(showcase.likes).map(monday))) {
      if (week === current) continue;
      const likes = weekLikes(showcase, week);
      if (likes > (state.fame[week]?.weekLikes || 0)) state.fame[week] = { weekStart: week, current: false, card: card(showcase, state, null), weekLikes: likes };
    }
  }
}

export function createHandler({
  store = createBlobStore(), secret = process.env.AUTH_SECRET, email = createEmailSender(),
  clock = Date.now, secureCookies = Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production'),
  appUrl = process.env.APP_ORIGIN || process.env.APP_URL,
} = {}) {
  // Heartbeats are analytics only. Coalesce repeated pings within an instance;
  // gameplay saves, authentication and community changes are always persisted.
  const recentBeats = new Map();
  return async function handler(req, res) {
    const send = (status, body, headers = {}) => {
      res.statusCode = status;
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
      if (body === undefined) return res.end();
      if (Buffer.isBuffer(body)) return res.end(body);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(body));
    };
    try {
      requireValue(secret && secret.length >= 32, 'internal', 503, { message: 'Authentication is not configured. Set AUTH_SECRET.' });
      checkOrigin(req);
      const url = new URL(req.url, 'http://localhost');
      let pathname = url.pathname.replace(/^\/api(?=\/|$)/, '').replace(/\/$/, '') || '/';
      const method = req.method;
      const now = clock();
      const body = ['POST', 'PUT', 'PATCH'].includes(method) ? await parseBody(req) : {};
      requireValue(object(body));
      const auth = (state, required = false) => {
        const session = readSession(req, state, secret, now);
        if (required && !session) throw new HttpError(401, 'unauthorized');
        return session;
      };
      const mutate = action => transact(store, state => action(state, auth(state)));
      const read = async action => { const { state } = await store.read(); return action(state, auth(state)); };
      const required = session => { requireValue(session, 'unauthorized', 401); return session.user; };
      const origin = appUrl || `${secureCookies ? 'https' : 'http'}://${req.headers.host}`;
      const setCookie = value => res.setHeader('Set-Cookie', sessionCookie(value, secureCookies));
      async function rateLimit(label, limit = 30, window = 15 * 60_000) {
        const address = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
        const key = digest(`${label}:${address}`, secret);
        await mutate(state => {
          state.limits ||= {};
          for (const [id, item] of Object.entries(state.limits)) if (item.until <= now) delete state.limits[id];
          const item = state.limits[key] || { count: 0, until: now + window };
          requireValue(item.count < limit, 'rate_limited', 429);
          item.count++; state.limits[key] = item;
        });
      }
      function createEmailToken(state, user, kind) {
        const token = randomToken();
        for (const [key, item] of Object.entries(state.tokens)) if (item.expiresAt <= now || (item.userId === user.id && item.kind === kind)) delete state.tokens[key];
        state.tokens[digest(token, secret)] = { userId: user.id, kind, expiresAt: now + (kind === 'verify' ? DAY : 30 * 60_000) };
        return token;
      }

      if (pathname === '/health' && method === 'GET') {
        await store.read(); return send(200, { ok: true, emailConfigured: email.configured });
      }
      if (pathname === '/auth/me' && method === 'GET') return send(200, await read((_state, session) => ({ user: publicUser(required(session)) })));
      if (pathname === '/auth/register' && method === 'POST') {
        await rateLimit('register', 12);
        const address = normalizeEmail(body.email); validatePassword(body.password);
        const name = typeof body.displayName === 'string' ? body.displayName.trim() : '';
        requireValue(validText(name, 2, 32) && /^[\p{L}\p{N} ._-]+$/u.test(name));
        const passwordHash = await hashPassword(body.password);
        const result = await mutate(state => {
          requireValue(!Object.values(state.users).some(user => user.email === address), 'email_taken', 409);
          const user = { id: randomUUID(), email: address, displayName: name, passwordHash, emailVerified: false, createdAt: new Date(now).toISOString() };
          state.users[user.id] = user;
          return { user: publicUser(user), cookie: issueSession(state, user.id, secret, now), token: email.configured ? createEmailToken(state, user, 'verify') : null };
        });
        setCookie(result.cookie);
        if (result.token) {
          // Account creation remains successful when the delivery provider is temporarily unavailable.
          try { await email.send({ email: result.user.email, token: result.token, kind: 'verify', origin }); } catch { /* Resend is available in the account menu. */ }
        }
        return send(201, { user: result.user });
      }
      if (pathname === '/auth/login' && method === 'POST') {
        await rateLimit('login', 50);
        const address = normalizeEmail(body.email);
        requireValue(validText(body.password, 1, 128));
        const candidate = await read(state => Object.values(state.users).find(user => user.email === address));
        const valid = await checkPassword(body.password, candidate?.passwordHash);
        requireValue(valid && candidate, 'invalid_credentials', 401);
        const result = await mutate(state => {
          const user = state.users[candidate.id];
          requireValue(user?.passwordHash === candidate.passwordHash, 'invalid_credentials', 401);
          return { user: publicUser(user), cookie: issueSession(state, user.id, secret, now) };
        });
        setCookie(result.cookie); return send(200, { user: result.user });
      }
      if (['/auth/logout', '/auth/logout-all'].includes(pathname) && method === 'POST') {
        await mutate((state, session) => {
          if (session) for (const [key, value] of Object.entries(state.sessions)) if (key === session.key || (pathname.endsWith('-all') && value.userId === session.userId)) delete state.sessions[key];
        });
        setCookie(''); return send(204);
      }
      if (pathname === '/auth/password/forgot' && method === 'POST') {
        requireValue(email.configured, 'internal', 503, { message: 'Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM.' });
        await rateLimit('forgot', 10);
        const address = normalizeEmail(body.email);
        const result = await mutate(state => {
          const user = Object.values(state.users).find(item => item.email === address);
          return user ? { email: user.email, token: createEmailToken(state, user, 'reset') } : null;
        });
        // Identical successful response whether or not this address has an account.
        if (result) {
          // Delivery failure must not disclose whether this address has an account.
          try { await email.send({ ...result, kind: 'reset', origin }); } catch { /* Generic success also covers provider failures. */ }
        }
        return send(204);
      }
      if (pathname === '/auth/email/resend' && method === 'POST') {
        requireValue(email.configured, 'internal', 503, { message: 'Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM.' });
        await rateLimit('resend', 10);
        const result = await mutate((state, session) => {
          const user = required(session);
          return user.emailVerified ? null : { email: user.email, token: createEmailToken(state, user, 'verify') };
        });
        if (result) await email.send({ ...result, kind: 'verify', origin });
        return send(204);
      }
      if (['/auth/email/verify', '/auth/password/reset'].includes(pathname) && method === 'POST') {
        await rateLimit('email-token', 30);
        requireValue(validText(body.token, 20, 200));
        const kind = pathname.endsWith('/verify') ? 'verify' : 'reset';
        const passwordHash = kind === 'reset' ? await hashPassword(validatePassword(body.password)) : null;
        await mutate(state => {
          const key = digest(body.token, secret); const token = state.tokens[key];
          requireValue(token && token.kind === kind && token.expiresAt > now && state.users[token.userId], 'invalid_token', 400);
          const user = state.users[token.userId];
          if (kind === 'verify') user.emailVerified = true;
          else {
            user.passwordHash = passwordHash;
            for (const [id, session] of Object.entries(state.sessions)) if (session.userId === user.id) delete state.sessions[id];
          }
          delete state.tokens[key];
        });
        if (kind === 'reset') setCookie('');
        return send(204);
      }

      if (pathname === '/saves' && method === 'GET') return send(200, await read((state, session) => {
        const user = required(session);
        return { saves: Object.values(state.saves[user.id] || {}).map(record => record.current.meta).sort((a, b) => a.slot - b.slot) };
      }));
      const saveMatch = pathname.match(/^\/saves\/([0-2])(?:\/(history|restore))?$/);
      if (saveMatch) {
        const slot = Number(saveMatch[1]); const action = saveMatch[2];
        if (method === 'GET' && !action) return send(200, await read((state, session) => {
          const user = required(session); const record = state.saves[user.id]?.[slot];
          requireValue(record, 'not_found', 404); return record.current;
        }));
        if (method === 'GET' && action === 'history') return send(200, await read((state, session) => {
          const user = required(session); const record = state.saves[user.id]?.[slot];
          return { history: record ? [record.current, ...record.history].map(item => item.meta) : [] };
        }));
        if ((method === 'PUT' && !action) || (method === 'POST' && action === 'restore')) {
          const details = action ? null : validateSave(body);
          if (action) requireValue(validInt(body.revision, 1) && validInt(body.baseRevision, 1));
          const result = await mutate((state, session) => {
            const user = required(session);
            state.saves[user.id] ||= {};
            const record = state.saves[user.id][slot];
            const revision = record?.current.meta.revision || 0;
            requireValue(revision === body.baseRevision, 'save_conflict', 409, { current: record?.current.meta || null });
            let next;
            if (action) {
              const source = [record.current, ...record.history].find(item => item.meta.revision === body.revision);
              requireValue(source, 'not_found', 404);
              next = structuredClone(source);
              next.meta.revision = revision + 1; next.meta.updatedAt = new Date(now).toISOString();
            } else next = {
              meta: { slot, version: body.version, revision: revision + 1, clientSavedAt: body.clientSavedAt, updatedAt: new Date(now).toISOString(), bytes: details.bytes, device: body.device || null, summary: details.summary || null },
              data: body.data,
            };
            state.saves[user.id][slot] = { current: next, history: record ? [record.current, ...record.history].slice(0, 10) : [] };
            return { meta: next.meta };
          });
          return send(200, result);
        }
      }

      if (pathname === '/showcases' && method === 'GET') return send(200, await read((state, session) => {
        const sort = url.searchParams.get('sort') || 'new';
        requireValue(['new', 'top'].includes(sort));
        const cursor = url.searchParams.get('cursor');
        const offset = cursor ? Number(cursor) : 0; requireValue(validInt(offset, 0, 1_000_000));
        const all = Object.values(state.showcases).sort((a, b) => sort === 'top' ? Object.keys(b.likes).length - Object.keys(a.likes).length || b.createdAt - a.createdAt : b.createdAt - a.createdAt);
        return { showcases: all.slice(offset, offset + 24).map(item => card(item, state, session?.user)), nextCursor: all.length > offset + 24 ? String(offset + 24) : null };
      }));
      if (pathname === '/showcases/mine' && method === 'GET') return send(200, await read((state, session) => {
        const user = required(session);
        return { showcases: Object.values(state.showcases).filter(item => item.userId === user.id).map(item => card(item, state, user)), visited: Object.keys(state.visits[user.id] || {}).length };
      }));
      if (pathname === '/showcases/featured' && method === 'GET') return send(200, await read((state, session) => {
        const week = monday(now);
        const showcase = Object.values(state.showcases).sort((a, b) => weekLikes(b, week) - weekLikes(a, week) || b.stats.score - a.stats.score || b.createdAt - a.createdAt)[0];
        return { showcase: showcase ? card(showcase, state, session?.user) : null, weekLikes: showcase ? weekLikes(showcase, week) : 0 };
      }));
      if (pathname === '/showcases/leaderboard' && method === 'GET') return send(200, await read((state, session) => {
        const board = url.searchParams.get('board') || 'hot'; requireValue(['hot', 'likes', 'score'].includes(board));
        const entries = ranking(state, session?.user, board, now);
        return { entries: entries.slice(0, 50), mine: entries.filter(item => item.card.mine), total: entries.length };
      }));
      if (pathname === '/showcases/hall-of-fame' && method === 'GET') return send(200, await read((state, session) => {
        archiveWeeks(state, now);
        const current = monday(now);
        const winner = Object.values(state.showcases).sort((a, b) => weekLikes(b, current) - weekLikes(a, current) || b.stats.score - a.stats.score)[0];
        const weeks = Object.values(state.fame || {}).sort((a, b) => b.weekStart.localeCompare(a.weekStart)).slice(0, 51);
        if (winner) weeks.unshift({ weekStart: current, current: true, card: card(winner, state, session?.user), weekLikes: weekLikes(winner, current) });
        return { weeks };
      }));
      const ownMatch = pathname.match(/^\/showcases\/mine\/(main|side1|side2)$/);
      if (ownMatch && ['PUT', 'DELETE'].includes(method)) {
        const tankKey = ownMatch[1]; const validated = method === 'PUT' ? validateShowcase(body) : null;
        const result = await mutate((state, session) => {
          const user = required(session); archiveWeeks(state, now);
          const old = Object.values(state.showcases).find(item => item.userId === user.id && item.tankKey === tankKey);
          if (method === 'DELETE') { if (old) delete state.showcases[old.id]; return; }
          const item = { ...(old || { id: randomUUID(), userId: user.id, tankKey, createdAt: now, likes: {}, views: 0 }), title: validated.title, stats: validated.stats, version: body.version, data: body.data, updatedAt: now };
          state.showcases[item.id] = item;
          return { showcase: card(item, state, user) };
        });
        return send(method === 'DELETE' ? 204 : 200, result);
      }
      const ownThumbMatch = pathname.match(/^\/showcases\/mine\/(main|side1|side2)\/thumb$/);
      if (ownThumbMatch && method === 'PUT') {
        requireValue(validText(body.jpeg, 100, 120_000) && /^[A-Za-z0-9+/]+=*$/.test(body.jpeg));
        const bytes = Buffer.from(body.jpeg, 'base64');
        requireValue(bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff);
        const result = await mutate((state, session) => {
          const user = required(session);
          const item = Object.values(state.showcases).find(showcase => showcase.userId === user.id && showcase.tankKey === ownThumbMatch[1]);
          requireValue(item, 'not_found', 404);
          item.jpeg = body.jpeg; item.thumbAt = now; return { thumbAt: now };
        });
        return send(200, result);
      }
      const showMatch = pathname.match(/^\/showcases\/([a-f0-9-]{36})(?:\/(like|vote|report|thumb))?$/i);
      if (showMatch) {
        const id = showMatch[1]; const action = showMatch[2];
        if (method === 'GET' && !action) {
          const result = await read((state, session) => {
            const item = state.showcases[id]; requireValue(item, 'not_found', 404);
            return {
              visit: Boolean(session && item.userId !== session.userId && !state.visits[session.userId]?.[id]),
              response: { showcase: card(item, state, session?.user), version: item.version, data: item.data },
            };
          });
          if (!result.visit) return send(200, result.response);
          return send(200, await mutate((state, session) => {
            const item = state.showcases[id]; requireValue(item, 'not_found', 404);
            if (session && item.userId !== session.userId) {
              state.visits[session.userId] ||= {};
              if (!state.visits[session.userId][id]) { state.visits[session.userId][id] = now; item.views++; }
            }
            return { showcase: card(item, state, session?.user), version: item.version, data: item.data };
          }));
        }
        if (method === 'GET' && action === 'thumb') {
          const thumbnail = await read(state => { const item = state.showcases[id]; requireValue(item?.jpeg, 'not_found', 404); return Buffer.from(item.jpeg, 'base64'); });
          return send(200, thumbnail, { 'Content-Type': 'image/jpeg' });
        }
        if (['POST', 'DELETE'].includes(method) && ['like', 'vote'].includes(action)) return send(200, await mutate((state, session) => {
          const user = required(session); const item = state.showcases[id]; requireValue(item, 'not_found', 404);
          requireValue(item.userId !== user.id, 'forbidden', 403); archiveWeeks(state, now);
          if (method === 'POST') { if (!hasOwn(item.likes, user.id)) item.likes[user.id] = now; }
          else delete item.likes[user.id];
          return { likes: Object.keys(item.likes).length, likedByMe: hasOwn(item.likes, user.id) };
        }));
        if (method === 'POST' && action === 'report') {
          requireValue(['offensive', 'spam', 'other'].includes(body.reason)); await rateLimit('report', 20);
          await mutate((state, session) => {
            const user = required(session); requireValue(state.showcases[id], 'not_found', 404);
            if (!state.reports.some(item => item.userId === user.id && item.showcaseId === id)) state.reports.push({ id: randomUUID(), userId: user.id, showcaseId: id, reason: body.reason, createdAt: now });
            state.reports = state.reports.slice(-1000);
          });
          return send(204);
        }
        if (method === 'PUT' && action === 'thumb') {
          requireValue(validText(body.jpeg, 100, 120_000) && /^[A-Za-z0-9+/]+=*$/.test(body.jpeg));
          const bytes = Buffer.from(body.jpeg, 'base64');
          requireValue(bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff);
          const result = await mutate((state, session) => {
            const user = required(session); const item = state.showcases[id]; requireValue(item, 'not_found', 404); requireValue(item.userId === user.id, 'forbidden', 403);
            item.jpeg = body.jpeg; item.thumbAt = now; return { thumbAt: now };
          });
          return send(200, result);
        }
      }

      if (pathname === '/play/beat' && method === 'POST') {
        const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
        requireValue(uuid(body.anonId) && uuid(body.sessionId));
        requireValue(body.milestones === undefined || (Array.isArray(body.milestones) && body.milestones.length <= MILESTONES.length && body.milestones.every(item => MILESTONES.includes(item))));
        if (body.start !== undefined) requireValue(object(body.start) && ['mobile', 'tablet', 'desktop'].includes(body.start.device) && ['low', 'high'].includes(body.start.quality) && validText(body.start.lang, 0, 8) && validText(body.start.source, 0, 24));
        const beatKey = digest(body.sessionId, secret);
        const fingerprint = [...new Set(body.milestones || [])].sort().join(',');
        const recent = recentBeats.get(beatKey);
        if (recent && recent.at > now - 5 * 60_000 && recent.fingerprint === fingerprint && !body.start) return send(204);
        await mutate(state => {
          const key = beatKey;
          const previous = state.play[key];
          state.play[key] = { anonId: digest(body.anonId, secret), startedAt: previous?.startedAt || now, lastBeat: now, ...(previous?.start ? { start: previous.start } : {}), ...(body.start ? { start: body.start } : {}), milestones: [...new Set([...(previous?.milestones || []), ...(body.milestones || [])])] };
          for (const [id, item] of Object.entries(state.play)) if (item.lastBeat < now - 7 * DAY) delete state.play[id];
          const ordered = Object.entries(state.play).sort((a, b) => b[1].lastBeat - a[1].lastBeat);
          for (const [id] of ordered.slice(5000)) delete state.play[id];
        });
        recentBeats.set(beatKey, { at: now, fingerprint });
        if (recentBeats.size > 10_000) for (const [key, value] of recentBeats) if (value.at < now - 5 * 60_000) recentBeats.delete(key);
        while (recentBeats.size > 10_000) recentBeats.delete(recentBeats.keys().next().value);
        return send(204);
      }
      if (pathname === '/client-error' && method === 'POST') {
        requireValue(validText(body.where, 1, 60) && validText(body.message, 1, 500) && validText(body.url, 0, 300));
        requireValue(body.stack === undefined || validText(body.stack, 0, 4000));
        // Acknowledge without retaining browser URLs, stacks, or user supplied content.
        return send(204);
      }
      return send(404, { error: { code: 'not_found' } });
    } catch (error) {
      if (error instanceof HttpError) return send(error.status, { error: { code: error.code, ...(error.detail ? { detail: error.detail } : {}) } });
      if (error instanceof StorageUnavailable) return send(503, { error: { code: 'internal', detail: { message: error.message } } });
      // Never expose SDK errors: provider errors can contain storage URLs or credentials.
      return send(503, { error: { code: 'internal', detail: { message: 'Persistent storage is temporarily unavailable. Please retry.' } } });
    }
  };
}

export default createHandler();
