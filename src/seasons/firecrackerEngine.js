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

// 鞭炮圖（217×900）裡每一顆鞭炮的位置（圖片座標）。由下往上逐顆引爆；ang＝筒身軸向（度），rx／ry＝擦除橢圓的半長軸／半短軸。
// 最後一筆（knot）是頂端中國結與吊繩，爆得最大。
const IMG_W = 217, IMG_H = 900;
const BLASTS = [
  { x: 110, y: 850, r: 62 },                                  // 流蘇（點火處，最先炸）
  { x: 80, y: 725, ang: -35, rx: 64, ry: 42 },                // L7
  { x: 132, y: 690, ang: 40, rx: 66, ry: 42 },                // R7
  { x: 69, y: 638, ang: -35, rx: 68, ry: 42 },                // L6
  { x: 183, y: 594, ang: 40, rx: 46, ry: 34 },                // B4
  { x: 134, y: 590, ang: 40, rx: 68, ry: 42 },                // R6
  { x: 62, y: 550, ang: -35, rx: 68, ry: 42 },                // L5
  { x: 186, y: 519, ang: 40, rx: 46, ry: 34 },                // B3
  { x: 134, y: 506, ang: 40, rx: 68, ry: 42 },                // R5
  { x: 53, y: 450, ang: -35, rx: 68, ry: 42 },                // L4
  { x: 185, y: 431, ang: 40, rx: 46, ry: 34 },                // B2
  { x: 125, y: 416, ang: 40, rx: 68, ry: 42 },                // R4
  { x: 50, y: 362, ang: -35, rx: 68, ry: 42 },                // L3
  { x: 131, y: 341, ang: 40, rx: 68, ry: 42 },                // R3
  { x: 180, y: 325, ang: 40, rx: 46, ry: 34 },                // B1
  { x: 53, y: 284, ang: -35, rx: 68, ry: 42 },                // L2
  { x: 134, y: 277, ang: 40, rx: 68, ry: 42 },                // R2
  { x: 69, y: 209, ang: -35, rx: 68, ry: 42 },                // L1
  { x: 144, y: 206, ang: 40, rx: 68, ry: 42 },                // R1
  { x: 108, y: 80, r: 90, last: true },                        // 中國結與吊繩（最後一響）
];

