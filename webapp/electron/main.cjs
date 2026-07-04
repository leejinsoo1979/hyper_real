// ---------------------------------------------------------------------------
// Lumanova 데스크톱 앱 — Electron 메인 프로세스
//
// 개발:   VITE_DEV_SERVER_URL 환경변수가 있으면 dev 서버를 로드
// 배포:   dist/index.html 로드 (vite.config.ts의 base './' 필수)
// ---------------------------------------------------------------------------
const { app, BrowserWindow, shell, ipcMain, desktopCapturer, session } = require('electron')
const path = require('path')
const http = require('http')
const fs = require('fs')

// 구글 로그인(unauthorized-domain) 해결: file:// 대신 http://localhost로 앱을 서빙
// (Firebase 승인 도메인에 localhost가 기본 포함되어 OAuth가 정상 동작)
const APP_PORT = 17173
const MIME = {
  html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png',
  jpg: 'image/jpeg', svg: 'image/svg+xml', json: 'application/json',
  ico: 'image/x-icon', woff2: 'font/woff2', woff: 'font/woff', map: 'application/json',
}

function startStaticServer() {
  const root = path.join(__dirname, '../dist')
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent((req.url || '/').split('?')[0])
      if (p === '/') p = '/index.html'
      let file = path.normalize(path.join(root, p))
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        file = path.join(root, 'index.html') // SPA 폴백
      }
      const ext = file.split('.').pop()
      res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
      fs.createReadStream(file).pipe(res)
    })
    srv.on('error', reject)
    srv.listen(APP_PORT, '127.0.0.1', () => resolve(APP_PORT))
  })
}

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
    title: 'Lumanova',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  // 렌더러가 문서 title을 바꾸지 못하게 (앱 이름 고정)
  mainWindow.on('page-title-updated', (e) => e.preventDefault())

  // Google/Firebase 로그인 팝업은 앱 안에서 허용, 그 외 링크는 기본 브라우저로
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/accounts\.google\.com|firebaseapp\.com|googleusercontent\.com/.test(url)) {
      return { action: 'allow' }
    }
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (DEV_URL) {
    mainWindow.loadURL(DEV_URL)
  } else {
    startStaticServer()
      .then((port) => mainWindow.loadURL(`http://localhost:${port}`))
      .catch(() => mainWindow.loadFile(path.join(__dirname, '../dist/index.html')))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// SketchUp 창 매칭: 모델 창 제목(브릿지 제공)을 우선 사용.
// 주의: 제목에 'sketchup'이 들어간 다른 앱 창(IDE 등)을 잡으면 안 된다.
let sketchupTitleHint = null
ipcMain.on('sketchup-title-hint', (_e, title) => {
  sketchupTitleHint = typeof title === 'string' && title.trim() ? title.trim() : null
})

function pickSketchUpSource(sources) {
  const notSelf = sources.filter((s) => !/vizmaker/i.test(s.name))
  if (sketchupTitleHint) {
    const byTitle = notSelf.find((s) => s.name.includes(sketchupTitleHint))
    if (byTitle) return byTitle
  }
  // 폴백은 .skp 문서 창만 허용. 제목 힌트 없이는 섣불리 잡지 않는다
  // (IDE 창 제목에 'sketchup'이 포함되어 오탐된 사고가 있었음)
  return notSelf.find((s) => /\.skp/i.test(s.name)) ?? null
}

ipcMain.handle('sketchup-window-source', async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['window'] })
    return pickSketchUpSource(sources)?.id ?? null
  } catch {
    return null
  }
})

app.whenReady().then(() => {
  // getDisplayMedia 요청을 SketchUp 창으로 자동 연결
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['window'] })
      const su = pickSketchUpSource(sources)
      if (su) callback({ video: su })
      else callback({})
    } catch {
      callback({})
    }
  })

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
