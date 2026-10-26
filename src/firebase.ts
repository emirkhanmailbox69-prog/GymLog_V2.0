import { initializeApp } from 'firebase/app';
import {
  getAuth, signInAnonymously, onAuthStateChanged, GoogleAuthProvider,
  linkWithRedirect, getRedirectResult, signOut
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
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

const googleProvider = new GoogleAuthProvider();

export function subscribeToAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

/** Автоматический анонимный вход, если пользователь ещё не авторизован */
export async function ensureAnonymousAuth(): Promise<void> {
  if (auth.currentUser) return;
  await signInAnonymously(auth);
}

/** Привязка текущего анонимного аккаунта к Google через редирект */
export function linkAnonymousWithGoogle(): Promise<void> {
  if (!auth.currentUser) return Promise.reject(new Error('Нет активного пользователя для привязки.'));
  return linkWithRedirect(auth.currentUser, googleProvider);
}

/** Получение результата после возврата с Google-редиректа */
export async function getGoogleRedirectResult(): Promise<{ error?: { code: string; message: string } } | null> {
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      // Успешная привязка или вход
      return null;
    }
    return null;
  } catch (error: any) {
    console.error('Redirect result error:', error);
    return { error: { code: error.code, message: error.message } };
  }
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
