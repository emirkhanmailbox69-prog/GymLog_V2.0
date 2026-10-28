import { initializeApp } from 'firebase/app';
import {
  getAuth, signInAnonymously, onAuthStateChanged, signOut,
  linkWithCredential, EmailAuthProvider, signInWithEmailAndPassword,
  sendPasswordResetEmail, setPersistence, browserLocalPersistence
} from 'firebase/auth';
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
setPersistence(auth, browserLocalPersistence).catch(err => {
  console.error('Auth persistence setup failed:', err);
});
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

export function subscribeToAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

/** Фоновый анонимный вход — нужен, чтобы Firestore работал до регистрации. Пользователь этого не видит. */
export async function ensureAnonymousAuth(): Promise<void> {
  if (auth.currentUser) return;
  await signInAnonymously(auth);
}

/** Привязка email+пароль к текущему (анонимному) аккаунту. UID сохраняется, данные остаются. */
export async function linkWithEmail(email: string, password: string): Promise<User> {
  if (!auth.currentUser) throw new Error('Нет активного пользователя.');
  const credential = EmailAuthProvider.credential(email, password);
  const result = await linkWithCredential(auth.currentUser, credential);
  return result.user;
}

/** Вход в существующий аккаунт по email+пароль. Переключает на другой UID, данные подтянутся из Firestore. */
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
