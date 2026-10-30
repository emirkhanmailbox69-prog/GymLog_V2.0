import type { AppState, Exercise, Program, ProgramDay, ProgramExercise, ProgramGoal, ProgramSetTemplate } from './types';
import { starterExercises } from './data';

const STORAGE_KEY = 'gymlog3_state_v1';
const SEED_FLAG = 'gymlog_seeded_v2';

const newId = () => crypto.randomUUID();

export function initialState(): AppState {
  return {
    schemaVersion: 1,
    profile: { name: 'Атлет', bodyWeight: '' },
    workouts: [],
    activeWorkout: null,
    exercises: starterExercises,
    programs: [],
    customCategories: [],
    unlockedAchievements: {},
    settings: {
      restSeconds: 90,
      ring1: { metric: 'workouts_week', goal: 3 },
      ring2: { metric: 'sets_week', goal: 50 },
      showInLeaderboard: false
    }
  };
}

function migrateSet(raw: unknown): ProgramSetTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  return {
    id: typeof s.id === 'string' ? s.id : newId(),
    weight: typeof s.weight === 'string' ? s.weight : '',
    reps: typeof s.reps === 'string' ? s.reps : ''
  };
}

function migrateProgramExercise(raw: unknown, exercises: Exercise[]): ProgramExercise | null {
  if (!raw || typeof raw !== 'object') return null;
  const pe = raw as Record<string, unknown>;
  if (typeof pe.exerciseId !== 'string') return null;
  const sets = Array.isArray(pe.sets)
    ? (pe.sets as unknown[]).map(migrateSet).filter((s): s is ProgramSetTemplate => Boolean(s))
    : [];
  return {
    id: typeof pe.id === 'string' ? pe.id : newId(),
    exerciseId: pe.exerciseId,
    name: typeof pe.name === 'string' && pe.name
      ? pe.name
      : (exercises.find(e => e.id === pe.exerciseId)?.name || 'Упражнение'),
    note: typeof pe.note === 'string' ? pe.note : undefined,
    sets: sets.length > 0
      ? sets
      : [
          { id: newId(), weight: '', reps: '' },
          { id: newId(), weight: '', reps: '' },
          { id: newId(), weight: '', reps: '' }
        ]
  };
}

function migrateProgramDay(raw: unknown, exercises: Exercise[]): ProgramDay | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (!Array.isArray(d.exercises)) return null;
  const exs = (d.exercises as unknown[])
    .map(pe => migrateProgramExercise(pe, exercises))
    .filter((pe): pe is ProgramExercise => Boolean(pe));
  return {
    id: typeof d.id === 'string' ? d.id : newId(),
    name: typeof d.name === 'string' && d.name ? d.name : 'Тренировка',
    exercises: exs
  };
}

function migrateProgram(raw: unknown, exercises: Exercise[]): Program | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== 'string' || typeof p.name !== 'string') return null;

  const goal: ProgramGoal | undefined = ['strength', 'mass', 'endurance', 'other'].includes(p.goal as string)
    ? (p.goal as ProgramGoal)
    : undefined;

  if (Array.isArray(p.days) && p.days.length > 0) {
    const days = (p.days as unknown[])
      .map(d => migrateProgramDay(d, exercises))
      .filter((d): d is ProgramDay => Boolean(d));
    if (days.length === 0) return null;
    return {
      id: p.id,
      name: p.name,
      goal,
      note: typeof p.note === 'string' ? p.note : undefined,
      days,
      createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now()
    };
  }

  if (Array.isArray(p.exerciseIds)) {
    const exs = (p.exerciseIds as string[]).map(eid => ({
      id: newId(),
      exerciseId: eid,
      name: exercises.find(e => e.id === eid)?.name || 'Упражнение',
      sets: [
        { id: newId(), weight: '', reps: '' },
        { id: newId(), weight: '', reps: '' },
        { id: newId(), weight: '', reps: '' }
      ]
    }));
    return {
      id: p.id,
      name: p.name,
      goal,
      note: typeof p.note === 'string' ? p.note : undefined,
      days: [{ id: newId(), name: 'Тренировка', exercises: exs }],
      createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now()
    };
  }

  return null;
}

type PartialSettings = Partial<{
  restSeconds: number;
  ring1: Partial<{ metric: string; goal: number }>;
  ring2: Partial<{ metric: string; goal: number }>;
  showInLeaderboard: boolean;
}>;

export function ensureState(state: Partial<AppState> | null | undefined): AppState {
  const defaults = initialState();
  if (!state || typeof state !== 'object') return defaults;
  const s = (state.settings ?? {}) as PartialSettings;
  const ring1Metric = (s.ring1?.metric as AppState['settings']['ring1']['metric']) ?? defaults.settings.ring1.metric;
  const ring2Metric = (s.ring2?.metric as AppState['settings']['ring2']['metric']) ?? defaults.settings.ring2.metric;

  const exercises = Array.isArray(state.exercises) && state.exercises.length > 0 ? state.exercises : defaults.exercises;
  const programs = (Array.isArray(state.programs) ? state.programs : [])
    .map(p => migrateProgram(p, exercises))
    .filter((p): p is Program => Boolean(p));

  return {
    ...defaults,
    ...state,
    profile: { ...defaults.profile, ...(state.profile || {}) },
    unlockedAchievements: typeof state.unlockedAchievements === 'object' && state.unlockedAchievements !== null ? state.unlockedAchievements : {},
    settings: {
      restSeconds: s.restSeconds ?? defaults.settings.restSeconds,
      ring1: { metric: ring1Metric, goal: s.ring1?.goal ?? defaults.settings.ring1.goal },
      ring2: { metric: ring2Metric, goal: s.ring2?.goal ?? defaults.settings.ring2.goal },
      showInLeaderboard: s.showInLeaderboard ?? defaults.settings.showInLeaderboard
    },
    customCategories: Array.isArray(state.customCategories) ? state.customCategories : [],
    exercises,
    programs,
    workouts: Array.isArray(state.workouts) ? state.workouts : []
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
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timePart = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const stamp = `${datePart}_${timePart}`;

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

  const payload = { app: 'GymLog', schemaVersion: 1, exportedAt: now.toISOString(), summary, state };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `gymlog-backup-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
