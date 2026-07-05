import { useState } from 'react';

/**
 * 密碼輸入框，右側附「眼睛」圖示可切換顯示 / 隱藏密碼，避免使用者打錯。
 * 透傳所有原生 <input> props（value / onChange / placeholder / required /
 * minLength / style / autoComplete…），可直接取代原本的 <input type="password">。
 */
export default function PasswordInput({ style, ...props }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        {...props}
        type={show ? 'text' : 'password'}
        style={{ boxSizing: 'border-box', ...style, paddingRight: 42 }}
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        aria-label={show ? '隱藏密碼' : '顯示密碼'}
        title={show ? '隱藏密碼' : '顯示密碼'}
        tabIndex={-1}
        style={{
          position: 'absolute', top: 0, bottom: 0, right: 0, width: 40,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#999',
        }}
      >
        <i className={show ? 'ti ti-eye-off' : 'ti ti-eye'} style={{ fontSize: 18 }} aria-hidden="true" />
      </button>
    </div>
  );
}
