import type { BodyMeasurement } from '../types';

export function WeightChart({ measurements }: { measurements: BodyMeasurement[] }) {
  // Берем последние 30 записей и сортируем по дате
  const sorted = [...measurements].sort((a, b) => a.date - b.date).slice(-30);
  
    if (sorted.length === 0) {
    return (
      <div className="empty" style={{ margin: 0, padding: '20px 10px' }}>
        <p style={{ margin: 0, fontSize: 12 }}>Нет данных. Введи свой вес, чтобы увидеть динамику.</p>
      </div>
    );
  }

  if (sorted.length === 1) {
    const m = sorted[0];
    return (
      <div className="weight-chart-wrap" style={{ textAlign: 'center' }}>
        <svg viewBox="0 0 300 120" className="weight-chart" aria-hidden="true">
          <circle cx="150" cy="60" r="6" fill="#32d4ff" />
          <text x="150" y="45" textAnchor="middle" className="chart-label" style={{ fontSize: 14, fill: '#32d4ff' }}>{m.weight} кг</text>
          <text x="150" y="85" textAnchor="middle" className="chart-label">{new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(m.date)}</text>
        </svg>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--muted)' }}>Пока одна запись. Добавь ещё, чтобы увидеть график.</p>
      </div>
    );
  }

  const W = 300;
  const H = 120;
  const pad = { top: 10, right: 10, bottom: 20, left: 30 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  
  const values = sorted.map(m => m.weight);
  const minV = Math.min(...values) - 1;
  const maxV = Math.max(...values) + 1;
  const range = Math.max(1, maxV - minV);
  const xStep = innerW / (sorted.length - 1);
  
  const coords = sorted.map((m, i) => ({
    x: pad.left + i * xStep,
    y: pad.top + innerH - ((m.weight - minV) / range) * innerH,
    value: m.weight,
    date: m.date
  }));
  
  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L${coords[coords.length - 1].x.toFixed(1)},${(pad.top + innerH).toFixed(1)} L${coords[0].x.toFixed(1)},${(pad.top + innerH).toFixed(1)} Z`;
  
  const fmtShort = (ts: number) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(ts);

  return (
    <div className="weight-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="weight-chart" aria-hidden="true">
        <defs>
          <linearGradient id="weightAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#32d4ff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#32d4ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <text x={pad.left - 4} y={pad.top + 4} textAnchor="end" className="chart-label">{Math.round(maxV)}</text>
        <text x={pad.left - 4} y={pad.top + innerH} textAnchor="end" className="chart-label">{Math.round(minV)}</text>
        <line x1={pad.left} y1={pad.top + innerH} x2={pad.left + innerW} y2={pad.top + innerH} stroke="rgba(255,255,255,.08)" />
        <path d={areaD} fill="url(#weightAreaGradient)" />
        <path d={pathD} fill="none" stroke="#32d4ff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((c, i) => <circle key={i} cx={c.x} cy={c.y} r={3} fill="#32d4ff" />)}
        <text x={coords[0].x} y={H - 4} textAnchor="start" className="chart-label">{fmtShort(coords[0].date)}</text>
        <text x={coords[coords.length - 1].x} y={H - 4} textAnchor="end" className="chart-label">{fmtShort(coords[coords.length - 1].date)}</text>
      </svg>
    </div>
  );
}
