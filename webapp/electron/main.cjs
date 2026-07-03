// ---------------------------------------------------------------------------
// VizMaker 데스크톱 앱 — Electron 메인 프로세스
//
// 개발:   VITE_DEV_SERVER_URL 환경변수가 있으면 dev 서버를 로드
// 배포:   dist/index.html 로드 (vite.config.ts의 base './' 필수)
// ---------------------------------------------------------------------------
const { app, BrowserWindow, shell } = require('electron')
const path = require('path')

const DEV_URL = process.env.VITE_DEV_SERVER_URL

let mainWindow = null

// 단일 인스턴스: 두 번째 실행 시 기존 창을 앞으로 (SketchUp '앱 열기' 대응)
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0a0a14',
    title: 'VizMaker',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // 렌더러가 문서 title을 바꾸지 못하게 (앱 이름 고정)
  mainWindow.on('page-title-updated', (e) => e.preventDefault())

  // 외부 링크는 기본 브라우저로
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (DEV_URL) {
    mainWindow.loadURL(DEV_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    // macOS: 독 아이콘 클릭 시 창 재생성
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // macOS 관례를 따르지 않고 모든 플랫폼에서 종료 (도구 앱 특성)
  app.quit()
})
