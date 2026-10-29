import { initializeApp } from 'firebase/app';
import {
  getAuth, signInAnonymously, onAuthStateChanged, signOut,
  linkWithCredential, EmailAuthProvider, signInWithEmailAndPassword,
  sendPasswordResetEmail, setPersistence, browserLocalPersistence
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, setDoc, onSnapshot, collection, query, orderBy, limit, getDocs, deleteDoc
} from 'firebase/firestore';
import type { AppState, PublicProfile } from './types';

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
setPersistence(auth, browserLocalPersistence).catch(err => {
  console.error('Auth persistence setup failed:', err);
});
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

export function subscribeToAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export async function ensureAnonymousAuth(): Promise<void> {
  if (auth.currentUser) return;
  await signInAnonymously(auth);
}

export async function linkWithEmail(email: string, password: string): Promise<User> {
  if (!auth.currentUser) throw new Error('Нет активного пользователя.');
  const credential = EmailAuthProvider.credential(email, password);
  const result = await linkWithCredential(auth.currentUser, credential);
  return result.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  if (auth.currentUser?.isAnonymous) {
    await signOut(auth);
  }
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export async function logOut(): Promise<void> {
  await signOut(auth);
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

// === Лидерборд ===
export async function updatePublicProfile(data: PublicProfile) {
  const profileDoc = doc(db, 'publicProfiles', data.uid);
  await setDoc(profileDoc, data, { merge: true });
}

export async function removePublicProfile(uid: string) {
  await deleteDoc(doc(db, 'publicProfiles', uid));
}

export async function fetchLeaderboard(metric: 'totalXp' | 'weeklyVolume' | 'streak'): Promise<PublicProfile[]> {
  const q = query(collection(db, 'publicProfiles'), orderBy(metric, 'desc'), limit(50));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data() as PublicProfile);
}
