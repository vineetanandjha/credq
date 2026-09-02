import { initializeApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const hasFirebaseConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.appId
].every(Boolean);

let firebasePromise = null;

// Loads firebase/auth and firebase/firestore on first use only, so the OTP/lead-save
// flow doesn't block the initial page render or delay the Meta Pixel PageView fire.
function loadFirebase() {
  if (!hasFirebaseConfig) return Promise.resolve(null);

  if (!firebasePromise) {
    firebasePromise = Promise.all([
      import('firebase/auth'),
      import('firebase/firestore')
    ]).then(([authModule, firestoreModule]) => {
      const app = initializeApp(firebaseConfig);
      return {
        auth: authModule.getAuth(app),
        db: firestoreModule.getFirestore(app),
        RecaptchaVerifier: authModule.RecaptchaVerifier,
        signInWithPhoneNumber: authModule.signInWithPhoneNumber,
        signOut: authModule.signOut,
        addDoc: firestoreModule.addDoc,
        collection: firestoreModule.collection,
        doc: firestoreModule.doc,
        serverTimestamp: firestoreModule.serverTimestamp,
        updateDoc: firestoreModule.updateDoc
      };
    });
  }

  return firebasePromise;
}

export { hasFirebaseConfig, loadFirebase };

