/**
 * Album Deduplication & Cleanup Migration Script
 * 
 * This script performs two cleanup operations:
 * 1. Removes orphaned userEntries (entries for users that no longer exist)
 * 2. Finds and merges duplicate album documents (same title + artist, different Spotify IDs)
 * 
 * Usage: 
 *   node dbscripts/dedupe-albums.js --dry-run           # Preview all changes
 *   node dbscripts/dedupe-albums.js --phase-1-only      # Run only orphan cleanup + empty album deletion
 *   node dbscripts/dedupe-albums.js --phase-1-only --dry-run  # Preview Phase 1 only
 *   node dbscripts/dedupe-albums.js --only-album <id>   # Deduplicate only the group containing this album ID
 *   node dbscripts/dedupe-albums.js                     # Execute full migration
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const PHASE_1_ONLY = args.includes('--phase-1-only');
const onlyAlbumIndex = args.indexOf('--only-album');
const ONLY_ALBUM_ID = onlyAlbumIndex >= 0 && args[onlyAlbumIndex + 1] ? args[onlyAlbumIndex + 1] : null;

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

/**
 * Creates a normalized key for grouping albums by title + artist
 */
function createGroupKey(albumTitle, artistName) {
  const normalizedTitle = (albumTitle || '').toLowerCase().trim();
  const normalizedArtist = (artistName || '').toLowerCase().trim();
  return `${normalizedTitle}|||${normalizedArtist}`;
}

/**
 * Counts the number of user entries in an album document
 */
function countUserEntries(albumData) {
  if (!albumData.userEntries) return 0;
  return Object.keys(albumData.userEntries).length;
}

/**
 * Gets the earliest createdAt timestamp from userEntries
 */
function getEarliestCreatedAt(albumData) {
  if (!albumData.userEntries) return null;
  
  let earliest = null;
  for (const userData of Object.values(albumData.userEntries)) {
    const createdAt = userData.createdAt?.toDate?.() || userData.createdAt;
    if (createdAt && (!earliest || createdAt < earliest)) {
      earliest = createdAt;
    }
  }
  return earliest;
}

/**
 * Selects the primary document from a group of duplicates
 * Priority: most userEntries, then oldest createdAt
 */
function selectPrimary(albums) {
  return albums.sort((a, b) => {
    // First, compare by user entry count (descending)
    const countDiff = countUserEntries(b.data) - countUserEntries(a.data);
    if (countDiff !== 0) return countDiff;
    
    // Then by earliest createdAt (ascending - older is better)
    const aDate = getEarliestCreatedAt(a.data);
    const bDate = getEarliestCreatedAt(b.data);
    if (aDate && bDate) return aDate - bDate;
    if (aDate) return -1;
    if (bDate) return 1;
    return 0;
  })[0];
}

/**
 * Merges userEntries from duplicate into primary
 */
function mergeUserEntries(primaryEntries, duplicateEntries) {
  const merged = { ...primaryEntries };
  
  for (const [userId, userData] of Object.entries(duplicateEntries || {})) {
    if (!merged[userId]) {
      // User only exists in duplicate - move to primary
      merged[userId] = userData;
    } else {
      // User exists in both - merge playlistHistory
      const existingHistory = merged[userId].playlistHistory || [];
      const newHistory = userData.playlistHistory || [];
      
      // Combine histories (duplicates may have different entries)
      merged[userId] = {
        ...merged[userId],
        playlistHistory: [...existingHistory, ...newHistory],
        // Keep the earlier createdAt
        createdAt: merged[userId].createdAt < userData.createdAt 
          ? merged[userId].createdAt 
          : userData.createdAt,
        // Use the latest updatedAt
        updatedAt: merged[userId].updatedAt > userData.updatedAt
          ? merged[userId].updatedAt
          : userData.updatedAt
      };
    }
  }
  
  return merged;
}

/**
 * Filters userEntries to only include valid (existing) users
 * Returns { filtered entries, removed user IDs }
 */
function filterOrphanedEntries(userEntries, validUserIds) {
  if (!userEntries) return { filtered: {}, orphanedUserIds: [] };
  
  const filtered = {};
  const orphanedUserIds = [];
  
  for (const [userId, userData] of Object.entries(userEntries)) {
    if (validUserIds.has(userId)) {
      filtered[userId] = userData;
    } else {
      orphanedUserIds.push(userId);
    }
  }
  
  return { filtered, orphanedUserIds };
}

/**
 * Fetches all valid user IDs from the users collection
 */
async function fetchValidUserIds() {
  const usersRef = db.collection('users');
  const snapshot = await usersRef.get();
  
  const userIds = new Set();
  for (const doc of snapshot.docs) {
    userIds.add(doc.id);
  }
  
  return userIds;
}

