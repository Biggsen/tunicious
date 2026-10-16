import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { doc, deleteDoc, setDoc, updateDoc } from 'firebase/firestore';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const describeRules = emulatorHost ? describe : describe.skip;

describeRules('albums security rules', () => {
  let testEnv;
  const albumId = `rules-test-${Date.now()}`;

  beforeAll(async () => {
    const [host, port] = emulatorHost.split(':');
    testEnv = await initializeTestEnvironment({
      projectId: 'audiofoodie-d5b2c',
      firestore: {
        rules: readFileSync(resolve('firestore.rules'), 'utf8'),
        host,
        port: Number(port)
      }
    });
  });

  afterAll(async () => {
    if (!testEnv) return;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await deleteDoc(doc(adminDb, 'albums', albumId)).catch(() => {});
      await deleteDoc(doc(adminDb, 'users/alice/libraryIndex/spotify-rules-test')).catch(() => {});
    });
    await testEnv.cleanup();
  });

  it('lets a user create an album with only their entry', async () => {
    const alice = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(alice, 'albums', albumId), {
      albumTitle: 'Songs For The Deaf',
      userEntries: {
        alice: { playlistHistory: [], notes: '' }
      }
    }));
  });

  it('rejects a create that includes another user', async () => {
    const alice = testEnv.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(alice, 'albums', 'album-shared-create'), {
      albumTitle: 'Nope',
      userEntries: {
        alice: { playlistHistory: [] },
        bob: { playlistHistory: [] }
      }
    }));
  });

  it('lets a user update root metadata and their own entry', async () => {
    const alice = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(updateDoc(doc(alice, 'albums', albumId), {
      albumTitle: 'Songs for the Deaf',
      'userEntries.alice.notes': 'loud'
    }));
  });

  it('lets another user add only their own entry', async () => {
    const bob = testEnv.authenticatedContext('bob').firestore();
    await assertSucceeds(updateDoc(doc(bob, 'albums', albumId), {
      'userEntries.bob.playlistHistory': []
    }));
  });

  it('rejects a write that changes someone else\'s entry', async () => {
    const bob = testEnv.authenticatedContext('bob').firestore();
    await assertFails(updateDoc(doc(bob, 'albums', albumId), {
      'userEntries.alice.notes': 'tampered'
    }));
  });

  it('rejects deleting an album', async () => {
    const alice = testEnv.authenticatedContext('alice').firestore();
    await assertFails(deleteDoc(doc(alice, 'albums', albumId)));
  });

  it('lets a user write their library index and blocks another user', async () => {
    const alice = testEnv.authenticatedContext('alice').firestore();
    const bob = testEnv.authenticatedContext('bob').firestore();
    await assertSucceeds(setDoc(doc(alice, 'users/alice/libraryIndex/spotify-rules-test'), {
      primaryId: albumId,
      savedAt: new Date()
    }));
    await assertFails(setDoc(doc(bob, 'users/alice/libraryIndex/spotify-rules-test'), {
      primaryId: albumId,
      savedAt: new Date()
    }));
  });
});
