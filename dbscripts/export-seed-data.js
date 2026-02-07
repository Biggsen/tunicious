/**
 * Export the seed user and their playlists from the Firestore emulator to JSON.
 * Run with emulator running and after onboarding has generated playlists.
 *
 * Usage:
 *   npm run export:seed-data
 *   or: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node dbscripts/export-seed-data.js
 *
 * Output: dbscripts/seed-data/user.json, dbscripts/seed-data/playlists.json
 */

import admin from 'firebase-admin';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'audiofoodie-d5b2c';
const SEED_UID = process.env.SEED_UID || 'seed-dev-user-1';
const OUT_DIR = join(__dirname, 'seed-data');

const firestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST;
if (!firestoreEmulator) {
  console.error('❌ FIRESTORE_EMULATOR_HOST is not set. Refusing to run (safety).');
  process.exit(1);
}
const emulatorHost = firestoreEmulator.split(':')[0].toLowerCase();
const isLocalHost = emulatorHost === '127.0.0.1' || emulatorHost === 'localhost' || emulatorHost === '::1';
if (!isLocalHost) {
  console.error('❌ FIRESTORE_EMULATOR_HOST must point at localhost. Refusing to run.');
  process.exit(1);
}

let app;
try {
  app = admin.initializeApp({ projectId: PROJECT_ID });
} catch (err) {
  console.error('❌ Firebase Admin init failed:', err.message);
  process.exit(1);
}

const db = app.firestore();

function serializeValue(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof admin.firestore.Timestamp) {
    return { _type: 'timestamp', _seconds: value.seconds, _nanoseconds: value.nanoseconds };
  }
  if (value instanceof Date) {
    return { _type: 'timestamp', _seconds: Math.floor(value.getTime() / 1000), _nanoseconds: 0 };
  }
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = serializeValue(v);
    return out;
  }
  return value;
}

async function exportData() {
  console.log('Exporting seed data from emulator...\n');
  console.log('  Project:', PROJECT_ID);
  console.log('  User UID:', SEED_UID);
  console.log('  Output:', OUT_DIR, '\n');

  const userRef = db.collection('users').doc(SEED_UID);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    console.error('❌ User document not found. Run seed and complete onboarding first.');
    process.exit(1);
  }

  const playlistsSnap = await db.collection('playlists').where('userId', '==', SEED_UID).get();
  console.log('  User doc: found');
  console.log('  Playlists:', playlistsSnap.size, 'documents\n');

  mkdirSync(OUT_DIR, { recursive: true });

  const userData = serializeValue(userSnap.data());
  writeFileSync(join(OUT_DIR, 'user.json'), JSON.stringify(userData, null, 2), 'utf8');
  console.log('✓ Wrote user.json');

  const playlists = playlistsSnap.docs.map((d) => ({ id: d.id, data: serializeValue(d.data()) }));
  writeFileSync(join(OUT_DIR, 'playlists.json'), JSON.stringify(playlists, null, 2), 'utf8');
  console.log('✓ Wrote playlists.json');

  console.log('\n✅ Export complete.');
}

exportData().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
