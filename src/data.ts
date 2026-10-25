import type { Exercise } from './types';

export const starterExercises: Exercise[] = [
  { id: 'bench-press', name: 'Жим штанги лёжа', muscle: 'Грудь', equipment: 'Штанга' },
  { id: 'incline-press', name: 'Жим на наклонной скамье', muscle: 'Грудь', equipment: 'Штанга' },
  { id: 'db-press', name: 'Жим гантелей лёжа', muscle: 'Грудь', equipment: 'Гантели' },
  { id: 'lat-pulldown', name: 'Тяга верхнего блока', muscle: 'Спина', equipment: 'Блок' },
  { id: 'pull-up', name: 'Подтягивания', muscle: 'Спина', equipment: 'Собственный вес' },
  { id: 'row', name: 'Тяга горизонтального блока', muscle: 'Спина', equipment: 'Блок' },
  { id: 'squat', name: 'Приседания со штангой', muscle: 'Ноги', equipment: 'Штанга' },
  { id: 'leg-press', name: 'Жим ногами', muscle: 'Ноги', equipment: 'Тренажёр' },
  { id: 'rdl', name: 'Румынская тяга', muscle: 'Ноги', equipment: 'Штанга' },
  { id: 'shoulder-press', name: 'Жим гантелей сидя', muscle: 'Плечи', equipment: 'Гантели' },
  { id: 'lateral-raise', name: 'Махи гантелями в стороны', muscle: 'Плечи', equipment: 'Гантели' },
  { id: 'curl', name: 'Подъём на бицепс', muscle: 'Бицепс', equipment: 'Гантели' },
  { id: 'pushdown', name: 'Разгибание рук на блоке', muscle: 'Трицепс', equipment: 'Блок' },
  { id: 'plank', name: 'Планка', muscle: 'Корпус', equipment: 'Собственный вес' },
  { id: 'treadmill', name: 'Беговая дорожка', muscle: 'Кардио', equipment: 'Кардио' }
];
