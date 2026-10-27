// 瀏覽器自動翻譯（Chrome／Safari 翻譯、Google 翻譯）會把文字節點包進 <font> 或換掉，
// React 之後要移除／插入原本的節點時就會丟 NotFoundError（removeChild／insertBefore），整頁崩潰。
// 這是 React 官方 issue #11538 的已知問題；這裡用社群通行的寫法讓「節點已不在原父節點下」時不丟例外。
// 不影響正常情況（節點確實是子節點時照舊呼叫原方法）。
export function installDomTranslateGuard() {
  if (typeof Node !== 'function' || !Node.prototype || Node.prototype.__rrTranslateGuard) return;
  const origRemove = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    if (child && child.parentNode !== this) {
      if (typeof console !== 'undefined') console.warn('[translate-guard] removeChild 略過：節點已不在此父節點下', child);
      return child;
    }
    return origRemove.apply(this, arguments);
  };
  const origInsert = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) {
      if (typeof console !== 'undefined') console.warn('[translate-guard] insertBefore 略過：參考節點已不在此父節點下', referenceNode);
      return newNode;
    }
    return origInsert.apply(this, arguments);
  };
  Node.prototype.__rrTranslateGuard = true;
}
