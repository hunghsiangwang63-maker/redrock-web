// 鞭炮爆破效果引擎（純 DOM + Canvas，不依賴 React；v5：9 顆獨立筒身逐顆碎裂、蓬鬆煙霧圖、翻轉金紙屑）。
// 素材與動畫邏輯來自使用者提供的「RedRock_2027_Firecracker_Refined_v5_CloudConfetti」，
// 這裡改成：全螢幕透明疊層（不擋點擊）、可手動步進（測試）、可停止與自動清除、金紙屑加量。
// 9 顆鞭炮由下往上逐顆碎裂：金黃火光 → 筒身扇形碎片飛散 → 蓬鬆煙霧 → 金紙屑／紅碎片翻飛飄落。

const tau = Math.PI * 2;
const VW = 520, VH = 780;               // 原作的虛擬畫布（座標以此為準）
const SPRITE = 174;                     // 單顆筒身顯示大小（虛擬單位）
const COUNT = 9;
// 每顆筒身「紅色部分」的軸向（弧度，已正規化到 ±90° 內讓字不會倒過來）與紅色區域中心偏移（虛擬單位，相對圖中心）；由各圖的紅色像素分佈量得（不含金環），字印在紅色正中央。
const AXIS = [-0.854, 0.89, 0.817, -0.78, -0.872, -0.863, -0.854, -0.963, 0.935];
const CEN = [[18.4, 0.1], [-15.3, 2.4], [-19.8, 3.5], [16.5, 0.8], [19.3, 0.0], [18.5, -1.0], [17.0, -0.3], [19.8, -3.0], [-16.9, 1.4]];
const BLESS = '恭賀新禧';
const FONT = '700 14px "PingFang TC","Noto Serif TC","Noto Sans TC","Songti TC","Microsoft JhengHei",serif';

