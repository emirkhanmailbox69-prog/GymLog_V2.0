import { useEffect, useMemo, useState } from 'react';
import {
  Activity, Award, BarChart3, BookOpen, Calendar, Camera, Check, ChevronDown, ChevronLeft, ChevronRight,
  ChevronUp, CircleUserRound, Cloud, Clock3, Copy, Crown, Dumbbell, FileDown, Flame, History, Home, MessageSquare,
  Moon, Pencil, Plus, RefreshCw, Save, ShieldCheck, Star, Target, Trash2, TrendingUp, Trophy, X, Zap
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { ActiveWorkout, AppState, Exercise, Program, ProgramDay, ProgramExercise, ProgramGoal, ProgramSetTemplate, PublicProfile, RingMetric, SetEntry, Tab, Workout, WorkoutExercise } from './types';
import { loadState, saveState, downloadBackup, ensureState } from './storage';
import { starterExercises } from './data';
import {
  firebaseConfigured, subscribeToAuth, ensureAnonymousAuth,
  logOut, linkWithEmail, signInWithEmail, resetPassword,
  updatePublicProfile, removePublicProfile, fetchLeaderboard
} from './firebase';
import { useCloudSync } from './hooks/useCloudSync';
import { ImageCropper } from './components/ImageCropper';

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

const getLevelInfo = (totalXp: number) => {
  let level = 1;
  let xpForNext = 250;
  let remainingXp = totalXp;
  const MAX_LEVEL = 70;

  while (remainingXp >= xpForNext && level < MAX_LEVEL) {
    remainingXp -= xpForNext;
    level++;
    xpForNext += 100;
  }

  if (level >= MAX_LEVEL) {
    return { level: MAX_LEVEL, currentXp: 1, nextLevelXp: 1, rank: 'Титан', isMax: true };
  }

  let rank = 'Новичок';
  if (level >= 60) rank = 'Полубог';
  else if (level >= 50) rank = 'Мифический воин';
  else if (level >= 40) rank = 'Легенда';
  else if (level >= 30) rank = 'Терминатор';
  else if (level >= 20) rank = 'Зверь';
  else if (level >= 15) rank = 'Силач';
  else if (level >= 10) rank = 'Атлет';
  else if (level >= 5) rank = 'Любитель';

  return { level, currentXp: remainingXp, nextLevelXp: xpForNext, rank, isMax: false };
};

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

const getStartOfWeek = (d: Date) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};
const getStartOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1).getTime();
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
  { id: 'workouts_week', label: 'Тренировки за неделю', shortLabel: 'Тренировки', unit: 'трен.', defaultGoal: 3 },
  { id: 'sets_week', label: 'Подходы за неделю', shortLabel: 'Подходы', unit: 'подх.', defaultGoal: 50 },
  { id: 'volume_week', label: 'Объём за неделю', shortLabel: 'Объём', unit: 'кг', defaultGoal: 10000 },
  { id: 'minutes_week', label: 'Время за неделю', shortLabel: 'Время', unit: 'мин', defaultGoal: 180 },
  { id: 'xp_week', label: 'XP за неделю', shortLabel: 'XP', unit: 'XP', defaultGoal: 300 },
  { id: 'workouts_month', label: 'Тренировки за месяц', shortLabel: 'Тренировки', unit: 'трен.', defaultGoal: 12 },
  { id: 'sets_month', label: 'Подходы за месяц', shortLabel: 'Подходы', unit: 'подх.', defaultGoal: 150 },
  { id: 'volume_month', label: 'Объём за месяц', shortLabel: 'Объём', unit: 'кг', defaultGoal: 40000 },
  { id: 'streak', label: 'Серия дней подряд', shortLabel: 'Серия', unit: 'дн.', defaultGoal: 7 }
];

const getRingMetricInfo = (id: RingMetric) => RING_METRICS.find(m => m.id === id) || RING_METRICS[0];
const DEFAULT_EXERCISE_IDS = new Set(starterExercises.map(e => e.id));
const isDefaultExercise = (id: string) => DEFAULT_EXERCISE_IDS.has(id);
const isValidWorkout = (w: Workout) => (w.endedAt - w.startedAt) >= 30 * 60 * 1000;

type PickerTarget = { type: 'workout' } | { type: 'programDay'; dayId: string };

export default function App() {
  const [state, setState] = useState<AppState>(() => ensureState(loadState()));
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [toast, setToast] = useState('');

  // Тренировка
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerNewCategory, setPickerNewCategory] = useState(DEFAULT_CATEGORIES[0]);
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(() => Date.now());
  const [historyPickerOpen, setHistoryPickerOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [xpPop, setXpPop] = useState<number | null>(null);
  const [graphExercise, setGraphExercise] = useState<{ id: string; name: string } | null>(null);
  const [tempImage, setTempImage] = useState<string | null>(null);

  // GymQuest
  const [questView, setQuestView] = useState<'achievements' | 'leaderboard'>('achievements');
  const [leaderboardMetric, setLeaderboardMetric] = useState<'totalXp' | 'weeklyVolume' | 'streak'>('totalXp');
  const [leaderboardData, setLeaderboardData] = useState<PublicProfile[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

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
  const [programGoal, setProgramGoal] = useState<ProgramGoal | ''>('');
  const [programDays, setProgramDays] = useState<ProgramDay[]>([]);
  const [programPickerOpen, setProgramPickerOpen] = useState<Program | null>(null);
  
  // Библиотека
  const [exerciseName, setExerciseName] = useState('');
  const [exerciseMuscle, setExerciseMuscle] = useState(DEFAULT_CATEGORIES[0]);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);

  // Профиль
  const [profileView, setProfileView] = useState<'main' | 'instructions'>('main');
  const [emailAuthOpen, setEmailAuthOpen] = useState(false);
  const [emailAuthMode, setEmailAuthMode] = useState<'signup' | 'signin' | 'reset'>('signup');
  const [emailValue, setEmailValue] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
  const [emailAuthLoading, setEmailAuthLoading] = useState(false);
  const [emailAuthError, setEmailAuthError] = useState<string | null>(null);

  const pickerOpen = pickerTarget !== null;

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

  const filteredExercises = useMemo(() => state.exercises.filter(e => 
    `${e.name} ${e.muscle} ${e.equipment}`.toLocaleLowerCase('ru-RU').includes(pickerQuery.toLocaleLowerCase('ru-RU'))
  ), [state.exercises, pickerQuery]);

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

  const orderedCategories = useMemo(() => {
    const result: string[] = [];
    const seen = new Set<string>();
    for (const c of DEFAULT_CATEGORIES) { result.push(c); seen.add(c); }
    for (const c of (state.customCategories ?? [])) { if (!seen.has(c)) { result.push(c); seen.add(c); } }
    for (const c of Object.keys(groupedExercises)) { if (!seen.has(c)) { result.push(c); seen.add(c); } }
    return result;
  }, [state.customCategories, groupedExercises]);

  useEffect(() => {
    if (!saveState(state)) notify('Не удалось сохранить локально. Экспортируй резервную копию.');
  }, [state]);

  useEffect(() => {
    let authResolved = false;
    const unsubscribe = subscribeToAuth((u) => {
      if (!authResolved) {
        authResolved = true;
        if (!u) ensureAnonymousAuth().catch(err => console.error('Auth error:', err));
      }
      setUser(u);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
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

  // Эффект обновления публичного профиля
  useEffect(() => {
    if (!user || !state.settings.showInLeaderboard) return;
    
    const xp = totalXp(state.workouts);
    const lvlInfo = getLevelInfo(xp);
    const currentWeekStart = getStartOfWeek(new Date());
    const currentWeekWorkouts = state.workouts.filter(w => w.endedAt >= currentWeekStart && isValidWorkout(w));
    const weeklyVolume = currentWeekWorkouts.reduce((n, w) => n + volume(w), 0);
    
    const validDays = new Set(state.workouts.filter(isValidWorkout).map(w => new Date(w.endedAt).toDateString()));
    let streak = 0;
    if (validDays.size > 0) {
      const d = new Date();
      if (!validDays.has(d.toDateString())) d.setDate(d.getDate() - 1);
      while (validDays.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1); }
    }

    const publicData: PublicProfile = {
      uid: user.uid,
      displayName: state.profile.name || 'Атлет',
      avatar: state.profile.avatar,
      totalXp: xp,
      level: lvlInfo.level,
      rank: lvlInfo.rank,
      weeklyVolume,
      streak,
      updatedAt: Date.now()
    };

    const timer = setTimeout(() => {
      updatePublicProfile(publicData).catch(err => console.error('Leaderboard update failed:', err));
    }, 3000);
    return () => clearTimeout(timer);
  }, [user, state.settings.showInLeaderboard, state.workouts, state.profile.name, state.profile.avatar]);

  // Эффект загрузки лидерборда
  useEffect(() => {
    if (tab !== 'quest' || questView !== 'leaderboard') return;
    let isMounted = true;
    setLeaderboardLoading(true);
    
    fetchLeaderboard(leaderboardMetric)
      .then(data => { if (isMounted) setLeaderboardData(data); })
      .catch(err => console.error(err))
      .finally(() => { if (isMounted) setLeaderboardLoading(false); });

    return () => { isMounted = false; };
  }, [tab, questView, leaderboardMetric]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  }

  async function toggleLeaderboardParticipation() {
    if (!user) return;
    const newVal = !state.settings.showInLeaderboard;
    setState(s => ({ ...s, settings: { ...s.settings, showInLeaderboard: newVal } }));
    
    if (newVal) {
      const xp = totalXp(state.workouts);
      const lvlInfo = getLevelInfo(xp);
      const currentWeekStart = getStartOfWeek(new Date());
      const currentWeekWorkouts = state.workouts.filter(w => w.endedAt >= currentWeekStart && isValidWorkout(w));
      const weeklyVolume = currentWeekWorkouts.reduce((n, w) => n + volume(w), 0);
      const validDays = new Set(state.workouts.filter(isValidWorkout).map(w => new Date(w.endedAt).toDateString()));
      let streak = 0;
      if (validDays.size > 0) {
        const d = new Date();
        if (!validDays.has(d.toDateString())) d.setDate(d.getDate() - 1);
        while (validDays.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1); }
      }
      try {
        await updatePublicProfile({
          uid: user.uid,
          displayName: state.profile.name || 'Атлет',
          avatar: state.profile.avatar,
          totalXp: xp, level: lvlInfo.level, rank: lvlInfo.rank,
          weeklyVolume, streak, updatedAt: Date.now()
        });
        notify('Вы в общем рейтинге!');
      } catch { notify('Ошибка обновления рейтинга.'); }
    } else {
      try {
        await removePublicProfile(user.uid);
        notify('Вы убраны из рейтинга.');
      } catch { notify('Ошибка удаления из рейтинга.'); }
    }
  }

  const xp = totalXp(state.workouts);
  const levelInfo = getLevelInfo(xp);
  const level = levelInfo.level;
  const currentWorkout = state.activeWorkout;

  const currentWeekStart = getStartOfWeek(new Date());
  const currentMonthStart = getStartOfMonth(new Date());

  const currentWeekWorkouts = state.workouts.filter(w => w.endedAt >= currentWeekStart);
  const currentMonthWorkouts = state.workouts.filter(w => w.endedAt >= currentMonthStart);

  const validWeekWorkouts = currentWeekWorkouts.filter(isValidWorkout);
  const validMonthWorkouts = currentMonthWorkouts.filter(isValidWorkout);

  const weeklySets = validWeekWorkouts.reduce((n, w) => n + setCount(w), 0);
  const weeklyVolume = validWeekWorkouts.reduce((n, w) => n + volume(w), 0);
  const weeklyMinutes = validWeekWorkouts.reduce((n, w) => n + durationMinutes(w.startedAt, w.endedAt), 0);
  const weeklyXp = validWeekWorkouts.reduce((n, w) => n + w.earnedXp, 0);

  const monthlySets = validMonthWorkouts.reduce((n, w) => n + setCount(w), 0);
  const monthlyVolume = validMonthWorkouts.reduce((n, w) => n + volume(w), 0);

  const streak = (() => {
    const validDays = new Set(state.workouts.filter(isValidWorkout).map(w => new Date(w.endedAt).toDateString()));
    if (validDays.size === 0) return 0;
    let s = 0;
    const d = new Date();
    if (!validDays.has(d.toDateString())) d.setDate(d.getDate() - 1);
    while (validDays.has(d.toDateString())) { s++; d.setDate(d.getDate() - 1); }
    return s;
  })();

  function getRingMetricValue(metric: RingMetric): number {
    switch (metric) {
      case 'workouts_week': return validWeekWorkouts.length;
      case 'sets_week': return weeklySets;
      case 'volume_week': return weeklyVolume;
      case 'minutes_week': return weeklyMinutes;
      case 'xp_week': return weeklyXp;
      case 'workouts_month': return validMonthWorkouts.length;
      case 'sets_month': return monthlySets;
      case 'volume_month': return monthlyVolume;
      case 'streak': return streak;
    }
  }

  function updateRingMetric(which: 'ring1' | 'ring2', metric: RingMetric) {
    const info = getRingMetricInfo(metric);
    setState(s => ({ ...s, settings: { ...s.settings, [which]: { metric, goal: info.defaultGoal } } }));
  }

  function updateRingGoal(which: 'ring1' | 'ring2', goal: number) {
    setState(s => ({ ...s, settings: { ...s.settings, [which]: { ...s.settings[which], goal: Math.max(1, goal || 1) } } }));
  }

  const ring1Info = getRingMetricInfo(state.settings.ring1.metric);
  const ring2Info = getRingMetricInfo(state.settings.ring2.metric);
  const ring1Value = getRingMetricValue(state.settings.ring1.metric);
  const ring2Value = getRingMetricValue(state.settings.ring2.metric);

  const isRing1Closed = ring1Value >= state.settings.ring1.goal;
  const isRing2Closed = ring2Value >= state.settings.ring2.goal;
  const isLevelGlowing = !levelInfo.isMax && (levelInfo.currentXp / levelInfo.nextLevelXp) >= 0.9;

  useEffect(() => {
    const newAch: Record<string, number> = {};
    let hasNew = false;
    const ts = Date.now();

    const check = (id: string, condition: boolean) => {
      if (condition && !state.unlockedAchievements[id]) {
        newAch[id] = ts;
        hasNew = true;
      }
    };

    const totalVol = state.workouts.reduce((n, w) => n + volume(w), 0);
    const totalSets = state.workouts.reduce((n, w) => n + setCount(w), 0);
    const isPerfectWeek = validWeekWorkouts.length >= 3; 
    
    check('first', state.workouts.length >= 1);
    check('five', state.workouts.length >= 5);
    check('ten', state.workouts.length >= 10);
    check('streak3', streak >= 3);
    check('streak7', streak >= 7);
    check('perfect_week', isPerfectWeek);
    check('marathon', validMonthWorkouts.length >= 10);
    check('vol10k', totalVol >= 10000);
    check('vol50k', totalVol >= 50000);
    check('sets100', totalSets >= 100);
    check('iron_streak', streak >= 5);
    
    check('centurion', state.workouts.length >= 50);
    check('programmer', state.programs.length >= 5);
    
    const customExCount = state.exercises.filter(e => !isDefaultExercise(e.id)).length;
    check('collector', customExCount >= 5);

    const allSets = state.workouts.flatMap(w => w.exercises.flatMap(e => e.sets));
    const notesCount = allSets.filter(s => s.note && s.note.trim().length > 0).length;
    const hasHeavy = allSets.some(s => Number(s.weight) >= 100);
    const hasTitan = allSets.some(s => Number(s.weight) >= 150);
    const hasLongWorkout = state.workouts.some(w => (w.endedAt - w.startedAt) >= 120 * 60000);

    check('philosopher', notesCount >= 10);
    check('heavy_lift', hasHeavy);
    check('titan_lift', hasTitan);
    check('marathon_time', hasLongWorkout);

    const hasEarly = state.workouts.some(w => new Date(w.startedAt).getHours() < 8);
    const hasLate = state.workouts.some(w => new Date(w.startedAt).getHours() >= 22);
    check('early_bird', hasEarly);
    check('night_owl', hasLate);

    const months: Record<string, number> = {};
    state.workouts.forEach(w => {
      const d = new Date(w.endedAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      months[key] = (months[key] || 0) + 1;
    });
    const hasPerfectMonth = Object.values(months).some(count => count >= 16);
    check('perfect_month', hasPerfectMonth);

    if (hasNew) {
      setState(s => ({ ...s, unlockedAchievements: { ...s.unlockedAchievements, ...newAch } }));
    }
  }, [state.workouts, state.exercises, state.programs, streak, validWeekWorkouts.length, validMonthWorkouts.length, state.unlockedAchievements]);

  const workoutsByDay = useMemo(() => {
    const map: Record<string, Workout[]> = {};
    for (const w of state.workouts) {
      const key = dayKeyFromTs(w.endedAt);
      if (!map[key]) map[key] = [];
      map[key].push(w);
    }
    return map;
  }, [state.workouts]);

  const calendarCells = useMemo(() => buildCalendarGrid(calendarDate.getFullYear(), calendarDate.getMonth()), [calendarDate]);
  const todayKey = dayKeyFromDate(new Date());

  const closedWeekStarts = useMemo(() => {
    const weeks: Record<number, Workout[]> = {};
    for (const w of state.workouts) {
      if (!isValidWorkout(w)) continue;
      const ws = getStartOfWeek(new Date(w.endedAt));
      if (!weeks[ws]) weeks[ws] = [];
      weeks[ws].push(w);
    }
    const closed = new Set<number>();
    for (const [ws, workouts] of Object.entries(weeks)) {
      if (workouts.length >= 3) closed.add(Number(ws));
    }
    return closed;
  }, [state.workouts]);

  const isIdealMonth = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    if (firstDay.getTime() > Date.now()) return false;

    let current = getStartOfWeek(firstDay);
    const end = lastDay.getTime();
    let weekCount = 0;

    while (current <= end) {
      const weekStartDate = new Date(current);
      if (weekStartDate.getMonth() === month) {
        weekCount++;
        if (!closedWeekStarts.has(current)) return false;
      }
      current += 7 * 86400000;
    }
    return weekCount > 0;
  }, [calendarDate, closedWeekStarts]);

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

  const muscleStatsSorted = useMemo(() => Object.entries(muscleStats30d).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]), [muscleStats30d]);
  const maxMuscleValue = Math.max(1, ...muscleStatsSorted.map(([, v]) => v));

  function goToPrevMonth() { setCalendarDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1)); }
  function goToNextMonth() { setCalendarDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1)); }
  function selectDay(key: string) { setSelectedDay(prev => prev === key ? null : key); }
  function openCalendar() {
    setHistoryView('calendar');
    if (!selectedDay) { setCalendarDate(new Date()); setSelectedDay(todayKey); }
  }

  // === ФУНКЦИИ ТРЕНИРОВКИ ===
  function patchActive(updater: (active: ActiveWorkout) => ActiveWorkout) {
    setState(s => s.activeWorkout ? { ...s, activeWorkout: updater(s.activeWorkout) } : s);
  }

  function cloneExercise(source: WorkoutExercise): WorkoutExercise {
    const doneSets = source.sets.filter(s => s.done && (s.weight || s.reps));
    const sets = doneSets.length > 0 ? doneSets.map(s => ({ id: uid(), weight: s.weight, reps: s.reps, done: false })) : [emptySet(), emptySet(), emptySet()];
    return { id: uid(), exerciseId: source.exerciseId, name: source.name, sets, collapsed: false };
  }

  function startFromWorkout(source: Workout) {
    const newWorkout: ActiveWorkout = { id: uid(), name: source.name, startedAt: Date.now(), exercises: source.exercises.map(cloneExercise) };
    setState(s => ({ ...s, activeWorkout: newWorkout }));
    setTab('workout');
    notify(`Скопировано из «${source.name}»`);
  }

  function startWorkout() {
    setState(s => ({ ...s, activeWorkout: { id: uid(), name: 'Силовая тренировка', startedAt: Date.now(), exercises: [] } }));
    setTab('workout');
    notify('Тренировка начата');
  }

  function updateSet(exerciseId: string, setId: string, patch: Partial<SetEntry>) {
    patchActive(a => ({ ...a, exercises: a.exercises.map(e => e.id !== exerciseId ? e : { ...e, sets: e.sets.map(s => s.id === setId ? { ...s, ...patch } : s) }) }));
  }

  function toggleNote(exerciseId: string, setId: string) {
    const key = `${exerciseId}-${setId}`;
    setOpenNotes(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function finishWorkout() {
    if (!currentWorkout || finishing) return;
    const earnedXp = xpFor(currentWorkout);
    if (earnedXp === 0) { notify('Отметь хотя бы один подход.'); return; }
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
    if (!window.confirm('Удалить тренировку?')) return;
    setState(s => ({ ...s, workouts: s.workouts.filter(w => w.id !== id) }));
    notify('Тренировка удалена.');
  }

  function clearHistory() {
    if (!window.confirm('Удалить ВСЮ историю? Это нельзя отменить.')) return;
    if (!window.confirm('Точно? Статистика и достижения будут потеряны.')) return;
    setState(s => ({ ...s, workouts: [], unlockedAchievements: {} }));
    notify('История очищена.');
  }

  function getExerciseStats(exerciseId: string) {
    const sorted = [...state.workouts].reverse();
    const points: { date: number; value: number }[] = [];
    let bestWeight = 0, bestReps = 0, bestDate: number | null = null, best1RM = 0, totalWorkouts = 0;

    for (const w of sorted) {
      const ex = w.exercises.find(e => e.exerciseId === exerciseId);
      if (!ex) continue;
      const doneSets = ex.sets.filter(s => s.done);
      if (doneSets.length === 0) continue;
      totalWorkouts++;

      let maxWeightInWorkout = 0;
      for (const s of doneSets) {
        const wt = Number(s.weight) || 0;
        const rp = Number(s.reps) || 0;
        if (wt > maxWeightInWorkout) maxWeightInWorkout = wt;
        if (wt <= 0 || rp <= 0) continue;
        if (wt > bestWeight || (wt === bestWeight && rp > bestReps)) { bestWeight = wt; bestReps = rp; bestDate = w.endedAt; }
        const epley = wt * (1 + rp / 30);
        if (epley > best1RM) best1RM = epley;
      }
      if (maxWeightInWorkout > 0) points.push({ date: w.endedAt, value: maxWeightInWorkout });
    }
    return { points: points.slice(-12), bestWeight, bestReps, bestDate, best1RM: Math.round(best1RM * 10) / 10, totalWorkouts };
  }

  // === ФУНКЦИИ ПИКЕРА ===
  function openPickerForWorkout() { setPickerTarget({ type: 'workout' }); }
  function openPickerForProgramDay(dayId: string) { setPickerTarget({ type: 'programDay', dayId }); }
  function closePicker() { setPickerTarget(null); setPickerQuery(''); }

  function addSelectedExerciseToTarget(exercise: Exercise) {
    if (!pickerTarget) return;
    if (pickerTarget.type === 'workout') {
      patchActive(a => ({ ...a, exercises: [...a.exercises, makeWorkoutExercise(exercise)] }));
    } else if (pickerTarget.type === 'programDay') {
      addExerciseToProgramDay(pickerTarget.dayId, exercise);
    }
    closePicker();
  }

  function addCustomInPicker(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = state.exercises.find(e => e.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) { addSelectedExerciseToTarget(existing); return; }
    const category = pickerNewCategory.trim();
    const exercise: Exercise = { id: uid(), name: trimmed, muscle: category, equipment: 'Пользовательское' };
    setState(s => ({ ...s, exercises: [...s.exercises, exercise] }));
    if (category) ensureCategoryRegistered(category);
    addSelectedExerciseToTarget(exercise);
  }

  // === ФУНКЦИИ ПРОГРАММ ===
  function cancelProgramEdit() {
    setEditingProgramId(null);
    setProgramName('');
    setProgramNote('');
    setProgramGoal('');
    setProgramDays([]);
    setShowProgramBuilder(false);
  }

  function startEditProgram(p: Program) {
    setEditingProgramId(p.id);
    setProgramName(p.name);
    setProgramNote(p.note || '');
    setProgramGoal(p.goal || '');
    setProgramDays(JSON.parse(JSON.stringify(p.days)));
    setShowProgramBuilder(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function makeProgramExercise(exercise: Exercise): ProgramExercise {
    return {
      id: uid(),
      exerciseId: exercise.id,
      name: exercise.name,
      sets: [
        { id: uid(), weight: '', reps: '' },
        { id: uid(), weight: '', reps: '' },
        { id: uid(), weight: '', reps: '' }
      ]
    };
  }

  function addProgramDay() {
    setProgramDays(prev => [...prev, { id: uid(), name: `День ${prev.length + 1}`, exercises: [] }]);
  }

  function removeProgramDay(dayId: string) {
    setProgramDays(prev => prev.filter(d => d.id !== dayId));
  }

  function updateProgramDay(dayId: string, patch: Partial<ProgramDay>) {
    setProgramDays(prev => prev.map(d => d.id === dayId ? { ...d, ...patch } : d));
  }

  function addExerciseToProgramDay(dayId: string, exercise: Exercise) {
    setProgramDays(prev => prev.map(d => d.id === dayId ? { ...d, exercises: [...d.exercises, makeProgramExercise(exercise)] } : d));
  }

  function removeExerciseFromProgramDay(dayId: string, peId: string) {
    setProgramDays(prev => prev.map(d => d.id === dayId ? { ...d, exercises: d.exercises.filter(pe => pe.id !== peId) } : d));
  }

  function updateProgramSet(dayId: string, peId: string, setId: string, patch: Partial<ProgramSetTemplate>) {
    setProgramDays(prev => prev.map(d => d.id === dayId ? {
      ...d,
      exercises: d.exercises.map(pe => pe.id === peId ? {
        ...pe, sets: pe.sets.map(s => s.id === setId ? { ...s, ...patch } : s)
      } : pe)
    } : d));
  }

  function addSetToProgram(dayId: string, peId: string) {
    setProgramDays(prev => prev.map(d => d.id === dayId ? {
      ...d,
      exercises: d.exercises.map(pe => pe.id === peId ? {
        ...pe, sets: [...pe.sets, { id: uid(), weight: '', reps: '' }]
      } : pe)
    } : d));
  }

  function removeSetFromProgram(dayId: string, peId: string, setId: string) {
    setProgramDays(prev => prev.map(d => d.id === dayId ? {
      ...d,
      exercises: d.exercises.map(pe => pe.id === peId ? {
        ...pe, sets: pe.sets.filter(s => s.id !== setId)
      } : pe)
    } : d));
  }

  function addProgram() {
    const name = programName.trim();
    if (!name) { notify('Введи название программы.'); return; }
    const daysWithExercises = programDays.filter(d => d.exercises.length > 0);
    if (daysWithExercises.length === 0) { notify('Добавь хотя бы одно упражнение.'); return; }

    const goal = programGoal || undefined;
    const note = programNote.trim() || undefined;

    if (editingProgramId) {
      const existing = state.programs.find(p => p.id === editingProgramId);
      const updated: Program = { id: editingProgramId, name, goal, note, days: daysWithExercises, createdAt: existing?.createdAt || Date.now() };
      setState(s => ({ ...s, programs: s.programs.map(p => p.id === editingProgramId ? updated : p) }));
      notify('Программа обновлена.');
    } else {
      const program: Program = { id: uid(), name, goal, note, days: daysWithExercises, createdAt: Date.now() };
      setState(s => ({ ...s, programs: [...s.programs, program] }));
      notify('Программа сохранена.');
    }
    cancelProgramEdit();
  }

   function makeWorkoutFromProgramDay(day: ProgramDay): WorkoutExercise[] {
    return day.exercises.map(pe => ({
      id: uid(),
      exerciseId: pe.exerciseId,
      name: pe.name,
      collapsed: false,
      sets: pe.sets.length > 0
        ? pe.sets.map(ps => ({ id: uid(), weight: ps.weight, reps: ps.reps, done: false }))
        : [emptySet(), emptySet(), emptySet()]
    }));
  }

    function startWorkoutFromProgram(program: Program, day: ProgramDay) {
    const exercises = makeWorkoutFromProgramDay(day); // <--- вот тут убрали program
    setState(s => ({ ...s, activeWorkout: {
      id: uid(),
      name: program.days.length > 1 ? `${program.name} · ${day.name}` : program.name,
      startedAt: Date.now(),
      exercises
    } }));
    setTab('workout');
    notify(`Начата «${program.name}»`);
  }

  function handleStartProgram(program: Program) {
    if (program.days.length === 0) { notify('В программе нет тренировок.'); return; }
    if (program.days.length === 1) { startWorkoutFromProgram(program, program.days[0]); }
    else { setProgramPickerOpen(program); }
  }

  // === ОБЩИЕ ФУНКЦИИ ===
  function ensureCategoryRegistered(cat: string) {
    const trimmed = cat.trim();
    if (!trimmed) return;
    setState(s => {
      const list = s.customCategories ?? [];
      if (list.includes(trimmed) || DEFAULT_CATEGORIES.includes(trimmed)) return s;
      return { ...s, customCategories: [...list, trimmed] };
    });
  }

  function addCustomExercise() {
    const name = exerciseName.trim();
    if (!name) { notify('Введи название.'); return; }
    if (state.exercises.some(e => e.name.toLowerCase() === name.toLowerCase())) { notify('Уже есть.'); return; }
    const category = exerciseMuscle.trim();
    const exercise: Exercise = { id: uid(), name, muscle: category, equipment: 'Пользовательское' };
    setState(s => ({ ...s, exercises: [...s.exercises, exercise] }));
    if (category) ensureCategoryRegistered(category);
    setExerciseName('');
    if (category) setExpandedCategories(prev => ({ ...prev, [normalizeMuscle(category) || 'Без категории']: true }));
    notify('Упражнение добавлено.');
  }

  function saveEditedExercise() {
    if (!editingExercise) return;
    const name = editingExercise.name.trim();
    if (!name) { notify('Название пустое.'); return; }
    const dup = state.exercises.some(e => e.id !== editingExercise.id && e.name.toLowerCase() === name.toLowerCase());
    if (dup) { notify('Уже есть.'); return; }
    const category = editingExercise.muscle.trim();
    setState(s => ({ ...s, exercises: s.exercises.map(e => e.id === editingExercise.id ? { ...e, name, muscle: category } : e) }));
    if (category) ensureCategoryRegistered(category);
    setEditingExercise(null);
    notify('Сохранено.');
  }

  function deleteExercise(exercise: Exercise) {
    if (isDefaultExercise(exercise.id)) { notify('Встроенные нельзя удалять.'); return; }
    if (!window.confirm(`Удалить «${exercise.name}»?`)) return;
    setState(s => ({ ...s, exercises: s.exercises.filter(x => x.id !== exercise.id), programs: s.programs.map(p => ({ ...p, days: p.days.map(d => ({ ...d, exercises: d.exercises.filter(pe => pe.exerciseId !== exercise.id) })) })) }));
    notify('Удалено.');
  }

  function renameCategory(oldName: string) {
    const normalized = normalizeMuscle(oldName);
    if (!isUserCategory(normalized)) { notify('Встроенные нельзя.'); return; }
    const newName = window.prompt(`Новое название «${oldName}»:`, oldName);
    if (!newName) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === normalized || allCategories.includes(trimmed)) { notify('Ошибка или уже есть.'); return; }
    setState(s => ({ ...s, customCategories: (s.customCategories ?? []).map(c => c === normalized ? trimmed : c), exercises: s.exercises.map(e => normalizeMuscle(e.muscle) === normalized ? { ...e, muscle: trimmed } : e) }));
    notify('Переименовано.');
  }

  function deleteCategory(cat: string) {
    const normalized = normalizeMuscle(cat);
    if (!isUserCategory(normalized)) { notify('Встроенные нельзя.'); return; }
    const count = state.exercises.filter(e => normalizeMuscle(e.muscle) === normalized).length;
    if (!window.confirm(count > 0 ? `В категории ${count} упражнений. Они перейдут в «Без категории».` : `Удалить «${cat}»?`)) return;
    setState(s => ({ ...s, customCategories: (s.customCategories ?? []).filter(c => c !== normalized), exercises: s.exercises.map(e => normalizeMuscle(e.muscle) === normalized ? { ...e, muscle: '' } : e) }));
    notify('Удалено.');
  }

  function toggleCategory(cat: string) { setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] })); }

  function exportData() { downloadBackup(state); notify('Бэкап подготовлен.'); }
  
  function importData(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed: unknown = JSON.parse(String(reader.result));
        if (!parsed || typeof parsed !== 'object' || !('app' in parsed) || parsed.app !== 'GymLog' || !('state' in parsed)) throw new Error('Не бэкап.');
        const candidate = (parsed as { state: AppState }).state;
        if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.workouts) || !Array.isArray(candidate.exercises)) throw new Error('Формат не поддерживается.');
        if (!window.confirm('Импорт заменит данные. Продолжить?')) return;
        setState(ensureState(candidate));
        notify('Импорт завершён.');
      } catch (e) { notify(e instanceof Error ? e.message : 'Ошибка.'); }
    };
    reader.readAsText(file);
  }

  function updateProfile(name: string, bodyWeight: string) { setState(s => ({ ...s, profile: { ...s.profile, name, bodyWeight } })); }
  
  async function handleAvatarUpload(file?: File) {
    if (!file || !file.type.startsWith('image/')) return;
    setTempImage(URL.createObjectURL(file));
  }

  function removeAvatar() {
    if (!window.confirm('Удалить фото?')) return;
    setState(s => ({ ...s, profile: { name: s.profile.name, bodyWeight: s.profile.bodyWeight } }));
    notify('Фото удалено');
  }

  async function handleLogout() {
    try { await logOut(); await ensureAnonymousAuth(); notify('Вы вышли.'); } catch { notify('Ошибка.'); }
  }

  function openEmailAuth(mode: 'signup' | 'signin' | 'reset') {
    setEmailAuthMode(mode); setEmailValue(user?.email || ''); setPasswordValue(''); setEmailAuthError(null); setEmailAuthOpen(true);
  }

  async function handleEmailAuth() {
    const email = emailValue.trim().toLowerCase();
    const password = passwordValue;
    setEmailAuthError(null);
    if (!email || !email.includes('@')) { setEmailAuthError('Корректный email?'); return; }
    if (emailAuthMode === 'reset') {
      setEmailAuthLoading(true);
      try { await resetPassword(email); setEmailAuthOpen(false); notify(`Письмо на ${email}`); } 
      catch (err: any) { setEmailAuthError(err?.code === 'auth/user-not-found' ? 'Не найден.' : 'Ошибка.'); } 
      finally { setEmailAuthLoading(false); }
      return;
    }
    if (password.length < 6) { setEmailAuthError('Пароль от 6 симв.'); return; }
    setEmailAuthLoading(true);
    try {
      if (emailAuthMode === 'signup') {
        try {
          const linkedUser = await linkWithEmail(email, password);
          setUser(linkedUser); setEmailAuthOpen(false); setEmailValue(''); setPasswordValue('');
          notify(`Аккаунт создан: ${email}`);
        } catch (err: any) {
          const code = err?.code || '';
          if (code === 'auth/email-already-in-use') setEmailAuthError('Email занят. Войдите.');
          else if (code === 'auth/weak-password') setEmailAuthError('Слишком простой.');
          else if (code === 'auth/credential-already-in-use') setEmailAuthError('Уже привязан. Войдите.');
          else setEmailAuthError(`Ошибка: ${code}`);
        }
      } else {
        try {
          const signedUser = await signInWithEmail(email, password);
          setUser(signedUser); setEmailAuthOpen(false); setEmailValue(''); setPasswordValue('');
          notify(`Вы вошли: ${email}`);
        } catch (err: any) {
          const code = err?.code || '';
          if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') setEmailAuthError('Неверный пароль.');
          else if (code === 'auth/user-not-found') setEmailAuthError('Нет аккаунта. Создайте.');
          else if (code === 'auth/too-many-requests') setEmailAuthError('Слишком много попыток. Подождите.');
          else setEmailAuthError(`Ошибка: ${code}`);
        }
      }
    } finally { setEmailAuthLoading(false); }
  }

  const navItems: { id: Tab; label: string; icon: typeof Home }[] = [
    { id: 'home', label: 'Главная', icon: Home },
    { id: 'workout', label: 'Тренировка', icon: Dumbbell },
    { id: 'programs', label: 'Программы', icon: BookOpen },
    { id: 'history', label: 'История', icon: BarChart3 },
    { id: 'quest', label: 'GymQuest', icon: Trophy },
    { id: 'profile', label: 'Профиль', icon: CircleUserRound }
  ];

  const isRegistered = Boolean(user && !user.isAnonymous);

  const customAchievements = [
    { id: 'first', icon: Award, title: 'Первый шаг', desc: 'Заверши тренировку' },
    { id: 'five', icon: Star, title: 'Пятёрка', desc: '5 тренировок' },
    { id: 'ten', icon: Star, title: 'Десятка', desc: '10 тренировок' },
    { id: 'perfect_week', icon: Target, title: 'Идеальная неделя', desc: 'Цель по кольцу выполнена' },
    { id: 'marathon', icon: Trophy, title: 'Марафонец', desc: '10 тренировок за месяц' },
    { id: 'streak3', icon: Zap, title: 'На волне', desc: 'Серия 3 дня' },
    { id: 'iron_streak', icon: Flame, title: 'Железная серия', desc: '5 дней подряд (от 30 мин)' },
    { id: 'streak7', icon: Zap, title: 'Неделя силы', desc: 'Серия 7 дней' },
    { id: 'vol10k', icon: Dumbbell, title: 'Первая тонна', desc: '10 000 кг объёма' },
    { id: 'vol50k', icon: Dumbbell, title: 'Пять тонн', desc: '50 000 кг объёма' },
    { id: 'sets100', icon: Check, title: 'Сто подходов', desc: '100 выполненных подходов' },
    { id: 'early_bird', icon: Clock3, title: 'Ранняя пташка', desc: 'Тренировка до 08:00' },
    { id: 'night_owl', icon: Moon, title: 'Полуночник', desc: 'Тренировка после 22:00' },
    { id: 'heavy_lift', icon: Dumbbell, title: 'Тяжеловес', desc: 'Взять вес 100+ кг' },
    { id: 'philosopher', icon: MessageSquare, title: 'Философ', desc: '10 заметок к подходам' },
    { id: 'titan_lift', icon: Dumbbell, title: 'Абсолют', desc: 'Взять вес 150+ кг' },
    { id: 'marathon_time', icon: Clock3, title: 'Долгоиграющий', desc: 'Тренировка 2 часа и более' },
    { id: 'collector', icon: Pencil, title: 'Коллекционер', desc: 'Создать 5 своих упражнений' },
    { id: 'programmer', icon: BookOpen, title: 'Программист', desc: 'Создать 5 программ' },
    { id: 'centurion', icon: Trophy, title: 'Юбилей', desc: 'Завершить 50 тренировок' },
    { id: 'perfect_month', icon: Calendar, title: 'Идеальный месяц', desc: 'Закрыть все недели в месяце' }
  ];

  const appShellClass = levelInfo.isMax ? 'app-shell max-level-gold' : 'app-shell';

  return (
    <div className={appShellClass}>
      <header className="topbar">
        <button className="brand" onClick={() => setTab('home')} aria-label="На главную">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="GymLog" className="brand-mark-img" />
          <span><b>GYMLOG</b><small>TRAINING JOURNAL</small></span>
        </button>
        <button className="avatar" onClick={() => setTab('profile')} aria-label="Открыть профиль">
          {state.profile.avatar ? <img src={state.profile.avatar} alt="" /> : (state.profile.name.trim()[0] || 'А').toLocaleUpperCase('ru-RU')}
        </button>
      </header>

      <main className="screen" key={tab}>
        {tab === 'home' && <section>
          <p className="eyebrow">{localDate(Date.now()).toUpperCase()}</p>
          <h1>Сводка.</h1>
          <p className="intro">Прогресс за последние 7 дней.</p>

          <div className={`rings-card ${isRing1Closed && isRing2Closed ? 'all-closed' : ''}`}>
            <ActivityRings rings={[
              { percent: ring1Value / Math.max(1, state.settings.ring1.goal), color: '#ff6482', closed: isRing1Closed },
              { percent: ring2Value / Math.max(1, state.settings.ring2.goal), color: '#d0f477', closed: isRing2Closed },
              { percent: levelInfo.currentXp / Math.max(1, levelInfo.nextLevelXp), color: '#32d4ff', closed: isLevelGlowing }
            ]} />
            <div className="rings-legend">
              <div className={`ring-legend-row ${isRing1Closed ? 'closed' : ''}`}>
                <span className="ring-dot" style={{ background: '#ff6482' }} />
                <div><b>{ring1Info.shortLabel} {isRing1Closed && <Check size={12} className="ring-check"/>}</b><small>{ring1Value} из {state.settings.ring1.goal} {ring1Info.unit}</small></div>
              </div>
              <div className={`ring-legend-row ${isRing2Closed ? 'closed' : ''}`}>
                <span className="ring-dot" style={{ background: '#d0f477' }} />
                <div><b>{ring2Info.shortLabel} {isRing2Closed && <Check size={12} className="ring-check"/>}</b><small>{ring2Value} из {state.settings.ring2.goal} {ring2Info.unit}</small></div>
              </div>
              <div className="ring-legend-row">
                <span className="ring-dot" style={{ background: '#32d4ff' }} />
                <div><b>{levelInfo.rank} · Ур. {level}</b><small>{levelInfo.isMax ? 'Максимальный уровень' : `${levelInfo.currentXp} из ${levelInfo.nextLevelXp} XP`}</small></div>
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
                <div><b>Повторить последнюю</b><small>{state.workouts[0].name} · {localDate(state.workouts[0].endedAt)} · {setCount(state.workouts[0])} подходов</small></div>
              </button>
              <button className="quick-start-btn" onClick={() => setHistoryPickerOpen(true)}>
                <History size={18} />
                <div><b>Из истории</b><small>выбрать любую тренировку</small></div>
              </button>
            </div>
          )}

          <div className="stats-grid">
            <Metric label="ТРЕНИРОВОК" value={String(state.workouts.length)} note="всего" />
            <Metric label="ОБЪЁМ" value={fmt(state.workouts.reduce((n, w) => n + volume(w), 0))} note="кг × повторы" />
            <Metric label="УРОВЕНЬ" value={String(level)} note={levelInfo.rank} />
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
              <button className="button button-secondary" onClick={() => startFromWorkout(state.workouts[0])}><RefreshCw size={15} /> Повторить последнюю</button>
              <button className="button button-secondary" onClick={() => setHistoryPickerOpen(true)}><History size={15} /> Из истории</button>
            </div>}
            {state.programs.length > 0 && <div className="quick-programs">{state.programs.map(p => <button key={p.id} className="button button-secondary" onClick={() => handleStartProgram(p)}>{p.name} <span>↗</span></button>)}</div>}
          </div> : <>
            <div className="workout-meta"><div><Clock3 size={16} /><span>Начата {localDate(currentWorkout.startedAt)}, {localTime(currentWorkout.startedAt)}</span></div><span>{currentWorkout.exercises.length} упражнений</span></div>
            <div className="workout-timer">
              <span className="workout-timer-label">Длительность</span>
              <span className="workout-timer-value">{formatTimer(now - currentWorkout.startedAt)}</span>
            </div>
            <label className="field-label">Название тренировки<input className="field" value={currentWorkout.name} onChange={e => patchActive(a => ({ ...a, name: e.target.value }))} maxLength={60} /></label>
            <div className="section-heading"><h2>Упражнения</h2><button className="icon-button" onClick={() => openPickerForWorkout()} aria-label="Добавить"><Plus size={20} /></button></div>
            {currentWorkout.exercises.length === 0 && <Empty title="Пока нет упражнений" text="Добавь первое упражнение из библиотеки." />}
            {currentWorkout.exercises.map((exercise, index) => <article className="exercise-card" key={exercise.id}>
              <div className="exercise-title">
                <button className="exercise-collapse" onClick={() => patchActive(a => ({ ...a, exercises: a.exercises.map(e => e.id === exercise.id ? { ...e, collapsed: !e.collapsed } : e) }))}>
                  <span className="exercise-number">{String(index + 1).padStart(2, '0')}</span><span className="exercise-name">{exercise.name}<small>{exercise.sets.filter(s => s.done).length} из {exercise.sets.length} подходов</small></span>{exercise.collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                </button>
                <button className="icon-button subtle" aria-label="Удалить" onClick={() => patchActive(a => ({ ...a, exercises: a.exercises.filter(e => e.id !== exercise.id) }))}><X size={17} /></button>
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
                          <button className="set-copy" aria-label="Копировать" onClick={() => prevSet && updateSet(exercise.id, set.id, { weight: prevSet.weight, reps: prevSet.reps })}><Copy size={13} /></button>
                        ) : (<span className="set-index">{i + 1}</span>)}
                        <input aria-label={`Вес ${i + 1}`} className="set-input" type="number" min="0" step="0.5" placeholder="—" value={set.weight} onChange={e => updateSet(exercise.id, set.id, { weight: e.target.value })} />
                        <input aria-label={`Повторы ${i + 1}`} className="set-input" type="number" min="0" step="1" placeholder="—" value={set.reps} onChange={e => updateSet(exercise.id, set.id, { reps: e.target.value })} />
                        <button className={`set-note-toggle ${set.note && set.note.trim() ? 'has-note' : ''}`} aria-label="Заметка" onClick={() => toggleNote(exercise.id, set.id)}><MessageSquare size={14} /></button>
                        <button className={`set-check ${set.done ? 'checked' : ''}`} aria-label="Выполнено" onClick={() => updateSet(exercise.id, set.id, { done: !set.done })}>{set.done && <Check size={16} />}</button>
                      </div>
                      {showNote && (<textarea className="set-note-input" placeholder="Заметка к подходу…" value={set.note || ''} onChange={e => updateSet(exercise.id, set.id, { note: e.target.value })} rows={1} maxLength={300} />)}
                    </div>
                  );
                })}
                <button className="add-set" onClick={() => patchActive(a => ({ ...a, exercises: a.exercises.map(e => e.id === exercise.id ? { ...e, sets: [...e.sets, emptySet()] } : e) }))}><Plus size={15} /> Добавить подход</button>
              </div>}
            </article>)}
            <button className="button button-secondary full-width" onClick={() => openPickerForWorkout()}><Plus size={17} /> Добавить упражнение</button>
            <div className="finish-bar"><div><b>{setCount(currentWorkout)}</b><small>выполнено подходов</small></div><button className={`button button-primary ${finishing ? 'is-finishing' : ''}`} onClick={finishWorkout} disabled={finishing}>{finishing ? 'Сохраняем…' : <>Завершить <Check size={17} /></>}</button></div>
            <button className="text-danger" onClick={() => { if (window.confirm('Отменить тренировку?')) { setState(s => ({ ...s, activeWorkout: null })); notify('Отменена.'); } }}>Отменить тренировку</button>
          </>}
        </section>}

        {tab === 'programs' && programsView === 'list' && <section>
          <p className="eyebrow">ПЛАНИРОВАНИЕ</p>
          <h1>Мои программы.</h1>
          <p className="intro">Собери шаблон один раз и запускай его, когда понадобится.</p>
          <button className="menu-card" onClick={() => { setProgramsView('library'); setLibraryTab('browse'); }}>
            <div className="menu-card-icon"><BookOpen size={22} /></div>
            <div className="menu-card-body"><b>Библиотека упражнений</b><small>{state.exercises.length} упражнений · {orderedCategories.length} категорий</small></div>
            <ChevronRight size={20} />
          </button>
          <button className="button button-primary full-width" onClick={() => { if (showProgramBuilder) cancelProgramEdit(); else setShowProgramBuilder(true); }}>
            <Plus size={17} /> {showProgramBuilder ? 'Скрыть билдер' : 'Создать программу'}
          </button>
          
          {showProgramBuilder && <div className="panel builder">
            <div className="section-heading" style={{ marginTop: 0 }}>
              <h2>{editingProgramId ? 'Редактирование' : 'Новая программа'}</h2>
              {editingProgramId && <button className="text-link" onClick={cancelProgramEdit}>Отмена</button>}
            </div>

            <label className="field-label">Название
              <input className="field" placeholder="Например, Сплит A" value={programName} onChange={e => setProgramName(e.target.value)} maxLength={60} />
            </label>

            <label className="field-label">Цель
              <select className="field" value={programGoal} onChange={e => setProgramGoal(e.target.value as ProgramGoal | '')}>
                <option value="">Без цели</option>
                <option value="strength">На силу</option>
                <option value="mass">На массу</option>
                <option value="endurance">На выносливость</option>
                <option value="other">Другое</option>
              </select>
            </label>

            <label className="field-label">Примечание
              <textarea className="program-note-textarea" placeholder="Например: отдых 90 сек между подходами" value={programNote} onChange={e => setProgramNote(e.target.value)} rows={2} maxLength={500} />
            </label>

            <p className="eyebrow">ТРЕНИРОВОЧНЫЕ ДНИ ({programDays.length})</p>

            <div className="program-days-list">
              {programDays.map((day, dayIdx) => (
                <div className="program-day-card" key={day.id}>
                  <div className="program-day-header">
                    <input
                      className="program-day-name"
                      value={day.name}
                      onChange={e => updateProgramDay(day.id, { name: e.target.value })}
                      placeholder={`День ${dayIdx + 1}`}
                      maxLength={40}
                    />
                    {programDays.length > 1 && (
                      <button className="icon-button subtle" aria-label="Удалить день" onClick={() => {
                        if (window.confirm(`Удалить «${day.name}»?`)) removeProgramDay(day.id);
                      }}><Trash2 size={14} /></button>
                    )}
                  </div>

                  <div className="program-day-exercises">
                    {day.exercises.map(pe => (
                      <div className="program-day-exercise" key={pe.id}>
                        <div className="program-exercise-header">
                          <b>{pe.name}</b>
                          <button className="icon-button subtle" aria-label="Удалить упражнение" onClick={() => removeExerciseFromProgramDay(day.id, pe.id)}><X size={14} /></button>
                        </div>
                        <div className="program-sets">
                          <div className="program-set-header">
                            <span>СЕТ</span><span>ВЕС</span><span>ПОВТ</span><span></span>
                          </div>
                          {pe.sets.map((s, idx) => (
                            <div className="program-set-row" key={s.id}>
                              <span className="set-index">{idx + 1}</span>
                              <input className="set-input" type="number" inputMode="decimal" min="0" step="0.5" placeholder="—" value={s.weight} onChange={e => updateProgramSet(day.id, pe.id, s.id, { weight: e.target.value })} />
                              <input className="set-input" type="number" inputMode="numeric" min="0" step="1" placeholder="—" value={s.reps} onChange={e => updateProgramSet(day.id, pe.id, s.id, { reps: e.target.value })} />
                              <button className="icon-button subtle" aria-label="Удалить подход" onClick={() => removeSetFromProgram(day.id, pe.id, s.id)}><X size={12} /></button>
                            </div>
                          ))}
                          <button className="add-set" onClick={() => addSetToProgram(day.id, pe.id)}>
                            <Plus size={14} /> Добавить подход
                          </button>
                        </div>
                      </div>
                    ))}

                    <button className="add-set" onClick={() => openPickerForProgramDay(day.id)}>
                      <Plus size={15} /> Добавить упражнение
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button className="button button-secondary full-width" onClick={addProgramDay} style={{ marginBottom: 10 }}>
              <Plus size={15} /> Добавить тренировочный день
            </button>

            <button className="button button-primary full-width" onClick={addProgram}>
              <Save size={16} /> {editingProgramId ? 'Сохранить изменения' : 'Сохранить программу'}
            </button>
          </div>}

          {state.programs.length ? <div className="program-list">{state.programs.map(p => {
            const goalLabel = p.goal === 'strength' ? 'Сила' : p.goal === 'mass' ? 'Масса' : p.goal === 'endurance' ? 'Выносливость' : p.goal === 'other' ? 'Другое' : null;
            const goalClass = p.goal === 'strength' ? 'goal-strength' : p.goal === 'mass' ? 'goal-mass' : p.goal === 'endurance' ? 'goal-endurance' : 'goal-other';
            const totalExercises = p.days.reduce((n, d) => n + d.exercises.length, 0);
            return (
              <article className="panel program-card" key={p.id}>
                <div className="program-icon"><BookOpen size={20} /></div>
                <div className="program-main">
                  <div className="program-title-row">
                    <h3 style={{ margin: 0 }}>{p.name}</h3>
                    {goalLabel && <span className={`program-goal-badge ${goalClass}`}>{goalLabel}</span>}
                  </div>
                  <p>
                    {p.days.length === 1 ? `${totalExercises} упражнений` : `${p.days.length} дн. · ${totalExercises} упр.`} · создана {localDate(p.createdAt)}
                  </p>
                  {p.note && <div className="program-note">{p.note}</div>}
                  {p.days.length === 1 ? (
                    <div className="program-exercises">{p.days[0].exercises.slice(0, 4).map(pe => pe.name).join(' · ')}</div>
                  ) : (
                    <div className="program-days-preview">
                      {p.days.map((d, i) => <span key={d.id} className="program-day-pill">{i + 1}. {d.name}</span>)}
                    </div>
                  )}
                  <div className="program-actions">
                    <button className="button button-primary" onClick={() => handleStartProgram(p)}>
                      {p.days.length === 1 ? 'Начать ↗' : 'Выбрать день ↗'}
                    </button>
                    <button className="icon-button subtle" aria-label="Ред." onClick={() => startEditProgram(p)}><Pencil size={15} /></button>
                    <button className="icon-button subtle" aria-label="Уд." onClick={() => { if (window.confirm(`Удалить «${p.name}»?`)) setState(s => ({ ...s, programs: s.programs.filter(x => x.id !== p.id) })); }}><Trash2 size={15} /></button>
                  </div>
                </div>
              </article>
            );
          })}</div> : <Empty title="Программ пока нет" text="Создай шаблон или сплит." />}
        </section>}

        {tab === 'programs' && programsView === 'library' && <section>
          <button className="back-link" onClick={() => setProgramsView('list')}><ChevronLeft size={18} /> Программы</button>
          <h1>Библиотека.</h1>
          <p className="intro">Упражнения для тренировок и программ.</p>
          <div className="library-tabs">
            <button className={`library-tab ${libraryTab === 'browse' ? 'active' : ''}`} onClick={() => setLibraryTab('browse')}><BookOpen size={20} /><span>Упражнения</span></button>
            <button className={`library-tab ${libraryTab === 'add' ? 'active' : ''}`} onClick={() => setLibraryTab('add')}><Plus size={20} /><span>Добавить своё</span></button>
          </div>
          {libraryTab === 'browse' && (
            <div className="category-list">
              {state.exercises.length === 0 && <Empty title="Пусто" text="Добавь упражнения." />}
              {orderedCategories.filter(cat => (groupedExercises[cat]?.length || 0) > 0 || (state.customCategories ?? []).includes(cat)).map(cat => {
                const exercises = groupedExercises[cat] || [];
                const expanded = expandedCategories[cat] ?? false;
                const userCat = isUserCategory(cat);
                return (
                  <div className="category-block" key={cat}>
                    <div className="category-header-wrap">
                      <button className="category-header" onClick={() => toggleCategory(cat)}>
                        <div><b>{cat}</b><small>{exercises.length} упражнений</small></div>
                        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                      {userCat && (
                        <div className="category-tools">
                          <button className="icon-button subtle" aria-label="Ред." onClick={() => renameCategory(cat)}><Pencil size={14} /></button>
                          <button className="icon-button subtle" aria-label="Уд." onClick={() => deleteCategory(cat)}><Trash2 size={14} /></button>
                        </div>
                      )}
                    </div>
                    {expanded && <div className="category-exercises">
                      {exercises.map(e => {
                        const defaultEx = isDefaultExercise(e.id);
                        return (
                          <div className="library-row" key={e.id}>
                            <div><b>{e.name}</b><small>{e.equipment}{defaultEx ? ' · встроенное' : ''}</small></div>
                            <div className="library-row-actions">
                              {!defaultEx && <button className="icon-button subtle" aria-label={`Ред. ${e.name}`} onClick={() => setEditingExercise({ ...e })}><Pencil size={14} /></button>}
                              {!defaultEx && <button className="icon-button subtle" aria-label={`Уд. ${e.name}`} onClick={() => deleteExercise(e)}><Trash2 size={14} /></button>}
                            </div>
                          </div>
                        );
                      })}
                      {exercises.length === 0 && <div className="picker-empty">Пусто</div>}
                    </div>}
                  </div>
                );
              })}
            </div>
          )}
          {libraryTab === 'add' && (
            <div className="panel builder">
              <label className="field-label">Название<input className="field" value={exerciseName} onChange={e => setExerciseName(e.target.value)} placeholder="Например, Тяга к поясу" maxLength={60} /></label>
              <label className="field-label">Категория<CategorySelect value={exerciseMuscle} onChange={(v) => { setExerciseMuscle(v); if (v) ensureCategoryRegistered(v); }} categories={allCategories} /></label>
              <button className="button button-primary full-width" onClick={addCustomExercise}><Plus size={16} /> Добавить</button>
            </div>
          )}
        </section>}

        {tab === 'history' && <section>
          <p className="eyebrow">ТВОЯ ДИНАМИКА</p>
          <h1>История.</h1>
          <p className="intro">Все завершённые тренировки.</p>
          <div className="history-tabs">
            <button className={`library-tab ${historyView === 'list' ? 'active' : ''}`} onClick={() => setHistoryView('list')}><BarChart3 size={20} /><span>Список</span></button>
            <button className={`library-tab ${historyView === 'calendar' ? 'active' : ''}`} onClick={openCalendar}><Calendar size={20} /><span>Календарь</span></button>
          </div>
          {historyView === 'list' && (
            <>
              <div className="stats-grid">
                <Metric label="ТРЕНИРОВОК" value={String(state.workouts.length)} note="всего" />
                <Metric label="ОБЪЁМ" value={fmt(state.workouts.reduce((n, w) => n + volume(w), 0))} note="кг × повторы" />
                <Metric label="ВРЕМЯ" value={String(state.workouts.reduce((n, w) => n + durationMinutes(w.startedAt, w.endedAt), 0))} note="минут" />
                <Metric label="XP" value={String(xp)} note={`${levelInfo.rank}`} />
              </div>
              {state.workouts.length ? <div className="history-list">{state.workouts.map(w => <article className="panel history-card" key={w.id}>
                <div className="history-top"><div><h3>{w.name}</h3><p>{localDate(w.endedAt)}, {localTime(w.startedAt)}–{localTime(w.endedAt)} · {formatDuration(w.startedAt, w.endedAt)}</p></div><button className="icon-button subtle" aria-label="Уд." onClick={() => deleteWorkout(w.id)}><Trash2 size={16} /></button></div>
                <div className="history-metrics"><span><Dumbbell size={14} /> {w.exercises.length} упр.</span><span><Check size={14} /> {setCount(w)} подходов</span><span><Activity size={14} /> {fmt(volume(w))} кг</span><strong>+{w.earnedXp} XP</strong></div>
                <details><summary>Упражнения</summary>{w.exercises.map(e => {
                  const doneSets = e.sets.filter(s => s.done);
                  return (
                    <div className="history-exercise" key={e.id}>
                      <div className="history-exercise-title"><b>{e.name}</b><button className="chart-trigger" aria-label="График" onClick={() => setGraphExercise({ id: e.exerciseId, name: e.name })}><TrendingUp size={14} /></button></div>
                      {doneSets.length === 0 ? (<span className="history-empty-note">Нет выполненных</span>) : (
                        <div className="history-sets-list">{doneSets.map((s, idx) => (
                          <div key={s.id} className="history-set">
                            <span className="history-set-main">Подход {idx + 1}: {s.weight || 0} кг × {s.reps || 0}</span>
                            {s.note && s.note.trim() && (<span className="history-set-note">{s.note}</span>)}
                          </div>
                        ))}</div>
                      )}
                    </div>
                  );
                })}</details>
              </article>)}</div> : <Empty title="История пуста" text="Заверши тренировку." />}
              {state.workouts.length > 0 && (<button className="text-danger clear-history-bottom" onClick={clearHistory}>Очистить историю</button>)}
            </>
          )}
          {historyView === 'calendar' && (
            <>
              <div className={`calendar-card ${isIdealMonth ? 'calendar-ideal' : ''}`}>
                <div className="calendar-header">
                  <button className="calendar-nav" onClick={goToPrevMonth} aria-label="Назад"><ChevronLeft size={20} /></button>
                  <div className="calendar-month-wrap">
                    <div className={`calendar-month ${isIdealMonth ? 'gold-text' : ''}`}>{formatMonthYear(calendarDate)}</div>
                    {isIdealMonth && <div className="calendar-ideal-badge">Идеальный месяц</div>}
                  </div>
                  <button className="calendar-nav" onClick={goToNextMonth} aria-label="Вперед"><ChevronRight size={20} /></button>
                </div>
                <div className="calendar-weekdays">{WEEKDAYS.map(d => <div key={d} className="calendar-weekday">{d}</div>)}</div>
                <div className="calendar-grid">
                  {calendarCells.map((date, i) => {
                    if (!date) return <div key={`empty-${i}`} className="calendar-day empty" />;
                    const key = dayKeyFromDate(date);
                    const isToday = key === todayKey;
                    const isSelected = key === selectedDay;
                    const hasWorkout = Boolean(workoutsByDay[key]?.length);
                    const isFuture = date.getTime() > Date.now() && !isToday;
                    const weekStart = getStartOfWeek(date);
                    const isGoldWeek = closedWeekStarts.has(weekStart);
                    const isGoldDay = isGoldWeek && hasWorkout;
                    const classes = [
                      'calendar-day',
                      isToday ? 'today' : '',
                      isSelected ? 'selected' : '',
                      hasWorkout ? 'has-workout' : '',
                      isFuture ? 'future' : '',
                      isGoldDay ? 'gold-day' : ''
                    ].filter(Boolean).join(' ');
                    return (
                      <button key={key} className={classes} onClick={() => selectDay(key)} aria-label={`${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`}>
                        <span className="calendar-day-num">{date.getDate()}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="calendar-metrics">
                <div className="metric"><span className="metric-label">ТРЕНИРОВОК</span><strong className="metric-value">{monthWorkouts.length}</strong><small className="metric-note">за месяц</small></div>
                <div className="metric"><span className="metric-label">ОБЪЁМ</span><strong className="metric-value">{fmt(monthVolume)}</strong><small className="metric-note">кг</small></div>
                <div className="metric"><span className="metric-label">XP</span><strong className="metric-value">{monthXp}</strong><small className="metric-note">за месяц</small></div>
              </div>
              {selectedDay && (
                <div className="calendar-day-details">
                  <div className="calendar-day-title">{new Date(selectedDay + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}{selectedDay === todayKey && <span className="calendar-day-badge">сегодня</span>}</div>
                  {(workoutsByDay[selectedDay]?.length || 0) === 0 ? (
                    <div className="calendar-day-empty">Нет тренировок</div>
                  ) : (workoutsByDay[selectedDay].map(w => (
                    <div className="calendar-workout" key={w.id}>
                      <div className="calendar-workout-top"><div><b>{w.name}</b><small>{localTime(w.startedAt)}–{localTime(w.endedAt)} · {formatDuration(w.startedAt, w.endedAt)}</small></div><button className="icon-button subtle" aria-label="Уд." onClick={() => deleteWorkout(w.id)}><Trash2 size={14} /></button></div>
                      <div className="calendar-workout-meta"><span>{w.exercises.length} упр.</span><span>·</span><span>{setCount(w)} подходов</span><span>·</span><span>{fmt(volume(w))} кг</span><strong>+{w.earnedXp} XP</strong></div>
                      <button className="calendar-workout-repeat" onClick={() => startFromWorkout(w)}><RefreshCw size={14} /> Повторить</button>
                    </div>
                  )))}
                </div>
              )}
              {!selectedDay && (<div className="calendar-hint">Выбери день, чтобы увидеть тренировки.</div>)}
              <div className="muscle-stats">
                <div className="muscle-stats-title">Мышцы за 30 дней</div>
                {muscleStatsSorted.length === 0 ? (<div className="muscle-stats-empty">Нет данных</div>) : (muscleStatsSorted.map(([cat, count]) => (
                  <div className="muscle-stat-row" key={cat}>
                    <div className="muscle-stat-label">{cat}</div>
                    <div className="muscle-stat-track"><div className="muscle-stat-fill" style={{ width: `${(count / maxMuscleValue) * 100}%` }} /></div>
                    <div className="muscle-stat-count">{count}</div>
                  </div>
                )))}
              </div>
              {state.workouts.length > 0 && (<button className="text-danger clear-history-bottom" onClick={clearHistory}>Очистить историю</button>)}
            </>
          )}
        </section>}

        {tab === 'quest' && <section>
          <p className="eyebrow">ПРОГРЕСС И НАГРАДЫ</p>
          <h1>GymQuest.</h1>
          
          <div className="library-tabs" style={{ marginBottom: 16 }}>
            <button className={`library-tab ${questView === 'achievements' ? 'active' : ''}`} onClick={() => setQuestView('achievements')}>
              <Award size={20} /><span>Награды</span>
            </button>
            <button className={`library-tab ${questView === 'leaderboard' ? 'active' : ''}`} onClick={() => setQuestView('leaderboard')}>
              <Trophy size={20} /><span>Рейтинг</span>
            </button>
          </div>

          {questView === 'achievements' && (
            <>
              <div className={`quest-card ${levelInfo.isMax ? 'max-level-card' : ''}`}>
                <div className="quest-icon">{levelInfo.isMax ? <Crown size={28} /> : <Trophy size={28} />}</div>
                <p className="eyebrow">ТВОЙ РАНГ</p>
                <h2>{levelInfo.rank} · Уровень {level}</h2>
                {!levelInfo.isMax ? (
                  <>
                    <div className="xp-line"><span>{levelInfo.currentXp} / {levelInfo.nextLevelXp} XP</span><span>{levelInfo.nextLevelXp - levelInfo.currentXp} до уровня</span></div>
                    <div className="progress-track"><span style={{ width: `${(levelInfo.currentXp / levelInfo.nextLevelXp) * 100}%` }} /></div>
                  </>
                ) : (
                  <div className="xp-line"><span>Максимальный уровень достигнут!</span><span>{xp} XP всего</span></div>
                )}
                <p className="quest-note">{state.workouts.length === 0 ? 'Первая тренировка откроет путь.' : `Тренировок завершено: ${state.workouts.length}.`}</p>
              </div>
              <SectionTitle title="Достижения" />
              <div className="achievements-grid">
                {customAchievements.map(a => {
                  const Icon = a.icon;
                  const unlocked = Boolean(state.unlockedAchievements[a.id]);
                  return (
                    <div key={a.id} className={`achievement ${unlocked ? 'unlocked' : 'locked'}`}>
                      <div className="achievement-icon"><Icon size={22} /></div>
                      <b>{a.title}</b>
                      <small>{a.desc}</small>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {questView === 'leaderboard' && (
            <>
              <div className="settings-group" style={{ marginBottom: 16 }}>
                <div className="setting-row">
                  <div className="setting-icon"><Trophy size={17} /></div>
                  <div>
                    <b>Участвовать в рейтинге</b>
                    <small>Твои имя, аватар и статы будут видны другим</small>
                  </div>
                  <button 
                    className={`toggle-switch ${state.settings.showInLeaderboard ? 'active' : ''}`}
                    onClick={toggleLeaderboardParticipation}
                  >
                    <span className="toggle-knob" />
                  </button>
                </div>
              </div>

              {state.settings.showInLeaderboard ? (
                <>
                  <div className="library-tabs" style={{ marginBottom: 12 }}>
                    <button className={`library-tab ${leaderboardMetric === 'totalXp' ? 'active' : ''}`} onClick={() => setLeaderboardMetric('totalXp')} style={{ minHeight: 50, fontSize: 12 }}>По XP</button>
                    <button className={`library-tab ${leaderboardMetric === 'weeklyVolume' ? 'active' : ''}`} onClick={() => setLeaderboardMetric('weeklyVolume')} style={{ minHeight: 50, fontSize: 12 }}>Объём (нед)</button>
                    <button className={`library-tab ${leaderboardMetric === 'streak' ? 'active' : ''}`} onClick={() => setLeaderboardMetric('streak')} style={{ minHeight: 50, fontSize: 12 }}>Серия</button>
                  </div>
                  
                  <div className="panel leaderboard-panel">
                    {leaderboardLoading ? (
                      <div className="leaderboard-loading">Загрузка...</div>
                    ) : leaderboardData.length === 0 ? (
                      <Empty title="Пока никого нет" text="Стань первым в рейтинге!" />
                    ) : (
                      leaderboardData.map((p, idx) => {
                        const isMe = p.uid === user?.uid;
                        let valueDisplay = '';
                        if (leaderboardMetric === 'totalXp') valueDisplay = `${p.totalXp} XP`;
                        else if (leaderboardMetric === 'weeklyVolume') valueDisplay = `${fmt(p.weeklyVolume)} кг`;
                        else if (leaderboardMetric === 'streak') valueDisplay = `${p.streak} дн.`;
                        
                        return (
                          <div key={p.uid} className={`leaderboard-row ${isMe ? 'is-me' : ''}`}>
                            <div className="leaderboard-rank">{idx + 1}</div>
                            <div className="leaderboard-avatar">
                              {p.avatar ? <img src={p.avatar} alt="" /> : (p.displayName[0] || 'А').toUpperCase()}
                            </div>
                            <div className="leaderboard-info">
                              <b>{p.displayName} {isMe && '(Ты)'}</b>
                              <small>{p.rank} · Ур. {p.level}</small>
                            </div>
                            <div className="leaderboard-value">{valueDisplay}</div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              ) : (
                <div className="sync-warning" style={{ textAlign: 'center', padding: 24 }}>
                  <Trophy size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                  <p>Включи тумблер выше, чтобы увидеть рейтинг других пользователей и показать свои результаты.</p>
                </div>
              )}
            </>
          )}
        </section>}

        {tab === 'profile' && profileView === 'instructions' && (
          <InstructionsScreen onBack={() => setProfileView('main')} />
        )}

        {tab === 'profile' && profileView === 'main' && <section>
          <p className="eyebrow">ТВОИ ДАННЫЕ</p>
          <h1>Профиль.</h1>
          <div className="profile-hero">
            <label className="profile-avatar profile-avatar-editable">
              {state.profile.avatar ? <img src={state.profile.avatar} alt="Аватар" /> : (state.profile.name.trim()[0] || 'А').toLocaleUpperCase('ru-RU')}
              <span className="profile-avatar-badge"><Camera size={12} /></span>
              <input type="file" accept="image/*" hidden onChange={e => { handleAvatarUpload(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <div className="profile-hero-info">
              <b>{state.profile.name || 'Атлет'}</b>
              <small>{state.profile.bodyWeight ? `${state.profile.bodyWeight} кг` : 'Вес не указан'}</small>
              {state.profile.avatar && (<button className="profile-avatar-remove" onClick={removeAvatar}>Удалить фото</button>)}
            </div>
          </div>
          <div className="settings-section">
            <p className="settings-header">Личные данные</p>
            <div className="settings-group">
              <label className="settings-row-input"><span>Имя</span><input className="settings-input" value={state.profile.name} onChange={e => updateProfile(e.target.value, state.profile.bodyWeight)} onBlur={() => updateProfile(state.profile.name.trim() || 'Атлет', state.profile.bodyWeight)} maxLength={40} /></label>
              <label className="settings-row-input"><span>Вес (кг)</span><input className="settings-input" type="number" inputMode="decimal" min="0" step="0.1" value={state.profile.bodyWeight} onChange={e => updateProfile(state.profile.name, e.target.value)} placeholder="—" /></label>
            </div>
          </div>
          <div className="settings-section">
            <p className="settings-header">Цели на главной</p>
            <div className="settings-group">
              <div className="ring-setting">
                <div className="ring-setting-color" style={{ background: '#ff6482' }} />
                <div className="ring-setting-body">
                  <select className="ring-setting-select" value={state.settings.ring1.metric} onChange={e => updateRingMetric('ring1', e.target.value as RingMetric)}>{RING_METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
                  <div className="ring-setting-goal"><span>Цель:</span><RingGoalInput value={state.settings.ring1.goal} onChange={v => updateRingGoal('ring1', v)} /><span className="ring-setting-unit">{ring1Info.unit}</span></div>
                </div>
              </div>
              <div className="ring-setting">
                <div className="ring-setting-color" style={{ background: '#d0f477' }} />
                <div className="ring-setting-body">
                  <select className="ring-setting-select" value={state.settings.ring2.metric} onChange={e => updateRingMetric('ring2', e.target.value as RingMetric)}>{RING_METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
                  <div className="ring-setting-goal"><span>Цель:</span><RingGoalInput value={state.settings.ring2.goal} onChange={v => updateRingGoal('ring2', v)} /><span className="ring-setting-unit">{ring2Info.unit}</span></div>
                </div>
              </div>
            </div>
            <p className="sync-hint" style={{ marginTop: 8 }}>Третье кольцо — уровень, оно не настраивается.</p>
          </div>
          <div className="settings-section">
            <p className="settings-header">Аккаунт</p>
            <div className="settings-group">
              <div className="setting-row">
                <div className="setting-icon">{isRegistered ? <ShieldCheck size={17} /> : <CircleUserRound size={17} />}</div>
                <div style={{ minWidth: 0, flex: 1 }}><b>{isRegistered ? (user?.email || 'Аккаунт создан') : 'Не привязан'}</b><small>{isRegistered ? 'Данные сохраняются в облако' : 'Прогресс только на устройстве'}</small></div>
                <span className={`status-dot ${isRegistered ? 'status-active' : 'status-pending'}`} />
              </div>
              {!isRegistered && (<><button className="settings-action" onClick={() => openEmailAuth('signup')}><Cloud size={17} /><span><b>Создать аккаунт</b><small>Email и пароль</small></span></button><button className="settings-action" onClick={() => openEmailAuth('signin')}><RefreshCw size={17} /><span><b>Войти</b><small>Если уже есть</small></span></button></>)}
              {isRegistered && (<><button className="settings-action" onClick={() => openEmailAuth('reset')}><Save size={17} /><span><b>Сбросить пароль</b><small>Письмо на {user?.email}</small></span></button><button className="settings-action" onClick={handleLogout}><X size={17} /><span><b>Выйти</b><small>Прогресс останется</small></span></button></>)}
            </div>
            {!isRegistered && (<div className="sync-warning"><p>Без аккаунта прогресс хранится только здесь.</p></div>)}
          </div>
          <div className="settings-section">
            <p className="settings-header">Синхронизация</p>
            <div className="settings-group">
              <div className="setting-row"><div className="setting-icon"><ShieldCheck size={17} /></div><div><b>Локальное сохранение</b><small>Автосохранение</small></div><span className="status-dot status-active" /></div>
              {firebaseConfigured ? (
                <div className="setting-row">
                  <div className="setting-icon"><Cloud size={17} /></div>
                  <div><b>Облачная синхронизация</b><small>{!isRegistered ? 'Только на устройстве' : `Аккаунт ${user?.email || ''}`}</small>{isRegistered && (<small className="sync-time">{isSyncing ? 'Синхронизация…' : lastSyncedAt ? `Сохранено: ${formatSyncTime(lastSyncedAt)}` : 'Ещё не синхронизировано'}</small>)}{syncError && <small className="sync-error">Ошибка: {syncError}</small>}</div>
                  <span className={`status-dot ${isSyncing ? 'status-pending' : isRegistered ? 'status-active' : ''}`} />
                </div>
              ) : (<div className="setting-row"><div className="setting-icon"><Cloud size={17} /></div><div><b>Облако</b><small>Не настроено</small></div><span className="status-dot" /></div>)}
            </div>
            {isRegistered && (<><p className="sync-hint">Отправка через 2 секунды.</p><button className="button button-secondary full-width" onClick={forceSync} disabled={isSyncing} style={{ marginTop: 8 }}><Cloud size={17} /> {isSyncing ? 'Синхронизация…' : 'Синхронизировать сейчас'}</button></>)}
          </div>
          <div className="settings-section">
            <p className="settings-header">Резервные копии</p>
            <div className="settings-group">
              <button className="settings-action" onClick={exportData}><FileDown size={17} /><span><b>Экспортировать JSON</b><small>Копия на диск</small></span></button>
              <label className="settings-action"><Save size={17} /><span><b>Импортировать JSON</b><small>Из файла</small></span><input type="file" accept=".json,application/json" hidden onChange={e => importData(e.target.files?.[0])} /></label>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-group">
              <button className="settings-action" onClick={() => setProfileView('instructions')}>
                <BookOpen size={17} />
                <span><b>Инструкция</b><small>Как пользоваться приложением</small></span>
                <ChevronRight size={16} style={{ color: 'var(--muted)' }} />
              </button>
            </div>
          </div>

          <div className="notice">Резервная копия JSON — страховка. Облако синхронизирует автоматически.</div>
        </section>}
      </main>

      <nav className="tabbar" aria-label="Навигация">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = tab === item.id;
          return <button key={item.id} className={`tab ${isActive ? 'active' : ''}`} onClick={() => { if (item.id === 'programs' && tab === 'programs' && programsView === 'library') { setProgramsView('list'); setLibraryTab('browse'); return; } if (item.id === 'profile' && tab === 'profile' && profileView === 'instructions') { setProfileView('main'); return; } setTab(item.id); }}>
            <Icon size={19} strokeWidth={isActive ? 2.4 : 1.8} /><span>{item.label}</span>
          </button>;
        })}
      </nav>

      {pickerOpen && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) closePicker(); }}>
        <section className="picker-modal" role="dialog" aria-modal="true" aria-labelledby="picker-title">
          <div className="modal-head">
            <div>
              <p className="eyebrow">{pickerTarget?.type === 'programDay' ? 'В ПРОГРАММУ' : 'БИБЛИОТЕКА'}</p>
              <h2 id="picker-title">Добавить упражнение</h2>
            </div>
            <button className="icon-button" onClick={closePicker} aria-label="Закрыть"><X size={20} /></button>
          </div>
          <input className="field" autoFocus placeholder="Поиск или новое" value={pickerQuery} onChange={e => setPickerQuery(e.target.value)} />
          {pickerQuery.trim() && !filteredExercises.some(e => e.name.toLowerCase() === pickerQuery.toLowerCase().trim()) && (
            <div className="picker-add-custom">
              <p className="picker-add-label">Нет в библиотеке? Добавить «{pickerQuery.trim()}»</p>
              <CategorySelect value={pickerNewCategory} onChange={(v) => { setPickerNewCategory(v); if (v) ensureCategoryRegistered(v); }} categories={allCategories} />
              <button className="picker-add-button" onClick={() => addCustomInPicker(pickerQuery)}><Plus size={16} /> Добавить</button>
            </div>
          )}
          <div className="picker-list">
            {filteredExercises.map(e => (
              <button key={e.id} className="picker-row" onClick={() => addSelectedExerciseToTarget(e)}>
                <span><b>{e.name}</b><small>{normalizeMuscle(e.muscle) || 'Без категории'} · {e.equipment}</small></span>
                <Plus size={18} />
              </button>
            ))}
            {filteredExercises.length === 0 && <Empty title="Ничего не найдено" text="Введи название — можно добавить как своё." />}
          </div>
        </section>
      </div>}

      {programPickerOpen && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setProgramPickerOpen(null); }}>
        <section className="picker-modal" role="dialog" aria-modal="true">
          <div className="modal-head">
            <div>
              <p className="eyebrow">ПРОГРАММА</p>
              <h2>{programPickerOpen.name}</h2>
            </div>
            <button className="icon-button" onClick={() => setProgramPickerOpen(null)} aria-label="Закрыть"><X size={20} /></button>
          </div>
          <p className="picker-hint">Выбери тренировочный день:</p>
          <div className="picker-list">
            {programPickerOpen.days.map((day, idx) => (
              <button key={day.id} className="picker-row" onClick={() => {
                const p = programPickerOpen;
                setProgramPickerOpen(null);
                startWorkoutFromProgram(p, day);
              }}>
                <span>
                  <b>{idx + 1}. {day.name}</b>
                  <small>{day.exercises.length} упражнений</small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </section>
      </div>}

      {historyPickerOpen && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setHistoryPickerOpen(false); }}>
        <section className="picker-modal" role="dialog" aria-modal="true" aria-labelledby="history-title">
          <div className="modal-head"><div><p className="eyebrow">ИСТОРИЯ</p><h2 id="history-title">Повторить тренировку</h2></div><button className="icon-button" onClick={() => setHistoryPickerOpen(false)} aria-label="Закрыть"><X size={20} /></button></div>
          <p className="picker-hint">Упражнения и веса скопируются.</p>
          <div className="picker-list">
            {state.workouts.length === 0 && <Empty title="Пусто" text="Заверши тренировку." />}
            {state.workouts.map(w => (
              <button key={w.id} className="picker-row" onClick={() => { setHistoryPickerOpen(false); startFromWorkout(w); }}>
                <span><b>{w.name}</b><small>{localDate(w.endedAt)} · {w.exercises.length} упр. · {setCount(w)} подходов</small></span><RefreshCw size={16} />
              </button>
            ))}
          </div>
        </section>
      </div>}

      {editingExercise && (
        <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setEditingExercise(null); }}>
          <section className="picker-modal" role="dialog" aria-modal="true" aria-labelledby="edit-ex-title">
            <div className="modal-head"><div><p className="eyebrow">РЕДАКТИРОВАНИЕ</p><h2 id="edit-ex-title">Упражнение</h2></div><button className="icon-button" onClick={() => setEditingExercise(null)} aria-label="Закрыть"><X size={20} /></button></div>
            <label className="field-label">Название<input className="field" value={editingExercise.name} onChange={e => setEditingExercise({ ...editingExercise, name: e.target.value })} maxLength={80} /></label>
            <label className="field-label">Категория<CategorySelect value={editingExercise.muscle} onChange={(v) => { setEditingExercise({ ...editingExercise, muscle: v }); if (v) ensureCategoryRegistered(v); }} categories={allCategories} /></label>
            <button className="button button-primary full-width" onClick={saveEditedExercise}><Save size={16} /> Сохранить</button>
          </section>
        </div>
      )}

      {graphExercise && (() => {
        const stats = getExerciseStats(graphExercise.id);
        return (
          <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setGraphExercise(null); }}>
            <section className="picker-modal graph-modal" role="dialog" aria-modal="true" aria-labelledby="graph-title">
              <div className="modal-head">
                <div style={{ minWidth: 0 }}><p className="eyebrow">ПРОГРЕСС</p><h2 id="graph-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{graphExercise.name}</h2></div>
                <button className="icon-button" onClick={() => setGraphExercise(null)} aria-label="Закрыть"><X size={20} /></button>
              </div>
              {stats.bestWeight > 0 ? (
                <>
                  <div className="chart-stats">
                    <div className="chart-stat"><span className="chart-stat-label">Лучший вес</span><span className="chart-stat-value">{stats.bestWeight} кг</span>{stats.bestDate && <span className="chart-stat-date">{localDate(stats.bestDate)}</span>}</div>
                    <div className="chart-stat"><span className="chart-stat-label">Повторения</span><span className="chart-stat-value">{stats.bestReps} раз</span><span className="chart-stat-date">с этим весом</span></div>
                    <div className="chart-stat"><span className="chart-stat-label">Максимум</span><span className="chart-stat-value">≈ {stats.best1RM} кг</span><span className="chart-stat-date">на 1 раз</span></div>
                  </div>
                  <div className="graph-chart-wrap"><ProgressChart points={stats.points} /></div>
                  <p className="chart-caption">Максимальный вес за тренировку · {stats.totalWorkouts} {stats.totalWorkouts === 1 ? 'тренировка' : stats.totalWorkouts < 5 ? 'тренировки' : 'тренировок'}</p>
                </>
              ) : (<Empty title="Нет данных" text="Отметь подходы с ненулевым весом." />)}
            </section>
          </div>
        );
      })()}

      {emailAuthOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !emailAuthLoading) setEmailAuthOpen(false); }}>
          <section className="picker-modal" role="dialog" aria-modal="true" aria-labelledby="email-auth-title">
            <div className="modal-head"><div><p className="eyebrow">АККАУНТ</p><h2 id="email-auth-title">{emailAuthMode === 'signup' ? 'Создать аккаунт' : emailAuthMode === 'signin' ? 'Войти' : 'Сбросить пароль'}</h2></div><button className="icon-button" onClick={() => setEmailAuthOpen(false)} aria-label="Закрыть" disabled={emailAuthLoading}><X size={20} /></button></div>
            <p className="picker-hint">{emailAuthMode === 'signup' && 'Привяжем email к текущему прогрессу.'}{emailAuthMode === 'signin' && 'Введи email и пароль. Текущие данные заменятся.'}{emailAuthMode === 'reset' && 'Отправим ссылку для сброса.'}</p>
            <input className="field" type="email" inputMode="email" autoComplete="email" placeholder="Email" value={emailValue} onChange={e => setEmailValue(e.target.value)} autoFocus disabled={emailAuthLoading} />
            {emailAuthMode !== 'reset' && (<input className="field" type="password" autoComplete={emailAuthMode === 'signup' ? 'new-password' : 'current-password'} placeholder={emailAuthMode === 'signup' ? 'Пароль (от 6 символов)' : 'Пароль'} value={passwordValue} onChange={e => setPasswordValue(e.target.value)} disabled={emailAuthLoading} />)}
            {emailAuthError && <div className="email-auth-error">{emailAuthError}</div>}
            <button className="button button-primary full-width" onClick={handleEmailAuth} disabled={emailAuthLoading || !emailValue.trim() || (emailAuthMode !== 'reset' && !passwordValue)}>{emailAuthLoading ? 'Подожди…' : emailAuthMode === 'signup' ? 'Создать аккаунт' : emailAuthMode === 'signin' ? 'Войти' : 'Отправить письмо'}</button>
            {emailAuthMode === 'signup' && (<button className="text-link" onClick={() => openEmailAuth('signin')}>Уже есть аккаунт? Войти</button>)}
            {emailAuthMode === 'signin' && (<><button className="text-link" onClick={() => openEmailAuth('signup')}>Нет аккаунта? Создать</button><button className="text-link" onClick={() => openEmailAuth('reset')}>Забыли пароль?</button></>)}
            {emailAuthMode === 'reset' && (<button className="text-link" onClick={() => openEmailAuth('signin')}>← Назад к входу</button>)}
          </section>
        </div>
      )}

      {finishing && <div className="finish-flash" />}
      {xpPop !== null && (<div className="xp-pop" role="status">+{xpPop} XP</div>)}
      {tempImage && (
        <ImageCropper
          imageSrc={tempImage}
          onCancel={() => setTempImage(null)}
          onCropComplete={(cropped) => { setState(s => ({ ...s, profile: { ...s.profile, avatar: cropped } })); setTempImage(null); notify('Фото обновлено'); }}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function InstructionsScreen({ onBack }: { onBack: () => void }) {
  return (
    <section className="instructions-screen">
      <button className="back-link" onClick={onBack}>
        <ChevronLeft size={18} /> Назад в профиль
      </button>
      
      <p className="eyebrow">СПРАВОЧНИК</p>
      <h1>Инструкция.</h1>
      <p className="intro">Всё, что нужно знать о GymLog.</p>

      <div className="instruction-content">
        <div className="instruction-section">
          <h3>1. Начало тренировки</h3>
          <p>На главной нажми <b>«Начать тренировку»</b>. Внутри ты можешь добавить упражнения из библиотеки (кнопка «+»). Если упражнения нет в списке — просто введи его название в поиске, и приложение предложит добавить его как «своё».</p>
        </div>

        <div className="instruction-section">
          <h3>2. Запись подходов</h3>
          <p>Вводи вес и количество повторений. Если ты уже делал это упражнение, нажми на <b>иконку копирования</b> (два листочка) рядом с номером подхода — приложение подставит данные из предыдущего подхода.</p>
          <p>Нажми на <b>галочку</b>, когда выполнишь подход. Иконка <b>сообщения</b> позволяет оставить заметку (например, «тяжело» или «с запасом»).</p>
        </div>

        <div className="instruction-section">
          <h3>3. Программы и сплиты</h3>
          <p>Во вкладке «Программы» можно создать шаблон. Ты можешь настроить не только список упражнений, но и точные веса и повторения для каждого подхода. Программа может состоять из одного дня или быть недельным сплитом (например, Верх/Низ).</p>
        </div>

        <div className="instruction-section">
          <h3>4. История и Календарь</h3>
          <p>Все завершённые тренировки попадают в «Историю». Там можно посмотреть график прогресса по каждому упражнению (иконка <b>тренда</b>) и узнать свой расчётный максимум на 1 повтор.</p>
          <p>В календаре отмечаются дни тренировок. Если ты тренируешься регулярно (выполняешь недельную норму), дни загораются <b>золотым</b>, а за идеальный месяц ты получаешь особую награду.</p>
        </div>

        <div className="instruction-section">
          <h3>5. GymQuest (Уровни и Рейтинг)</h3>
          <p>За каждую тренировку ты получаешь опыт (XP). Чем больше подходов — тем больше опыта. Прокачивай уровень от «Новичка» до «Титана».</p>
          <p>На вкладке «Рейтинг» ты можешь включить участие и сравнивать свои успехи с другими пользователями по XP, объёму или серии дней.</p>
        </div>

        <div className="instruction-section">
          <h3>6. Профиль и Данные</h3>
          <p>В профиле настраиваются главные «Кольца» на главном экране — ты сам выбираешь, за чем следить (тренировки, подходы, объём или серия).</p>
          <p><b>Важно:</b> Создай аккаунт (Email + Пароль) в блоке «Аккаунт», чтобы твой прогресс сохранялся в облаке. Если ты не создашь аккаунт и удалишь приложение, данные могут быть утеряны.</p>
          <p>Для дополнительной страховки используй <b>«Экспорт JSON»</b> внизу профиля.</p>
        </div>
      </div>
    </section>
  );
}

function RingGoalInput({ value, onChange }: { value: number; onChange: (val: number) => void }) {
  const [localValue, setLocalValue] = useState(String(value));

  useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setLocalValue(e.target.value);
    const num = Number(e.target.value);
    if (e.target.value !== '' && !isNaN(num) && num > 0) {
      onChange(num);
    }
  }

  function handleBlur() {
    if (localValue === '' || isNaN(Number(localValue)) || Number(localValue) <= 0) {
      setLocalValue(String(value));
    } else {
      onChange(Number(localValue));
    }
  }

  return (
    <input
      type="number"
      className="ring-setting-input"
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      min={1}
    />
  );
}

function CategorySelect({ value, onChange, categories }: { value: string; onChange: (v: string) => void; categories: string[]; }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  if (creating) {
    return (
      <div className="category-create">
        <input className="field" autoFocus placeholder="Название категории" value={newName} onChange={e => setNewName(e.target.value)} maxLength={40} />
        <div className="category-create-actions">
          <button className="button button-secondary" onClick={() => { setCreating(false); setNewName(''); }}>Отмена</button>
          <button className="button button-primary" onClick={() => { const v = newName.trim(); if (!v) return; onChange(v); setCreating(false); setNewName(''); }}>Создать</button>
        </div>
      </div>
    );
  }
  return (
    <select className="field" value={value} onChange={e => { if (e.target.value === '__new__') setCreating(true); else onChange(e.target.value); }}>
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

function ActivityRings({ rings }: { rings: { percent: number; color: string; closed?: boolean }[] }) {
  const stroke = 13;
  const gap = 5;
  return (
    <svg viewBox="0 0 200 200" className="rings-svg" aria-hidden="true">
      {rings.map((ring, i) => {
        const r = 82 - i * (stroke + gap);
        const c = 2 * Math.PI * r;
        const pct = Math.max(0, Math.min(1, ring.percent || 0));
        const isClosed = ring.closed || pct >= 1;
        return (
          <g key={i}>
            {isClosed && (
              <circle
                cx="100" cy="100" r={r} fill="none"
                stroke={ring.color} strokeWidth={stroke + 4}
                strokeLinecap="round"
                style={{ filter: 'blur(4px)' }}
                className="ring-glow"
              />
            )}
            <circle cx="100" cy="100" r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={stroke} />
            <circle cx="100" cy="100" r={r} fill="none" stroke={ring.color} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
              transform="rotate(-90 100 100)" style={{ transition: 'stroke-dashoffset .6s ease' }} />
          </g>
        );
      })}
      {rings.every(r => r.closed || r.percent >= 1) && (
        <g className="ring-check-center">
          <circle cx="100" cy="100" r="28" fill="rgba(208, 244, 119, 0.15)" />
          <path d="M85 100 L95 110 L115 90" fill="none" stroke="var(--lime)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  );
}

function ProgressChart({ points }: { points: { date: number; value: number }[] }) {
  if (points.length < 2) return <Empty title="Мало данных" text="Нужно минимум 2 тренировки с этим упражнением." />;
  const W = 360, H = 240;
  const pad = { top: 20, right: 16, bottom: 34, left: 52 };
  const innerW = W - pad.left - pad.right, innerH = H - pad.top - pad.bottom;
  const values = points.map(p => p.value);
  const minV = Math.min(...values), maxV = Math.max(...values);
  const range = Math.max(1, maxV - minV);
  const xStep = innerW / (points.length - 1);
  const coords = points.map((p, i) => ({ x: pad.left + i * xStep, y: pad.top + innerH - ((p.value - minV) / range) * innerH, value: p.value, date: p.date }));
  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L${coords[coords.length - 1].x.toFixed(1)},${(pad.top + innerH).toFixed(1)} L${coords[0].x.toFixed(1)},${(pad.top + innerH).toFixed(1)} Z`;
  const fmtShort = (ts: number) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(ts);

  return (
    <div className="progress-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="progress-chart" aria-hidden="true">
        <defs><linearGradient id="chartAreaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgb(208,244,119)" stopOpacity="0.35" /><stop offset="100%" stopColor="rgb(208,244,119)" stopOpacity="0" /></linearGradient></defs>
        <text x={pad.left - 8} y={pad.top + 4} textAnchor="end" className="chart-label">{Math.round(maxV)} кг</text>
        <text x={pad.left - 8} y={pad.top + innerH} textAnchor="end" className="chart-label">{Math.round(minV)} кг</text>
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + innerH} stroke="rgba(255,255,255,.08)" />
        <line x1={pad.left} y1={pad.top + innerH} x2={pad.left + innerW} y2={pad.top + innerH} stroke="rgba(255,255,255,.08)" />
        <line x1={pad.left} y1={pad.top + innerH / 2} x2={pad.left + innerW} y2={pad.top + innerH / 2} stroke="rgba(255,255,255,.05)" strokeDasharray="2 4" />
        <path d={areaD} fill="url(#chartAreaGradient)" />
        <path d={pathD} fill="none" stroke="var(--lime)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((c, i) => <circle key={i} cx={c.x} cy={c.y} r={4} fill="var(--lime)" />)}
        <text x={coords[0].x} y={H - 10} textAnchor="start" className="chart-label">{fmtShort(coords[0].date)}</text>
        <text x={coords[coords.length - 1].x} y={H - 10} textAnchor="end" className="chart-label">{fmtShort(coords[coords.length - 1].date)}</text>
      </svg>
    </div>
  );
}
