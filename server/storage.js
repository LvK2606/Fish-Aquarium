import { randomUUID } from 'node:crypto';

export class StorageConflict extends Error {}
export class StorageUnavailable extends Error {}

export function emptyState() {
  return { schema: 1, users: {}, sessions: {}, tokens: {}, saves: {}, showcases: {}, reports: [], visits: {}, play: {} };
}

/** One private snapshot, protected by Blob's ETag compare-and-swap. No CDN reads. */
export function createBlobStore({ token = process.env.BLOB_READ_WRITE_TOKEN, pathname = 'aquarium/state-v1.json', sdk } = {}) {
  async function client() {
    if (!token) throw new StorageUnavailable('Persistent storage is not configured.');
    return sdk || import('@vercel/blob');
  }
  return {
    async read() {
      const blob = await (await client()).get(pathname, { access: 'private', token, useCache: false });
      if (!blob) return { state: emptyState(), etag: null };
      return { state: JSON.parse(await new Response(blob.stream).text()), etag: blob.blob.etag };
    },
    async write(state, etag) {
      try {
        const result = await (await client()).put(pathname, JSON.stringify(state), {
          access: 'private', token, addRandomSuffix: false, contentType: 'application/json',
          cacheControlMaxAge: 60, ...(etag ? { ifMatch: etag, allowOverwrite: true } : { allowOverwrite: false }),
        });
        return result.etag;
      } catch (error) {
        if (/Precondition|already exists|condition.*fail|conflicting operation|conditional request cannot succeed/i.test(`${error.name} ${error.message}`)) throw new StorageConflict();
        throw error;
      }
    },
  };
}

/** Tests and explicitly selected local development only; never a production fallback. */
export function createMemoryStore(initial = emptyState()) {
  let state = structuredClone(initial);
  let etag = null;
  return {
    async read() { return { state: structuredClone(state), etag }; },
    async write(next, previous) {
      if (etag !== previous) throw new StorageConflict();
      state = structuredClone(next);
      etag = randomUUID();
      return etag;
    },
  };
}

export async function transact(store, action) {
  for (let attempt = 0; attempt < 7; attempt++) {
    const { state, etag } = await store.read();
    const result = await action(state);
    try { await store.write(state, etag); return result; }
    catch (error) { if (!(error instanceof StorageConflict)) throw error; }
  }
  throw new StorageUnavailable('Storage is busy; please retry.');
}
