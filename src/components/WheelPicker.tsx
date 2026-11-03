import { useEffect, useRef, useState } from 'react';

type Props = {
  value: string;
  onChange: (val: string) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
};

export function WheelPicker({ value, onChange, min = 0, max = 200, step = 2.5, label }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemHeight = 44;
  const [isScrolling, setIsScrolling] = useState(false);

  const values: number[] = [];
  for (let i = min; i <= max; i += step) {
    values.push(Math.round(i * 100) / 100);
  }

  useEffect(() => {
    if (containerRef.current) {
      let index = values.indexOf(parseFloat(value));
      if (index === -1 && value !== '') {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          index = values.findIndex(v => v >= num);
          if (index === -1) index = values.length - 1;
        }
      }
      if (index === -1) index = 0;
      containerRef.current.scrollTop = index * itemHeight;
    }
  }, []);

  function handleScroll() {
    if (!containerRef.current) return;
    setIsScrolling(true);
    
    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      const index = Math.round(containerRef.current.scrollTop / itemHeight);
      const newValue = values[index];
      if (newValue !== undefined && String(newValue) !== value) {
        onChange(String(newValue));
      }
      setIsScrolling(false);
    }, 150);
    
    return () => clearTimeout(timer);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', userSelect: 'none' }}>
      {label && <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>}
      
      {/* Фиксированная ширина 140px и жесткий контейнер */}
      <div style={{ position: 'relative', height: '220px', width: '140px', overflow: 'hidden', borderRadius: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
        
        {/* Градиенты сверху и снизу для эффекта глубины */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '80px', background: 'linear-gradient(to bottom, var(--bg) 0%, transparent 100%)', zIndex: 3, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '80px', background: 'linear-gradient(to top, var(--bg) 0%, transparent 100%)', zIndex: 3, pointerEvents: 'none' }} />

        {/* Линия выделения по центру */}
        <div style={{ 
          position: 'absolute', top: '50%', left: 0, right: 0, height: `${itemHeight}px`, 
          transform: 'translateY(-50%)', borderTop: '1px solid rgba(255,255,255,0.15)', 
          borderBottom: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.03)', zIndex: 1, pointerEvents: 'none' 
        }} />

        {/* Само колесо */}
        <div 
          ref={containerRef}
          onScroll={handleScroll}
          className="wheel-scroll-container"
          style={{ 
            height: '100%', width: '100%', overflowY: 'scroll', overflowX: 'hidden', 
            scrollSnapType: 'y mandatory', padding: '88px 0',
            position: 'relative', zIndex: 2, scrollbarWidth: 'none', msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch', // Плавный скролл на iOS
            touchAction: 'pan-y' // Разрешаем только вертикальный скролл
          }}
        >
          {values.map((val) => {
            const isSelected = String(val) === value;
            return (
              <div 
                key={val}
                style={{ 
                  height: `${itemHeight}px`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  scrollSnapAlign: 'center', transition: 'all 0.15s ease-out',
                  fontSize: isSelected ? '28px' : '18px',
                  fontWeight: isSelected ? 'bold' : 'normal',
                  color: isSelected ? 'var(--lime)' : 'var(--muted)',
                  opacity: isSelected ? 1 : (isScrolling ? 0.7 : 0.3),
                  transform: `scale(${isSelected ? 1.1 : 0.85})`
                }}
              >
                {val}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
