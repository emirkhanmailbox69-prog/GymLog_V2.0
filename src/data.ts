import type { Exercise } from './types';

export const starterExercises: Exercise[] = [
  // Ноги и ягодицы
  { id: 'squat-barbell', name: 'Приседания со штангой на плечах', muscle: 'Ноги и ягодицы', equipment: 'Штанга' },
  { id: 'squat-plie', name: 'Приседания плие / сумо', muscle: 'Ноги и ягодицы', equipment: 'Штанга' },
  { id: 'squat-front', name: 'Фронтальные приседания', muscle: 'Ноги и ягодицы', equipment: 'Штанга' },
  { id: 'hack-squat', name: 'Гакк-приседания', muscle: 'Ноги и ягодицы', equipment: 'Тренажёр' },
  { id: 'leg-press', name: 'Жим ногами в тренажере', muscle: 'Ноги и ягодицы', equipment: 'Тренажёр' },
  { id: 'goblet-squat', name: 'Гобулет-приседания с гантелью', muscle: 'Ноги и ягодицы', equipment: 'Гантель' },
  { id: 'rdl-barbell', name: 'Румынская тяга со штангой', muscle: 'Ноги и ягодицы', equipment: 'Штанга' },
  { id: 'rdl-dumbbell', name: 'Румынская тяга с гантелями', muscle: 'Ноги и ягодицы', equipment: 'Гантель' },
  { id: 'lunges-dumbbell', name: 'Выпады с гантелями', muscle: 'Ноги и ягодицы', equipment: 'Гантель' },
  { id: 'bulgarian-split', name: 'Болгарские сплит-приседания', muscle: 'Ноги и ягодицы', equipment: 'Гантель' },
  { id: 'hip-thrust', name: 'Ягодичный мостик со штангой', muscle: 'Ноги и ягодицы', equipment: 'Штанга' },
  { id: 'leg-ext', name: 'Разгибания ног в тренажере', muscle: 'Ноги и ягодицы', equipment: 'Тренажёр' },
  { id: 'leg-curl-lying', name: 'Сгибания ног лежа в тренажере', muscle: 'Ноги и ягодицы', equipment: 'Тренажёр' },
  { id: 'leg-curl-seated', name: 'Сгибания ног сидя в тренажере', muscle: 'Ноги и ягодицы', equipment: 'Тренажёр' },
  { id: 'hip-adduction', name: 'Сведение ног в тренажере', muscle: 'Ноги и ягодицы', equipment: 'Тренажёр' },
  { id: 'hip-abduction', name: 'Разведение ног в тренажере', muscle: 'Ноги и ягодицы', equipment: 'Тренажёр' },
  { id: 'calf-raise-standing', name: 'Подъемы на носки стоя', muscle: 'Ноги и ягодицы', equipment: 'Тренажёр' },
  { id: 'calf-raise-seated', name: 'Подъемы на носки сидя', muscle: 'Ноги и ягодицы', equipment: 'Тренажёр' },

  // Спина
  { id: 'pull-up', name: 'Подтягивания на турнике', muscle: 'Спина', equipment: 'Собственный вес' },
  { id: 'lat-pulldown-front', name: 'Тяга верхнего блока к груди', muscle: 'Спина', equipment: 'Блок' },
  { id: 'lat-pulldown-parallel', name: 'Тяга верхнего блока параллельным хватом', muscle: 'Спина', equipment: 'Блок' },
  { id: 'deadlift', name: 'Становая тяга', muscle: 'Спина', equipment: 'Штанга' },
  { id: 'barbell-row', name: 'Тяга штанги в наклоне', muscle: 'Спина', equipment: 'Штанга' },
  { id: 'dumbbell-row-one-arm', name: 'Тяга гантели одной рукой в наклоне', muscle: 'Спина', equipment: 'Гантель' },
  { id: 'cable-row', name: 'Тяга горизонтального блока к поясу', muscle: 'Спина', equipment: 'Блок' },
  { id: 't-bar-row', name: 'Тяга Т-грифа', muscle: 'Спина', equipment: 'Штанга' },
  { id: 'cable-pullover', name: 'Пуловер на верхнем блоке', muscle: 'Спина', equipment: 'Блок' },
  { id: 'shrug-barbell', name: 'Шраги со штангой', muscle: 'Спина', equipment: 'Штанга' },
  { id: 'shrug-dumbbell', name: 'Шраги с гантелями', muscle: 'Спина', equipment: 'Гантель' },
  { id: 'hyperextension', name: 'Гиперэкстензия', muscle: 'Спина', equipment: 'Тренажёр' },

  // Грудь
  { id: 'bench-press-flat', name: 'Жим штанги лежа на горизонтальной скамье', muscle: 'Грудь', equipment: 'Штанга' },
  { id: 'db-press-flat', name: 'Жим гантелей лежа на горизонтальной скамье', muscle: 'Грудь', equipment: 'Гантель' },
  { id: 'incline-press-barbell-up', name: 'Жим штанги на наклонной скамье вверх', muscle: 'Грудь', equipment: 'Штанга' },
  { id: 'incline-press-db-up', name: 'Жим гантелей на наклонной скамье вверх', muscle: 'Грудь', equipment: 'Гантель' },
  { id: 'incline-press-barbell-down', name: 'Жим штанги на наклонной скамье вниз', muscle: 'Грудь', equipment: 'Штанга' },
  { id: 'hammer-press', name: 'Жим в тренажере Хаммер', muscle: 'Грудь', equipment: 'Тренажёр' },
  { id: 'dips', name: 'Отжимания на брусьях', muscle: 'Грудь', equipment: 'Собственный вес' },
  { id: 'butterfly', name: 'Сведения рук в тренажере Бабочка', muscle: 'Грудь', equipment: 'Тренажёр' },
  { id: 'cable-fly-upper', name: 'Сведение рук в кроссовере через верхние блоки', muscle: 'Грудь', equipment: 'Блок' },
  { id: 'push-up', name: 'Отжимания от пола', muscle: 'Грудь', equipment: 'Собственный вес' },

  // Плечи (Дельты)
  { id: 'military-press', name: 'Армейский жим стоя', muscle: 'Плечи (Дельты)', equipment: 'Штанга' },
  { id: 'db-shoulder-press', name: 'Жим гантелей сидя', muscle: 'Плечи (Дельты)', equipment: 'Гантель' },
  { id: 'arnold-press', name: 'Жим Арнольда', muscle: 'Плечи (Дельты)', equipment: 'Гантель' },
  { id: 'lateral-raise-db', name: 'Махи гантелями в стороны', muscle: 'Плечи (Дельты)', equipment: 'Гантель' },
  { id: 'lateral-raise-cable', name: 'Махи в кроссовере в стороны', muscle: 'Плечи (Дельты)', equipment: 'Блок' },
  { id: 'upright-row', name: 'Тяга штанги к подбородку', muscle: 'Плечи (Дельты)', equipment: 'Штанга' },
  { id: 'rear-delt-raise-db', name: 'Махи гантелями в наклоне на заднюю дельту', muscle: 'Плечи (Дельты)', equipment: 'Гантель' },
  { id: 'rear-delt-machine', name: 'Махи на заднюю дельту в тренажере', muscle: 'Плечи (Дельты)', equipment: 'Тренажёр' },
  { id: 'face-pull', name: 'Тяга каната к лицу в кроссовере', muscle: 'Плечи (Дельты)', equipment: 'Блок' },

  // Руки (Бицепс и Трицепс)
  { id: 'barbell-curl', name: 'Подъем штанги на бицепс стоя', muscle: 'Руки (Бицепс и Трицепс)', equipment: 'Штанга' },
  { id: 'db-curl-supination', name: 'Подъем гантелей на бицепс с супинацией', muscle: 'Руки (Бицепс и Трицепс)', equipment: 'Гантель' },
  { id: 'hammer-curl', name: 'Сгибания «Молотки» с гантелями', muscle: 'Руки (Бицепс и Трицепс)', equipment: 'Гантель' },
  { id: 'scott-curl', name: 'Сгибания на скамье Скотта', muscle: 'Руки (Бицепс и Трицепс)', equipment: 'Штанга' },
  { id: 'concentration-curl', name: 'Концентрированные сгибания с гантелью', muscle: 'Руки (Бицепс и Трицепс)', equipment: 'Гантель' },
  { id: 'close-grip-bench', name: 'Жим лежа узким хватом', muscle: 'Руки (Бицепс и Трицепс)', equipment: 'Штанга' },
  { id: 'pushdown', name: 'Разгибания рук на верхнем блоке в кроссовере', muscle: 'Руки (Бицепс и Трицепс)', equipment: 'Блок' },
  { id: 'french-press', name: 'Французский жим со штангой лежа', muscle: 'Руки (Бицепс и Трицепс)', equipment: 'Штанга' },
  { id: 'overhead-db-ext', name: 'Разгибание рук с гантелью из-за головы', muscle: 'Руки (Бицепс и Трицепс)', equipment: 'Гантель' },
  { id: 'bench-dips', name: 'Отжимания от скамьи сзади', muscle: 'Руки (Бицепс и Трицепс)', equipment: 'Собственный вес' },

  // Пресс и кор
  { id: 'crunch', name: 'Скручивания на пресс', muscle: 'Пресс и кор', equipment: 'Собственный вес' },
  { id: 'hanging-leg-raise', name: 'Подъем ног в висе на турнике', muscle: 'Пресс и кор', equipment: 'Собственный вес' },
  { id: 'jackknife', name: 'Книжка / одновременный подъем рук и ног', muscle: 'Пресс и кор', equipment: 'Собственный вес' },
  { id: 'cable-crunch', name: 'Скручивания на верхнем блоке на коленях «Молитва»', muscle: 'Пресс и кор', equipment: 'Блок' },
  { id: 'plank', name: 'Планка', muscle: 'Пресс и кор', equipment: 'Собственный вес' }
];
