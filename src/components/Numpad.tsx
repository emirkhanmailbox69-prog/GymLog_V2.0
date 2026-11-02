import { Delete, Check } from 'lucide-react';

type Props = {
  value: string;
  onChange: (val: string) => void;
  onClose: () => void;
  onPlateCalc?: () => void;
  isReps?: boolean;
};

export function Numpad({ value, onChange, onClose, onPlateCalc, isReps = false }: Props) {
  function handleKey(key: string) {
    if (key === 'back') {
      onChange(value.slice(0, -1));
    } else if (key === '.') {
      if (!value.includes('.')) onChange(value ? value + '.' : '0.');
    } else {
      onChange(value + key);
    }
  }

  function handleQuickAdd(amount: number) {
    const num = parseFloat(value) || 0;
    onChange(String(num + amount));
  }

  return (
    <div className="numpad-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="numpad-container">
        <div className="numpad-header">
          <span className="numpad-value">{value || '0'}</span>
          <div className="numpad-actions">
            {!isReps && onPlateCalc && (
              <button className="numpad-action-btn" onClick={onPlateCalc} title="Калькулятор блинов">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 10h12M6 14h12M6 18h12M6 6h12"/></svg>
              </button>
            )}
            <button className="numpad-action-btn" onClick={onClose}>
              <Check size={20} />
            </button>
          </div>
        </div>
        
        {!isReps && (
          <div className="numpad-quick-add">
            <button onClick={() => handleQuickAdd(2.5)}>+2.5</button>
            <button onClick={() => handleQuickAdd(5)}>+5</button>
            <button onClick={() => handleQuickAdd(10)}>+10</button>
          </div>
        )}

        <div className="numpad-grid">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
            <button key={n} onClick={() => handleKey(String(n))}>{n}</button>
          ))}
          {!isReps ? (
            <button onClick={() => handleKey('.')}>.</button>
          ) : (
            <button onClick={() => onChange('')} className="numpad-clear">C</button>
          )}
          <button onClick={() => handleKey('0')}>0</button>
          <button onClick={() => handleKey('back')}><Delete size={22} /></button>
        </div>
      </div>
    </div>
  );
}
