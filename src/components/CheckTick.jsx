// 純 CSS 繪製的打勾圖示（旋轉 border 的經典技法），取代裸字元 '✓'。
// 緣由：✓ 在少數缺字型裝置上會渲染成黑色方塊（tofu），且這裡的用途一律是「自訂 checkbox
// 的勾選狀態指示」——沒有文字備援，字型缺字時使用者完全看不出是「已勾選」還是「渲染錯誤」。
// 純文字場景（如「✓ 已完成」這種前綴裝飾、旁邊本就有文字說明狀態）風險低，不在此範圍內。
export default function CheckTick({ color = '#fff', size = 10, thickness = 2, style }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: size * 0.55,
        height: size,
        borderBottom: `${thickness}px solid ${color}`,
        borderRight: `${thickness}px solid ${color}`,
        transform: 'rotate(45deg)',
        boxSizing: 'border-box',
        ...style,
      }}
    />
  );
}
