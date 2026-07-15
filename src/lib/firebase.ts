import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase provisioning config (from firebase-applet-config.json)
const DEFAULT_CONFIG = {
  projectId: "gen-lang-client-0746878979",
  appId: "1:1017409135988:web:fe4151d539b70589e1b821",
  apiKey: "AIzaSyBL0vKyb1rTLDwDq6Fiz23Y6hyGxhpoCU0",
  authDomain: "gen-lang-client-0746878979.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-3dcim-18c65ab4-a7bb-4d1e-a0fe-6d6f9682ab3a",
  storageBucket: "gen-lang-client-0746878979.firebasestorage.app",
  messagingSenderId: "1017409135988"
};

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || DEFAULT_CONFIG.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || DEFAULT_CONFIG.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || DEFAULT_CONFIG.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || DEFAULT_CONFIG.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || DEFAULT_CONFIG.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || DEFAULT_CONFIG.appId,
};

const app = getApps().length === 0 ? initializeApp(config) : getApp();
const auth = getAuth(app);

// Use custom Firestore Database ID if provisioned
const dbId = import.meta.env.VITE_FIREBASE_FIRESTORE_DB_ID || DEFAULT_CONFIG.firestoreDatabaseId;
const db = dbId ? getFirestore(app, dbId) : getFirestore(app);

export { app, auth, db };
