// 觸控模式（小幫手「設定 → 觸控模式」勾選後才會生效）：
// 遊戲的鏡頭縮放只在觸控裝置上有作用，這裡在遊戲程式載入前讓頁面回報「有觸控點」，電腦版也能調鏡頭倍率。
// 沒勾選時完全不做任何事。
try {
  if (localStorage.getItem('g155_touchmode') === '1') {
    Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { configurable: true, get() { return 5; } });
  }
} catch (e) {}
