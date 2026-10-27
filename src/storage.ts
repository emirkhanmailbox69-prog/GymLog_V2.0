import type { AppState } from './types';
import { starterExercises } from './data';

const STORAGE_KEY = 'gymlog3_state_v1';
const SEED_FLAG = 'gymlog_seeded_v2';

export function initialState(): AppState {
  return {
    schemaVersion: 1,
    profile: { name: 'Атлет', bodyWeight: '' },
    workouts: [],
    activeWorkout: null,
    exercises: starterExercises,
    programs: [],
    customCategories: [],
    settings: { restSeconds: 90 }
  };
}

/**
 * Нормализует любой частичный/старый стейт до валидного AppState.
 * Используется при загрузке из localStorage, из Firestore и из import JSON.
 */
export function ensureState(state: Partial<AppState> | null | undefined): AppState {
  const defaults = initialState();
  if (!state || typeof state !== 'object') return defaults;
  return {
    ...defaults,
    ...state,
    profile: { ...defaults.profile, ...(state.profile || {}) },
    settings: { ...defaults.settings, ...(state.settings || {}) },
    customCategories: Array.isArray(state.customCategories) ? state.customCategories : [],
    exercises: Array.isArray(state.exercises) && state.exercises.length > 0 ? state.exercises : defaults.exercises,
    workouts: Array.isArray(state.workouts) ? state.workouts : [],
    programs: Array.isArray(state.programs) ? state.programs : []
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !('schemaVersion' in parsed) || (parsed as { schemaVersion: unknown }).schemaVersion !== 1) {
      return initialState();
    }
    const value = parsed as Partial<AppState>;
    const normalized = ensureState(value);

    let exercises = normalized.exercises;

    if (!localStorage.getItem(SEED_FLAG)) {
      const existingIds = new Set(exercises.map(e => e.id));
      const toAdd = starterExercises.filter(e => !existingIds.has(e.id));
      if (toAdd.length) exercises = [...exercises, ...toAdd];
      localStorage.setItem(SEED_FLAG, '1');
    }

    return { ...normalized, exercises };
  } catch {
    return initialState();
  }
}

export function saveState(state: AppState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function downloadBackup(state: AppState): void {
  const blob = new Blob([JSON.stringify({ app: 'GymLog', schemaVersion: 1, exportedAt: new Date().toISOString(), state }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `gymlog-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
