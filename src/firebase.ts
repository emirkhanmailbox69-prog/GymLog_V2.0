import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithRedirect, signOut, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, setDoc, onSnapshot
} from 'firebase/firestore';
import type { AppState } from './types';

const firebaseConfig = {
  apiKey: "AIzaSyC0kRaPp9Wyj64WqUgGhQQjHnGbhB-BiKM",
  authDomain: "gymlog2-2947e.firebaseapp.com",
  projectId: "gymlog2-2947e",
  storageBucket: "gymlog2-2947e.firebasestorage.app",
  messagingSenderId: "14005084417",
  appId: "1:14005084417:web:36848090fd37b0cc43fb00"
};

export const firebaseConfigured = true;

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = () => signInWithRedirect(auth, googleProvider);
export const logOut = () => signOut(auth);

export function subscribeToAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export function subscribeToState(userId: string, callback: (state: AppState | null) => void) {
  const userDoc = doc(db, 'users', userId);
  return onSnapshot(userDoc, (snapshot) => {
    callback(snapshot.exists() ? (snapshot.data() as AppState) : null);
  }, (error) => {
    console.error('Firestore sync error:', error);
  });
}

export async function pushStateToCloud(userId: string, state: AppState) {
  const userDoc = doc(db, 'users', userId);
  await setDoc(userDoc, state);
}
