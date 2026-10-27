export type Tab = 'home' | 'workout' | 'programs' | 'history' | 'quest' | 'profile';
export type SetEntry = { id: string; weight: string; reps: string; done: boolean; note?: string };
export type WorkoutExercise = { id: string; exerciseId: string; name: string; sets: SetEntry[]; collapsed: boolean };
export type Workout = {
  id: string; name: string; startedAt: number; endedAt: number;
  exercises: WorkoutExercise[]; earnedXp: number;
};
export type ActiveWorkout = { id: string; name: string; startedAt: number; exercises: WorkoutExercise[] };
export type Exercise = { id: string; name: string; muscle: string; equipment: string };
export type Program = { id: string; name: string; exerciseIds: string[]; createdAt: number };
export type AppState = {
  schemaVersion: 1;
  profile: { name: string; bodyWeight: string };
  workouts: Workout[];
  activeWorkout: ActiveWorkout | null;
  exercises: Exercise[];
  programs: Program[];
  settings: { restSeconds: number };
};
