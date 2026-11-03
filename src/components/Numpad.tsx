import { useState } from 'react';
import { Delete, Check } from 'lucide-react';
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
  const [isWheelMode, setIsWheelMode] = useState(false);

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
      <div className="numpad-container" style={{ minHeight: '400px' }}>
        
        <div className="numpad-header">
          {/* Вместо нуля — прочерк, если пусто */}
          <span className="numpad-value">
            {value ? value : <span style={{ color: 'var(--muted)' }}>—</span>}
          </span>

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

        {/* СТИЛЬНЫЙ ПЕРЕКЛЮЧАТЕЛЬ РЕЖИМОВ (КАК В IOS) */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '4px', margin: '0 16px 16px' }}>
          <button 
            onClick={() => setIsWheelMode(false)}
            style={{ 
              flex: 1, padding: '10px', borderRadius: '8px', border: 'none', 
              background: !isWheelMode ? 'rgba(208, 244, 119, 0.15)' : 'transparent', 
              color: !isWheelMode ? 'var(--lime)' : 'var(--muted)', 
              fontWeight: !isWheelMode ? 'bold' : 'normal', fontSize: '14px', transition: 'all 0.2s ease' 
            }}
          >
            Клавиатура
          </button>
          <button 
            onClick={() => setIsWheelMode(true)}
            style={{ 
              flex: 1, padding: '10px', borderRadius: '8px', border: 'none', 
              background: isWheelMode ? 'rgba(208, 244, 119, 0.15)' : 'transparent', 
              color: isWheelMode ? 'var(--lime)' : 'var(--muted)', 
              fontWeight: isWheelMode ? 'bold' : 'normal', fontSize: '14px', transition: 'all 0.2s ease' 
            }}
          >
            Барабан
          </button>
        </div>

        {isWheelMode ? (
          <div style={{ padding: '10px 0 20px', display: 'flex', justifyContent: 'center' }}>
            <WheelPicker 
              value={value} 
              onChange={onChange} 
              min={0} 
              max={isReps ? 50 : 300} 
              step={isReps ? 1 : 0.5} 
            />
          </div>
        ) : (
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
