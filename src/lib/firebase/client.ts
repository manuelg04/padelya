import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";

import { USE_AUTH_EMULATOR } from "@/src/lib/env";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};

export const isFirebaseClientConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId,
);

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: ReturnType<typeof getAuth> | null = null;

if (isFirebaseClientConfigured) {
  firebaseApp = getApps()[0] ?? initializeApp(firebaseConfig);
  firebaseAuth = getAuth(firebaseApp);

  if (USE_AUTH_EMULATOR && typeof window !== "undefined") {
    firebaseAuth.settings.appVerificationDisabledForTesting = true;
    connectAuthEmulator(firebaseAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  }
}

export { firebaseApp, firebaseAuth };
