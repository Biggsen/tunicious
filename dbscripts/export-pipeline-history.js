/**
 * Read-only export of pipeline history for Tunicious v2 migration.
 * Writes local JSON only — does not write to Firestore, Spotify, or MusicBrainz.
 *
 * Usage:
 *   npm run export:pipeline-history
 *   EXPORT_UID=<uid> npm run export:pipeline-history   # optional: one user only
 *
 * Output:
 *   exports/v1-pipeline-YYYY-MM-DD/{uid}/manifest.json
 *   exports/v1-pipeline-YYYY-MM-DD/{uid}/albums.json
 *   exports/v1-pipeline-YYYY-MM-DD/{uid}/playlists.json
 */

import admin from 'firebase-admin';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const ALBUM_TOP_LEVEL = new Set([
  'v1AlbumId',
  'albumTitle',
  'artistName',
  'playlistHistory',
  'releaseYear',
  'albumCover',
  'rating',
  'ratedAt',
  'ratingSource',
  'extras',
]);

const ALBUM_ROOT_SKIP = new Set(['userEntries']);

const SECRET_KEY_RE = /token|secret|password|session|credential|refresh|accesskey/i;

const serviceAccountPath = join(ROOT, 'service-account.json');
let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
} catch (error) {
  console.error('Error reading service account file:', error.message);
  console.error('Make sure service-account.json exists in the project root.');
  process.exit(1);
}

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log('✓ Firebase Admin initialized (production)\n');
} catch (error) {
  console.error('Error initializing Firebase Admin:', error.message);
  process.exit(1);
}

const db = admin.firestore();
const Timestamp = admin.firestore.Timestamp;

function toIso(value) {
  if (value == null) return value;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && typeof value._seconds === 'number') {
    return new Date(value._seconds * 1000 + (value._nanoseconds || 0) / 1e6).toISOString();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return value;
}

function addedAtMs(value) {
  const iso = toIso(value);
  if (typeof iso === 'string') {
    const t = Date.parse(iso);
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Timestamp) && !(value instanceof Date);
}

function looksSecret(key) {
  return SECRET_KEY_RE.test(key);
}

function serializeDeep(value, keyHint = '') {
  if (value === null || value === undefined) return value;
  if (looksSecret(keyHint)) return undefined;
  if (value instanceof Timestamp || (typeof value?.toDate === 'function') || value instanceof Date) {
    return toIso(value);
  }
  if (Array.isArray(value)) {
    return value.map((item, i) => serializeDeep(item, `${keyHint}[${i}]`)).filter((v) => v !== undefined);
  }
  if (isPlainObject(value)) {
    if (typeof value._seconds === 'number' && ('_nanoseconds' in value || value._type === 'timestamp')) {
      return toIso(value);
    }
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (looksSecret(k)) continue;
      const serialized = serializeDeep(v, k);
      if (serialized !== undefined) out[k] = serialized;
    }
    return out;
  }
  return value;
}

function serializeHistoryEntry(entry) {
  if (!isPlainObject(entry)) return entry;
  const out = {};
  for (const [k, v] of Object.entries(entry)) {
    if (looksSecret(k)) continue;
    if (k === 'addedAt') {
      out.addedAt = toIso(v);
      continue;
    }
    if (k === 'removedAt') {
      out.removedAt = v == null ? null : toIso(v);
      continue;
    }
    const serialized = serializeDeep(v, k);
    if (serialized !== undefined) out[k] = serialized;
  }
  return out;
}

function buildAlbumRecord(albumId, albumData, userEntry, warnings) {
  const history = Array.isArray(userEntry.playlistHistory)
    ? userEntry.playlistHistory.map(serializeHistoryEntry)
    : [];

  history.sort((a, b) => addedAtMs(a.addedAt) - addedAtMs(b.addedAt));

  const openCount = history.filter((e) => e.removedAt == null).length;
  if (openCount !== 1) {
    warnings.push(
      `album ${albumId}: expected exactly 1 open history entry (removedAt null), found ${openCount}`
    );
  }

  const record = {
    v1AlbumId: albumId,
    albumTitle: albumData.albumTitle ?? null,
    artistName: albumData.artistName ?? null,
    playlistHistory: history,
  };

  if (albumData.releaseYear !== undefined && albumData.releaseYear !== null && albumData.releaseYear !== '') {
    record.releaseYear = albumData.releaseYear;
  }
  if (albumData.albumCover !== undefined && albumData.albumCover !== null && albumData.albumCover !== '') {
    record.albumCover = albumData.albumCover;
  }

  for (const ratingKey of ['rating', 'ratedAt', 'ratingSource']) {
    const fromEntry = userEntry[ratingKey];
    const fromRoot = albumData[ratingKey];
    const value = fromEntry !== undefined ? fromEntry : fromRoot;
    if (value !== undefined && value !== null) {
      record[ratingKey] = ratingKey === 'ratedAt' ? toIso(value) : serializeDeep(value, ratingKey);
    }
  }

  const extras = {};

  for (const [k, v] of Object.entries(albumData)) {
    if (ALBUM_ROOT_SKIP.has(k)) continue;
    if (k === 'albumTitle' || k === 'artistName' || k === 'releaseYear' || k === 'albumCover') continue;
    if (k === 'rating' || k === 'ratedAt' || k === 'ratingSource') continue;
    if (looksSecret(k)) continue;
    const serialized = serializeDeep(v, k);
    if (serialized !== undefined) extras[k] = serialized;
  }

  for (const [k, v] of Object.entries(userEntry)) {
    if (k === 'playlistHistory') continue;
    if (k === 'rating' || k === 'ratedAt' || k === 'ratingSource') continue;
    if (looksSecret(k)) continue;
    const serialized = serializeDeep(v, k);
    if (serialized !== undefined) extras[k] = serialized;
  }

  if (Object.keys(extras).length > 0) {
    record.extras = extras;
  }

  // Guard against accidental top-level pollution
  for (const key of Object.keys(record)) {
    if (!ALBUM_TOP_LEVEL.has(key)) {
      if (!record.extras) record.extras = {};
      record.extras[key] = record[key];
      delete record[key];
    }
  }

  return record;
}

