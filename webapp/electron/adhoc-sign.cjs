// ---------------------------------------------------------------------------
// electron-builder afterSign 훅 — 인증서 없을 때 macOS 애드혹(ad-hoc) 서명
//
// electron-builder가 서명을 생략하면 리소스 수정으로 Electron의 기존 서명이
// '깨진' 상태가 되고, 다운로드된 앱은 Gatekeeper가 "손상됨"(우회 불가)으로
// 차단한다. 애드혹 서명을 다시 입히면 "확인할 수 없음" 다이얼로그로 바뀌어
// 시스템 설정 → 개인정보 보호 및 보안 → [그래도 열기]로 실행할 수 있다.
// 정식 Developer ID 서명(CSC_LINK/CSC_NAME)이 설정되면 이 훅은 건너뛴다.
// ---------------------------------------------------------------------------
const { execSync } = require('child_process')
const path = require('path')

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return
  if (process.env.CSC_LINK || process.env.CSC_NAME) return
  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  console.log(`  • ad-hoc signing (no certificate)  app=${appPath}`)
  execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' })
}