/**
 * Main cleanup function
 */
async function cleanupAlbums() {
  console.log('\n=== Album Cleanup & Deduplication ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be applied)'}\n`);

  try {
    // Step 1: Fetch all valid user IDs
    console.log('Fetching valid users...');
    const validUserIds = await fetchValidUserIds();
    console.log(`Found ${validUserIds.size} valid users.\n`);

    // Step 2: Fetch all albums
    console.log('Fetching all albums...');
    const albumsRef = db.collection('albums');
    const snapshot = await albumsRef.get();

    if (snapshot.empty) {
      console.log('No albums found in the collection.');
      return;
    }

    console.log(`Found ${snapshot.size} albums.\n`);

    // ============================================
    // PHASE 1: Clean up orphaned user entries
    // ============================================
    console.log('=== Phase 1: Orphaned User Entry Cleanup ===\n');
    
    const orphanResults = {
      albumsWithOrphans: 0,
      orphanedEntriesRemoved: 0,
      albumsDeletedEmpty: 0,
      errors: []
    };

    // Track albums and their cleaned data for phase 2
    const cleanedAlbums = [];

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const { filtered, orphanedUserIds } = filterOrphanedEntries(data.userEntries, validUserIds);
      
      if (orphanedUserIds.length > 0) {
        orphanResults.albumsWithOrphans++;
        orphanResults.orphanedEntriesRemoved += orphanedUserIds.length;
        
        console.log(`"${data.albumTitle}" by ${data.artistName} (${docSnap.id})`);
        console.log(`   Orphaned users: ${orphanedUserIds.join(', ')}`);
        
        const remainingEntries = Object.keys(filtered).length;
        
        if (remainingEntries === 0) {
          console.log(`   → Album will be DELETED (no valid user entries remain)\n`);
          orphanResults.albumsDeletedEmpty++;
          
          if (!DRY_RUN) {
            try {
              await docSnap.ref.delete();
            } catch (error) {
              console.log(`   ✗ Error deleting album: ${error.message}\n`);
              orphanResults.errors.push({ album: docSnap.id, error: error.message });
            }
          }
          // Don't add to cleanedAlbums since it's deleted
          continue;
        } else {
          console.log(`   → Removing ${orphanedUserIds.length} orphaned entries, keeping ${remainingEntries}\n`);
          
          if (!DRY_RUN) {
            try {
              await docSnap.ref.update({
                userEntries: filtered,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              });
            } catch (error) {
              console.log(`   ✗ Error updating album: ${error.message}\n`);
              orphanResults.errors.push({ album: docSnap.id, error: error.message });
            }
          }
          
          // Add to cleanedAlbums with updated data
          cleanedAlbums.push({
            id: docSnap.id,
            data: { ...data, userEntries: filtered },
            ref: docSnap.ref
          });
        }
      } else {
        // No orphans, add as-is
        cleanedAlbums.push({
          id: docSnap.id,
          data: data,
          ref: docSnap.ref
        });
      }
    }

    console.log('--- Phase 1 Summary ---');
    console.log(`Albums with orphaned entries: ${orphanResults.albumsWithOrphans}`);
    console.log(`Orphaned entries ${DRY_RUN ? 'to be ' : ''}removed: ${orphanResults.orphanedEntriesRemoved}`);
    console.log(`Empty albums ${DRY_RUN ? 'to be ' : ''}deleted: ${orphanResults.albumsDeletedEmpty}`);
    if (orphanResults.errors.length > 0) {
      console.log(`Errors: ${orphanResults.errors.length}`);
    }
    console.log('');

    if (PHASE_1_ONLY) {
      console.log('Phase 1 complete (--phase-1-only: skipping deduplication).\n');
      return;
    }

    // ============================================
    // PHASE 2: Deduplicate albums
    // ============================================
    console.log('=== Phase 2: Album Deduplication ===\n');

    // Group by title + artist
    const groups = new Map();
    
    for (const album of cleanedAlbums) {
      const key = createGroupKey(album.data.albumTitle, album.data.artistName);
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      
      groups.get(key).push(album);
    }

    // Find duplicate groups
    let duplicateGroups = [];
    for (const [key, albums] of groups) {
      if (albums.length > 1) {
        duplicateGroups.push({ key, albums });
      }
    }

    // Filter to only the group containing the specified album ID if --only-album is set
    if (ONLY_ALBUM_ID) {
      duplicateGroups = duplicateGroups.filter(g => g.albums.some(a => a.id === ONLY_ALBUM_ID));
      if (duplicateGroups.length === 0) {
        console.log(`No duplicate group found containing album ID: ${ONLY_ALBUM_ID}`);
        console.log('(Album may not exist, may not be in a duplicate group, or ID may be incorrect)\n');
        return;
      }
      console.log(`Filtering to 1 group containing album ${ONLY_ALBUM_ID}:\n`);
    }

    if (duplicateGroups.length === 0) {
      console.log('✓ No duplicate albums found. Collection is clean!\n');
    } else {
      console.log(`Found ${duplicateGroups.length} duplicate group(s):\n`);

      const dedupeResults = {
        groupsProcessed: 0,
        documentsMerged: 0,
        documentsDeleted: 0,
        mappingsCreated: 0,
        errors: []
      };

      for (let i = 0; i < duplicateGroups.length; i++) {
        const { key, albums } = duplicateGroups[i];
        
        console.log(`${i + 1}. "${albums[0].data.albumTitle}" by ${albums[0].data.artistName}`);
        console.log(`   Found ${albums.length} documents:`);
        
        // Select primary
        const primary = selectPrimary(albums);
        const duplicates = albums.filter(a => a.id !== primary.id);
        
        console.log(`   - Primary: ${primary.id} (${countUserEntries(primary.data)} user entries)`);
        
        for (const dup of duplicates) {
          console.log(`   - Duplicate: ${dup.id} (${countUserEntries(dup.data)} user entries) → WILL BE MERGED & DELETED`);
        }

        if (!DRY_RUN) {
          try {
            // Merge all duplicate userEntries into primary
            let mergedEntries = { ...primary.data.userEntries };
            for (const dup of duplicates) {
              mergedEntries = mergeUserEntries(mergedEntries, dup.data.userEntries);
            }

            // Update primary document with merged entries
            await primary.ref.update({
              userEntries: mergedEntries,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            
            // Create mappings for each duplicate ID
            const mappingsRef = db.collection('albumMappings');
            for (const dup of duplicates) {
              await mappingsRef.add({
                alternateId: dup.id,
                primaryId: primary.id,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              });
              dedupeResults.mappingsCreated++;
              console.log(`   ✓ Mapping created: ${dup.id} → ${primary.id}`);
            }

            // Delete duplicate documents
            for (const dup of duplicates) {
              await dup.ref.delete();
              dedupeResults.documentsDeleted++;
            }

            dedupeResults.documentsMerged += duplicates.length;
            console.log(`   ✓ Merged and cleaned up\n`);
            
          } catch (error) {
            console.log(`   ✗ Error processing group: ${error.message}\n`);
            dedupeResults.errors.push({ group: key, error: error.message });
          }
        } else {
          console.log(`   (Dry run - no changes made)\n`);
        }

        dedupeResults.groupsProcessed++;
      }

      console.log('--- Phase 2 Summary ---');
      console.log(`Duplicate groups found: ${duplicateGroups.length}`);
      
      if (DRY_RUN) {
        const totalDuplicates = duplicateGroups.reduce((sum, g) => sum + g.albums.length - 1, 0);
        console.log(`Documents that would be merged: ${totalDuplicates}`);
        console.log(`Documents that would be deleted: ${totalDuplicates}`);
        console.log(`Mappings that would be created: ${totalDuplicates}`);
      } else {
        console.log(`Documents merged: ${dedupeResults.documentsMerged}`);
        console.log(`Documents deleted: ${dedupeResults.documentsDeleted}`);
        console.log(`Mappings created: ${dedupeResults.mappingsCreated}`);
        
        if (dedupeResults.errors.length > 0) {
          console.log(`Errors: ${dedupeResults.errors.length}`);
          for (const err of dedupeResults.errors) {
            console.log(`  - ${err.group}: ${err.error}`);
          }
        }
      }
    }

    // Final summary
    console.log('\n=== Final Summary ===');
    console.log(`Total albums scanned: ${snapshot.size}`);
    console.log(`Valid users in system: ${validUserIds.size}`);
    console.log(`Orphaned entries ${DRY_RUN ? 'to be ' : ''}cleaned: ${orphanResults.orphanedEntriesRemoved}`);
    console.log(`Empty albums ${DRY_RUN ? 'to be ' : ''}removed: ${orphanResults.albumsDeletedEmpty}`);
    console.log(`Duplicate groups ${DRY_RUN ? 'to be ' : ''}merged: ${duplicateGroups.length}`);
    
    if (DRY_RUN) {
      console.log('\n→ Run without --dry-run to apply changes.');
    }

  } catch (error) {
    console.error('\n❌ Error during cleanup:', error);
    throw error;
  }
}

// Run the script
cleanupAlbums()
  .then(() => {
    console.log('\n✅ Cleanup process completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Cleanup failed:', error);
    process.exit(1);
  });
