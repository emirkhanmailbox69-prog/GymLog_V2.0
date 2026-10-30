export type Tab = 'home' | 'workout' | 'programs' | 'history' | 'quest' | 'profile';
export type SetEntry = { id: string; weight: string; reps: string; done: boolean; note?: string };
export type WorkoutExercise = { id: string; exerciseId: string; name: string; sets: SetEntry[]; collapsed: boolean };
export type Workout = {
  id: string; name: string; startedAt: number; endedAt: number;
  exercises: WorkoutExercise[]; earnedXp: number;
};
export type ActiveWorkout = { id: string; name: string; startedAt: number; exercises: WorkoutExercise[] };
export type Exercise = { id: string; name: string; muscle: string; equipment: string };

export type ProgramGoal = 'strength' | 'mass' | 'endurance' | 'other';
export type ProgramSetTemplate = { id: string; weight: string; reps: string };
export type ProgramExercise = {
  id: string;
  exerciseId: string;
  name: string;
  note?: string;
  sets: ProgramSetTemplate[];
};
export type ProgramDay = {
  id: string;
  name: string;
  exercises: ProgramExercise[];
};
export type Program = {
  id: string;
  name: string;
  goal?: ProgramGoal;
  note?: string;
  days: ProgramDay[];
  createdAt: number;
};

export type RingMetric =
  | 'workouts_week' | 'sets_week' | 'volume_week' | 'minutes_week' | 'xp_week'
  | 'workouts_month' | 'sets_month' | 'volume_month'
  | 'streak';

export type RingSetting = { metric: RingMetric; goal: number };

export type AppState = {
  schemaVersion: 1;
  profile: { name: string; bodyWeight: string; avatar?: string };
  workouts: Workout[];
  activeWorkout: ActiveWorkout | null;
  exercises: Exercise[];
  programs: Program[];
  customCategories: string[];
  unlockedAchievements: Record<string, number>;
  settings: {
    restSeconds: number;
    ring1: RingSetting;
    ring2: RingSetting;
    showInLeaderboard: boolean;
  };
};

export type PublicProfile = {
  uid: string;
  displayName: string;
  avatar?: string;
  totalXp: number;
  level: number;
  rank: string;
  weeklyVolume: number;
  streak: number;
  updatedAt: number;
};
