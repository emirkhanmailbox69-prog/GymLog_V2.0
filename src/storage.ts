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
    settings: { restSeconds: 90 }
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !('schemaVersion' in parsed) || parsed.schemaVersion !== 1) {
      return initialState();
    }
    const value = parsed as AppState;
    const defaults = initialState();

    let exercises = Array.isArray(value.exercises) ? value.exercises : defaults.exercises;

    if (!localStorage.getItem(SEED_FLAG)) {
      const existingIds = new Set(exercises.map(e => e.id));
      const toAdd = defaults.exercises.filter(e => !existingIds.has(e.id));
      if (toAdd.length) exercises = [...exercises, ...toAdd];
      localStorage.setItem(SEED_FLAG, '1');
    }

    return {
      ...defaults,
      ...value,
      profile: { ...defaults.profile, ...value.profile },
      settings: { ...defaults.settings, ...value.settings },
      exercises,
      programs: Array.isArray(value.programs) ? value.programs : [],
      workouts: Array.isArray(value.workouts) ? value.workouts : []
    };
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
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

  const totalVolume = state.workouts.reduce((n, w) =>
    n + w.exercises.reduce((m, e) =>
      m + e.sets.reduce((s, set) =>
        s + (Number(set.weight) || 0) * (Number(set.reps) || 0) * (set.done ? 1 : 0), 0), 0), 0);

  const summary = {
    workoutsCount: state.workouts.length,
    programsCount: state.programs.length,
    exercisesCount: state.exercises.length,
    totalVolume: Math.round(totalVolume),
    xp: state.workouts.reduce((n, w) => n + w.earnedXp, 0)
  };

  const payload = {
    app: 'GymLog',
    schemaVersion: 1,
    exportedAt: now.toISOString(),
    summary,
    state
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `gymlog-backup-${stamp}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
