import { useEffect, useMemo, useState } from 'react';
import {
  Activity, BarChart3, BookOpen, Check, ChevronDown, ChevronUp, CircleUserRound,
  Clock3, Dumbbell, FileDown, Flame, Home, Plus, Save, ShieldCheck, Trash2,
  Trophy, X
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

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [tab, setTab] = useState<Tab>('home');
  const [toast, setToast] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [programName, setProgramName] = useState('');
  const [programExerciseIds, setProgramExerciseIds] = useState<string[]>([]);
  const [showProgramBuilder, setShowProgramBuilder] = useState(false);
  const [exerciseName, setExerciseName] = useState('');
  const [exerciseMuscle, setExerciseMuscle] = useState('Грудь');
  const [showExerciseBuilder, setShowExerciseBuilder] = useState(false);

  useEffect(() => {
    if (!saveState(state)) notify('Не удалось сохранить локально. Экспортируй резервную копию.');
  }, [state]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  }

  const xp = totalXp(state.workouts);
  const level = levelFor(xp);
  const currentWorkout = state.activeWorkout;
  const weeklyWorkouts = state.workouts.filter(w => Date.now() - w.endedAt < 7 * 86400000);
  const filteredExercises = useMemo(() => state.exercises.filter(e =>
    `${e.name} ${e.muscle} ${e.equipment}`.toLocaleLowerCase('ru-RU').includes(pickerQuery.toLocaleLowerCase('ru-RU'))
  ), [state.exercises, pickerQuery]);

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
    notify('Программа сохранена отдельно от текущей тренировки.');
  }

  function addCustomExercise() {
    const name = exerciseName.trim();
    if (!name) return;
    const exercise: Exercise = { id: uid(), name, muscle: exerciseMuscle, equipment: 'Пользовательское' };
    setState(s => ({ ...s, exercises: [...s.exercises, exercise] }));
    setExerciseName('');
    setShowExerciseBuilder(false);
    notify('Упражнение добавлено в библиотеку.');
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
  setState(s => ({
    ...s,
    profile: {
      name,
      bodyWeight
    }
  }));
}

  const navItems: { id: Tab; label: string; icon: typeof Home }[] = [
    { id: 'home', label: 'Главная', icon: Home },
    { id: 'workout', label: 'Тренировка', icon: Dumbbell },
    { id: 'programs', label: 'Программы', icon: BookOpen },
    { id: 'history', label: 'История', icon: BarChart3 },
    { id: 'quest', label: 'GymQuest', icon: Trophy },
    { id: 'profile', label: 'Профиль', icon: CircleUserRound }
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
          <p className="eyebrow">ТВОЯ ТРЕНИРОВОЧНАЯ СИСТЕМА</p>
          <h1>Становись<br /><span>сильнее.</span></h1>
          <p className="intro">Тренировки, история и прогресс — в одном месте.</p>
          <div className="hero-card">
            <div className="hero-glow" />
            <div className="hero-kicker"><Flame size={15} /> СЛЕДУЮЩИЙ ШАГ</div>
            <h2>{currentWorkout ? 'Тренировка уже идёт' : 'Готов к работе?'}</h2>
            <p>{currentWorkout ? 'Продолжай с того подхода, на котором остановился.' : 'Запиши рабочие подходы и отслеживай свой прогресс.'}</p>
            <button className="button button-primary" onClick={() => currentWorkout ? setTab('workout') : startWorkout()}>
              {currentWorkout ? 'Продолжить тренировку' : 'Начать тренировку'} <span>↗</span>
            </button>
          </div>
          <div className="stats-grid">
            <Metric label="ТРЕНИРОВОК" value={String(state.workouts.length)} note="за всё время" />
            <Metric label="ЗА 7 ДНЕЙ" value={String(weeklyWorkouts.length)} note="завершено" />
            <Metric label="ОБЪЁМ" value={fmt(state.workouts.reduce((n, w) => n + volume(w), 0))} note="кг × повторы" />
            <Metric label="GYMQUEST" value={`ур. ${level}`} note={`${xp} XP`} />
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

        {tab === 'programs' && <section>
          <p className="eyebrow">ПЛАНИРОВАНИЕ</p><h1>Мои программы.</h1><p className="intro">Собери шаблон один раз и запускай его, когда понадобится.</p>
          <button className="button button-primary full-width" onClick={() => setShowProgramBuilder(v => !v)}><Plus size={17} /> Создать программу</button>
          {showProgramBuilder && <div className="panel builder">
            <label className="field-label">Название программы<input className="field" placeholder="Например, Верх тела A" value={programName} onChange={e => setProgramName(e.target.value)} /></label>
            <p className="eyebrow">ВЫБЕРИ УПРАЖНЕНИЯ</p>
            <div className="selection-list">{state.exercises.map(e => <label key={e.id} className="selection-row"><input type="checkbox" checked={programExerciseIds.includes(e.id)} onChange={event => setProgramExerciseIds(ids => event.target.checked ? [...ids, e.id] : ids.filter(id => id !== e.id))} /><span>{e.name}<small>{e.muscle}</small></span></label>)}</div>
            <button className="button button-primary full-width" onClick={addProgram}><Save size={16} /> Сохранить программу</button>
          </div>}
          {state.programs.length ? <div className="program-list">{state.programs.map(p => <article className="panel program-card" key={p.id}><div className="program-icon"><BookOpen size={20} /></div><div className="program-main"><h3>{p.name}</h3><p>{p.exerciseIds.length} упражнений · создана {localDate(p.createdAt)}</p><div className="program-exercises">{state.exercises.filter(e => p.exerciseIds.includes(e.id)).slice(0, 4).map(e => e.name).join(' · ')}</div><button className="button button-primary" onClick={() => startWorkout(p)}>Начать программу ↗</button></div><button className="icon-button subtle" aria-label="Удалить программу" onClick={() => { if (window.confirm(`Удалить программу «${p.name}»?`)) setState(s => ({ ...s, programs: s.programs.filter(x => x.id !== p.id) })); }}><Trash2 size={16} /></button></article>)}</div> : <Empty title="Программ пока нет" text="Создай шаблон. Он не изменит текущую тренировку, пока ты сам его не запустишь." />}
          <SectionTitle title="Библиотека упражнений" action="Добавить" onAction={() => setShowExerciseBuilder(v => !v)} />
          {showExerciseBuilder && <div className="panel builder"><label className="field-label">Название<input className="field" value={exerciseName} onChange={e => setExerciseName(e.target.value)} placeholder="Новое упражнение" /></label><label className="field-label">Группа мышц<select className="field" value={exerciseMuscle} onChange={e => setExerciseMuscle(e.target.value)}>{['Грудь','Спина','Плечи','Бицепс','Трицепс','Ноги','Корпус','Кардио','Другое'].map(m => <option key={m}>{m}</option>)}</select></label><button className="button button-primary full-width" onClick={addCustomExercise}>Сохранить упражнение</button></div>}
          <div className="panel library-list">{state.exercises.map(e => <div className="library-row" key={e.id}><div><b>{e.name}</b><small>{e.muscle} · {e.equipment}</small></div><button className="icon-button subtle" aria-label={`Удалить ${e.name}`} onClick={() => { if (window.confirm(`Удалить упражнение «${e.name}» из библиотеки?`)) setState(s => ({ ...s, exercises: s.exercises.filter(x => x.id !== e.id), programs: s.programs.map(p => ({ ...p, exerciseIds: p.exerciseIds.filter(id => id !== e.id) })) })); }}><Trash2 size={15} /></button></div>)}</div>
        </section>}

        {tab === 'history' && <section>
          <p className="eyebrow">ТВОЯ ДИНАМИКА</p><h1>История.</h1><p className="intro">Все завершённые тренировки и показатели, пересчитываемые из истории.</p>
          <div className="stats-grid"><Metric label="ТРЕНИРОВОК" value={String(state.workouts.length)} note="всего" /><Metric label="ОБЪЁМ" value={fmt(state.workouts.reduce((n, w) => n + volume(w), 0))} note="кг × повторы" /><Metric label="ВРЕМЯ" value={String(state.workouts.reduce((n, w) => n + durationMinutes(w.startedAt, w.endedAt), 0))} note="минут" /><Metric label="XP" value={String(xp)} note={`уровень ${level}`} /></div>
          {state.workouts.length > 0 && <button className="text-danger clear-history" onClick={clearHistory}>Очистить всю историю</button>}
          {state.workouts.length ? <div className="history-list">{state.workouts.map(w => <article className="panel history-card" key={w.id}><div className="history-top"><div><h3>{w.name}</h3><p>{localDate(w.endedAt)} · {durationMinutes(w.startedAt, w.endedAt)} мин</p></div><button className="icon-button subtle" aria-label="Удалить тренировку" onClick={() => deleteWorkout(w.id)}><Trash2 size={16} /></button></div><div className="history-metrics"><span><Dumbbell size={14} /> {w.exercises.length} упр.</span><span><Check size={14} /> {setCount(w)} подходов</span><span><Activity size={14} /> {fmt(volume(w))} кг</span><strong>+{w.earnedXp} XP</strong></div><details><summary>Упражнения и подходы</summary>{w.exercises.map(e => <div className="history-exercise" key={e.id}><b>{e.name}</b><span>{e.sets.filter(s => s.done).map(s => `${s.weight || 0} кг × ${s.reps || 0}`).join(' · ') || 'Нет отмеченных подходов'}</span></div>)}</details></article>)}</div> : <Empty title="История пока пуста" text="Заверши первую тренировку. Она появится здесь вместе с деталями подходов." />}
        </section>}

        {tab === 'quest' && <section>
          <p className="eyebrow">ПРОГРЕСС И МОТИВАЦИЯ</p><h1>GymQuest.</h1><p className="intro">Игровой прогресс вычисляется из завершённых тренировок — без отдельного несогласованного счётчика XP.</p>
          <div className="quest-card"><div className="quest-icon"><Trophy size={30} /></div><p className="eyebrow">ТВОЙ РАНГ</p><h2>Уровень {level}</h2><div className="xp-line"><span>{xp % 250} / 250 XP</span><span>{250 - xp % 250} до уровня</span></div><div className="progress-track"><span style={{ width: `${(xp % 250) / 2.5}%` }} /></div><p className="quest-note">{state.workouts.length === 0 ? 'Первая тренировка откроет путь.' : `Выполнено тренировок: ${state.workouts.length}. Продолжай в своём темпе.`}</p></div>
          <div className="panel quest-rules"><h3>Как начисляется опыт</h3><p>За тренировку с хотя бы одним отмеченным выполненным подходом начисляется 20 XP плюс 5 XP за выполненный подход и 2 XP за упражнение, максимум 100 XP за занятие. Пустая тренировка XP не даёт.</p><p>Удаление тренировки пересчитывает XP и уровень из оставшейся истории.</p></div>
        </section>}

        {tab === 'profile' && <section>
          <p className="eyebrow">ТВОИ ДАННЫЕ</p><h1>Профиль.</h1><p className="intro">Настройки и инструменты сохранения.</p>
          <label className="field-label">
  Имя
  <input
    className="field"
    value={state.profile.name}
    onChange={e => updateProfile(e.target.value, state.profile.bodyWeight)}
    onBlur={() => updateProfile(state.profile.name.trim() || 'Атлет', state.profile.bodyWeight)}
    maxLength={40}
  />
</label>
          <SectionTitle title="Данные и безопасность" />
          <div className="panel settings-list"><div className="setting-row"><div className="setting-icon"><ShieldCheck size={18} /></div><div><b>Локальное автосохранение</b><small>Сохраняет изменения на этом устройстве.</small></div><span className="status-dot" /></div><div className="setting-row"><div className="setting-icon"><Activity size={18} /></div><div><b>Облачная синхронизация</b><small>{firebaseConfigured ? 'Firebase настроен, синхронизацию нужно подключить и проверить.' : 'Firebase пока не настроен в этой сборке.'}</small></div><span className={`status-dot ${firebaseConfigured ? 'status-pending' : ''}`} /></div><button className="setting-action" onClick={exportData}><FileDown size={18} /><span><b>Экспортировать JSON</b><small>Независимая резервная копия тренировок.</small></span></button><label className="setting-action"><Save size={18} /><span><b>Импортировать JSON</b><small>Восстановить данные из резервной копии.</small></span><input type="file" accept=".json,application/json" hidden onChange={e => importData(e.target.files?.[0])} /></label></div>
          <div className="notice">Важно: локальное сохранение не заменяет резервную копию. Для восстановления после смены телефона нужно подключить и проверить постоянный вход Firebase. В этой стартовой сборке облачная синхронизация ещё не включена.</div>
        </section>}
      </main>

      <nav className="tabbar" aria-label="Основная навигация">
        {navItems.map(item => { const Icon = item.icon; return <button key={item.id} className={`tab ${tab === item.id ? 'active' : ''}`} onClick={() => setTab(item.id)}><Icon size={19} strokeWidth={tab === item.id ? 2.4 : 1.8} /><span>{item.label}</span></button>; })}
      </nav>

      {pickerOpen && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setPickerOpen(false); }}><section className="picker-modal" role="dialog" aria-modal="true" aria-labelledby="picker-title"><div className="modal-head"><div><p className="eyebrow">БИБЛИОТЕКА</p><h2 id="picker-title">Добавить упражнение</h2></div><button className="icon-button" onClick={() => setPickerOpen(false)} aria-label="Закрыть"><X size={20} /></button></div><input className="field" autoFocus placeholder="Поиск упражнения или группы мышц" value={pickerQuery} onChange={e => setPickerQuery(e.target.value)} /><div className="picker-list">{filteredExercises.map(e => <button key={e.id} className="picker-row" onClick={() => addExerciseToWorkout(e)}><span><b>{e.name}</b><small>{e.muscle} · {e.equipment}</small></span><Plus size={18} /></button>)}{filteredExercises.length === 0 && <Empty title="Ничего не найдено" text="Измени поисковый запрос или добавь упражнение в библиотеку." />}</div></section></div>}

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
