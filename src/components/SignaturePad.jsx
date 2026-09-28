import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';

// 簡易簽名畫布，無外部套件依賴。
// 透過 ref 取得：isEmpty() / isTooSimple() / clear() / toDataURL()
//
// ── 2026-09-28：isTooSimple()，擋掉「隨便畫一條線／點一下」這類明顯不是簽名的塗鴉 ──
// 不做真正的筆跡辨識（OCR/手寫辨識），純粹分析畫圖過程的幾何特徵（真正商用電子簽署產品
// 常見的做法、見對話說明）：跟簽名圖片內容本身寫什麼完全無關，只看「這像不像一次認真簽名
// 的動作」——
//   ① 涵蓋範圍（外接矩形對角線）太小 → 只是點一下/短短劃一下
//   ② 總描點數太少 → 動作太短促
//   ③ 只有一筆、且路徑長度接近直線距離（幾乎沒有轉折）→ 一筆拖過去的直線塗鴉
// 三者命中任一即視為「過於簡單」。刻意保留寬鬆：多筆的簽名（中文姓名幾乎必為多筆）完全不受
// 這條規則限制；單筆但軌跡有彎曲（如英文草寫簽名）也不會被擋——只擋最明顯的「應付了事」案例。
const MIN_BOUNDS_DIAGONAL = 40;   // px，涵蓋範圍對角線下限
const MIN_TOTAL_POINTS = 8;       // 總描點數下限
const MIN_SINGLE_STROKE_RATIO = 1.3; // 單筆時「路徑長度 / 首尾直線距離」下限，接近 1 代表近乎直線

const SignaturePad = forwardRef(function SignaturePad({ height = 160 }, ref) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const [hasSignature, setHasSignature] = useState(false);
  // 筆劃幾何資料（供 isTooSimple() 判斷；與畫面渲染分開追蹤，僅供程式判斷用）
  const strokesRef = useRef([]); // [{points:[{x,y}], pathLength}]
  const boundsRef = useRef(null); // {minX,maxX,minY,maxY}

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [height]);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const updateBounds = (pos) => {
    const b = boundsRef.current;
    if (!b) { boundsRef.current = { minX: pos.x, maxX: pos.x, minY: pos.y, maxY: pos.y }; return; }
    if (pos.x < b.minX) b.minX = pos.x;
    if (pos.x > b.maxX) b.maxX = pos.x;
    if (pos.y < b.minY) b.minY = pos.y;
    if (pos.y > b.maxY) b.maxY = pos.y;
  };

  const start = (e) => {
    e.preventDefault();
    drawingRef.current = true;
    lastPos.current = getPos(e);
    strokesRef.current.push({ points: [lastPos.current], pathLength: 0 });
    updateBounds(lastPos.current);
  };
  const move = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    const stroke = strokesRef.current[strokesRef.current.length - 1];
    if (stroke) {
      stroke.pathLength += Math.hypot(pos.x - lastPos.current.x, pos.y - lastPos.current.y);
      stroke.points.push(pos);
    }
    updateBounds(pos);
    lastPos.current = pos;
    setHasSignature(true);
  };
  const end = (e) => { e.preventDefault(); drawingRef.current = false; };

  // 過於簡單的塗鴉判斷（見檔頭說明）；空白畫布交給 isEmpty() 判斷，這裡不重複判斷
  const computeTooSimple = () => {
    if (!hasSignature || !boundsRef.current) return false;
    const b = boundsRef.current;
    const diagonal = Math.hypot(b.maxX - b.minX, b.maxY - b.minY);
    if (diagonal < MIN_BOUNDS_DIAGONAL) return true;
    const totalPoints = strokesRef.current.reduce((sum, s) => sum + s.points.length, 0);
    if (totalPoints < MIN_TOTAL_POINTS) return true;
    if (strokesRef.current.length === 1) {
      const s = strokesRef.current[0];
      const first = s.points[0], last = s.points[s.points.length - 1];
      const straightDist = Math.hypot(last.x - first.x, last.y - first.y);
      if (straightDist > 0 && s.pathLength / straightDist < MIN_SINGLE_STROKE_RATIO) return true;
    }
    return false;
  };

  useImperativeHandle(ref, () => ({
    isEmpty: () => !hasSignature,
    isTooSimple: computeTooSimple,
    clear: () => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      strokesRef.current = [];
      boundsRef.current = null;
      setHasSignature(false);
    },
    toDataURL: () => canvasRef.current.toDataURL('image/png'),
  }), [hasSignature]);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ fontSize: 11, color: '#854F0B', background: '#FFFBF0', border: '0.5px solid #F0D9A8', borderRadius: '6px 6px 0 0', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
        ✎ 請以正楷書寫全名簽名，潦草或無法辨識將請求重新簽署
      </div>
      <canvas
        ref={canvasRef}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        style={{
          width: '100%', height, borderRadius: '0 0 10px 10px', border: '0.5px dashed #C9A8A8',
          borderTop: 'none', background: '#FBF5F5', touchAction: 'none', display: 'block', boxSizing: 'border-box',
        }}
      />
      {!hasSignature && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height,
          display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: '#bbb', fontSize: 13, pointerEvents: 'none',
        }}>
          請在此處簽名 / Sign here
        </div>
      )}
    </div>
  );
});

export default SignaturePad;
