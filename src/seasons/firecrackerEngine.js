// 鞭炮爆破效果引擎（純 DOM + Canvas，不依賴 React，可單獨預覽／測試）。
// 一串鞭炮由畫面上方垂掛，「由最下方逐顆往上」引爆：金黃火光 → 白灰煙霧膨脹淡出 → 金紙屑／紅紙屑向四周噴散並受重力飄落。
// 疊在畫面最上層，pointer-events:none，不擋任何點擊；播完自動清除。

// 可重現的亂數（seed 相同＝每次播放一模一樣，方便測試比對）
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GOLD = ['#FFD54A', '#F5B800', '#FFE79A', '#E8A100'];
const RED = ['#D81E1E', '#B71414', '#F03A2E'];

export function playFirecrackers({
  container = document.body,
  imgSrc = '/newyear/firecracker.webp',
  count = 10,            // 鞭炮顆數（引爆次數）
  interval = 340,        // 相鄰兩顆引爆間隔 ms
  heightVh = 58,         // 整串高度（螢幕高度百分比）
  rightPct = 5,          // 距右邊百分比
  seed = 7,
  manual = false,        // true：不用 requestAnimationFrame，由呼叫端 step(ms) 推進（測試用）
  onDone,
} = {}) {
  const R = rng(seed);
  const rand = (a, b) => a + (b - a) * R();
  const pick = (arr) => arr[Math.floor(R() * arr.length)];

  const root = document.createElement('div');
  root.setAttribute('aria-hidden', 'true');
  root.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;overflow:hidden;';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
  const string = document.createElement('img');
  string.src = imgSrc;
  string.alt = '';
  string.draggable = false;
  string.style.cssText = `position:absolute;top:0;right:${rightPct}%;height:${heightVh}vh;width:auto;will-change:clip-path;`;
  root.appendChild(string);
  root.appendChild(canvas);
  container.appendChild(root);

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0;
  const resize = () => {
    W = root.clientWidth || window.innerWidth;
    H = root.clientHeight || window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  };
  resize();
  const ctx = canvas.getContext('2d');

  // 整串的實際位置（圖載入後才知道寬度，爆破中心取其水平中線）
  const geom = () => {
    const r = string.getBoundingClientRect();
    return { cx: r.left + r.width / 2, top: r.top, h: r.height || (H * heightVh) / 100, w: r.width || 80 };
  };

  const particles = [];  // 煙霧、紙屑、火花
  const flashes = [];
  let t = 0;             // 已播放毫秒
  let next = 0;          // 下一顆
  let finished = false;
  let stopped = false;

  function explode(i) {
    const g = geom();
    const f = 1 - (i + 0.5) / count;          // 這一顆在整串的相對高度（0=頂、1=底）
    const x = g.cx + rand(-g.w * 0.12, g.w * 0.12);
    const y = g.top + f * g.h;
    const last = i === count - 1;
    // 之後只剩這顆以上的鞭炮（用 clip-path 從下往上一截截消失）
    const hiddenPct = ((i + 1) / count) * 100;
    string.style.clipPath = `inset(0 0 ${hiddenPct}% 0)`;

    flashes.push({ x, y, born: t, life: last ? 220 : 150, r: last ? 110 : 70 });
    // 煙霧：柔軟的白灰團，膨脹、上飄、淡出
    const puffs = last ? 11 : 7;
    for (let k = 0; k < puffs; k++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(10, 55);
      particles.push({
        kind: 'smoke', born: t, delay: rand(0, 90), life: rand(750, 1250) * (last ? 1.25 : 1),
        x: x + Math.cos(a) * rand(0, 12), y: y + Math.sin(a) * rand(0, 12),
        vx: Math.cos(a) * sp - 12, vy: Math.sin(a) * sp * 0.5 - rand(18, 46),
        r0: rand(14, 26), r1: rand(46, 78), alpha: rand(0.3, 0.48),
        warm: rand(0.4, 1),
      });
    }
    // 金紙屑
    const gold = last ? 40 : 24;
    for (let k = 0; k < gold; k++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(130, 400);
      particles.push({
        kind: 'paper', born: t, life: rand(1200, 1900),
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(40, 150),
        w: rand(5, 10), h: rand(3, 5), rot: rand(0, 6.28), spin: rand(-9, 9),
        flip: rand(0, 6.28), flipSp: rand(5, 13), color: pick(GOLD),
      });
    }
    // 紅色碎片（少量）
    for (let k = 0; k < (last ? 10 : 6); k++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(100, 320);
      particles.push({
        kind: 'paper', born: t, life: rand(1000, 1600),
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(20, 110),
        w: rand(4, 8), h: rand(3, 6), rot: rand(0, 6.28), spin: rand(-12, 12),
        flip: rand(0, 6.28), flipSp: rand(6, 15), color: pick(RED),
      });
    }
    // 小火花（快速拖尾）
    for (let k = 0; k < 10; k++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(180, 460);
      particles.push({
        kind: 'spark', born: t, life: rand(320, 560),
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: rand(1.2, 2.4),
      });
    }
  }

  function drawFlash(fl) {
    const p = (t - fl.born) / fl.life;
    if (p < 0 || p > 1) return;
    const e = 1 - p;
    const r = fl.r * (0.45 + 0.75 * p);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, r);
    g.addColorStop(0, `rgba(255,252,225,${0.95 * e})`);
    g.addColorStop(0.3, `rgba(255,214,90,${0.75 * e})`);
    g.addColorStop(0.7, `rgba(255,140,30,${0.28 * e})`);
    g.addColorStop(1, 'rgba(255,110,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(fl.x, fl.y, r, 0, 6.2832); ctx.fill();
    // 放射光芒
    ctx.strokeStyle = `rgba(255,226,130,${0.8 * e})`;
    ctx.lineWidth = 2;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * 6.2832 + fl.born * 0.01;
      const r0 = r * 0.35, r1 = r * (0.95 + 0.4 * ((k * 37) % 5) / 5);
      ctx.beginPath();
      ctx.moveTo(fl.x + Math.cos(a) * r0, fl.y + Math.sin(a) * r0);
      ctx.lineTo(fl.x + Math.cos(a) * r1, fl.y + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawParticles(dt, smokePass) {
    const sec = dt / 1000;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if ((p.kind === 'smoke') !== smokePass) continue;
      const age = t - p.born - (p.delay || 0);
      if (age < 0) continue;
      const pr = age / p.life;
      if (pr >= 1) { particles.splice(i, 1); continue; }
      if (p.kind === 'smoke') {
        p.x += p.vx * sec; p.y += p.vy * sec;
        p.vx *= 0.985; p.vy *= 0.99;
        const grow = 1 - Math.pow(1 - pr, 2);        // 先快後慢地膨脹
        const r = p.r0 + (p.r1 - p.r0) * grow;
        const a = p.alpha * (pr < 0.15 ? pr / 0.15 : 1 - (pr - 0.15) / 0.85);
        const warm = Math.max(0, 1 - pr * 3.2) * p.warm; // 剛爆時帶一點橘黃餘光
        const g = ctx.createRadialGradient(p.x, p.y, r * 0.1, p.x, p.y, r);
        g.addColorStop(0, `rgba(${250},${244 - 40 * warm},${236 - 110 * warm},${a})`);
        g.addColorStop(0.55, `rgba(238,232,226,${a * 0.65})`);
        g.addColorStop(1, 'rgba(232,226,220,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.2832); ctx.fill();
      } else if (p.kind === 'paper') {
        p.vx *= Math.pow(0.9, sec * 6); p.vy += 520 * sec; p.vy *= Math.pow(0.9, sec * 2.2);
        p.x += p.vx * sec; p.y += p.vy * sec;
        p.rot += p.spin * sec; p.flip += p.flipSp * sec;
        const a = pr > 0.72 ? 1 - (pr - 0.72) / 0.28 : 1;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.flip));
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      } else { // spark
        const px = p.x, py = p.y;
        p.vx *= Math.pow(0.88, sec * 8); p.vy = p.vy * Math.pow(0.88, sec * 8) + 380 * sec;
        p.x += p.vx * sec; p.y += p.vy * sec;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - pr;
        ctx.strokeStyle = '#FFD968'; ctx.lineWidth = p.r; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.restore();
      }
    }
  }

  let lastTs = 0;
  function frame(dt) {
    t += dt;
    while (next < count && t >= next * interval) { explode(next); next++; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // 由下而上：煙霧 → 火光 → 紙屑／火花
    drawParticles(dt, true);
    for (let i = flashes.length - 1; i >= 0; i--) {
      if (t - flashes[i].born > flashes[i].life) flashes.splice(i, 1); else drawFlash(flashes[i]);
    }
    drawParticles(dt, false);
    if (next >= count && !particles.length && !flashes.length && !finished) finish();
  }

  function finish() {
    if (finished) return;
    finished = true;
    cleanup();
    if (onDone) onDone();
  }

  let raf = 0;
  function loop(ts) {
    if (stopped) return;
    if (document.hidden) { lastTs = 0; raf = requestAnimationFrame(loop); return; } // 離開頁面就暫停，不耗電
    const dt = lastTs ? Math.min(ts - lastTs, 50) : 16;
    lastTs = ts;
    frame(dt);
    if (!finished) raf = requestAnimationFrame(loop);
  }

  function cleanup() {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  window.addEventListener('resize', resize);
  if (!manual) {
    const start = () => { if (!stopped) raf = requestAnimationFrame(loop); };
    if (string.complete) start(); else { string.onload = start; string.onerror = start; }
  }

  return {
    stop: () => { stopped = true; cleanup(); },
    step: (ms) => { // 測試用：以固定 16ms 推進
      let left = ms;
      while (left > 0 && !finished) { const d = Math.min(16, left); frame(d); left -= d; }
    },
    get time() { return t; },
    get ready() { return string.complete; },
  };
}
