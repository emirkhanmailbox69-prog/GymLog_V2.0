import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { User } from 'firebase/auth';
import type { AppState } from '../types';
import { subscribeToState, pushStateToCloud } from '../firebase';

export type CloudSyncStatus = {
  lastSyncedAt: number | null;
  isSyncing: boolean;
  syncError: string | null;
  forceSync: () => Promise<void>;
};

export function useCloudSync(
  user: User | null,
  state: AppState,
  setState: Dispatch<SetStateAction<AppState>>
): CloudSyncStatus {
  const isRemoteUpdate = useRef(false);
  const initialSyncDone = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const doSync = useCallback(async (userId: string, stateToSync: AppState) => {
    setIsSyncing(true);
    try {
      await pushStateToCloud(userId, stateToSync);
      setLastSyncedAt(Date.now());
      setSyncError(null);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Ошибка синхронизации');
    } finally {
      setIsSyncing(false);
    }
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
          setLastSyncedAt(Date.now());
        } else {
          doSync(user.uid, stateRef.current);
        }
        return;
      }
      if (remoteState) {
        isRemoteUpdate.current = true;
        setState(remoteState);
        setLastSyncedAt(Date.now());
      }
    });
    return unsubscribe;
  }, [user, setState, doSync]);

  useEffect(() => {
    if (!user || !initialSyncDone.current) return;
    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      return;
    }
    const timeout = setTimeout(() => {
      doSync(user.uid, state);
    }, 2000);
    return () => clearTimeout(timeout);
  }, [state, user, doSync]);

  const forceSync = useCallback(async () => {
    if (!user) return;
    await doSync(user.uid, stateRef.current);
  }, [user, doSync]);

  return { lastSyncedAt, isSyncing, syncError, forceSync };
}
