/**
 * Seed the Firebase emulators (Auth + Firestore) with a dev user and minimal data.
 * If dbscripts/seed-data/user.json and playlists.json exist (from npm run export:seed-data),
 * loads and writes that data so the seed user gets full onboarding state and playlists.
 *
 * Usage:
 *   npm run seed:emulator
 *   or: FIRESTORE_EMULATOR_HOST=127.0.0.1:8081 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9100 node dbscripts/seed-emulator.js
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SEED_DATA_DIR = join(__dirname, 'seed-data');

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'audiofoodie-d5b2c';
const SEED_EMAIL = process.env.SEED_EMAIL || 'dev@example.com';
const SEED_PASSWORD = process.env.SEED_PASSWORD || 'devpass123';
const SEED_UID = process.env.SEED_UID || 'seed-dev-user-1';

// --- Safety: never run against production ---
const firestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST;
const authEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;

if (!firestoreEmulator) {
  console.error('❌ FIRESTORE_EMULATOR_HOST is not set. Refusing to run (safety).');
  console.error('   Use: npm run seed:emulator');
  process.exit(1);
}

const emulatorHost = firestoreEmulator.split(':')[0].toLowerCase();
const isLocalHost = emulatorHost === '127.0.0.1' || emulatorHost === 'localhost' || emulatorHost === '::1';
if (!isLocalHost) {
  console.error('❌ FIRESTORE_EMULATOR_HOST must point at localhost (127.0.0.1 or localhost). Refusing to run.');
  console.error('   Current value:', firestoreEmulator);
  process.exit(1);
}

// Default Auth emulator if only Firestore was set
if (!authEmulator) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9100';
  console.log('ℹ FIREBASE_AUTH_EMULATOR_HOST set to 127.0.0.1:9100');
}

// Do not load service-account.json when seeding emulator — use projectId only so prod credentials are never used
let app;
try {
  app = admin.initializeApp({ projectId: PROJECT_ID });
} catch (err) {
  console.error('❌ Firebase Admin init failed:', err.message);
  process.exit(1);
}

const db = app.firestore();
const auth = app.auth();

const now = admin.firestore.Timestamp.now();

function deserializeValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'object' && value._type === 'timestamp') {
    return new admin.firestore.Timestamp(value._seconds, value._nanoseconds ?? 0);
  }
  if (Array.isArray(value)) return value.map(deserializeValue);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = deserializeValue(v);
    return out;
  }
  return value;
}

async function seed() {
  console.log('Seeding emulators (Auth + Firestore)...\n');
  console.log(`  Project: ${PROJECT_ID}`);
  console.log(`  User: ${SEED_EMAIL} (uid: ${SEED_UID})\n`);

  try {
    let authUser;
    try {
      authUser = await auth.getUser(SEED_UID);
      console.log('✓ Auth user already exists:', authUser.email);
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        authUser = await auth.createUser({
          uid: SEED_UID,
          email: SEED_EMAIL,
          password: SEED_PASSWORD,
          displayName: 'Dev User',
          emailVerified: true,
        });
        console.log('✓ Auth user created:', authUser.email);
      } else {
        throw e;
      }
    }

    const userRef = db.collection('users').doc(SEED_UID);
    const userJsonPath = join(SEED_DATA_DIR, 'user.json');
    const playlistsJsonPath = join(SEED_DATA_DIR, 'playlists.json');
    const albumsJsonPath = join(SEED_DATA_DIR, 'albums.json');
    const hasSeedData = existsSync(userJsonPath) && existsSync(playlistsJsonPath);

    if (hasSeedData) {
      const userData = deserializeValue(JSON.parse(readFileSync(userJsonPath, 'utf8')));
      await userRef.set(userData, { merge: true });
      console.log('✓ Firestore user doc loaded from seed-data/user.json');

      const playlists = JSON.parse(readFileSync(playlistsJsonPath, 'utf8'));
      for (const { id, data } of playlists) {
        await db.collection('playlists').doc(id).set(deserializeValue(data));
      }
      console.log('✓ Loaded', playlists.length, 'playlists from seed-data/playlists.json');

      if (existsSync(albumsJsonPath)) {
        const albums = JSON.parse(readFileSync(albumsJsonPath, 'utf8'));
        for (const { id, data } of albums) {
          await db.collection('albums').doc(id).set(deserializeValue(data));
        }
        console.log('✓ Loaded', albums.length, 'albums from seed-data/albums.json');
      }
    } else {
      const userSnap = await userRef.get();
      if (userSnap.exists) {
        console.log('✓ Firestore user doc already exists');
      } else {
        await userRef.set({
          email: SEED_EMAIL,
          displayName: 'Dev User',
          searchableDisplayName: 'dev user',
          publicProfile: true,
          friendsCount: 0,
          lastFmUserName: null,
          lastFmAuthenticated: false,
          spotifyConnected: false,
          createdAt: now,
          updatedAt: now,
          emailVerified: true,
        });
        console.log('✓ Firestore user doc created');
      }
    }

    console.log('\n✅ Seed complete.');
    console.log('   Log in with:', SEED_EMAIL, '/', SEED_PASSWORD);
  } catch (err) {
    console.error('\n❌ Seed failed:', err);
    throw err;
  }
}

seed()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
