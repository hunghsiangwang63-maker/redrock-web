// 共用 Modal 外框（取代各頁原本各自定義的 Modal）
export default function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(3px)' }}>
      <div style={{ background:'#fff', borderRadius:16, padding:24, width, maxWidth:'95vw', maxHeight:'85vh', overflowY:'auto', border:'0.5px solid #E8D5D5' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div style={{ fontSize:16, fontWeight:600 }}>{title}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#999' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
