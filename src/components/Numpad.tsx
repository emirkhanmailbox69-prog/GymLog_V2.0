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
      {/* Фиксированная высота контейнера, чтобы окно не меняло размер */}
      <div className="numpad-container" style={{ height: '420px', display: 'flex', flexDirection: 'column' }}>
        
        <div className="numpad-header" style={{ flexShrink: 0 }}>
          
          {/* 1. СЛЕВА — тумблер. Намертво зафиксирован */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            <button
              onClick={() => setIsWheelMode(!isWheelMode)}
              style={{
                width: '51px', height: '31px', borderRadius: '16px',
                backgroundColor: isWheelMode ? '#4CD964' : 'rgba(255,255,255,0.15)',
                border: 'none', padding: '2px', display: 'flex', alignItems: 'center',
                cursor: 'pointer', transition: 'background-color 0.3s ease'
              }}
              title="Переключить на барабан"
            >
              <div style={{
                width: '27px', height: '27px', borderRadius: '50%', backgroundColor: '#fff',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                transform: isWheelMode ? 'translateX(20px)' : 'translateX(0px)',
                transition: 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)'
              }} />
            </button>
          </div>

          {/* 2. ЦЕНТР — цифры. ПОКАЗЫВАЕМ ТОЛЬКО В РЕЖИМЕ КЛАВИАТУРЫ */}
          {!isWheelMode && (
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minWidth: 0, overflow: 'hidden', padding: '0 12px' }}>
              <span className="numpad-value" style={{ 
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                fontSize: '32px', fontWeight: 'bold', lineHeight: 1
              }}>
                {value ? value : <span style={{ color: 'var(--muted)' }}>—</span>}
              </span>
            </div>
          )}

          {/* Если барабан включен, цифры в центре не рендерим, оставляем пустое место для отступа */}
          {isWheelMode && <div style={{ flex: 1 }} />}

          {/* 3. СПРАВА — только иконки действий */}
          <div className="numpad-actions" style={{ flexShrink: 0 }}>
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

        {/* ОСНОВНАЯ ОБЛАСТЬ (цифры или барабан) — растягивается на оставшееся место */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {isWheelMode ? (
            <div style={{ padding: '0 16px', display: 'flex', justifyContent: 'center' }}>
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
    </div>
  );
}
