import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(
  fs.readFileSync(new URL('../service-account.json', import.meta.url))
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migratePipelineRole() {
  const albumsRef = db.collection('albums');
  const playlistsRef = db.collection('playlists');
  
  console.log('Fetching all playlists...');
  const playlistsSnapshot = await playlistsRef.get();
  
  // Build playlist lookup map first (playlistId -> pipelineRole)
  const playlistMap = new Map();
  playlistsSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.playlistId) {
      playlistMap.set(data.playlistId, data.pipelineRole || 'transient');
    }
  });
  
  console.log(`Loaded ${playlistMap.size} playlists`);
  
  console.log('Fetching all albums...');
  const albumsSnapshot = await albumsRef.get();
  console.log(`Found ${albumsSnapshot.size} albums`);
  
  let updated = 0;
  let skipped = 0;
  let entriesUpdated = 0;

  for (const albumDoc of albumsSnapshot.docs) {
    const data = albumDoc.data();
    if (!data.userEntries || typeof data.userEntries !== 'object') {
      skipped++;
      continue;
    }
    
    let hasChanges = false;
    let albumEntriesUpdated = 0;
    const updatedUserEntries = { ...data.userEntries };
    
    // For each user's entry
    for (const [userId, userEntry] of Object.entries(data.userEntries)) {
      if (!userEntry || !userEntry.playlistHistory || !Array.isArray(userEntry.playlistHistory)) {
        continue;
      }
      
      let userEntryChanged = false;
      const updatedHistory = userEntry.playlistHistory.map(entry => {
        // Skip if already has pipelineRole
        if (entry.pipelineRole) {
          return entry;
        }
        
        // Look up pipelineRole from playlist
        const pipelineRole = playlistMap.get(entry.playlistId) || 'transient';
        userEntryChanged = true;
        albumEntriesUpdated++;
        
        return {
          ...entry,
          pipelineRole
        };
      });
      
      if (userEntryChanged) {
        hasChanges = true;
        updatedUserEntries[userId] = {
          ...userEntry,
          playlistHistory: updatedHistory
        };
      }
    }
    
    if (hasChanges) {
      await albumDoc.ref.update({ userEntries: updatedUserEntries });
      updated++;
      entriesUpdated += albumEntriesUpdated;
      console.log(`Updated ${albumDoc.id} (${albumEntriesUpdated} entries)`);
    } else {
      skipped++;
    }
  }

  console.log(`\nDone! Updated ${updated} albums, skipped ${skipped} albums.`);
  console.log(`Total playlist history entries updated: ${entriesUpdated}`);
}

migratePipelineRole().catch(console.error);
