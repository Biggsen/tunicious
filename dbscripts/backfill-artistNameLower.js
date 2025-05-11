import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(
  fs.readFileSync(new URL('../service-account.json', import.meta.url))
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function backfillArtistNameLower() {
  const albumsRef = db.collection('albums');
  const snapshot = await albumsRef.get();
  let updated = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!data.artistName) {
      console.log(`Skipping ${doc.id}: no artistName`);
      continue;
    }
    if (data.artistNameLower === data.artistName.toLowerCase()) {
      continue;
    }
    await doc.ref.update({
      artistNameLower: data.artistName.toLowerCase()
    });
    updated++;
    console.log(`Updated ${doc.id}: artistNameLower = ${data.artistName.toLowerCase()}`);
  }

  console.log(`Done! Updated ${updated} documents.`);
}

backfillArtistNameLower().catch(console.error);