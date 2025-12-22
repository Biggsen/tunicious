/**
 * Migration script to update existing users with friends feature fields:
 * - searchableDisplayName: lowercase version of displayName (or null)
 * - publicProfile: true (default)
 * - friendsCount: 0 (default)
 * 
 * Usage: node dbscripts/migrate-user-friends-fields.js
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Firebase Admin
const serviceAccountPath = join(__dirname, '..', 'service-account.json');

let serviceAccount;
try {
  const serviceAccountData = readFileSync(serviceAccountPath, 'utf8');
  serviceAccount = JSON.parse(serviceAccountData);
} catch (error) {
  console.error('Error reading service account file:', error.message);
  console.error('Make sure service-account.json exists in the project root.');
  process.exit(1);
}

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('✓ Firebase Admin initialized successfully');
} catch (error) {
  console.error('Error initializing Firebase Admin:', error.message);
  process.exit(1);
}

const db = admin.firestore();

async function migrateUsers() {
  console.log('Starting user migration...\n');

  try {
    // Get all users
    const usersRef = db.collection('users');
    const snapshot = await usersRef.get();

    if (snapshot.empty) {
      console.log('No users found to migrate.');
      return;
    }

    console.log(`Found ${snapshot.size} users to migrate.\n`);

    const batch = db.batch();
    let batchCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const BATCH_SIZE = 500; // Firestore batch limit

    for (const docSnap of snapshot.docs) {
      const userData = docSnap.data();
      const updates = {};
      let needsUpdate = false;

      // Update searchableDisplayName
      if (userData.displayName) {
        const searchableDisplayName = userData.displayName.toLowerCase();
        if (userData.searchableDisplayName !== searchableDisplayName) {
          updates.searchableDisplayName = searchableDisplayName;
          needsUpdate = true;
        }
      } else if (userData.searchableDisplayName !== null && userData.searchableDisplayName !== undefined) {
        updates.searchableDisplayName = null;
        needsUpdate = true;
      }

      // Update publicProfile (default to true if not set)
      if (userData.publicProfile === undefined || userData.publicProfile === null) {
        updates.publicProfile = true;
        needsUpdate = true;
      }

      // Update friendsCount (default to 0 if not set)
      if (userData.friendsCount === undefined || userData.friendsCount === null) {
        updates.friendsCount = 0;
        needsUpdate = true;
      }

      if (needsUpdate) {
        const userRef = usersRef.doc(docSnap.id);
        batch.update(userRef, updates);
        batchCount++;
        updatedCount++;

        // Commit batch when it reaches the limit
        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          console.log(`✓ Committed batch of ${batchCount} updates (${updatedCount} total updated)`);
          batchCount = 0;
        }
      } else {
        skippedCount++;
      }
    }

    // Commit remaining updates
    if (batchCount > 0) {
      await batch.commit();
      console.log(`✓ Committed final batch of ${batchCount} updates`);
    }

    console.log('\n=== Migration Complete ===');
    console.log(`Total users processed: ${snapshot.size}`);
    console.log(`Users updated: ${updatedCount}`);
    console.log(`Users skipped (already up to date): ${skippedCount}`);
    console.log('\nAll users now have:');
    console.log('  - searchableDisplayName (lowercase of displayName or null)');
    console.log('  - publicProfile (true by default)');
    console.log('  - friendsCount (0 by default)');

  } catch (error) {
    console.error('\n❌ Error during migration:', error);
    throw error;
  }
}

// Run migration
migrateUsers()
  .then(() => {
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });

