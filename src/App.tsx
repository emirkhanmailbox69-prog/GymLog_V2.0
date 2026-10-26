import { useEffect, useMemo, useState } from 'react';
import {
  Activity, Award, BarChart3, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight,
  ChevronUp, CircleUserRound, Clock3, Dumbbell, FileDown, Home, Plus, Save,
  ShieldCheck, Star, Target, Trash2, Trophy, X, Zap
} from 'lucide-react';
import type { ActiveWorkout, AppState, Exercise, Program, SetEntry, Tab, Workout, WorkoutExercise } from './types';
import { loadState, saveState, downloadBackup } from './storage';
import { firebaseConfigured } from './firebase';

const uid = () => crypto.randomUUID();
const emptySet = (): SetEntry => ({ id: uid(), weight: '', reps: '', done: false });
const makeWorkoutExercise = (exercise: Exercise): WorkoutExercise => ({
  id: uid(), exerciseId: exercise.id, name: exercise.name,
  sets: [emptySet(), emptySet(), emptySet()], collapsed: false
});
const localDate = (timestamp: number) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).format(timestamp);
const durationMinutes = (start: number, end: number) => Math.max(1, Math.round((end - start) / 60000));
const setCount = (w: { exercises: WorkoutExercise[] }) => w.exercises.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0);
const volume = (w: { exercises: WorkoutExercise[] }) => w.exercises.reduce((n, e) => n + e.sets.reduce((m, s) => m + (Number(s.weight) || 0) * (Number(s.reps) || 0) * (s.done ? 1 : 0), 0), 0);
const totalXp = (workouts: Workout[]) => workouts.reduce((sum, w) => sum + w.earnedXp, 0);
const xpFor = (w: ActiveWorkout) => {
  const done = setCount(w);
  return done === 0 ? 0 : Math.min(100, 20 + done * 5 + Math.min(20, w.exercises.length * 2));
};
const levelFor = (xp: number) => Math.floor(xp / 250) + 1;
const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');

