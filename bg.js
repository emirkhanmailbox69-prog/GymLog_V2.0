(function(){
  if (typeof state === 'undefined') return;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;display:none';
  document.body.prepend(canvas);
  const appEl = document.getElementById('app');
  if (appEl) { appEl.style.position = 'relative'; appEl.style.zIndex = '1'; }
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;

  function resize(){
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (w === W && h === H && canvas.width > 0) return false;
    W = w; H = h;
    canvas.width = Math.max(1, W * DPR);
    canvas.height = Math.max(1, H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    return true;
  }

  function mulberry32(a){
    return function(){
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const MONTH_HUES = [215, 205, 195, 185, 170, 160, 200, 220, 240, 260, 250, 230];
  let stars = [], builtFor = -1;

  function buildStars(){
    const h = state.history || [];
    stars = h.slice(0, 220).map(w => {
      const rnd = mulberry32(Math.floor(w.start / 1000));
      const vol = volumeOf(w), sets = setsOf(w);
      return {
        x: rnd(), y: rnd() * 0.92,
        r: 1.2 + Math.min(3.0, vol / 5000),
        a: 0.28 + Math.min(0.5, sets / 60),
        ph: rnd() * Math.PI * 2,
        sp: 0.3 + rnd() * 0.7,
        dy: (rnd() - 0.5) * 0.006,
        hueOff: (rnd() - 0.5) * 24
      };
    });
    builtFor = h.length;
  }

  function mood(){
    const h = state.history || [];
    if (!h.length) return { glow: 0, dead: false };
    const now = Date.now();
    const week = h.filter(w => now - w.start < 7 * 864e5).length;
    return { glow: Math.min(1, week / 4), dead: new Date(h[0].start).getHours() >= 23 };
  }

  function draw(time){
    if (W < 10 || H < 10) return;
    const t = time / 1000;
    ctx.clearRect(0, 0, W, H);
    const baseHue = MONTH_HUES[new Date().getMonth()];
    const m = mood();
    if (m.glow > 0){
      const g = ctx.createRadialGradient(W/2, H*1.15, 10, W/2, H*1.15, H*0.9);
      g.addColorStop(0, 'hsla(' + (baseHue + 40) + ',80%,55%,' + (0.14 * m.glow).toFixed(3) + ')');
      g.addColorStop(1, 'hsla(0,0%,0%,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (m.dead){
      const g2 = ctx.createRadialGradient(W/2, -H*0.2, 10, W/2, -H*0.2, H*0.8);
      g2.addColorStop(0, 'hsla(355,70%,45%,0.09)');
      g2.addColorStop(1, 'hsla(0,0%,0%,0)');
      ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
    }
    for (let i = 0; i < stars.length; i++){
      const s = stars[i];
      const tw = 0.75 + 0.25 * Math.sin(t * s.sp + s.ph);
      const x = (s.x + Math.sin(t * 0.05 + s.ph) * 0.01) * W;
      const y = (((s.y + t * s.dy) % 1) + 1) % 1 * H;
      ctx.beginPath();
      ctx.fillStyle = 'hsla(' + (baseHue + s.hueOff).toFixed(0) + ',70%,75%,' + (s.a * tw).toFixed(3) + ')';
      ctx.arc(x, y, s.r, 0, 6.2832);
      ctx.fill();
    }
  }

  let visible = false, raf = 0;

  function frame(t){
    if (!visible) { raf = 0; return; }
    if (W < 10 || H < 10) resize();
    draw(t);
    raf = requestAnimationFrame(frame);
  }

  window.addEventListener('resize', () => {
    if (visible) { resize(); draw(performance.now()); }
  });

  setInterval(function(){
    if (typeof state === 'undefined') return;
    const want = state.screen === 'HOME';
    const len = (state.history || []).length;
    if (want && !visible){
      visible = true;
      canvas.style.display = 'block';
      if (builtFor !== len) buildStars();
      resize();
      draw(performance.now());
      if (!raf) raf = requestAnimationFrame(frame);
    } else if (!want && visible){
      visible = false;
      canvas.style.display = 'none';
    } else if (want && builtFor !== len){
      buildStars();
    }
  }, 500);
})();
