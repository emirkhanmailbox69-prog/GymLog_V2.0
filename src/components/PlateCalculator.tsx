import { useState } from 'react';
import { X } from 'lucide-react';

type Props = {
  initialWeight: string;
  onClose: () => void;
  onApply: (weight: string) => void;
};

const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

export function PlateCalculator({ initialWeight, onClose, onApply }: Props) {
  const [target, setTarget] = useState(initialWeight || '');
  const [barWeight, setBarWeight] = useState(20);

  const targetNum = parseFloat(target.replace(',', '.'));
  const isValid = !isNaN(targetNum) && targetNum >= barWeight;
  
  let platesPerSide: number[] = [];
  if (isValid) {
    let remaining = (targetNum - barWeight) / 2;
    for (const p of PLATES) {
      while (remaining >= p) {
        platesPerSide.push(p);
        remaining -= p;
      }
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="picker-modal plate-calc-modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <p className="eyebrow">КАЛЬКУЛЯТОР</p>
            <h2>Блины на гриф</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Закрыть"><X size={20} /></button>
        </div>

        <label className="field-label">Целевой вес (кг)
          <input className="field" type="number" inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} placeholder="Например, 100" autoFocus />
        </label>

        <label className="field-label">Вес грифа (кг)
          <select className="field" value={barWeight} onChange={e => setBarWeight(Number(e.target.value))}>
            <option value={20}>20 (Олимпийский)</option>
            <option value={15}>15 (Женский)</option>
            <option value={10}>10 (Легкий)</option>
            <option value={0}>Без грифа (0)</option>
          </select>
        </label>

        <div className="plate-result">
          {!target ? (
            <p className="plate-hint">Введи вес, чтобы увидеть расчет.</p>
          ) : !isValid ? (
            <p className="plate-error">Вес должен быть больше веса грифа ({barWeight} кг).</p>
          ) : platesPerSide.length === 0 ? (
            <p className="plate-hint">Только гриф ({barWeight} кг).</p>
          ) : (
            <>
              <p className="plate-hint">На каждую сторону:</p>
              <div className="plate-list">
                {platesPerSide.map((p, i) => (
                  <div key={i} className={`plate-badge plate-${p}`}>{p} кг</div>
                ))}
              </div>
            </>
          )}
        </div>

        <button className="button button-primary full-width" onClick={() => { onApply(target); onClose(); }} disabled={!isValid}>
          Применить вес
        </button>
      </section>
    </div>
  );
}
