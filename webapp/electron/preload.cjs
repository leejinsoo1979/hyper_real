// 렌더러에 네이티브 기능 노출 (SketchUp 창 실시간 캡처용)
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('vizmakerNative', {
  // SketchUp 창의 화면공유 소스 ID (없으면 null)
  getSketchUpSourceId: () => ipcRenderer.invoke('sketchup-window-source'),
  // 브릿지가 알려준 SketchUp 모델 창 제목 (창 매칭 정확도용)
  setSketchUpTitleHint: (title) => ipcRenderer.send('sketchup-title-hint', title),
})
