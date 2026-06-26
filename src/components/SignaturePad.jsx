import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';

// 簡易簽名畫布，無外部套件依賴。
// 透過 ref 取得：isEmpty() / clear() / toDataURL()
const SignaturePad = forwardRef(function SignaturePad({ height = 160 }, ref) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const [hasSignature, setHasSignature] = useState(false);

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

  const start = (e) => {
    e.preventDefault();
    drawingRef.current = true;
    lastPos.current = getPos(e);
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
    lastPos.current = pos;
    setHasSignature(true);
  };
  const end = (e) => { e.preventDefault(); drawingRef.current = false; };

  useImperativeHandle(ref, () => ({
    isEmpty: () => !hasSignature,
    clear: () => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
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