function mkRng(seed) {
  let s = seed | 0;
  return () => { s = (Math.imul(1664525, s) + 1013904223) | 0; return (s >>> 0) / 4294967296; };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function playFirecrackers({
  container = document.body,
  base = '/newyear/fx/',
  heightVh = 70,         // 虛擬畫布 780 單位對應的螢幕高度百分比
  rightPct = 3,          // 鞭炮串距右邊的百分比
  confettiPerBlast = 42, // 每顆爆破的金紙屑數量（原作 21，依使用者要求加量）
  seed = 923711,
  manual = false,        // true：不用 requestAnimationFrame，由呼叫端 step(ms) 推進（測試用）
  onDone,
} = {}) {
  const rnd = mkRng(seed);
  const range = (a, b) => a + (b - a) * rnd();

  const root = document.createElement('div');
  root.setAttribute('aria-hidden', 'true');
  root.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;overflow:hidden;';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
  root.appendChild(canvas);
  container.appendChild(root);
  const ctx = canvas.getContext('2d', { alpha: true });

  const load = (src) => { const im = new Image(); im.src = src; return im; };
  const images = Array.from({ length: COUNT }, (_, i) => load(`${base}firecracker_${String(i + 1).padStart(2, '0')}.webp`));
  const smokeImages = ['smoke_puff', 'smoke_warm'].map((n) => load(`${base}${n}.webp`));

  const cracker = Array.from({ length: COUNT }, (_, i) => ({
    i,
    x: i % 2 ? 294 : 226,
    y: 153 + i * 57,
    angle: i % 2 ? 0.27 : -0.27,
    scale: i % 3 === 0 ? 1.0 : (i % 3 === 1 ? 0.98 : 1.02),
    hit: 0.52 + (COUNT - 1 - i) * 0.405,     // 最下面那顆最先炸
    broken: false,
  }));
  const duration = 4.25;

  let sparks = [], confetti = [], smoke = [], fragments = [], flashes = [];
  let t = 0, finished = false, stopped = false, raf = 0, lastTs = 0;
  let W = 0, H = 0, s = 1, tx = 0;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    W = root.clientWidth || window.innerWidth;
    H = root.clientHeight || window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    s = (H * heightVh) / 100 / VH;                       // 虛擬單位 → 螢幕像素
    tx = W - (W * rightPct) / 100 - 385 * s;             // 虛擬 x=385（串右緣）對到靠右位置
  }
  resize();

  // 在筒身上沿軸向印「恭賀新禧」小金字（座標＝筒圖中心為原點的圖面空間）
  function label(i) {
    ctx.save();
    ctx.translate(CEN[i][0], CEN[i][1]); ctx.rotate(AXIS[i]);
    ctx.font = FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(110,12,12,.85)';
    ctx.shadowColor = 'rgba(70,0,0,.55)'; ctx.shadowBlur = 2;
    ctx.fillStyle = '#FFE08A';
    for (let k = 0; k < BLESS.length; k++) {
      const x = (k - (BLESS.length - 1) / 2) * 17;
      ctx.strokeText(BLESS[k], x, 0); ctx.fillText(BLESS[k], x, 0);
    }
    ctx.restore();
  }
  function drawSource(p) {
    const im = images[p.i]; if (!im || !im.naturalWidth) return;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle); ctx.scale(p.scale, p.scale);
    ctx.drawImage(im, -SPRITE / 2, -SPRITE / 2, SPRITE, SPRITE);
    label(p.i);
    ctx.restore();
  }
  // 吊繩：隨鞭炮消失而縮短（不留一條空繩）
  function rope(time) {
    let last = -1;
    for (let i = 0; i < cracker.length; i++) if (time < cracker[i].hit) last = i;
    if (last < 0) return;
    const end = cracker[last].y + 30;
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = '#15100f'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(260, 48); ctx.bezierCurveTo(240, 95, 270, 135, 255, 190);
    for (let y = 190; y < end; y += 45) ctx.lineTo(259 + Math.sin(y / 28) * 8, y);
    ctx.lineTo(259 + Math.sin(end / 28) * 8, end); ctx.stroke();
    ctx.strokeStyle = 'rgba(150,135,125,.55)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(258, 50); ctx.lineTo(255, Math.min(end, 190)); ctx.stroke(); ctx.restore();
  }
  // 筒身碎成 13 個扇形碎片（各自速度與旋轉）
  function shatter(p) {
    const N = 13, r = SPRITE * 0.57;
    for (let k = 0; k < N; k++) {
      const a0 = (tau * k) / N, a1 = (tau * (k + 1)) / N, center = (a0 + a1) / 2;
      fragments.push({
        p, a0, a1, r, age: 0, life: range(0.30, 0.52),
        vx: Math.cos(center) * range(63, 172) + range(-26, 26),
        vy: Math.sin(center) * range(65, 173) - range(30, 87),
        turn: range(-5.5, 5.5), spin: range(-0.18, 0.18),
        x: p.x, y: p.y, originAngle: p.angle,
      });
    }
  }
  function blast(p) {
    shatter(p);
    flashes.push({ x: p.x, y: p.y, age: 0, life: 0.23, r: 54 });
    for (let j = 0; j < 17; j++) {
      const a = range(0, tau), speed = range(110, 272);
      sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 28, age: 0, life: range(0.27, 0.77), size: range(3, 8), warm: j % 3 === 0 });
    }
    for (let j = 0; j < confettiPerBlast; j++) {
      const a = range(0, tau), speed = range(43, 175);
      confetti.push({
        x: p.x, y: p.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - range(40, 105),
        age: 0, life: range(1.1, 2.3), w: range(3.5, 9), h: range(3.5, 11),
        rot: range(0, tau), spin: range(-9, 9), sway: range(0, tau), red: j % 8 === 0,
        flip: range(0, tau), flipSpeed: range(8, 18), fold: range(0.15, 0.75),
      });
    }
    for (let j = 0; j < 11; j++) {
      const a = range(0, tau), speed = range(12, 52);
      smoke.push({
        x: p.x + range(-13, 13), y: p.y + range(-11, 11),
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed * 0.5 - range(18, 43),
        r: range(22, 39), age: 0, life: range(1.6, 2.65),
        sprite: j % 4 === 0 ? 1 : 0, rot: range(-0.28, 0.28), spin: range(-0.26, 0.26),
        lag: range(0, 0.22), opa: range(0.49, 0.78),
      });
    }
  }
  function drawFragments(dt) {
    const next = [];
    for (const f of fragments) {
      f.age += dt; if (f.age >= f.life) continue;
      const u = f.age / f.life;
      f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 245 * dt; f.spin += f.turn * dt;
      const im = images[f.p.i]; if (!im.naturalWidth) continue;
      ctx.save(); ctx.globalAlpha = Math.pow(1 - u, 0.58);
      ctx.translate(f.x, f.y); ctx.rotate(f.originAngle + f.spin); ctx.scale(f.p.scale * (1 - u * 0.3), f.p.scale * (1 - u * 0.3));
      ctx.beginPath(); ctx.moveTo(0, 0);
      for (let j = 0; j <= 5; j++) { const a = f.a0 + ((f.a1 - f.a0) * j) / 5; ctx.lineTo(Math.cos(a) * f.r, Math.sin(a) * f.r); }
      ctx.closePath(); ctx.clip();
      ctx.drawImage(im, -SPRITE / 2, -SPRITE / 2, SPRITE, SPRITE);
      label(f.p.i);
      ctx.restore(); next.push(f);
    }
    fragments = next;
  }
  function drawFlashes(dt) {
    const next = [];
    for (const f of flashes) {
      f.age += dt; if (f.age > f.life) continue;
      const u = f.age / f.life, r = f.r * (0.37 + u * 0.92);
      const g = ctx.createRadialGradient(f.x, f.y, 1, f.x, f.y, r);
      g.addColorStop(0, `rgba(255,255,231,${(1 - u) * 0.95})`);
      g.addColorStop(0.17, `rgba(255,225,109,${(1 - u) * 0.83})`);
      g.addColorStop(0.42, `rgba(255,143,27,${(1 - u) * 0.36})`);
      g.addColorStop(1, 'rgba(255,130,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, tau); ctx.fill(); next.push(f);
    }
    flashes = next;
  }
  function drawSmoke(dt) {
    const next = [];
    for (const sm of smoke) {
      sm.age += dt;
      if (sm.age >= sm.life) continue;
      if (sm.age < sm.lag) { next.push(sm); continue; }
      const u = Math.max(0, (sm.age - sm.lag) / (sm.life - sm.lag));
      sm.x += sm.vx * dt; sm.y += sm.vy * dt; sm.vx *= Math.max(0, 1 - 0.38 * dt); sm.rot += sm.spin * dt;
      const swell = 0.54 + Math.min(1, u * 2.4) * 0.95;
      const alpha = sm.opa * Math.min(1, u * 13) * Math.pow(1 - u, 1.12);
      const radius = sm.r * swell * 1.55;
      const im = smokeImages[sm.sprite];
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(sm.x, sm.y); ctx.rotate(sm.rot);
      if (im && im.naturalWidth) ctx.drawImage(im, -radius, -radius * 0.95, radius * 2, radius * 1.9);
      else {
        const g = ctx.createRadialGradient(0, 0, 1, 0, 0, radius);
        g.addColorStop(0, '#e9e3dd'); g.addColorStop(0.48, '#c8c4c2'); g.addColorStop(1, 'rgba(195,193,190,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, radius, 0, tau); ctx.fill();
      }
      ctx.restore(); next.push(sm);
    }
    smoke = next;
  }
  function drawSparks(dt) {
    const next = [];
    for (const sp of sparks) {
      sp.age += dt; if (sp.age >= sp.life) continue;
      sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.vy += 230 * dt; sp.vx *= Math.max(0, 1 - 1.2 * dt);
      const a = Math.pow(1 - sp.age / sp.life, 1.4);
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = sp.warm ? '#ff8b28' : '#ffdb6c';
      ctx.lineWidth = range(1.1, 2.5); ctx.shadowColor = '#ffb532'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(sp.x - sp.vx * 0.017, sp.y - sp.vy * 0.017); ctx.lineTo(sp.x, sp.y); ctx.stroke(); ctx.restore(); next.push(sp);
    }
    sparks = next;
  }
  function drawConfetti(dt) {
    const next = [];
    for (const c of confetti) {
      c.age += dt; if (c.age >= c.life) continue;
      c.x += (c.vx + Math.sin(c.age * 7 + c.sway) * 17) * dt;
      c.y += c.vy * dt; c.vy += 150 * dt; c.vx *= Math.max(0, 1 - 0.64 * dt); c.rot += c.spin * dt;
      const sc = Math.cos(c.flip + c.age * c.flipSpeed);
      const a = Math.min(1, c.age * 13) * clamp((c.life - c.age) / 0.42, 0, 1);
      ctx.save(); ctx.globalAlpha = a; ctx.translate(c.x, c.y); ctx.rotate(c.rot); ctx.scale(Math.max(0.15, Math.abs(sc)), 1);
      const bright = sc > 0;
      ctx.fillStyle = c.red ? (bright ? '#e3442a' : '#a52e25') : (bright ? '#ffdf78' : '#bd841a');
      ctx.beginPath(); ctx.moveTo(-c.w / 2, -c.h / 2);
      ctx.quadraticCurveTo(c.w * 0.2, -c.h * 0.75, c.w / 2, -c.h / 2 + c.fold * 3);
      ctx.lineTo(c.w / 2, c.h / 2); ctx.quadraticCurveTo(-c.w * 0.18, c.h * 0.66, -c.w / 2, c.h / 2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = c.red ? 'rgba(255,185,88,.5)' : 'rgba(255,250,189,.72)';
      ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-c.w * 0.25, -c.h * 0.36); ctx.lineTo(-c.w * 0.18, c.h * 0.3); ctx.stroke();
      ctx.restore(); next.push(c);
    }
    confetti = next;
  }

  function frame(dt) {
    t += dt;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * tx, 0);
    rope(t);
    for (const p of cracker) {
      if (!p.broken && t >= p.hit) { p.broken = true; blast(p); }
      if (!p.broken) drawSource(p);
    }
    drawFragments(dt); drawSmoke(dt); drawFlashes(dt); drawSparks(dt); drawConfetti(dt);
    if (t >= duration && !fragments.length && !smoke.length && !sparks.length && !confetti.length && !flashes.length) finish();
  }
  function finish() {
    if (finished) return;
    finished = true; cleanup();
    if (onDone) onDone();
  }
  function cleanup() {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    if (root.parentNode) root.parentNode.removeChild(root);
  }
  function loop(ts) {
    if (stopped) return;
    if (document.hidden) { lastTs = 0; raf = requestAnimationFrame(loop); return; }   // 離開頁面暫停，不耗電
    const dt = lastTs ? clamp((ts - lastTs) / 1000, 0, 0.045) : 0.016;
    lastTs = ts;
    frame(dt);
    if (!finished) raf = requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  const all = [...images, ...smokeImages];
  const ready = () => all.every((im) => im.complete);
  if (!manual) {
    const start = () => { if (!stopped) raf = requestAnimationFrame(loop); };
    // 素材都載入（或失敗）後才開始，避免一開始整串鞭炮還沒圖就開始計時
    Promise.all(all.map((im) => (im.decode ? im.decode().catch(() => null) : null))).then(start);
  }
  void VW;

  return {
    stop: () => { stopped = true; cleanup(); },
    step: (ms) => { let left = ms / 1000; while (left > 0 && !finished) { const d = Math.min(0.016, left); frame(d); left -= d; } },
    get time() { return t; },
    get ready() { return ready(); },
  };
}