export function playFirecrackers({
  container = document.body,
  imgSrc = '/newyear/firecracker.webp',
  interval = 190,        // 相鄰兩顆引爆間隔 ms
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
  // 鞭炮串畫在自己的 canvas 上：每顆爆破時用「擦除」把那一顆整個炸掉（不是一刀橫切）
  const sc = document.createElement('canvas');
  sc.style.cssText = 'position:absolute;top:0;';
  const img = new Image();
  img.src = imgSrc;
  let imgReady = false;
  root.appendChild(sc);
  root.appendChild(canvas);
  container.appendChild(root);

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0;
  let sk = 1;                          // 圖片座標 → 螢幕像素
  const layoutString = () => {
    sk = (H * heightVh) / 100 / IMG_H;
    const cw = IMG_W * sk, ch = IMG_H * sk;
    sc.style.width = `${cw}px`; sc.style.height = `${ch}px`; sc.style.right = `${rightPct}%`;
    sc.width = Math.round(cw * dpr); sc.height = Math.round(ch * dpr);
    const c = sc.getContext('2d');
    c.setTransform(dpr * sk, 0, 0, dpr * sk, 0, 0);
    if (imgReady) c.drawImage(img, 0, 0, IMG_W, IMG_H);
    for (let k = 0; k < Math.min(next, BLASTS.length); k++) erase(c, BLASTS[k]);   // resize 時把已炸掉的再擦一次
  };
  const resize = () => {
    W = root.clientWidth || window.innerWidth;
    H = root.clientHeight || window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    layoutString();
  };
  const ctx = canvas.getContext('2d');
  let next = 0;                        // 下一顆（resize 會用到，先宣告）

  // 擦掉某一顆：橢圓（沿筒身軸向）＋中間吊繩的一小段；最後一響把整串清掉
  function erase(c, b) {
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = '#000';
    if (b.last) { c.clearRect(0, 0, IMG_W, IMG_H); c.restore(); return; }
    c.beginPath();
    if (b.r) c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    else c.ellipse(b.x, b.y, b.rx, b.ry, (b.ang * Math.PI) / 180, 0, Math.PI * 2);
    c.fill();
    c.fillRect(86, b.y - 42, 44, 84);      // 中間吊繩與小珠
    c.fillRect(0, b.y + 62, IMG_W, IMG_H);   // 再往下一定已經炸完：清掉殘留的環片
    c.restore();
  }

  // 圖片座標 → 螢幕座標
  const toScreen = (x, y) => {
    const r = sc.getBoundingClientRect();
    return { x: r.left + x * sk, y: r.top + y * sk };
  };
  resize();

  const particles = [];  // 煙霧、紙屑、火花
  const flashes = [];
  let t = 0;             // 已播放毫秒
  let finished = false;
  let stopped = false;

  function explode(i) {
    const bl = BLASTS[i];
    const { x, y } = toScreen(bl.x, bl.y);
    const last = !!bl.last;
    erase(sc.getContext('2d'), bl);
    flashes.push({ x, y, born: t, life: last ? 240 : 140, r: last ? 120 : 52 });
    // 煙霧：柔軟的白灰團，膨脹、上飄、淡出
    const puffs = last ? 11 : 5;
    for (let k = 0; k < puffs; k++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(10, 55);
      particles.push({
        kind: 'smoke', born: t, delay: rand(0, 90), life: rand(750, 1250) * (last ? 1.25 : 1),
        x: x + Math.cos(a) * rand(0, 12), y: y + Math.sin(a) * rand(0, 12),
        vx: Math.cos(a) * sp - 12, vy: Math.sin(a) * sp * 0.5 - rand(18, 46),
        r0: rand(12, 22), r1: rand(38, 66), alpha: rand(0.3, 0.48),
        warm: rand(0.4, 1),
      });
    }
    // 金紙屑
    const gold = last ? 90 : 34;
    for (let k = 0; k < gold; k++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(130, 400);
      particles.push({
        kind: 'paper', born: t, life: rand(1400, 2200),
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(40, 150),
        w: rand(6, 12), h: rand(3.5, 6), rot: rand(0, 6.28), spin: rand(-9, 9),
        flip: rand(0, 6.28), flipSp: rand(5, 13), color: pick(GOLD),
      });
    }
    // 紅色碎片（少量）
    for (let k = 0; k < (last ? 14 : 6); k++) {
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
    for (let k = 0; k < (last ? 16 : 7); k++) {
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
    while (next < BLASTS.length && t >= next * interval) { explode(next); next++; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // 由下而上：煙霧 → 火光 → 紙屑／火花
    drawParticles(dt, true);
    for (let i = flashes.length - 1; i >= 0; i--) {
      if (t - flashes[i].born > flashes[i].life) flashes.splice(i, 1); else drawFlash(flashes[i]);
    }
    drawParticles(dt, false);
    if (next >= BLASTS.length && !particles.length && !flashes.length && !finished) finish();
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
    if (img.complete) { imgReady = true; layoutString(); start(); } else { img.onload = () => { imgReady = true; layoutString(); start(); }; img.onerror = start; }
  }

  return {
    stop: () => { stopped = true; cleanup(); },
    step: (ms) => { // 測試用：以固定 16ms 推進
      let left = ms;
      while (left > 0 && !finished) { const d = Math.min(16, left); frame(d); left -= d; }
    },
    get time() { return t; },
    get ready() { if (img.complete && !imgReady) { imgReady = true; layoutString(); } return imgReady; },
  };
}
