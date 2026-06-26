import { useState, useEffect } from 'react';

/**
 * SaveButton - 統一儲存按鈕
 * 狀態：紅色（可儲存）→ 灰色（儲存中）→ 綠色（已儲存）→ 有修改後回紅色
 *
 * Props:
 *   onSave    async () => void
 *   isDirty   boolean  有內容被修改時為 true
 *   label     string   預設「儲存」
 *   style     object   額外樣式
 *   fullWidth boolean  是否撐滿
 */
export default function SaveButton({ onSave, isDirty = true, label = '儲存', style = {}, fullWidth = false }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // 有修改時重置 saved 狀態 → 變回紅色
  useEffect(() => {
    if (isDirty) setSaved(false);
  }, [isDirty]);

  const handleClick = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave();
      setSaved(true);
    } catch(e) {
      // error handled by parent
    } finally {
      setSaving(false);
    }
  };

  const isGreen = saved && !isDirty;
  const bg = saving ? '#aaa' : isGreen ? '#2D7D46' : '#8B1A1A';
  const text = saving ? '⏳ 儲存中...' : isGreen ? '✅ 已儲存' : label;

  return (
    <button
      onClick={handleClick}
      disabled={saving}
      style={{
        height: 44,
        borderRadius: 10,
        border: 'none',
        background: bg,
        color: '#fff',
        fontSize: 14,
        fontWeight: 500,
        cursor: saving ? 'not-allowed' : 'pointer',
        transition: 'background 0.3s',
        width: fullWidth ? '100%' : 'auto',
        padding: '0 24px',
        ...style,
      }}>
      {text}
    </button>
  );
}
