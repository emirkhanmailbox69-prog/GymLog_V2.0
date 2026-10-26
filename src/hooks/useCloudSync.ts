import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { User } from 'firebase/auth';
import type { AppState } from '../types';
import { subscribeToState, pushStateToCloud, getGoogleRedirectResult } from '../firebase';

export function useCloudSync(
  user: User | null,
  state: AppState,
  setState: Dispatch<SetStateAction<AppState>>
) {
  const isRemoteUpdate = useRef(false);
  const initialSyncDone = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Обработка результата редиректа (для привязки Google)
  useEffect(() => {
    getGoogleRedirectResult().then(result => {
      if (result?.error) {
        console.error('Google link redirect error:', result.error);
      }
    });
  }, []);

  useEffect(() => {
    if (!user) {
      initialSyncDone.current = false;
      return;
    }
    const unsubscribe = subscribeToState(user.uid, (remoteState) => {
      if (!initialSyncDone.current) {
        initialSyncDone.current = true;
        if (remoteState) {
          isRemoteUpdate.current = true;
          setState(remoteState);
        } else {
          pushStateToCloud(user.uid, stateRef.current).catch(err => console.error(err));
        }
        return;
      }
      if (remoteState) {
        isRemoteUpdate.current = true;
        setState(remoteState);
      }
    });
    return unsubscribe;
  }, [user, setState]);

  useEffect(() => {
    if (!user || !initialSyncDone.current) return;
    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      return;
    }
    const timeout = setTimeout(() => {
      pushStateToCloud(user.uid, state).catch(err => console.error(err));
    }, 2000);
    return () => clearTimeout(timeout);
  }, [state, user]);
}
