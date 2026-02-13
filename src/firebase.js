// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);
export const functions = getFunctions(firebaseApp, "us-central1");

const useEmulators = import.meta.env.VITE_FIREBASE_EMULATORS === "1" || import.meta.env.VITE_FIREBASE_EMULATORS === "true";
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const prodProjectId = "audiofoodie-d5b2c";

if (useEmulators && typeof window !== "undefined") {
  const hostname = window.location.hostname;
  connectFirestoreEmulator(db, hostname, 8081);
  connectAuthEmulator(auth, `http://${hostname}:9100`, { disableWarnings: true });
  connectFunctionsEmulator(functions, hostname, 5002);
}
if (typeof window !== "undefined" && !useEmulators && projectId === prodProjectId) {
  console.warn("[Firebase] Production database is active.");
}
