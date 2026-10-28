import { useEffect, useMemo, useState } from 'react';
import {
  Activity, Award, BarChart3, BookOpen, Calendar, Camera, Check, ChevronDown, ChevronLeft, ChevronRight,
  ChevronUp, CircleUserRound, Cloud, Clock3, Copy, Dumbbell, FileDown, History, Home, MessageSquare,
  Pencil, Plus, RefreshCw, Save, ShieldCheck, Star, Target, Trash2, TrendingUp, Trophy, X, Zap
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { ActiveWorkout, AppState, Exercise, Program, RingMetric, SetEntry, Tab, Workout, WorkoutExercise } from './types';
import { loadState, saveState, downloadBackup, ensureState } from './storage';
import { starterExercises } from './data';
import {
  firebaseConfigured, subscribeToAuth, ensureAnonymousAuth,
  logOut, linkWithEmail, signInWithEmail, resetPassword
} from './firebase';
import { useCloudSync } from './hooks/useCloudSync';

const uid = () => crypto.randomUUID();
const emptySet = (): SetEntry => ({ id: uid(), weight: '', reps: '', done: false });
const makeWorkoutExercise = (exercise: Exercise): WorkoutExercise => ({
  id: uid(), exerciseId: exercise.id, name: exercise.name,
  sets: [emptySet(), emptySet(), emptySet()], collapsed: false
});
const localDate = (timestamp: number) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).format(timestamp);
const localTime = (timestamp: number) => new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
const durationMinutes = (start: number, end: number) => Math.max(1, Math.round((end - start) / 60000));
const formatDuration = (start: number, end: number): string => {
  const mins = Math.max(1, Math.round((end - start) / 60000));
  if (mins < 60) return `${mins} мин`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
};
const formatTimer = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};
const setCount = (w: { exercises: WorkoutExercise[] }) => w.exercises.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0);
const volume = (w: { exercises: WorkoutExercise[] }) => w.exercises.reduce((n, e) => n + e.sets.reduce((m, s) => m + (Number(s.weight) || 0) * (Number(s.reps) || 0) * (s.done ? 1 : 0), 0), 0);
const totalXp = (workouts: Workout[]) => workouts.reduce((sum, w) => sum + w.earnedXp, 0);
const xpFor = (w: ActiveWorkout) => {
  const done = setCount(w);
  return done === 0 ? 0 : Math.min(100, 20 + done * 5 + Math.min(20, w.exercises.length * 2));
};
const levelFor = (xp: number) => Math.floor(xp / 250) + 1;
const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');
const formatSyncTime = (ts: number | null): string => {
  if (!ts) return 'ещё не синхронизировано';
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `сегодня в ${time}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `вчера в ${time}`;
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const formatMonthYear = (d: Date) => `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
const dayKeyFromDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayKeyFromTs = (ts: number) => dayKeyFromDate(new Date(ts));
const buildCalendarGrid = (year: number, month: number): (Date | null)[] => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const totalDays = lastDay.getDate();
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

const DEFAULT_CATEGORIES = ['Ноги и ягодицы', 'Спина', 'Грудь', 'Плечи (Дельты)', 'Руки (Бицепс и Трицепс)', 'Пресс и кор'];
const MUSCLE_MAP: Record<string, string> = {
  'Ноги': 'Ноги и ягодицы',
  'Плечи': 'Плечи (Дельты)',
  'Бицепс': 'Руки (Бицепс и Трицепс)',
  'Трицепс': 'Руки (Бицепс и Трицепс)',
  'Корпус': 'Пресс и кор'
};
const normalizeMuscle = (m: string) => MUSCLE_MAP[m] || m;
const RING_METRICS: { id: RingMetric; label: string; shortLabel: string; unit: string; defaultGoal: number }[] = [
  { id: 'workouts_week', label: 'Тренировки за неделю', shortLabel: 'Тренировки', unit: 'трен.', defaultGoal: 4 },
  { id: 'sets_week', label: 'Подходы за неделю', shortLabel: 'Подходы', unit: 'подх.', defaultGoal: 50 },
  { id: 'volume_week', label: 'Объём за неделю', shortLabel: 'Объём', unit: 'кг', defaultGoal: 10000 },
  { id: 'minutes_week', label: 'Время за неделю', shortLabel: 'Время', unit: 'мин', defaultGoal: 180 },
  { id: 'xp_week', label: 'XP за неделю', shortLabel: 'XP', unit: 'XP', defaultGoal: 300 },
  { id: 'workouts_30d', label: 'Тренировки за 30 дней', shortLabel: 'Тренировки', unit: 'трен.', defaultGoal: 12 },
  { id: 'sets_30d', label: 'Подходы за 30 дней', shortLabel: 'Подходы', unit: 'подх.', defaultGoal: 150 },
  { id: 'volume_30d', label: 'Объём за 30 дней', shortLabel: 'Объём', unit: 'кг', defaultGoal: 40000 },
  { id: 'streak', label: 'Серия дней подряд', shortLabel: 'Серия', unit: 'дн.', defaultGoal: 7 }
];

const getRingMetricInfo = (id: RingMetric) => RING_METRICS.find(m => m.id === id) || RING_METRICS[0];
const DEFAULT_EXERCISE_IDS = new Set(starterExercises.map(e => e.id));
const isDefaultExercise = (id: string) => DEFAULT_EXERCISE_IDS.has(id);

export default function App() {
  const [state, setState] = useState<AppState>(() => ensureState(loadState()));
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [toast, setToast] = useState('');

  // Тренировка
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerNewCategory, setPickerNewCategory] = useState(DEFAULT_CATEGORIES[0]);
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(() => Date.now());
  const [historyPickerOpen, setHistoryPickerOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [xpPop, setXpPop] = useState<number | null>(null);
  const [graphExercise, setGraphExercise] = useState<{ id: string; name: string } | null>(null);

  // История
  const [historyView, setHistoryView] = useState<'list' | 'calendar'>('list');
  const [calendarDate, setCalendarDate] = useState<Date>(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Программы
  const [programsView, setProgramsView] = useState<'list' | 'library'>('list');
  const [libraryTab, setLibraryTab] = useState<'browse' | 'add'>('browse');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [showProgramBuilder, setShowProgramBuilder] = useState(false);
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [programName, setProgramName] = useState('');
  const [programNote, setProgramNote] = useState('');
  const [programExerciseIds, setProgramExerciseIds] = useState<string[]>([]);
  const [programSearch, setProgramSearch] = useState('');
  const [programCustomExName, setProgramCustomExName] = useState('');
  const [programCustomExCategory, setProgramCustomExCategory] = useState(DEFAULT_CATEGORIES[0]);
  const [showProgramCustomEx, setShowProgramCustomEx] = useState(false);

  // Библиотека → добавить своё
  const [exerciseName, setExerciseName] = useState('');
  const [exerciseMuscle, setExerciseMuscle] = useState(DEFAULT_CATEGORIES[0]);

  // Редактирование упражнения
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);

  // Email/Password
  const [emailAuthOpen, setEmailAuthOpen] = useState(false);
  const [emailAuthMode, setEmailAuthMode] = useState<'signup' | 'signin' | 'reset'>('signup');
  const [emailValue, setEmailValue] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
  const [emailAuthLoading, setEmailAuthLoading] = useState(false);
  const [emailAuthError, setEmailAuthError] = useState<string | null>(null);

  const allCategories = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES);
    (state.customCategories ?? []).forEach(c => set.add(c));
    state.exercises.forEach(e => {
      const cat = normalizeMuscle(e.muscle);
      if (cat) set.add(cat);
    });
    return Array.from(set);
  }, [state.exercises, state.customCategories]);

  const isUserCategory = (cat: string) => !DEFAULT_CATEGORIES.includes(cat);

  useEffect(() => {
    if (!saveState(state)) notify('Не удалось сохранить локально. Экспортируй резервную копию.');
  }, [state]);

    useEffect(() => {
    let authResolved = false;
    const unsubscribe = subscribeToAuth((u) => {
      if (!authResolved) {
        authResolved = true;
        if (!u) {
          ensureAnonymousAuth().catch(err => console.error('Anonymous auth error:', err));
        }
      }
      setUser(u);
    });
    return unsubscribe;
  }, []);

    useEffect(() => {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {
        /* не критично, просто игнорируем */
      });
    }
  }, []);

  const { lastSyncedAt, isSyncing, syncError, forceSync } = useCloudSync(user, state, setState);
 
  useEffect(() => {
    if (!state.activeWorkout) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.activeWorkout?.id]);

  useEffect(() => {
    if (tab !== 'programs') {
      setProgramsView('list');
      setLibraryTab('browse');
      cancelProgramEdit();
    }
  }, [tab]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  }

  function ensureCategoryRegistered(cat: string) {
    const trimmed = cat.trim();
    if (!trimmed) return;
    setState(s => {
      const list = s.customCategories ?? [];
      if (list.includes(trimmed)) return s;
      if (DEFAULT_CATEGORIES.includes(trimmed)) return s;
      return { ...s, customCategories: [...list, trimmed] };
    });
  }

  async function handleLogout() {
    try {
      await logOut();
      await ensureAnonymousAuth();
      notify('Вы вышли из аккаунта.');
    } catch {
      notify('Ошибка выхода.');
    }
  }

  function openEmailAuth(mode: 'signup' | 'signin' | 'reset') {
    setEmailAuthMode(mode);
    setEmailValue(user?.email || '');
    setPasswordValue('');
    setEmailAuthError(null);
    setEmailAuthOpen(true);
  }

  async function handleEmailAuth() {
    const email = emailValue.trim().toLowerCase();
    const password = passwordValue;
    setEmailAuthError(null);

    if (!email || !email.includes('@')) {
      setEmailAuthError('Введи корректный email');
      return;
    }

    if (emailAuthMode === 'reset') {
      setEmailAuthLoading(true);
      try {
        await resetPassword(email);
        setEmailAuthOpen(false);
        notify(`Письмо для сброса пароля отправлено на ${email}`);
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code || '';
        if (code === 'auth/user-not-found') setEmailAuthError('Аккаунт с таким email не найден');
        else if (code === 'auth/invalid-email') setEmailAuthError('Некорректный email');
        else setEmailAuthError('Не удалось отправить письмо');
      } finally {
        setEmailAuthLoading(false);
      }
      return;
    }

    if (password.length < 6) {
      setEmailAuthError('Пароль минимум 6 символов');
      return;
    }

    setEmailAuthLoading(true);
    try {
      if (emailAuthMode === 'signup') {
        try {
          const linkedUser = await linkWithEmail(email, password);
          setUser(linkedUser);
          setEmailAuthOpen(false);
          setEmailValue('');
          setPasswordValue('');
          notify(`Аккаунт создан: ${email}. Данные синхронизируются.`);
        } catch (err: unknown) {
          const code = (err as { code?: string })?.code || '';
          if (code === 'auth/email-already-in-use') {
            setEmailAuthError('Этот email уже используется. Нажми «Войти» снизу.');
          } else if (code === 'auth/weak-password') {
            setEmailAuthError('Пароль слишком простой (минимум 6 символов)');
          } else if (code === 'auth/credential-already-in-use') {
            setEmailAuthError('Email уже привязан к другому аккаунту. Нажми «Войти».');
          } else {
            setEmailAuthError(`Не удалось: ${code || 'ошибка'}`);
          }
        }
      } else {
        try {
          const signedUser = await signInWithEmail(email, password);
          setUser(signedUser);
          setEmailAuthOpen(false);
          setEmailValue('');
          setPasswordValue('');
          notify(`Вы вошли: ${email}`);
        } catch (err: unknown) {
          const code = (err as { code?: string })?.code || '';
          if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
            setEmailAuthError('Неверный пароль');
          } else if (code === 'auth/user-not-found') {
            setEmailAuthError('Аккаунт не найден. Нажми «Нет аккаунта? Создать».');
          } else if (code === 'auth/too-many-requests') {
            setEmailAuthError('Слишком много попыток. Подожди пару минут.');
          } else if (code === 'auth/invalid-email') {
            setEmailAuthError('Некорректный email');
          } else {
            setEmailAuthError(`Не удалось: ${code || 'ошибка'}`);
          }
        }
      }
    } finally {
      setEmailAuthLoading(false);
    }
  }

  const xp = totalXp(state.workouts);
  const level = levelFor(xp);
  const currentWorkout = state.activeWorkout;
  const weeklyWorkouts = state.workouts.filter(w => Date.now() - w.endedAt < 7 * 86400000);
  const weeklySets = weeklyWorkouts.reduce((n, w) => n + setCount(w), 0);
  const streak = (() => {
    if (!state.workouts.length) return 0;
    const days = new Set(state.workouts.map(w => new Date(w.endedAt).toDateString()));
    let s = 0;
    const d = new Date();
    while (days.has(d.toDateString())) { s++; d.setDate(d.getDate() - 1); }
    return s;
  })();

    const weeklyVolume = weeklyWorkouts.reduce((n, w) => n + volume(w), 0);
  const weeklyMinutes = weeklyWorkouts.reduce((n, w) => n + durationMinutes(w.startedAt, w.endedAt), 0);
  const weeklyXp = weeklyWorkouts.reduce((n, w) => n + w.earnedXp, 0);

  const last30dWorkouts = state.workouts.filter(w => Date.now() - w.endedAt < 30 * 86400000);
  const last30dSets = last30dWorkouts.reduce((n, w) => n + setCount(w), 0);
  const last30dVolume = last30dWorkouts.reduce((n, w) => n + volume(w), 0);

  function getRingMetricValue(metric: RingMetric): number {
    switch (metric) {
      case 'workouts_week': return weeklyWorkouts.length;
      case 'sets_week': return weeklySets;
      case 'volume_week': return weeklyVolume;
      case 'minutes_week': return weeklyMinutes;
      case 'xp_week': return weeklyXp;
      case 'workouts_30d': return last30dWorkouts.length;
      case 'sets_30d': return last30dSets;
      case 'volume_30d': return last30dVolume;
      case 'streak': return streak;
    }
  }

  function updateRingMetric(which: 'ring1' | 'ring2', metric: RingMetric) {
    const info = getRingMetricInfo(metric);
    setState(s => ({
      ...s,
      settings: {
        ...s.settings,
        [which]: { metric, goal: info.defaultGoal }
      }
    }));
  }

  function updateRingGoal(which: 'ring1' | 'ring2', goal: number) {
    setState(s => ({
      ...s,
      settings: {
        ...s.settings,
        [which]: { ...s.settings[which], goal: Math.max(1, goal || 1) }
      }
    }));
  }

  const ring1Info = getRingMetricInfo(state.settings.ring1.metric);
  const ring2Info = getRingMetricInfo(state.settings.ring2.metric);
  const ring1Value = getRingMetricValue(state.settings.ring1.metric);
  const ring2Value = getRingMetricValue(state.settings.ring2.metric);

  const filteredExercises = useMemo(() => state.exercises.filter(e =>
    `${e.name} ${e.muscle} ${e.equipment}`.toLocaleLowerCase('ru-RU').includes(pickerQuery.toLocaleLowerCase('ru-RU'))
  ), [state.exercises, pickerQuery]);

  const filteredProgramExercises = useMemo(() => {
    const q = programSearch.toLowerCase().trim();
    if (!q) return state.exercises;
    return state.exercises.filter(e =>
      `${e.name} ${e.muscle} ${e.equipment}`.toLowerCase().includes(q)
    );
  }, [state.exercises, programSearch]);

  const groupedExercises = useMemo(() => {
    const groups: Record<string, Exercise[]> = {};
    for (const e of state.exercises) {
      const cat = normalizeMuscle(e.muscle) || 'Без категории';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(e);
    }
    for (const cat in groups) {
      groups[cat].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    }
    return groups;
  }, [state.exercises]);

  // === Календарь ===
  const workoutsByDay = useMemo(() => {
    const map: Record<string, Workout[]> = {};
    for (const w of state.workouts) {
      const key = dayKeyFromTs(w.endedAt);
      if (!map[key]) map[key] = [];
      map[key].push(w);
    }
    return map;
  }, [state.workouts]);

  const calendarCells = useMemo(
    () => buildCalendarGrid(calendarDate.getFullYear(), calendarDate.getMonth()),
    [calendarDate]
  );

  const todayKey = dayKeyFromDate(new Date());

  const monthWorkouts = useMemo(() => {
    return state.workouts.filter(w => {
      const d = new Date(w.endedAt);
      return d.getFullYear() === calendarDate.getFullYear() && d.getMonth() === calendarDate.getMonth();
    });
  }, [state.workouts, calendarDate]);

  const monthVolume = monthWorkouts.reduce((n, w) => n + volume(w), 0);
  const monthXp = monthWorkouts.reduce((n, w) => n + w.earnedXp, 0);

  const muscleStats30d = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000;
    const stats: Record<string, number> = {};
    for (const w of state.workouts) {
      if (w.endedAt < cutoff) continue;
      for (const ex of w.exercises) {
        const libEx = state.exercises.find(e => e.id === ex.exerciseId);
        const cat = libEx ? (normalizeMuscle(libEx.muscle) || 'Без категории') : 'Без категории';
        const doneSets = ex.sets.filter(s => s.done).length;
        if (doneSets === 0) continue;
        stats[cat] = (stats[cat] || 0) + doneSets;
      }
    }
    return stats;
  }, [state.workouts, state.exercises]);

  const muscleStatsSorted = useMemo(() => {
    return Object.entries(muscleStats30d)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [muscleStats30d]);

  const maxMuscleValue = Math.max(1, ...muscleStatsSorted.map(([, v]) => v));

  function goToPrevMonth() {
    setCalendarDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  function goToNextMonth() {
    setCalendarDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }
  function selectDay(key: string) {
    setSelectedDay(prev => prev === key ? null : key);
  }
  function openCalendar() {
    setHistoryView('calendar');
    if (!selectedDay) {
      setCalendarDate(new Date());
      setSelectedDay(todayKey);
    }
  }

  function patchActive(updater: (active: ActiveWorkout) => ActiveWorkout) {
    setState(s => s.activeWorkout ? { ...s, activeWorkout: updater(s.activeWorkout) } : s);
  }

  function cloneExercise(source: WorkoutExercise): WorkoutExercise {
    const doneSets = source.sets.filter(s => s.done && (s.weight || s.reps));
    const sets = doneSets.length > 0
      ? doneSets.map(s => ({ id: uid(), weight: s.weight, reps: s.reps, done: false }))
      : [emptySet(), emptySet(), emptySet()];
    return {
      id: uid(),
      exerciseId: source.exerciseId,
      name: source.name,
      sets,
      collapsed: false
    };
  }

  function startFromWorkout(source: Workout) {
    const newWorkout: ActiveWorkout = {
      id: uid(),
      name: source.name,
      startedAt: Date.now(),
      exercises: source.exercises.map(cloneExercise)
    };
    setState(s => ({ ...s, activeWorkout: newWorkout }));
    setTab('workout');
    notify(`Скопировано из «${source.name}»`);
  }

  function startWorkout(program?: Program) {
    const chosen = program ? state.exercises.filter(e => program.exerciseIds.includes(e.id)) : [];
    setState(s => ({ ...s, activeWorkout: {
      id: uid(), name: program?.name ?? 'Силовая тренировка', startedAt: Date.now(),
      exercises: chosen.map(makeWorkoutExercise)
    }}));
    setTab('workout');
    notify(program ? `Начата программа «${program.name}»` : 'Тренировка начата');
  }

  function addExerciseToWorkout(exercise: Exercise) {
    patchActive(a => ({ ...a, exercises: [...a.exercises, makeWorkoutExercise(exercise)] }));
    setPickerOpen(false);
    setPickerQuery('');
  }

  function updateSet(exerciseId: string, setId: string, patch: Partial<SetEntry>) {
    patchActive(a => ({ ...a, exercises: a.exercises.map(e => e.id !== exerciseId ? e : {
      ...e, sets: e.sets.map(s => s.id === setId ? { ...s, ...patch } : s)
    }) }));
  }

  function toggleNote(exerciseId: string, setId: string) {
    const key = `${exerciseId}-${setId}`;
    setOpenNotes(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function getExerciseProgress(exerciseId: string): { date: number; value: number }[] {
    const sorted = [...state.workouts].reverse();
    const points: { date: number; value: number }[] = [];
    for (const w of sorted) {
      const ex = w.exercises.find(e => e.exerciseId === exerciseId);
      if (!ex) continue;
      const doneSets = ex.sets.filter(s => s.done);
      if (doneSets.length === 0) continue;
      const vol = doneSets.reduce(
        (n, s) => n + (Number(s.weight) || 0) * (Number(s.reps) || 0),
        0
      );
      if (vol === 0) continue;
      points.push({ date: w.endedAt, value: vol });
    }
    return points.slice(-12);
  }

  function finishWorkout() {
    if (!currentWorkout || finishing) return;
    const earnedXp = xpFor(currentWorkout);
    if (earnedXp === 0) {
      notify('Отметь хотя бы один выполненный подход — пустая тренировка не даёт XP.');
      return;
    }
    setFinishing(true);
    window.setTimeout(() => {
      const completed: Workout = { ...currentWorkout, endedAt: Date.now(), earnedXp };
      setState(s => ({ ...s, workouts: [completed, ...s.workouts], activeWorkout: null }));
      setTab('home');
      setFinishing(false);
      setXpPop(earnedXp);
      window.setTimeout(() => setXpPop(null), 1200);
      notify(`Тренировка сохранена · +${earnedXp} XP`);
    }, 700);
  }

  function deleteWorkout(id: string) {
    if (!window.confirm('Удалить тренировку? Статистика и XP будут пересчитаны.')) return;
    setState(s => ({ ...s, workouts: s.workouts.filter(w => w.id !== id) }));
    notify('Тренировка удалена. Прогресс пересчитан.');
  }

  function clearHistory() {
    if (!window.confirm('Удалить ВСЮ историю тренировок? Это действие нельзя отменить.')) return;
    if (!window.confirm('Точно? Все тренировки, XP и статистика будут потеряны навсегда.\n\nСовет: перед удалением сделайте экспорт JSON в профиле.')) return;
    setState(s => ({ ...s, workouts: [] }));
    notify('История очищена. XP и статистика пересчитаны.');
  }

  function cancelProgramEdit() {
    setEditingProgramId(null);
    setProgramName('');
    setProgramNote('');
    setProgramExerciseIds([]);
    setProgramSearch('');
    setProgramCustomExName('');
    setProgramCustomExCategory(DEFAULT_CATEGORIES[0]);
    setShowProgramCustomEx(false);
    setShowProgramBuilder(false);
  }

  function startEditProgram(p: Program) {
    setEditingProgramId(p.id);
    setProgramName(p.name);
    setProgramNote(p.note || '');
    setProgramExerciseIds(p.exerciseIds);
    setProgramSearch('');
    setShowProgramCustomEx(false);
    setShowProgramBuilder(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function addProgram() {
    const name = programName.trim();
    if (!name || programExerciseIds.length === 0) {
      notify('Укажи название и добавь хотя бы одно упражнение.');
      return;
    }
    const note = programNote.trim() || undefined;
    if (editingProgramId) {
      setState(s => ({
        ...s,
        programs: s.programs.map(p => p.id === editingProgramId
          ? { ...p, name, note, exerciseIds: programExerciseIds }
          : p
        )
      }));
      notify('Программа обновлена.');
    } else {
      const program: Program = { id: uid(), name, note, exerciseIds: programExerciseIds, createdAt: Date.now() };
      setState(s => ({ ...s, programs: [...s.programs, program] }));
      notify('Программа сохранена.');
    }
    cancelProgramEdit();
  }

  function addCustomExerciseFromProgram() {
    const name = programCustomExName.trim();
    if (!name) { notify('Введи название упражнения.'); return; }
    if (state.exercises.some(e => e.name.toLowerCase() === name.toLowerCase())) {
      notify('Такое упражнение уже есть в библиотеке.');
      return;
    }
    const category = programCustomExCategory.trim();
    const exercise: Exercise = { id: uid(), name, muscle: category, equipment: 'Пользовательское' };
    setState(s => ({ ...s, exercises: [...s.exercises, exercise] }));
    if (category) ensureCategoryRegistered(category);
    setProgramExerciseIds(ids => [...ids, exercise.id]);
    setProgramCustomExName('');
    setProgramCustomExCategory(DEFAULT_CATEGORIES[0]);
    setShowProgramCustomEx(false);
    notify('Упражнение добавлено и выбрано.');
  }

  function addCustomExercise() {
    const name = exerciseName.trim();
    if (!name) { notify('Введи название упражнения.'); return; }
    if (state.exercises.some(e => e.name.toLowerCase() === name.toLowerCase())) {
      notify('Такое упражнение уже есть в библиотеке.');
      return;
    }
    const category = exerciseMuscle.trim();
    const exercise: Exercise = { id: uid(), name, muscle: category, equipment: 'Пользовательское' };
    setState(s => ({ ...s, exercises: [...s.exercises, exercise] }));
    if (category) ensureCategoryRegistered(category);
    setExerciseName('');
    if (category) setExpandedCategories(prev => ({ ...prev, [normalizeMuscle(category) || 'Без категории']: true }));
    notify('Упражнение добавлено в библиотеку.');
  }

  function addCustomInPicker(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = state.exercises.find(e => e.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      addExerciseToWorkout(existing);
      return;
    }
    const category = pickerNewCategory.trim();
    const exercise: Exercise = { id: uid(), name: trimmed, muscle: category, equipment: 'Пользовательское' };
    setState(s => ({ ...s, exercises: [...s.exercises, exercise] }));
    if (category) ensureCategoryRegistered(category);
    addExerciseToWorkout(exercise);
  }

  function saveEditedExercise() {
    if (!editingExercise) return;
    const name = editingExercise.name.trim();
    if (!name) { notify('Название не может быть пустым.'); return; }
    const dup = state.exercises.some(e => e.id !== editingExercise.id && e.name.toLowerCase() === name.toLowerCase());
    if (dup) { notify('Упражнение с таким названием уже есть.'); return; }
    const category = editingExercise.muscle.trim();
    setState(s => ({
      ...s,
      exercises: s.exercises.map(e => e.id === editingExercise.id ? { ...e, name, muscle: category } : e)
    }));
    if (category) ensureCategoryRegistered(category);
    setEditingExercise(null);
    notify('Упражнение сохранено.');
  }

  function deleteExercise(exercise: Exercise) {
    if (isDefaultExercise(exercise.id)) {
      notify('Встроенные упражнения удалять нельзя.');
      return;
    }
    if (!window.confirm(`Удалить упражнение «${exercise.name}» из библиотеки?`)) return;
    setState(s => ({
      ...s,
      exercises: s.exercises.filter(x => x.id !== exercise.id),
      programs: s.programs.map(p => ({ ...p, exerciseIds: p.exerciseIds.filter(id => id !== exercise.id) }))
    }));
    notify('Упражнение удалено.');
  }

  function renameCategory(oldName: string) {
    const normalized = normalizeMuscle(oldName);
    if (!isUserCategory(normalized)) {
      notify('Встроенные категории нельзя переименовать.');
      return;
    }
    const newName = window.prompt(`Новое название категории «${oldName}»:`, oldName);
    if (!newName) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === normalized) return;
    if (allCategories.includes(trimmed)) {
      notify('Категория с таким названием уже существует.');
      return;
    }
    setState(s => ({
      ...s,
      customCategories: (s.customCategories ?? []).map(c => c === normalized ? trimmed : c),
      exercises: s.exercises.map(e => normalizeMuscle(e.muscle) === normalized ? { ...e, muscle: trimmed } : e)
    }));
    notify('Категория переименована.');
  }

  function deleteCategory(cat: string) {
    const normalized = normalizeMuscle(cat);
    if (!isUserCategory(normalized)) {
      notify('Встроенные категории удалять нельзя.');
      return;
    }
    const count = state.exercises.filter(e => normalizeMuscle(e.muscle) === normalized).length;
    const message = count > 0
      ? `Удалить категорию «${cat}»?\n\nВ ней ${count} упражнений. Они перейдут в «Без категории».`
      : `Удалить категорию «${cat}»?`;
    if (!window.confirm(message)) return;
    setState(s => ({
      ...s,
      customCategories: (s.customCategories ?? []).filter(c => c !== normalized),
      exercises: s.exercises.map(e => normalizeMuscle(e.muscle) === normalized ? { ...e, muscle: '' } : e)
    }));
    notify('Категория удалена.');
  }

  function toggleCategory(cat: string) {
    setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  }

  function toggleProgramExercise(id: string) {
    setProgramExerciseIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  }

  function exportData() {
    downloadBackup(state);
    notify('Резервная копия JSON подготовлена.');
  }

  function importData(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed: unknown = JSON.parse(String(reader.result));
        if (!parsed || typeof parsed !== 'object' || !('app' in parsed) || parsed.app !== 'GymLog' || !('state' in parsed)) {
          throw new Error('Файл не похож на резервную копию GymLog.');
        }
        const raw = parsed as {
          exportedAt?: string;
          summary?: { workoutsCount?: number; totalVolume?: number; xp?: number };
          state: AppState;
        };
        const candidate = raw.state;
        if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.workouts) || !Array.isArray(candidate.exercises)) {
          throw new Error('Структура резервной копии не поддерживается.');
        }

        const fileDate = raw.exportedAt
          ? new Date(raw.exportedAt).toLocaleString('ru-RU', {
              day: 'numeric', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })
          : 'дата не указана';
        const fileSummary = raw.summary
          ? `тренировок ${raw.summary.workoutsCount ?? '?'}, XP ${raw.summary.xp ?? '?'}`
          : `тренировок ${candidate.workouts.length}`;

        const message =
          `Импортировать файл от ${fileDate}?\n` +
          `Содержимое: ${fileSummary}.\n\n` +
          `Текущие данные заменятся.`;

        if (!window.confirm(message)) return;
        setState(ensureState(candidate));
        notify('Импорт завершён.');
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Не удалось импортировать файл.');
      }
    };
    reader.readAsText(file);
  }

    function updateProfile(name: string, bodyWeight: string) {
    setState(s => ({ ...s, profile: { ...s.profile, name, bodyWeight } }));
  }

  function loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  async function handleAvatarUpload(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('Выбери файл изображения');
      return;
    }
    try {
      const img = await loadImage(file);
      const SIZE = 192;
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas недоступен');
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      setState(s => ({ ...s, profile: { ...s.profile, avatar: dataUrl } }));
      notify('Фото обновлено');
    } catch (err) {
      console.error('Avatar upload error:', err);
      notify('Не удалось загрузить фото');
    }
  }

  function removeAvatar() {
    if (!window.confirm('Удалить фото профиля?')) return;
    setState(s => ({
      ...s,
      profile: { name: s.profile.name, bodyWeight: s.profile.bodyWeight }
    }));
    notify('Фото удалено');
  }

  const navItems: { id: Tab; label: string; icon: typeof Home }[] = [
    { id: 'home', label: 'Главная', icon: Home },
    { id: 'workout', label: 'Тренировка', icon: Dumbbell },
    { id: 'programs', label: 'Программы', icon: BookOpen },
    { id: 'history', label: 'История', icon: BarChart3 },
    { id: 'quest', label: 'GymQuest', icon: Trophy },
    { id: 'profile', label: 'Профиль', icon: CircleUserRound }
  ];

  const orderedCategories = useMemo(() => {
    const result: string[] = [];
    const seen = new Set<string>();
    for (const c of DEFAULT_CATEGORIES) { result.push(c); seen.add(c); }
    for (const c of (state.customCategories ?? [])) { if (!seen.has(c)) { result.push(c); seen.add(c); } }
    for (const c of Object.keys(groupedExercises)) { if (!seen.has(c)) { result.push(c); seen.add(c); } }
    return result;
  }, [state.customCategories, groupedExercises]);

  const isRegistered = Boolean(user && !user.isAnonymous);

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setTab('home')} aria-label="На главную">
          <span className="brand-mark"><Activity size={19} strokeWidth={2.8} /></span>
          <span><b>GYMLOG</b><small>TRAINING JOURNAL</small></span>
        </button>
          <button className="avatar" onClick={() => setTab('profile')} aria-label="Открыть профиль">
          {state.profile.avatar
            ? <img src={state.profile.avatar} alt="" />
            : (state.profile.name.trim()[0] || 'А').toLocaleUpperCase('ru-RU')}
        </button>
      </header>

      <main className="screen" key={tab}>
        {tab === 'home' && <section>
          <p className="eyebrow">{localDate(Date.now()).toUpperCase()}</p>
          <h1>Сводка.</h1>
          <p className="intro">Прогресс за последние 7 дней.</p>

                    <div className="rings-card">
            <ActivityRings rings={[
              { percent: ring1Value / Math.max(1, state.settings.ring1.goal), color: '#ff6482' },
              { percent: ring2Value / Math.max(1, state.settings.ring2.goal), color: '#d0f477' },
              { percent: (xp % 250) / 250, color: '#32d4ff' }
            ]} />
            <div className="rings-legend">
              <div className="ring-legend-row">
                <span className="ring-dot" style={{ background: '#ff6482' }} />
                <div><b>{ring1Info.shortLabel}</b><small>{ring1Value} из {state.settings.ring1.goal} {ring1Info.unit}</small></div>
              </div>
              <div className="ring-legend-row">
                <span className="ring-dot" style={{ background: '#d0f477' }} />
                <div><b>{ring2Info.shortLabel}</b><small>{ring2Value} из {state.settings.ring2.goal} {ring2Info.unit}</small></div>
              </div>
              <div className="ring-legend-row">
                <span className="ring-dot" style={{ background: '#32d4ff' }} />
                <div><b>До уровня {level + 1}</b><small>{xp % 250} из 250 XP</small></div>
              </div>
            </div>
          </div>

          <button className="button button-primary full-width big-button" onClick={() => currentWorkout ? setTab('workout') : startWorkout()}>
            {currentWorkout ? 'Продолжить тренировку' : 'Начать тренировку'}
          </button>

          {!currentWorkout && state.workouts.length > 0 && (
            <div className="quick-start">
              <button className="quick-start-btn" onClick={() => startFromWorkout(state.workouts[0])}>
                <RefreshCw size={18} />
                <div>
                  <b>Повторить последнюю</b>
                  <small>{state.workouts[0].name} · {localDate(state.workouts[0].endedAt)} · {setCount(state.workouts[0])} подходов</small>
                </div>
              </button>
              <button className="quick-start-btn" onClick={() => setHistoryPickerOpen(true)}>
                <History size={18} />
                <div>
                  <b>Из истории</b>
                  <small>выбрать любую тренировку</small>
                </div>
              </button>
            </div>
          )}

          <div className="stats-grid">
            <Metric label="ТРЕНИРОВОК" value={String(state.workouts.length)} note="всего" />
            <Metric label="ОБЪЁМ" value={fmt(state.workouts.reduce((n, w) => n + volume(w), 0))} note="кг × повторы" />
            <Metric label="УРОВЕНЬ" value={String(level)} note={`${xp} XP`} />
            <Metric label="СЕРИЯ" value={String(streak)} note="дней подряд" />
          </div>

          <SectionTitle title="Последние тренировки" action={state.workouts.length ? 'Вся история' : undefined} onAction={() => setTab('history')} />
          {state.workouts.length ? <div className="panel">{state.workouts.slice(0, 3).map(w => <WorkoutRow key={w.id} workout={w} onDelete={() => deleteWorkout(w.id)} />)}</div> : <Empty title="Здесь начнётся твой прогресс" text="Заверши первую тренировку, чтобы увидеть историю и статистику." />}
        </section>}

        {tab === 'workout' && <section>
          <p className="eyebrow">ТРЕНИРОВОЧНЫЙ ЗАЛ</p>
          <h1>{currentWorkout ? 'Работаем.' : 'Твоя тренировка.'}</h1>
          <p className="intro">{currentWorkout ? 'Отмечай подходы по мере выполнения.' : 'Начни пустую тренировку или выбери программу.'}</p>
          {!currentWorkout ? <div className="panel empty-workout">
            <Dumbbell size={29} />
            <h3>Новая тренировка</h3>
            <p>Начни с нуля, повтори прошлую, выбери из истории или запусти программу.</p>
            <button className="button button-primary" onClick={() => startWorkout()}>Начать с нуля</button>
            {state.workouts.length > 0 && <div className="quick-programs">
              <button className="button button-secondary" onClick={() => startFromWorkout(state.workouts[0])}>
                <RefreshCw size={15} /> Повторить последнюю
              </button>
              <button className="button button-secondary" onClick={() => setHistoryPickerOpen(true)}>
                <History size={15} /> Из истории
              </button>
            </div>}
            {state.programs.length > 0 && <div className="quick-programs">{state.programs.map(p => <button key={p.id} className="button button-secondary" onClick={() => startWorkout(p)}>{p.name} <span>↗</span></button>)}</div>}
          </div> : <>
            <div className="workout-meta"><div><Clock3 size={16} /><span>Начата {localDate(currentWorkout.startedAt)}, {localTime(currentWorkout.startedAt)}</span></div><span>{currentWorkout.exercises.length} упражнений</span></div>
            <div className="workout-timer">
              <span className="workout-timer-label">Длительность</span>
              <span className="workout-timer-value">{formatTimer(now - currentWorkout.startedAt)}</span>
            </div>
            <label className="field-label">Название тренировки<input className="field" value={currentWorkout.name} onChange={e => patchActive(a => ({ ...a, name: e.target.value }))} maxLength={60} /></label>
            <div className="section-heading"><h2>Упражнения</h2><button className="icon-button" onClick={() => setPickerOpen(true)} aria-label="Добавить упражнение"><Plus size={20} /></button></div>
            {currentWorkout.exercises.length === 0 && <Empty title="Пока нет упражнений" text="Добавь первое упражнение из библиотеки." />}
            {currentWorkout.exercises.map((exercise, index) => <article className="exercise-card" key={exercise.id}>
              <div className="exercise-title">
                <button className="exercise-collapse" onClick={() => patchActive(a => ({ ...a, exercises: a.exercises.map(e => e.id === exercise.id ? { ...e, collapsed: !e.collapsed } : e) }))}>
                  <span className="exercise-number">{String(index + 1).padStart(2, '0')}</span><span className="exercise-name">{exercise.name}<small>{exercise.sets.filter(s => s.done).length} из {exercise.sets.length} подходов</small></span>{exercise.collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                </button>
                <button className="icon-button subtle" aria-label="Удалить упражнение" onClick={() => patchActive(a => ({ ...a, exercises: a.exercises.filter(e => e.id !== exercise.id) }))}><X size={17} /></button>
              </div>
              {!exercise.collapsed && <div className="sets">
                <div className="set-header"><span>СЕТ</span><span>ВЕС, КГ</span><span>ПОВТОРЫ</span><span></span><span>✓</span></div>
                {exercise.sets.map((set, i) => {
                  const noteKey = `${exercise.id}-${set.id}`;
                  const showNote = openNotes[noteKey] || Boolean(set.note && set.note.trim());
                  const prevSet = i > 0 ? exercise.sets[i - 1] : null;
                  const isEmptySet = !set.weight && !set.reps;
                  const canCopy = Boolean(prevSet && isEmptySet && (prevSet.weight || prevSet.reps));
                  return (
                    <div key={set.id}>
                      <div className={`set-row ${set.done ? 'set-done' : ''}`}>
                        {canCopy ? (
                          <button
                            className="set-copy"
                            aria-label="Скопировать из предыдущего подхода"
                            onClick={() => prevSet && updateSet(exercise.id, set.id, { weight: prevSet.weight, reps: prevSet.reps })}
                          >
                            <Copy size={13} />
                          </button>
                        ) : (
                          <span className="set-index">{i + 1}</span>
                        )}
                        <input aria-label={`Вес, подход ${i + 1}`} className="set-input" type="number" min="0" step="0.5" placeholder="—" value={set.weight} onChange={e => updateSet(exercise.id, set.id, { weight: e.target.value })} />
                        <input aria-label={`Повторы, подход ${i + 1}`} className="set-input" type="number" min="0" step="1" placeholder="—" value={set.reps} onChange={e => updateSet(exercise.id, set.id, { reps: e.target.value })} />
                        <button
                          className={`set-note-toggle ${set.note && set.note.trim() ? 'has-note' : ''}`}
                          aria-label={showNote ? 'Скрыть заметку' : 'Добавить заметку'}
                          onClick={() => toggleNote(exercise.id, set.id)}
                        >
                          <MessageSquare size={14} />
                        </button>
                        <button className={`set-check ${set.done ? 'checked' : ''}`} aria-label={set.done ? 'Снять отметку подхода' : 'Отметить подход выполненным'} onClick={() => updateSet(exercise.id, set.id, { done: !set.done })}>{set.done && <Check size={16} />}</button>
                      </div>
                      {showNote && (
                        <textarea
                          className="set-note-input"
                          placeholder="Заметка к подходу…"
                          value={set.note || ''}
                          onChange={e => updateSet(exercise.id, set.id, { note: e.target.value })}
                          rows={1}
                          maxLength={300}
                        />
                      )}
                    </div>
                  );
                })}
                <button className="add-set" onClick={() => patchActive(a => ({ ...a, exercises: a.exercises.map(e => e.id === exercise.id ? { ...e, sets: [...e.sets, emptySet()] } : e) }))}><Plus size={15} /> Добавить подход</button>
              </div>}
            </article>)}
            <button className="button button-secondary full-width" onClick={() => setPickerOpen(true)}><Plus size={17} /> Добавить упражнение</button>
            <div className="finish-bar"><div><b>{setCount(currentWorkout)}</b><small>выполнено подходов</small></div><button className={`button button-primary ${finishing ? 'is-finishing' : ''}`} onClick={finishWorkout} disabled={finishing}>{finishing ? 'Сохраняем…' : <>Завершить <Check size={17} /></>}</button></div>
            <button className="text-danger" onClick={() => { if (window.confirm('Отменить текущую тренировку? Она не попадёт в историю.')) { setState(s => ({ ...s, activeWorkout: null })); notify('Тренировка отменена.'); } }}>Отменить тренировку</button>
          </>}
        </section>}

        {tab === 'programs' && programsView === 'list' && <section>
          <p className="eyebrow">ПЛАНИРОВАНИЕ</p>
          <h1>Мои программы.</h1>
          <p className="intro">Собери шаблон один раз и запускай его, когда понадобится.</p>

          <button className="menu-card" onClick={() => { setProgramsView('library'); setLibraryTab('browse'); }}>
            <div className="menu-card-icon"><BookOpen size={22} /></div>
            <div className="menu-card-body">
              <b>Библиотека упражнений</b>
              <small>{state.exercises.length} упражнений · {orderedCategories.length} категорий</small>
            </div>
            <ChevronRight size={20} />
          </button>

          <button className="button button-primary full-width" onClick={() => { if (showProgramBuilder) { cancelProgramEdit(); } else { setShowProgramBuilder(true); } }}>
            <Plus size={17} /> {showProgramBuilder ? 'Скрыть билдер' : 'Создать программу'}
          </button>

          {showProgramBuilder && <div className="panel builder">
            <div className="section-heading" style={{ marginTop: 0 }}>
              <h2>{editingProgramId ? 'Редактирование программы' : 'Новая программа'}</h2>
              {editingProgramId && <button className="text-link" onClick={cancelProgramEdit}>Отмена</button>}
            </div>

            <label className="field-label">Название программы
              <input className="field" placeholder="Например, Верх тела A" value={programName} onChange={e => setProgramName(e.target.value)} maxLength={60} />
            </label>

            <label className="field-label">Примечание (опционально)
              <textarea
                className="program-note-textarea"
                placeholder="Например: тренировка на массу, отдых 90 сек"
                value={programNote}
                onChange={e => setProgramNote(e.target.value)}
                rows={2}
                maxLength={500}
              />
            </label>

            <p className="eyebrow">ВЫБЕРИ УПРАЖНЕНИЯ ({programExerciseIds.length} выбрано)</p>

            <div className="selection-list-search">
              <input
                className="field"
                placeholder="Поиск упражнения..."
                value={programSearch}
                onChange={e => setProgramSearch(e.target.value)}
              />
            </div>

            {!showProgramCustomEx && (
              <button className="add-set" style={{ marginBottom: 10 }} onClick={() => setShowProgramCustomEx(true)}>
                <Plus size={15} /> Добавить своё упражнение
              </button>
            )}

            {showProgramCustomEx && (
              <div className="program-custom-form">
                <input
                  className="field"
                  placeholder="Название упражнения"
                  value={programCustomExName}
                  onChange={e => setProgramCustomExName(e.target.value)}
                  maxLength={80}
                />
                <CategorySelect
                  value={programCustomExCategory}
                  onChange={(v) => { setProgramCustomExCategory(v); if (v) ensureCategoryRegistered(v); }}
                  categories={allCategories}
                />
                <div className="program-custom-actions">
                  <button className="button button-secondary" onClick={() => { setShowProgramCustomEx(false); setProgramCustomExName(''); setProgramCustomExCategory(DEFAULT_CATEGORIES[0]); }}>
                    Отмена
                  </button>
                  <button className="button button-primary" onClick={addCustomExerciseFromProgram}>
                    <Plus size={15} /> Добавить
                  </button>
                </div>
              </div>
            )}

            <div className="selection-list">
              {filteredProgramExercises.length === 0 && <div className="picker-empty">Ничего не найдено</div>}
              {filteredProgramExercises.map(e => (
                <label key={e.id} className="selection-row">
                  <input
                    type="checkbox"
                    checked={programExerciseIds.includes(e.id)}
                    onChange={() => toggleProgramExercise(e.id)}
                  />
                  <span>{e.name}<small>{normalizeMuscle(e.muscle) || 'Без категории'} · {e.equipment}</small></span>
                </label>
              ))}
            </div>

            <button className="button button-primary full-width" onClick={addProgram}>
              <Save size={16} /> {editingProgramId ? 'Сохранить изменения' : 'Сохранить программу'}
            </button>
          </div>}

          {state.programs.length ? <div className="program-list">{state.programs.map(p => <article className="panel program-card" key={p.id}>
            <div className="program-icon"><BookOpen size={20} /></div>
            <div className="program-main">
              <h3>{p.name}</h3>
              <p>{p.exerciseIds.length} упражнений · создана {localDate(p.createdAt)}</p>
              {p.note && <div className="program-note">{p.note}</div>}
              <div className="program-exercises">{state.exercises.filter(e => p.exerciseIds.includes(e.id)).slice(0, 4).map(e => e.name).join(' · ')}</div>
              <div className="program-actions">
                <button className="button button-primary" onClick={() => startWorkout(p)}>Начать ↗</button>
                <button className="icon-button subtle" aria-label="Редактировать" onClick={() => startEditProgram(p)}><Pencil size={15} /></button>
                <button className="icon-button subtle" aria-label="Удалить" onClick={() => { if (window.confirm(`Удалить программу «${p.name}»?`)) setState(s => ({ ...s, programs: s.programs.filter(x => x.id !== p.id) })); }}><Trash2 size={15} /></button>
              </div>
            </div>
          </article>)}</div> : <Empty title="Программ пока нет" text="Создай шаблон. Он не изменит текущую тренировку, пока ты сам его не запустишь." />}
        </section>}

        {tab === 'programs' && programsView === 'library' && <section>
          <button className="back-link" onClick={() => setProgramsView('list')}>
            <ChevronLeft size={18} /> Программы
          </button>
          <h1>Библиотека.</h1>
          <p className="intro">Упражнения для тренировок и программ.</p>

          <div className="library-tabs">
            <button className={`library-tab ${libraryTab === 'browse' ? 'active' : ''}`} onClick={() => setLibraryTab('browse')}>
              <BookOpen size={20} /><span>Библиотека упражнений</span>
            </button>
            <button className={`library-tab ${libraryTab === 'add' ? 'active' : ''}`} onClick={() => setLibraryTab('add')}>
              <Plus size={20} /><span>Добавить своё</span>
            </button>
          </div>

          {libraryTab === 'browse' && (
            <div className="category-list">
              {state.exercises.length === 0 && <Empty title="Библиотека пуста" text="Добавь упражнения на вкладке «Добавить своё»." />}
              {orderedCategories.filter(cat => (groupedExercises[cat]?.length || 0) > 0 || (state.customCategories ?? []).includes(cat)).map(cat => {
                const exercises = groupedExercises[cat] || [];
                const expanded = expandedCategories[cat] ?? false;
                const userCat = isUserCategory(cat);
                return (
                  <div className="category-block" key={cat}>
                    <div className="category-header-wrap">
                      <button className="category-header" onClick={() => toggleCategory(cat)}>
                        <div>
                          <b>{cat}</b>
                          <small>{exercises.length} упражнений</small>
                        </div>
                        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                      {userCat && (
                        <div className="category-tools">
                          <button className="icon-button subtle" aria-label="Переименовать категорию" onClick={() => renameCategory(cat)}><Pencil size={14} /></button>
                          <button className="icon-button subtle" aria-label="Удалить категорию" onClick={() => deleteCategory(cat)}><Trash2 size={14} /></button>
                        </div>
                      )}
                    </div>
                    {expanded && <div className="category-exercises">
                      {exercises.map(e => {
                        const defaultEx = isDefaultExercise(e.id);
                        return (
                          <div className="library-row" key={e.id}>
                            <div>
                              <b>{e.name}</b>
                              <small>{e.equipment}{defaultEx ? ' · встроенное' : ''}</small>
                            </div>
                            <div className="library-row-actions">
                              {!defaultEx && (
                                <button className="icon-button subtle" aria-label={`Редактировать ${e.name}`} onClick={() => setEditingExercise({ ...e })}><Pencil size={14} /></button>
                              )}
                              {!defaultEx && (
                                <button className="icon-button subtle" aria-label={`Удалить ${e.name}`} onClick={() => deleteExercise(e)}><Trash2 size={14} /></button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {exercises.length === 0 && <div className="picker-empty">Категория пуста</div>}
                    </div>}
                  </div>
                );
              })}
            </div>
          )}

          {libraryTab === 'add' && (
            <div className="panel builder">
              <label className="field-label">Название упражнения
                <input className="field" value={exerciseName} onChange={e => setExerciseName(e.target.value)} placeholder="Например, Тяга к поясу" maxLength={60} />
              </label>
              <label className="field-label">Категория
                <CategorySelect
                  value={exerciseMuscle}
                  onChange={(v) => { setExerciseMuscle(v); if (v) ensureCategoryRegistered(v); }}
                  categories={allCategories}
                />
              </label>
              <button className="button button-primary full-width" onClick={addCustomExercise}><Plus size={16} /> Добавить в библиотеку</button>
            </div>
          )}
        </section>}

        {tab === 'history' && <section>
          <p className="eyebrow">ТВОЯ ДИНАМИКА</p>
          <h1>История.</h1>
          <p className="intro">Все завершённые тренировки и показатели, пересчитываемые из истории.</p>

          <div className="history-tabs">
            <button
              className={`library-tab ${historyView === 'list' ? 'active' : ''}`}
              onClick={() => setHistoryView('list')}
            >
              <BarChart3 size={20} /><span>Список</span>
            </button>
            <button
              className={`library-tab ${historyView === 'calendar' ? 'active' : ''}`}
              onClick={openCalendar}
            >
              <Calendar size={20} /><span>Календарь</span>
            </button>
          </div>

          {historyView === 'list' && (
            <>
              <div className="stats-grid">
                <Metric label="ТРЕНИРОВОК" value={String(state.workouts.length)} note="всего" />
                <Metric label="ОБЪЁМ" value={fmt(state.workouts.reduce((n, w) => n + volume(w), 0))} note="кг × повторы" />
                <Metric label="ВРЕМЯ" value={String(state.workouts.reduce((n, w) => n + durationMinutes(w.startedAt, w.endedAt), 0))} note="минут" />
                <Metric label="XP" value={String(xp)} note={`уровень ${level}`} />
              </div>
              {state.workouts.length ? <div className="history-list">{state.workouts.map(w => <article className="panel history-card" key={w.id}>
                <div className="history-top"><div><h3>{w.name}</h3><p>{localDate(w.endedAt)}, {localTime(w.startedAt)}–{localTime(w.endedAt)} · {formatDuration(w.startedAt, w.endedAt)}</p></div><button className="icon-button subtle" aria-label="Удалить тренировку" onClick={() => deleteWorkout(w.id)}><Trash2 size={16} /></button></div>
                <div className="history-metrics"><span><Dumbbell size={14} /> {w.exercises.length} упр.</span><span><Check size={14} /> {setCount(w)} подходов</span><span><Activity size={14} /> {fmt(volume(w))} кг</span><strong>+{w.earnedXp} XP</strong></div>
                <details><summary>Упражнения и подходы</summary>{w.exercises.map(e => {
                  const doneSets = e.sets.filter(s => s.done);
                  return (
                    <div className="history-exercise" key={e.id}>
                      <div className="history-exercise-title">
                        <b>{e.name}</b>
                        <button
                          className="chart-trigger"
                          aria-label="График прогресса"
                          onClick={() => setGraphExercise({ id: e.exerciseId, name: e.name })}
                        >
                          <TrendingUp size={14} />
                        </button>
                      </div>
                      {doneSets.length === 0 ? (
                        <span className="history-empty-note">Нет отмеченных подходов</span>
                      ) : (
                        <div className="history-sets-list">
                          {doneSets.map((s, idx) => (
                            <div key={s.id} className="history-set">
                              <span className="history-set-main">Подход {idx + 1}: {s.weight || 0} кг × {s.reps || 0}</span>
                              {s.note && s.note.trim() && (
                                <span className="history-set-note">{s.note}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}</details>
              </article>)}</div> : <Empty title="История пока пуста" text="Заверши первую тренировку. Она появится здесь вместе с деталями подходов." />}
              {state.workouts.length > 0 && (
                <button className="text-danger clear-history-bottom" onClick={clearHistory}>Очистить всю историю</button>
              )}
            </>
          )}

          {historyView === 'calendar' && (
            <>
              <div className="calendar-card">
                <div className="calendar-header">
                  <button className="calendar-nav" onClick={goToPrevMonth} aria-label="Предыдущий месяц">
                    <ChevronLeft size={20} />
                  </button>
                  <div className="calendar-month">{formatMonthYear(calendarDate)}</div>
                  <button className="calendar-nav" onClick={goToNextMonth} aria-label="Следующий месяц">
                    <ChevronRight size={20} />
                  </button>
                </div>

                <div className="calendar-weekdays">
                  {WEEKDAYS.map(d => <div key={d} className="calendar-weekday">{d}</div>)}
                </div>

                <div className="calendar-grid">
                  {calendarCells.map((date, i) => {
                    if (!date) return <div key={`empty-${i}`} className="calendar-day empty" />;
                    const key = dayKeyFromDate(date);
                    const isToday = key === todayKey;
                    const isSelected = key === selectedDay;
                    const hasWorkout = Boolean(workoutsByDay[key]?.length);
                    const isFuture = date.getTime() > Date.now() && !isToday;
                    const classes = [
                      'calendar-day',
                      isToday ? 'today' : '',
                      isSelected ? 'selected' : '',
                      hasWorkout ? 'has-workout' : '',
                      isFuture ? 'future' : ''
                    ].filter(Boolean).join(' ');
                    return (
                      <button
                        key={key}
                        className={classes}
                        onClick={() => selectDay(key)}
                        aria-label={`${date.getDate()} ${MONTH_NAMES[date.getMonth()]}${hasWorkout ? ', есть тренировка' : ''}`}
                      >
                        <span className="calendar-day-num">{date.getDate()}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="calendar-metrics">
                <div className="metric">
                  <span className="metric-label">ТРЕНИРОВОК</span>
                  <strong className="metric-value">{monthWorkouts.length}</strong>
                  <small className="metric-note">за месяц</small>
                </div>
                <div className="metric">
                  <span className="metric-label">ОБЪЁМ</span>
                  <strong className="metric-value">{fmt(monthVolume)}</strong>
                  <small className="metric-note">кг</small>
                </div>
                <div className="metric">
                  <span className="metric-label">XP</span>
                  <strong className="metric-value">{monthXp}</strong>
                  <small className="metric-note">за месяц</small>
                </div>
              </div>

              {selectedDay && (
                <div className="calendar-day-details">
                  <div className="calendar-day-title">
                    {new Date(selectedDay + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                    {selectedDay === todayKey && <span className="calendar-day-badge">сегодня</span>}
                  </div>
                  {(workoutsByDay[selectedDay]?.length || 0) === 0 ? (
                    <div className="calendar-day-empty">Нет тренировок в этот день</div>
                  ) : (
                    workoutsByDay[selectedDay].map(w => (
                      <div className="calendar-workout" key={w.id}>
                        <div className="calendar-workout-top">
                          <div>
                            <b>{w.name}</b>
                            <small>{localTime(w.startedAt)}–{localTime(w.endedAt)} · {formatDuration(w.startedAt, w.endedAt)}</small>
                          </div>
                          <button
                            className="icon-button subtle"
                            aria-label="Удалить тренировку"
                            onClick={() => deleteWorkout(w.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="calendar-workout-meta">
                          <span>{w.exercises.length} упр.</span>
                          <span>·</span>
                          <span>{setCount(w)} подходов</span>
                          <span>·</span>
                          <span>{fmt(volume(w))} кг</span>
                          <strong>+{w.earnedXp} XP</strong>
                        </div>
                        <button className="calendar-workout-repeat" onClick={() => startFromWorkout(w)}>
                          <RefreshCw size={14} /> Повторить
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {!selectedDay && (
                <div className="calendar-hint">Выбери день в календаре, чтобы увидеть тренировки.</div>
              )}

              <div className="muscle-stats">
                <div className="muscle-stats-title">Мышцы за 30 дней</div>
                {muscleStatsSorted.length === 0 ? (
                  <div className="muscle-stats-empty">Нет данных за последние 30 дней</div>
                ) : (
                  muscleStatsSorted.map(([cat, count]) => (
                    <div className="muscle-stat-row" key={cat}>
                      <div className="muscle-stat-label">{cat}</div>
                      <div className="muscle-stat-track">
                        <div
                          className="muscle-stat-fill"
                          style={{ width: `${(count / maxMuscleValue) * 100}%` }}
                        />
                      </div>
                      <div className="muscle-stat-count">{count}</div>
                    </div>
                  ))
                )}
              </div>

              {state.workouts.length > 0 && (
                <button className="text-danger clear-history-bottom" onClick={clearHistory}>Очистить всю историю</button>
              )}
            </>
          )}
        </section>}

        {tab === 'quest' && <section>
          <p className="eyebrow">ПРОГРЕСС И НАГРАДЫ</p>
          <h1>Награды.</h1>
          <p className="intro">Достижения открываются автоматически по мере тренировок.</p>

          <div className="quest-card">
            <div className="quest-icon"><Trophy size={28} /></div>
            <p className="eyebrow">ТВОЙ РАНГ</p>
            <h2>Уровень {level}</h2>
            <div className="xp-line"><span>{xp % 250} / 250 XP</span><span>{250 - xp % 250} до уровня</span></div>
            <div className="progress-track"><span style={{ width: `${(xp % 250) / 2.5}%` }} /></div>
            <p className="quest-note">{state.workouts.length === 0 ? 'Первая тренировка откроет путь.' : `Тренировок завершено: ${state.workouts.length}.`}</p>
          </div>

          <SectionTitle title="Достижения" />
          <div className="achievements-grid">
            {[
              { id: 'first', icon: Award, title: 'Первый шаг', desc: 'Заверши тренировку', unlocked: state.workouts.length >= 1 },
              { id: 'five', icon: Star, title: 'Пятёрка', desc: '5 тренировок', unlocked: state.workouts.length >= 5 },
              { id: 'ten', icon: Star, title: 'Десятка', desc: '10 тренировок', unlocked: state.workouts.length >= 10 },
              { id: 'twentyfive', icon: Trophy, title: 'Четверть сотни', desc: '25 тренировок', unlocked: state.workouts.length >= 25 },
              { id: 'fifty', icon: Trophy, title: 'Полтинник', desc: '50 тренировок', unlocked: state.workouts.length >= 50 },
              { id: 'streak3', icon: Zap, title: 'На волне', desc: 'Серия 3 дня', unlocked: streak >= 3 },
              { id: 'streak7', icon: Zap, title: 'Неделя силы', desc: 'Серия 7 дней', unlocked: streak >= 7 },
              { id: 'lvl5', icon: Target, title: 'Пятый уровень', desc: 'Достигни ур. 5', unlocked: level >= 5 },
              { id: 'lvl10', icon: Target, title: 'Десятый уровень', desc: 'Достигни ур. 10', unlocked: level >= 10 },
              { id: 'vol10k', icon: Dumbbell, title: 'Первая тонна', desc: '10 000 кг объёма', unlocked: state.workouts.reduce((n, w) => n + volume(w), 0) >= 10000 },
              { id: 'vol50k', icon: Dumbbell, title: 'Пять тонн', desc: '50 000 кг объёма', unlocked: state.workouts.reduce((n, w) => n + volume(w), 0) >= 50000 },
              { id: 'sets100', icon: Check, title: 'Сто подходов', desc: '100 выполненных подходов', unlocked: state.workouts.reduce((n, w) => n + setCount(w), 0) >= 100 }
            ].map(a => {
              const Icon = a.icon;
              return (
                <div key={a.id} className={`achievement ${a.unlocked ? 'unlocked' : 'locked'}`}>
                  <div className="achievement-icon"><Icon size={22} /></div>
                  <b>{a.title}</b>
                  <small>{a.desc}</small>
                </div>
              );
            })}
          </div>
        </section>}

        {tab === 'profile' && <section>
          <p className="eyebrow">ТВОИ ДАННЫЕ</p>
          <h1>Профиль.</h1>

                    <div className="profile-hero">
            <label className="profile-avatar profile-avatar-editable">
              {state.profile.avatar
                ? <img src={state.profile.avatar} alt="Аватар" />
                : (state.profile.name.trim()[0] || 'А').toLocaleUpperCase('ru-RU')}
              <span className="profile-avatar-badge"><Camera size={12} /></span>
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={e => {
                  handleAvatarUpload(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            <div className="profile-hero-info">
              <b>{state.profile.name || 'Атлет'}</b>
              <small>{state.profile.bodyWeight ? `${state.profile.bodyWeight} кг` : 'Вес не указан'}</small>
              {state.profile.avatar && (
                <button className="profile-avatar-remove" onClick={removeAvatar}>Удалить фото</button>
              )}
            </div>
          </div>

          <div className="settings-section">
            <p className="settings-header">Личные данные</p>
            <div className="settings-group">
              <label className="settings-row-input">
                <span>Имя</span>
                <input
                  className="settings-input"
                  value={state.profile.name}
                  onChange={e => updateProfile(e.target.value, state.profile.bodyWeight)}
                  onBlur={() => updateProfile(state.profile.name.trim() || 'Атлет', state.profile.bodyWeight)}
                  maxLength={40}
                />
              </label>
              <label className="settings-row-input">
                <span>Вес (кг)</span>
                <input
                  className="settings-input"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={state.profile.bodyWeight}
                  onChange={e => updateProfile(state.profile.name, e.target.value)}
                  placeholder="—"
                />
              </label>
            </div>
          </div>
                    <div className="settings-section">
            <p className="settings-header">Цели на главной</p>
            <div className="settings-group">
              <div className="ring-setting">
                <div className="ring-setting-color" style={{ background: '#ff6482' }} />
                <div className="ring-setting-body">
                  <select
                    className="ring-setting-select"
                    value={state.settings.ring1.metric}
                    onChange={e => updateRingMetric('ring1', e.target.value as RingMetric)}
                  >
                    {RING_METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                  <div className="ring-setting-goal">
                    <span>Цель:</span>
                    <input
                      type="number"
                      className="ring-setting-input"
                      value={state.settings.ring1.goal}
                      onChange={e => updateRingGoal('ring1', Number(e.target.value))}
                      min={1}
                    />
                    <span className="ring-setting-unit">{ring1Info.unit}</span>
                  </div>
                </div>
              </div>
              <div className="ring-setting">
                <div className="ring-setting-color" style={{ background: '#d0f477' }} />
                <div className="ring-setting-body">
                  <select
                    className="ring-setting-select"
                    value={state.settings.ring2.metric}
                    onChange={e => updateRingMetric('ring2', e.target.value as RingMetric)}
                  >
                    {RING_METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                  <div className="ring-setting-goal">
                    <span>Цель:</span>
                    <input
                      type="number"
                      className="ring-setting-input"
                      value={state.settings.ring2.goal}
                      onChange={e => updateRingGoal('ring2', Number(e.target.value))}
                      min={1}
                    />
                    <span className="ring-setting-unit">{ring2Info.unit}</span>
                  </div>
                </div>
              </div>
            </div>
            <p className="sync-hint" style={{ marginTop: 8 }}>Третье кольцо — уровень, оно не настраивается.</p>
          </div>

          <div className="settings-section">
            <p className="settings-header">Аккаунт</p>
            <div className="settings-group">
              <div className="setting-row">
                <div className="setting-icon">
                  {isRegistered ? <ShieldCheck size={17} /> : <CircleUserRound size={17} />}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <b>
                    {isRegistered ? (user?.email || 'Аккаунт создан') : 'Не привязан'}
                  </b>
                  <small>
                    {isRegistered
                      ? 'Данные сохраняются в облако'
                      : 'Прогресс только на этом устройстве'}
                  </small>
                </div>
                <span className={`status-dot ${isRegistered ? 'status-active' : 'status-pending'}`} />
              </div>

              {!isRegistered && (
                <>
                  <button className="settings-action" onClick={() => openEmailAuth('signup')}>
                    <Cloud size={17} />
                    <span><b>Создать аккаунт</b><small>Email и пароль — чтобы прогресс не потерялся</small></span>
                  </button>
                  <button className="settings-action" onClick={() => openEmailAuth('signin')}>
                    <RefreshCw size={17} />
                    <span><b>Войти в существующий</b><small>Если уже создавал аккаунт на другом устройстве</small></span>
                  </button>
                </>
              )}

              {isRegistered && (
                <>
                  <button className="settings-action" onClick={() => openEmailAuth('reset')}>
                    <Save size={17} />
                    <span><b>Сбросить пароль</b><small>Письмо на {user?.email || 'твой email'}</small></span>
                  </button>
                  <button className="settings-action" onClick={handleLogout}>
                    <X size={17} />
                    <span><b>Выйти из аккаунта</b><small>Прогресс останется в облаке</small></span>
                  </button>
                </>
              )}
            </div>

            {!isRegistered && (
              <div className="sync-warning">
                <p>Без аккаунта прогресс хранится только на этом устройстве. Удалишь приложение — данные пропадут.</p>
              </div>
            )}
          </div>

          <div className="settings-section">
            <p className="settings-header">Синхронизация</p>
            <div className="settings-group">
              <div className="setting-row">
                <div className="setting-icon"><ShieldCheck size={17} /></div>
                <div>
                  <b>Локальное сохранение</b>
                  <small>Автосохранение после каждого действия</small>
                </div>
                <span className="status-dot status-active" title="Активно" />
              </div>

              {firebaseConfigured ? (
                <div className="setting-row">
                  <div className="setting-icon"><Cloud size={17} /></div>
                  <div>
                    <b>Облачная синхронизация</b>
                    <small>
                      {!isRegistered
                        ? 'Только на этом устройстве'
                        : `Через аккаунт ${user?.email || ''}`}
                    </small>
                    {isRegistered && (
                      <small className="sync-time">
                        {isSyncing
                          ? 'Синхронизация…'
                          : lastSyncedAt
                            ? `Сохранено: ${formatSyncTime(lastSyncedAt)}`
                            : 'Ещё не синхронизировано'}
                      </small>
                    )}
                    {syncError && <small className="sync-error">Ошибка: {syncError}</small>}
                  </div>
                  <span className={`status-dot ${isSyncing ? 'status-pending' : isRegistered ? 'status-active' : ''}`} />
                </div>
              ) : (
                <div className="setting-row">
                  <div className="setting-icon"><Cloud size={17} /></div>
                  <div>
                    <b>Облачная синхронизация</b>
                    <small>Firebase не настроен.</small>
                  </div>
                  <span className="status-dot" />
                </div>
              )}
            </div>

            {isRegistered && (
              <>
                <p className="sync-hint">Изменения отправляются в облако через 2 секунды после действия.</p>
                <button className="button button-secondary full-width" onClick={forceSync} disabled={isSyncing} style={{ marginTop: 8 }}>
                  <Cloud size={17} /> {isSyncing ? 'Синхронизация…' : 'Синхронизировать сейчас'}
                </button>
              </>
            )}
          </div>

          <div className="settings-section">
            <p className="settings-header">Резервные копии</p>
            <div className="settings-group">
              <button className="settings-action" onClick={exportData}>
                <FileDown size={17} />
                <span><b>Экспортировать JSON</b><small>Копия всех данных на диск</small></span>
              </button>
              <label className="settings-action">
                <Save size={17} />
                <span><b>Импортировать JSON</b><small>Восстановить из файла</small></span>
                <input type="file" accept=".json,application/json" hidden onChange={e => importData(e.target.files?.[0])} />
              </label>
            </div>
          </div>

          <div className="notice">Резервная копия JSON — независимая страховка. Облако синхронизирует автоматически, но локальный файл можно открыть и восстановить без интернета.</div>
        </section>}
      </main>

      <nav className="tabbar" aria-label="Основная навигация">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = tab === item.id;
          return <button
            key={item.id}
            className={`tab ${isActive ? 'active' : ''}`}
            onClick={() => {
              if (item.id === 'programs' && tab === 'programs' && programsView === 'library') {
                setProgramsView('list');
                setLibraryTab('browse');
                return;
              }
              setTab(item.id);
            }}
          >
            <Icon size={19} strokeWidth={isActive ? 2.4 : 1.8} /><span>{item.label}</span>
          </button>;
        })}
      </nav>

      {pickerOpen && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setPickerOpen(false); }}>
        <section className="picker-modal" role="dialog" aria-modal="true" aria-labelledby="picker-title">
          <div className="modal-head"><div><p className="eyebrow">БИБЛИОТЕКА</p><h2 id="picker-title">Добавить упражнение</h2></div><button className="icon-button" onClick={() => setPickerOpen(false)} aria-label="Закрыть"><X size={20} /></button></div>
          <input className="field" autoFocus placeholder="Поиск или новое название" value={pickerQuery} onChange={e => setPickerQuery(e.target.value)} />
          {pickerQuery.trim() && !filteredExercises.some(e => e.name.toLowerCase() === pickerQuery.toLowerCase().trim()) && (
            <div className="picker-add-custom">
              <p className="picker-add-label">Нет в библиотеке? Добавить «{pickerQuery.trim()}»</p>
              <CategorySelect
                value={pickerNewCategory}
                onChange={(v) => { setPickerNewCategory(v); if (v) ensureCategoryRegistered(v); }}
                categories={allCategories}
              />
              <button className="picker-add-button" onClick={() => addCustomInPicker(pickerQuery)}><Plus size={16} /> Добавить</button>
            </div>
          )}
          <div className="picker-list">{filteredExercises.map(e => <button key={e.id} className="picker-row" onClick={() => addExerciseToWorkout(e)}><span><b>{e.name}</b><small>{normalizeMuscle(e.muscle) || 'Без категории'} · {e.equipment}</small></span><Plus size={18} /></button>)}{filteredExercises.length === 0 && <Empty title="Ничего не найдено" text="Введи название — можно добавить как своё упражнение." />}</div>
        </section>
      </div>}

      {historyPickerOpen && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setHistoryPickerOpen(false); }}>
        <section className="picker-modal" role="dialog" aria-modal="true" aria-labelledby="history-title">
          <div className="modal-head">
            <div>
              <p className="eyebrow">ИСТОРИЯ</p>
              <h2 id="history-title">Повторить тренировку</h2>
            </div>
            <button className="icon-button" onClick={() => setHistoryPickerOpen(false)} aria-label="Закрыть">
              <X size={20} />
            </button>
          </div>
          <p className="picker-hint">Упражнения и веса скопируются. Галочки и заметки — нет.</p>
          <div className="picker-list">
            {state.workouts.length === 0 && <Empty title="История пуста" text="Заверши тренировку, чтобы она появилась здесь." />}
            {state.workouts.map(w => (
              <button key={w.id} className="picker-row" onClick={() => { setHistoryPickerOpen(false); startFromWorkout(w); }}>
                <span>
                  <b>{w.name}</b>
                  <small>{localDate(w.endedAt)} · {w.exercises.length} упр. · {setCount(w)} подходов</small>
                </span>
                <RefreshCw size={16} />
              </button>
            ))}
          </div>
        </section>
      </div>}

      {editingExercise && (
        <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setEditingExercise(null); }}>
          <section className="picker-modal" role="dialog" aria-modal="true" aria-labelledby="edit-ex-title">
            <div className="modal-head">
              <div>
                <p className="eyebrow">РЕДАКТИРОВАНИЕ</p>
                <h2 id="edit-ex-title">Упражнение</h2>
              </div>
              <button className="icon-button" onClick={() => setEditingExercise(null)} aria-label="Закрыть">
                <X size={20} />
              </button>
            </div>
            <label className="field-label">Название
              <input
                className="field"
                value={editingExercise.name}
                onChange={e => setEditingExercise({ ...editingExercise, name: e.target.value })}
                maxLength={80}
              />
            </label>
            <label className="field-label">Категория
              <CategorySelect
                value={editingExercise.muscle}
                onChange={(v) => { setEditingExercise({ ...editingExercise, muscle: v }); if (v) ensureCategoryRegistered(v); }}
                categories={allCategories}
              />
            </label>
            <button className="button button-primary full-width" onClick={saveEditedExercise}>
              <Save size={16} /> Сохранить
            </button>
          </section>
        </div>
      )}

      {graphExercise && (
        <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setGraphExercise(null); }}>
          <section className="picker-modal" role="dialog" aria-modal="true" aria-labelledby="graph-title">
            <div className="modal-head">
              <div>
                <p className="eyebrow">ПРОГРЕСС</p>
                <h2 id="graph-title">{graphExercise.name}</h2>
              </div>
              <button className="icon-button" onClick={() => setGraphExercise(null)} aria-label="Закрыть">
                <X size={20} />
              </button>
            </div>
            <ProgressChart points={getExerciseProgress(graphExercise.id)} />
            <p className="chart-caption">Объём = вес × повторы за все выполненные подходы. Последние 12 тренировок.</p>
          </section>
        </div>
      )}

      {emailAuthOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !emailAuthLoading) setEmailAuthOpen(false); }}>
          <section className="picker-modal" role="dialog" aria-modal="true" aria-labelledby="email-auth-title">
            <div className="modal-head">
              <div>
                <p className="eyebrow">АККАУНТ</p>
                <h2 id="email-auth-title">
                  {emailAuthMode === 'signup' ? 'Создать аккаунт' : emailAuthMode === 'signin' ? 'Войти' : 'Сбросить пароль'}
                </h2>
              </div>
              <button className="icon-button" onClick={() => setEmailAuthOpen(false)} aria-label="Закрыть" disabled={emailAuthLoading}>
                <X size={20} />
              </button>
            </div>

            <p className="picker-hint">
              {emailAuthMode === 'signup' && 'Привяжем email к текущему прогрессу. Дальше сможешь войти с другого устройства или после переустановки.'}
              {emailAuthMode === 'signin' && 'Введи email и пароль. Текущие данные на этом устройстве заменятся данными из облака.'}
              {emailAuthMode === 'reset' && 'Отправим ссылку для сброса пароля на email.'}
            </p>

            <input
              className="field"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="Email"
              value={emailValue}
              onChange={e => setEmailValue(e.target.value)}
              autoFocus
              disabled={emailAuthLoading}
            />

            {emailAuthMode !== 'reset' && (
              <input
                className="field"
                type="password"
                autoComplete={emailAuthMode === 'signup' ? 'new-password' : 'current-password'}
                placeholder={emailAuthMode === 'signup' ? 'Пароль (минимум 6 символов)' : 'Пароль'}
                value={passwordValue}
                onChange={e => setPasswordValue(e.target.value)}
                disabled={emailAuthLoading}
              />
            )}

            {emailAuthError && <div className="email-auth-error">{emailAuthError}</div>}

            <button
              className="button button-primary full-width"
              onClick={handleEmailAuth}
              disabled={emailAuthLoading || !emailValue.trim() || (emailAuthMode !== 'reset' && !passwordValue)}
            >
              {emailAuthLoading
                ? 'Подожди…'
                : emailAuthMode === 'signup' ? 'Создать аккаунт'
                : emailAuthMode === 'signin' ? 'Войти'
                : 'Отправить письмо'}
            </button>

            {emailAuthMode === 'signup' && (
              <button className="text-link" onClick={() => openEmailAuth('signin')}>
                Уже есть аккаунт? Войти
              </button>
            )}
            {emailAuthMode === 'signin' && (
              <>
                <button className="text-link" onClick={() => openEmailAuth('signup')}>
                  Нет аккаунта? Создать
                </button>
                <button className="text-link" onClick={() => openEmailAuth('reset')}>
                  Забыли пароль?
                </button>
              </>
            )}
            {emailAuthMode === 'reset' && (
              <button className="text-link" onClick={() => openEmailAuth('signin')}>
                ← Назад к входу
              </button>
            )}
          </section>
        </div>
      )}

      {finishing && <div className="finish-flash" />}
      {xpPop !== null && (
        <div className="xp-pop" role="status">
          +{xpPop} XP
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function CategorySelect({
  value,
  onChange,
  categories
}: {
  value: string;
  onChange: (v: string) => void;
  categories: string[];
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  if (creating) {
    return (
      <div className="category-create">
        <input
          className="field"
          autoFocus
          placeholder="Название новой категории"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          maxLength={40}
        />
        <div className="category-create-actions">
          <button className="button button-secondary" onClick={() => { setCreating(false); setNewName(''); }}>Отмена</button>
          <button className="button button-primary" onClick={() => {
            const v = newName.trim();
            if (!v) return;
            onChange(v);
            setCreating(false);
            setNewName('');
          }}>Создать</button>
        </div>
      </div>
    );
  }

  return (
    <select
      className="field"
      value={value}
      onChange={e => {
        if (e.target.value === '__new__') {
          setCreating(true);
        } else {
          onChange(e.target.value);
        }
      }}
    >
      <option value="">Без категории</option>
      {categories.map(c => <option key={c} value={c}>{c}</option>)}
      <option value="__new__">+ Создать категорию</option>
    </select>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}
function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <div className="section-heading"><h2>{title}</h2>{action && <button className="text-link" onClick={onAction}>{action} ↗</button>}</div>;
}
function Empty({ title, text }: { title: string; text: string }) {
  return <div className="empty"><span className="empty-mark"><Dumbbell size={21} /></span><b>{title}</b><p>{text}</p></div>;
}
function WorkoutRow({ workout, onDelete }: { workout: Workout; onDelete: () => void }) {
  return <div className="workout-row"><div className="row-mark"><Check size={17} /></div><div className="row-content"><b>{workout.name}</b><small>{localDate(workout.endedAt)} · {workout.exercises.length} упражнений</small></div><strong>+{workout.earnedXp} XP</strong><button className="icon-button subtle" aria-label="Удалить тренировку" onClick={onDelete}><Trash2 size={15} /></button></div>;
}
function ActivityRings({ rings }: { rings: { percent: number; color: string }[] }) {
  const stroke = 13;
  const gap = 5;
  return (
    <svg viewBox="0 0 200 200" className="rings-svg" aria-hidden="true">
      {rings.map((ring, i) => {
        const r = 82 - i * (stroke + gap);
        const c = 2 * Math.PI * r;
        const pct = Math.max(0, Math.min(1, ring.percent || 0));
        return (
          <g key={i}>
            <circle cx="100" cy="100" r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={stroke} />
            <circle cx="100" cy="100" r={r} fill="none" stroke={ring.color} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
              transform="rotate(-90 100 100)" style={{ transition: 'stroke-dashoffset .6s ease' }} />
          </g>
        );
      })}
    </svg>
  );
}
function ProgressChart({ points }: { points: { date: number; value: number }[] }) {
  if (points.length < 2) {
    return <Empty title="Мало данных" text="Нужно минимум 2 тренировки с этим упражнением, чтобы построить график." />;
  }
  const W = 300;
  const H = 140;
  const pad = { top: 16, right: 16, bottom: 28, left: 44 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const values = points.map(p => p.value);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = Math.max(1, maxV - minV);
  const xStep = innerW / (points.length - 1);
  const coords = points.map((p, i) => ({
    x: pad.left + i * xStep,
    y: pad.top + innerH - ((p.value - minV) / range) * innerH,
    value: p.value,
    date: p.date
  }));
  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L${coords[coords.length - 1].x.toFixed(1)},${(pad.top + innerH).toFixed(1)} L${coords[0].x.toFixed(1)},${(pad.top + innerH).toFixed(1)} Z`;
  const fmtShort = (ts: number) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(ts);

  return (
    <div className="progress-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="progress-chart" aria-hidden="true">
        <text x={pad.left - 6} y={pad.top + 4} textAnchor="end" className="chart-label">{Math.round(maxV).toLocaleString('ru-RU')}</text>
        <text x={pad.left - 6} y={pad.top + innerH} textAnchor="end" className="chart-label">{Math.round(minV).toLocaleString('ru-RU')}</text>
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + innerH} stroke="rgba(255,255,255,.08)" />
        <line x1={pad.left} y1={pad.top + innerH} x2={pad.left + innerW} y2={pad.top + innerH} stroke="rgba(255,255,255,.08)" />
        <line x1={pad.left} y1={pad.top + innerH / 2} x2={pad.left + innerW} y2={pad.top + innerH / 2} stroke="rgba(255,255,255,.05)" strokeDasharray="2 4" />
        <path d={areaD} fill="rgba(208,244,119,.09)" />
        <path d={pathD} fill="none" stroke="var(--lime)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((c, i) => <circle key={i} cx={c.x} cy={c.y} r={3} fill="var(--lime)" />)}
        <text x={coords[0].x} y={H - 8} textAnchor="start" className="chart-label">{fmtShort(coords[0].date)}</text>
        <text x={coords[coords.length - 1].x} y={H - 8} textAnchor="end" className="chart-label">{fmtShort(coords[coords.length - 1].date)}</text>
      </svg>
    </div>
  );
}
