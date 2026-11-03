import { useState } from 'react';
import { Delete, Check, ChevronsUpDown } from 'lucide-react';
import { WheelPicker } from './WheelPicker';

type Props = {
  value: string;
  onChange: (val: string) => void;
  onClose: () => void;
  onPlateCalc?: () => void;
  onDelete?: () => void;
  isReps?: boolean;
};

export function Numpad({ value, onChange, onClose, onPlateCalc, onDelete, isReps = false }: Props) {
  const [isWheelMode, setIsWheelMode] = useState(false); // Состояние тумблера

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
      <div className="numpad-container" style={{ minHeight: '380px' }}>
        
        <div className="numpad-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="numpad-value">{value || '0'}</span>
            
            {/* МАЛЕНЬКИЙ ТУМБЛЕР ПЕРЕКЛЮЧЕНИЯ */}
            <button 
              onClick={() => setIsWheelMode(!isWheelMode)}
              style={{ 
                background: isWheelMode ? 'var(--lime)' : 'rgba(255,255,255,0.1)',
                border: 'none', borderRadius: '20px', padding: '6px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: isWheelMode ? '#000' : 'var(--muted)',
                transition: 'all 0.2s ease',
                cursor: 'pointer'
              }}
              title={isWheelMode ? "Переключить на цифры" : "Переключить на барабан"}
            >
              <ChevronsUpDown size={16} />
            </button>
          </div>

          <div className="numpad-actions">
            {onDelete && (
              <button className="numpad-action-btn" onClick={() => { onDelete(); onClose(); }} title="Удалить подход" style={{ color: '#ff6482' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            )}
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

        {/* ЕСЛИ ВКЛЮЧЕН ТУМБЛЕР - ПОКАЗЫВАЕМ КОЛЕСО */}
        {isWheelMode ? (
          <div style={{ padding: '20px 0', display: 'flex', justifyContent: 'center' }}>
            <WheelPicker 
              value={value} 
              onChange={onChange} 
              min={0} 
              max={isReps ? 50 : 300} 
              step={isReps ? 1 : 0.5} 
            />
          </div>
        ) : (
          /* ИНАЧЕ ПОКАЗЫВАЕМ ОБЫЧНУЮ КЛАВИАТУРУ */
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