function collectReferencedPlaylistIds(albums) {
  const ids = new Set();
  for (const album of albums) {
    for (const entry of album.playlistHistory || []) {
      if (entry?.playlistId) ids.add(entry.playlistId);
    }
  }
  return ids;
}

function buildPlaylistCatalog(referencedIds, userPlaylists, warnings) {
  const bySpotifyId = new Map();
  for (const p of userPlaylists) {
    if (!p.playlistId) continue;
    // Prefer non-deleted docs when duplicates exist
    const existing = bySpotifyId.get(p.playlistId);
    if (!existing || (existing.deletedAt != null && p.deletedAt == null)) {
      bySpotifyId.set(p.playlistId, p);
    }
  }

  const catalog = [];
  for (const spotifyId of [...referencedIds].sort()) {
    const doc = bySpotifyId.get(spotifyId);
    if (!doc) {
      warnings.push(`playlist catalog: history references ${spotifyId} with no matching Firestore playlist doc`);
      catalog.push({ v1PlaylistId: spotifyId });
      continue;
    }
    catalog.push({
      v1PlaylistId: spotifyId,
      pipelineRole: doc.pipelineRole ?? null,
      group: doc.group ?? null,
      nextStagePlaylistId: doc.nextStagePlaylistId ?? null,
      terminationPlaylistId: doc.terminationPlaylistId ?? null,
      firestoreDocId: doc.firestoreDocId,
    });
  }
  return catalog;
}

function validatePipelineGraph(userPlaylists, warnings) {
  const active = userPlaylists.filter((p) => p.deletedAt == null);
  const byGroup = new Map();
  for (const p of active) {
    const g = p.group || 'unknown';
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(p);
  }

  for (const [group, playlists] of byGroup) {
    const byDocId = new Map(playlists.map((p) => [p.firestoreDocId, p]));
    const sources = playlists.filter((p) => p.pipelineRole === 'source');
    if (sources.length === 0) {
      warnings.push(`pipeline graph [${group}]: no source playlist`);
    }

    for (const p of playlists) {
      if (p.nextStagePlaylistId && !byDocId.has(p.nextStagePlaylistId)) {
        warnings.push(
          `pipeline graph [${group}]: dangling nextStagePlaylistId ${p.nextStagePlaylistId} from ${p.firestoreDocId}`
        );
      }
      if (p.terminationPlaylistId && !byDocId.has(p.terminationPlaylistId)) {
        warnings.push(
          `pipeline graph [${group}]: dangling terminationPlaylistId ${p.terminationPlaylistId} from ${p.firestoreDocId}`
        );
      }
    }

    // Cycle detection on nextStagePlaylistId edges
    const visiting = new Set();
    const visited = new Set();
    const cycleFrom = (startId) => {
      const stack = [];
      const walk = (id) => {
        if (!id || !byDocId.has(id)) return null;
        if (visiting.has(id)) {
          const idx = stack.indexOf(id);
          return [...stack.slice(idx), id].join(' -> ');
        }
        if (visited.has(id)) return null;
        visiting.add(id);
        stack.push(id);
        const next = byDocId.get(id)?.nextStagePlaylistId;
        const cycle = walk(next);
        stack.pop();
        visiting.delete(id);
        visited.add(id);
        return cycle;
      };
      return walk(startId);
    };

    for (const p of playlists) {
      const cycle = cycleFrom(p.firestoreDocId);
      if (cycle) {
        warnings.push(`pipeline graph [${group}]: cycle in nextStagePlaylistId: ${cycle}`);
        break;
      }
    }
  }
}

function todayStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function exportPipelineHistory() {
  const filterUid = process.env.EXPORT_UID || null;
  const exportedAt = new Date().toISOString();
  const outRoot = join(ROOT, 'exports', `v1-pipeline-${todayStamp()}`);

  console.log('Exporting pipeline history (read-only)...');
  console.log('  Output:', outRoot);
  if (filterUid) console.log('  Filter UID:', filterUid);
  console.log('');

  console.log('Loading playlists...');
  const playlistsSnap = await db.collection('playlists').get();
  /** @type {Map<string, Array>} */
  const playlistsByUser = new Map();
  for (const docSnap of playlistsSnap.docs) {
    const data = docSnap.data();
    const uid = data.userId;
    if (!uid) continue;
    if (filterUid && uid !== filterUid) continue;
    if (!playlistsByUser.has(uid)) playlistsByUser.set(uid, []);
    playlistsByUser.get(uid).push({
      firestoreDocId: docSnap.id,
      playlistId: data.playlistId,
      pipelineRole: data.pipelineRole,
      group: data.group,
      nextStagePlaylistId: data.nextStagePlaylistId ?? null,
      terminationPlaylistId: data.terminationPlaylistId ?? null,
      deletedAt: data.deletedAt ?? null,
      createdAt: data.createdAt,
    });
  }
  console.log(`  Playlists: ${playlistsSnap.size} docs\n`);

  console.log('Loading albums...');
  const albumsSnap = await db.collection('albums').get();
  console.log(`  Albums: ${albumsSnap.size} docs\n`);

  /** @type {Map<string, Array>} */
  const albumsByUser = new Map();
  /** @type {Map<string, string[]>} */
  const warningsByUser = new Map();

  const ensureWarnings = (uid) => {
    if (!warningsByUser.has(uid)) warningsByUser.set(uid, []);
    return warningsByUser.get(uid);
  };

  for (const docSnap of albumsSnap.docs) {
    const albumData = docSnap.data();
    const userEntries = albumData.userEntries;
    if (!userEntries || typeof userEntries !== 'object') continue;

    for (const [uid, userEntry] of Object.entries(userEntries)) {
      if (filterUid && uid !== filterUid) continue;
      if (!userEntry || !Array.isArray(userEntry.playlistHistory) || userEntry.playlistHistory.length === 0) {
        continue;
      }
      const warnings = ensureWarnings(uid);
      const record = buildAlbumRecord(docSnap.id, albumData, userEntry, warnings);
      if (!albumsByUser.has(uid)) albumsByUser.set(uid, []);
      albumsByUser.get(uid).push(record);
    }
  }

  const uids = new Set([...albumsByUser.keys(), ...playlistsByUser.keys()]);
  if (filterUid) uids.add(filterUid);

  if (uids.size === 0) {
    console.log('No users with playlist history found.');
    return;
  }

  mkdirSync(outRoot, { recursive: true });

  let usersExported = 0;
  for (const uid of [...uids].sort()) {
    const albums = albumsByUser.get(uid) || [];
    if (albums.length === 0) {
      console.log(`— skip ${uid}: no albums with playlistHistory`);
      continue;
    }

    albums.sort((a, b) => String(a.v1AlbumId).localeCompare(String(b.v1AlbumId)));

    const warnings = ensureWarnings(uid);
    const userPlaylists = playlistsByUser.get(uid) || [];
    validatePipelineGraph(userPlaylists, warnings);

    const referencedIds = collectReferencedPlaylistIds(albums);
    const playlists = buildPlaylistCatalog(referencedIds, userPlaylists, warnings);

    const covered = new Set(playlists.map((p) => p.v1PlaylistId));
    for (const id of referencedIds) {
      if (!covered.has(id)) {
        warnings.push(`playlist catalog gap: ${id} missing from playlists.json`);
      }
    }

    const userDir = join(outRoot, uid);
    mkdirSync(userDir, { recursive: true });

    const manifest = {
      exportedAt,
      source: 'tunicious-v1',
      uid,
      albumCount: albums.length,
      playlistCount: playlists.length,
      timestampFormat: 'ISO-8601',
      notes: 'Pipeline history export for Tunicious v2 iteration 2b',
    };

    writeFileSync(join(userDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    writeFileSync(join(userDir, 'albums.json'), JSON.stringify(albums, null, 2), 'utf8');
    writeFileSync(join(userDir, 'playlists.json'), JSON.stringify(playlists, null, 2), 'utf8');

    usersExported += 1;
    console.log(`✓ ${uid}: ${albums.length} albums, ${playlists.length} playlists`);
    if (warnings.length) {
      console.log(`  ⚠ ${warnings.length} warning(s):`);
      for (const w of warnings) console.log(`    - ${w}`);
    }
  }

  console.log(`\n✅ Export complete: ${usersExported} user(s) → ${outRoot}`);
}

exportPipelineHistory()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Export failed:', err);
    process.exit(1);
  });
