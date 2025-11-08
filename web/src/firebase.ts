import {initializeApp} from "firebase/app";
import {getStorage, connectStorageEmulator} from "firebase/storage";
import {getFirestore, connectFirestoreEmulator} from "firebase/firestore";
import {getAuth, connectAuthEmulator} from "firebase/auth";

/**
 * Validate Firebase configuration
 * Ensures all required environment variables are set
 */
function validateFirebaseConfig(): void {
  const requiredVars = [
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_STORAGE_BUCKET",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_APP_ID",
  ];

  const missing = requiredVars.filter((v) => !import.meta.env[v]);
  if (missing.length > 0) {
    throw new Error(
      `Missing Firebase configuration: ${missing.join(", ")}. ` +
      `Please check your .env.local file and ensure all required variables are set.`
    );
  }
}

// Validate configuration before initialization
validateFirebaseConfig();

// Firebase config from Firebase Console
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

// Enable emulators in development if configured
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === "true") {
  try {
    connectAuthEmulator(auth, "http://localhost:9099", {disableWarnings: true});
    connectFirestoreEmulator(db, "localhost", 8080);
    connectStorageEmulator(storage, "localhost", 9199);
    console.log("Firebase emulators connected");
  } catch (error) {
    // Emulators may already be connected
    console.debug("Emulator connection skipped:", error);
  }
}