const CATEGORIES = ['Ноги и ягодицы', 'Спина', 'Грудь', 'Плечи (Дельты)', 'Руки (Бицепс и Трицепс)', 'Пресс и кор'];
const MUSCLE_MAP: Record<string, string> = {
  'Ноги': 'Ноги и ягодицы',
  'Плечи': 'Плечи (Дельты)',
  'Бицепс': 'Руки (Бицепс и Трицепс)',
  'Трицепс': 'Руки (Бицепс и Трицепс)',
  'Корпус': 'Пресс и кор'
};
const normalizeMuscle = (m: string) => MUSCLE_MAP[m] || m;

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [tab, setTab] = useState<Tab>('home');
  const [toast, setToast] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerNewCategory, setPickerNewCategory] = useState(CATEGORIES[0]);
  const [programName, setProgramName] = useState('');
  const [programExerciseIds, setProgramExerciseIds] = useState<string[]>([]);
  const [showProgramBuilder, setShowProgramBuilder] = useState(false);
  const [exerciseName, setExerciseName] = useState('');
  const [exerciseMuscle, setExerciseMuscle] = useState(CATEGORIES[0]);

  const [programsView, setProgramsView] = useState<'list' | 'library'>('list');
  const [libraryTab, setLibraryTab] = useState<'browse' | 'add'>('browse');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!saveState(state)) notify('Не удалось сохранить локально. Экспортируй резервную копию.');
  }, [state]);

  useEffect(() => {
    if (tab !== 'programs') {
      setProgramsView('list');
      setLibraryTab('browse');
    }
  }, [tab]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
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

  const filteredExercises = useMemo(() => state.exercises.filter(e =>
    `${e.name} ${e.muscle} ${e.equipment}`.toLocaleLowerCase('ru-RU').includes(pickerQuery.toLocaleLowerCase('ru-RU'))
  ), [state.exercises, pickerQuery]);

  const groupedExercises = useMemo(() => {
    const groups: Record<string, Exercise[]> = {};
    for (const e of state.exercises) {
      const cat = normalizeMuscle(e.muscle);
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(e);
    }
    for (const cat in groups) {
      groups[cat].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    }
    return groups;
  }, [state.exercises]);

  function patchActive(updater: (active: ActiveWorkout) => ActiveWorkout) {
    setState(s => s.activeWorkout ? { ...s, activeWorkout: updater(s.activeWorkout) } : s);
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

  function finishWorkout() {
    if (!currentWorkout) return;
    const earnedXp = xpFor(currentWorkout);
    if (earnedXp === 0) {
      notify('Отметь хотя бы один выполненный подход — пустая тренировка не даёт XP.');
      return;
    }
    const completed: Workout = { ...currentWorkout, endedAt: Date.now(), earnedXp };
    setState(s => ({ ...s, workouts: [completed, ...s.workouts], activeWorkout: null }));
    setTab('home');
    notify(`Тренировка сохранена · +${earnedXp} XP`);
  }

  function deleteWorkout(id: string) {
    if (!window.confirm('Удалить тренировку? Статистика и XP будут пересчитаны.')) return;
    setState(s => ({ ...s, workouts: s.workouts.filter(w => w.id !== id) }));
    notify('Тренировка удалена. Прогресс пересчитан.');
  }

  function clearHistory() {
    if (!window.confirm('Удалить ВСЮ историю тренировок? Это действие нельзя отменить без резервной копии.')) return;
    setState(s => ({ ...s, workouts: [] }));
    notify('История очищена. XP и статистика пересчитаны.');
  }

  function addProgram() {
    const name = programName.trim();
    if (!name || programExerciseIds.length === 0) {
      notify('Укажи название и добавь хотя бы одно упражнение.');
      return;
    }
    const program: Program = { id: uid(), name, exerciseIds: programExerciseIds, createdAt: Date.now() };
    setState(s => ({ ...s, programs: [...s.programs, program] }));
    setProgramName('');
    setProgramExerciseIds([]);
    setShowProgramBuilder(false);
    notify('Программа сохранена.');
  }

  function addCustomExercise() {
    const name = exerciseName.trim();
    if (!name) { notify('Введи название упражнения.'); return; }
    if (state.exercises.some(e => e.name.toLowerCase() === name.toLowerCase())) {
      notify('Такое упражнение уже есть в библиотеке.');
      return;
    }
    const exercise: Exercise = { id: uid(), name, muscle: exerciseMuscle, equipment: 'Пользовательское' };
    setState(s => ({ ...s, exercises: [...s.exercises, exercise] }));
    setExerciseName('');
    setExpandedCategories(prev => ({ ...prev, [exerciseMuscle]: true }));
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
    const exercise: Exercise = { id: uid(), name: trimmed, muscle: pickerNewCategory, equipment: 'Пользовательское' };
    setState(s => ({ ...s, exercises: [...s.exercises, exercise] }));
    addExerciseToWorkout(exercise);
  }

  function toggleCategory(cat: string) {
    setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
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
        const candidate = (parsed as { state: AppState }).state;
        if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.workouts) || !Array.isArray(candidate.exercises)) {
          throw new Error('Структура резервной копии не поддерживается.');
        }
        if (!window.confirm('Импорт заменит текущие данные. Продолжить?')) return;
        setState(candidate);
        notify('Резервная копия импортирована.');
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Не удалось импортировать файл.');
      }
    };
    reader.readAsText(file);
  }

  function updateProfile(name: string, bodyWeight: string) {
    setState(s => ({ ...s, profile: { name, bodyWeight } }));
  }

  const navItems: { id: Tab; label: string; icon: typeof Home }[] = [
    { id: 'home', label: 'Главная', icon: Home },
    { id: 'workout', label: 'Тренировка', icon: Dumbbell },
    { id: 'programs', label: 'Программы', icon: BookOpen },
    { id: 'history', label: 'История', icon: BarChart3 },
    { id: 'quest', label: 'GymQuest', icon: Trophy },
    { id: 'profile', label: 'Профиль', icon: CircleUserRound }
  ];

  const orderedCategories = [
    ...CATEGORIES,
    ...Object.keys(groupedExercises).filter(c => !CATEGORIES.includes(c))
  ];

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setTab('home')} aria-label="На главную">
          <span className="brand-mark"><Activity size={19} strokeWidth={2.8} /></span>
          <span><b>GYMLOG</b><small>TRAINING JOURNAL</small></span>
        </button>
        <button className="avatar" onClick={() => setTab('profile')} aria-label="Открыть профиль">
          {(state.profile.name.trim()[0] || 'А').toLocaleUpperCase('ru-RU')}
        </button>
      </header>

      <main className="screen" key={tab}>
        {tab === 'home' && <section>
          <p className="eyebrow">{localDate(Date.now()).toUpperCase()}</p>
          <h1>Сводка.</h1>
          <p className="intro">Прогресс за последние 7 дней.</p>

          <div className="rings-card">
            <ActivityRings rings={[
              { percent: weeklyWorkouts.length / 4, color: '#ff6482' },
              { percent: weeklySets / 50, color: '#d0f477' },
              { percent: (xp % 250) / 250, color: '#32d4ff' }
            ]} />
            <div className="rings-legend">
              <div className="ring-legend-row">
                <span className="ring-dot" style={{ background: '#ff6482' }} />
                <div><b>Тренировки</b><small>{weeklyWorkouts.length} из 4 за неделю</small></div>
              </div>
              <div className="ring-legend-row">
                <span className="ring-dot" style={{ background: '#d0f477' }} />
                <div><b>Подходы</b><small>{weeklySets} из 50 за неделю</small></div>
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
            <p>Добавляй упражнения из библиотеки. Программы остаются отдельными шаблонами.</p>
            <button className="button button-primary" onClick={() => startWorkout()}>Начать с нуля</button>
            {state.programs.length > 0 && <div className="quick-programs">{state.programs.map(p => <button key={p.id} className="button button-secondary" onClick={() => startWorkout(p)}>{p.name} <span>↗</span></button>)}</div>}
          </div> : <>
            <div className="workout-meta"><div><Clock3 size={16} /><span>Начата {localDate(currentWorkout.startedAt)}</span></div><span>{currentWorkout.exercises.length} упражнений</span></div>
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
                <div className="set-header"><span>СЕТ</span><span>ВЕС, КГ</span><span>ПОВТОРЫ</span><span>✓</span></div>
                {exercise.sets.map((set, i) => <div className={`set-row ${set.done ? 'set-done' : ''}`} key={set.id}>
                  <span className="set-index">{i + 1}</span>
                  <input aria-label={`Вес, подход ${i + 1}`} className="set-input" type="number" min="0" step="0.5" placeholder="—" value={set.weight} onChange={e => updateSet(exercise.id, set.id, { weight: e.target.value })} />
                  <input aria-label={`Повторы, подход ${i + 1}`} className="set-input" type="number" min="0" step="1" placeholder="—" value={set.reps} onChange={e => updateSet(exercise.id, set.id, { reps: e.target.value })} />
                  <button className={`set-check ${set.done ? 'checked' : ''}`} aria-label={set.done ? 'Снять отметку подхода' : 'Отметить подход выполненным'} onClick={() => updateSet(exercise.id, set.id, { done: !set.done })}>{set.done && <Check size={16} />}</button>
                </div>)}
                <button className="add-set" onClick={() => patchActive(a => ({ ...a, exercises: a.exercises.map(e => e.id === exercise.id ? { ...e, sets: [...e.sets, emptySet()] } : e) }))}><Plus size={15} /> Добавить подход</button>
              </div>}
            </article>)}
            <button className="button button-secondary full-width" onClick={() => setPickerOpen(true)}><Plus size={17} /> Добавить упражнение</button>
            <div className="finish-bar"><div><b>{setCount(currentWorkout)}</b><small>выполнено подходов</small></div><button className="button button-primary" onClick={finishWorkout}>Завершить <Check size={17} /></button></div>
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
              <small>{state.exercises.length} упражнений · {Object.keys(groupedExercises).length} категорий</small>
            </div>
            <ChevronRight size={20} />
          </button>

          <button className="button button-primary full-width" onClick={() => setShowProgramBuilder(v => !v)}><Plus size={17} /> Создать программу</button>
          {showProgramBuilder && <div className="panel builder">
            <label className="field-label">Название программы<input className="field" placeholder="Например, Верх тела A" value={programName} onChange={e => setProgramName(e.target.value)} /></label>
            <p className="eyebrow">ВЫБЕРИ УПРАЖНЕНИЯ</p>
            <div className="selection-list">{state.exercises.map(e => <label key={e.id} className="selection-row"><input type="checkbox" checked={programExerciseIds.includes(e.id)} onChange={event => setProgramExerciseIds(ids => event.target.checked ? [...ids, e.id] : ids.filter(id => id !== e.id))} /><span>{e.name}<small>{normalizeMuscle(e.muscle)}</small></span></label>)}</div>
            <button className="button button-primary full-width" onClick={addProgram}><Save size={16} /> Сохранить программу</button>
          </div>}
          {state.programs.length ? <div className="program-list">{state.programs.map(p => <article className="panel program-card" key={p.id}><div className="program-icon"><BookOpen size={20} /></div><div className="program-main"><h3>{p.name}</h3><p>{p.exerciseIds.length} упражнений · создана {localDate(p.createdAt)}</p><div className="program-exercises">{state.exercises.filter(e => p.exerciseIds.includes(e.id)).slice(0, 4).map(e => e.name).join(' · ')}</div><button className="button button-primary" onClick={() => startWorkout(p)}>Начать программу ↗</button></div><button className="icon-button subtle" aria-label="Удалить программу" onClick={() => { if (window.confirm(`Удалить программу «${p.name}»?`)) setState(s => ({ ...s, programs: s.programs.filter(x => x.id !== p.id) })); }}><Trash2 size={16} /></button></article>)}</div> : <Empty title="Программ пока нет" text="Создай шаблон. Он не изменит текущую тренировку, пока ты сам его не запустишь." />}
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
              {state.exercises.length === 0 && <Empty title="Библиотека пуста" text="Добавь упражнения или импортируй из истории." />}
              {orderedCategories.filter(cat => (groupedExercises[cat]?.length || 0) > 0).map(cat => {
                const exercises = groupedExercises[cat] || [];
                const expanded = expandedCategories[cat] ?? false;
                return (
                  <div className="category-block" key={cat}>
                    <button className="category-header" onClick={() => toggleCategory(cat)}>
                      <div>
                        <b>{cat}</b>
                        <small>{exercises.length} упражнений</small>
                      </div>
                      {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                    {expanded && <div className="category-exercises">
                      {exercises.map(e => (
                        <div className="library-row" key={e.id}>
                          <div>
                            <b>{e.name}</b>
                            <small>{e.equipment}</small>
                          </div>
                          <button className="icon-button subtle" aria-label={`Удалить ${e.name}`} onClick={() => {
                            if (window.confirm(`Удалить упражнение «${e.name}» из библиотеки?`)) {
                              setState(s => ({ ...s, exercises: s.exercises.filter(x => x.id !== e.id), programs: s.programs.map(p => ({ ...p, exerciseIds: p.exerciseIds.filter(id => id !== e.id) })) }));
                              notify('Упражнение удалено.');
                            }
                          }}><Trash2 size={15} /></button>
                        </div>
                      ))}
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
                <select className="field" value={exerciseMuscle} onChange={e => setExerciseMuscle(e.target.value)}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </label>
              <button className="button button-primary full-width" onClick={addCustomExercise}><Plus size={16} /> Добавить в библиотеку</button>
            </div>
          )}

        </section>}

        {tab === 'history' && <section>
          <p className="eyebrow">ТВОЯ ДИНАМИКА</p><h1>История.</h1><p className="intro">Все завершённые тренировки и показатели, пересчитываемые из истории.</p>
          <div className="stats-grid"><Metric label="ТРЕНИРОВОК" value={String(state.workouts.length)} note="всего" /><Metric label="ОБЪЁМ" value={fmt(state.workouts.reduce((n, w) => n + volume(w), 0))} note="кг × повторы" /><Metric label="ВРЕМЯ" value={String(state.workouts.reduce((n, w) => n + durationMinutes(w.startedAt, w.endedAt), 0))} note="минут" /><Metric label="XP" value={String(xp)} note={`уровень ${level}`} /></div>
          {state.workouts.length > 0 && <button className="text-danger clear-history" onClick={clearHistory}>Очистить всю историю</button>}
          {state.workouts.length ? <div className="history-list">{state.workouts.map(w => <article className="panel history-card" key={w.id}><div className="history-top"><div><h3>{w.name}</h3><p>{localDate(w.endedAt)} · {durationMinutes(w.startedAt, w.endedAt)} мин</p></div><button className="icon-button subtle" aria-label="Удалить тренировку" onClick={() => deleteWorkout(w.id)}><Trash2 size={16} /></button></div><div className="history-metrics"><span><Dumbbell size={14} /> {w.exercises.length} упр.</span><span><Check size={14} /> {setCount(w)} подходов</span><span><Activity size={14} /> {fmt(volume(w))} кг</span><strong>+{w.earnedXp} XP</strong></div><details><summary>Упражнения и подходы</summary>{w.exercises.map(e => <div className="history-exercise" key={e.id}><b>{e.name}</b><span>{e.sets.filter(s => s.done).map(s => `${s.weight || 0} кг × ${s.reps || 0}`).join(' · ') || 'Нет отмеченных подходов'}</span></div>)}</details></article>)}</div> : <Empty title="История пока пуста" text="Заверши первую тренировку. Она появится здесь вместе с деталями подходов." />}
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
            <div className="profile-avatar">{(state.profile.name.trim()[0] || 'А').toLocaleUpperCase('ru-RU')}</div>
            <div className="profile-hero-info">
              <b>{state.profile.name || 'Атлет'}</b>
              <small>{state.profile.bodyWeight ? `${state.profile.bodyWeight} кг` : 'Вес не указан'}</small>
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
            <p className="settings-header">Данные и безопасность</p>
            <div className="settings-group">
              <div className="setting-row">
                <div className="setting-icon"><ShieldCheck size={17} /></div>
                <div><b>Локальное автосохранение</b><small>Сохраняет изменения на устройстве.</small></div>
                <span className="status-dot" />
              </div>
              <div className="setting-row">
                <div className="setting-icon"><Activity size={17} /></div>
                <div><b>Облачная синхронизация</b><small>{firebaseConfigured ? 'Firebase настроен, синхронизацию нужно подключить.' : 'Не настроена в этой сборке.'}</small></div>
                <span className={`status-dot ${firebaseConfigured ? 'status-pending' : ''}`} />
              </div>
            </div>
          </div>

          <div className="settings-section">
            <p className="settings-header">Резервные копии</p>
            <div className="settings-group">
              <button className="settings-action" onClick={exportData}>
                <FileDown size={17} />
                <span><b>Экспортировать JSON</b><small>Независимая копия тренировок.</small></span>
              </button>
              <label className="settings-action">
                <Save size={17} />
                <span><b>Импортировать JSON</b><small>Восстановить из резервной копии.</small></span>
                <input type="file" accept=".json,application/json" hidden onChange={e => importData(e.target.files?.[0])} />
              </label>
            </div>
          </div>

          <div className="notice">Локальное сохранение не заменяет резервную копию. Для восстановления после смены телефона нужно подключить и проверить Firebase. В этой сборке облачная синхронизация ещё не включена.</div>
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
              <div className="picker-add-row">
                <select className="picker-add-category" value={pickerNewCategory} onChange={e => setPickerNewCategory(e.target.value)}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <button className="picker-add-button" onClick={() => addCustomInPicker(pickerQuery)}><Plus size={16} /> Добавить</button>
              </div>
            </div>
          )}
          <div className="picker-list">{filteredExercises.map(e => <button key={e.id} className="picker-row" onClick={() => addExerciseToWorkout(e)}><span><b>{e.name}</b><small>{normalizeMuscle(e.muscle)} · {e.equipment}</small></span><Plus size={18} /></button>)}{filteredExercises.length === 0 && <Empty title="Ничего не найдено" text="Введи название — можно добавить как своё упражнение." />}</div>
        </section>
      </div>}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
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
