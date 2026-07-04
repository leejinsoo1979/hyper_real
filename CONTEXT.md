# CONTEXT.md — 세션 인수인계 문서

> 작성: 2026-07-04. 다음 AI 세션이 이 문서 하나로 작업을 이어갈 수 있도록 작성됨.
> 읽는 순서: 이 문서 → `BRIEFING.md`(v2, 최상위 지시) → `docs/VIDEO_ANALYSIS.md` → 해당 영역 `skills/*.md`

---

## 1. 프로젝트가 무엇인가

**최종 목표: VizMaker(MS Store, VizAcademy Software)와 동일한 독립 데스크톱 AI 렌더링 앱.**
SketchUp 씬을 AI(Gemini/Nanobanana)로 실사 렌더링. 노드 기반 파이프라인, Draw 마스킹, 업스케일, 비디오.

### 두 갈래 (혼동 금지 — BRIEFING v2 §3)
| 갈래 | 경로 | 상태 |
|---|---|---|
| **정본(제품)** | `webapp/` — React 19+TS+Vite+Zustand+@xyflow/react+fabric | 모든 신규 개발 여기 |
| **레거시(동결)** | `nano_banana_renderer/` — SketchUp Ruby 플러그인 | 버그픽스만. 단 **로컬 서버(9876)는 브릿지로 승격되어 계속 발전** |

### 배포 3형태 (모두 살아있음)
1. **웹**: https://hyper-real-3vvh.vercel.app — git push하면 자동 재배포
2. **데스크톱**: `/Applications/VizMaker.app` (Electron, `webapp && npm run app:dist`로 빌드 후 수동 교체)
3. **SketchUp 플러그인**: rbz (현재 v1.0.4, 루트의 `NanoBananaRenderer_v1.0.4.rbz`)

### git
- 푸시 대상: `hyper_real` = https://github.com/leejinsoo1979/hyper_real (main 추적, **공개 저장소**)
- `origin`(sketchup_show)은 구 리모트, 사용 안 함
- 커밋 스타일: 기능 단위로 쪼갬, Co-Authored-By: Claude 푸터

---

## 2. 핵심 결정 (경위 포함)

1. **방향 전환 (2026-07-03 확정)**: HtmlDialog 내장 UI → 독립 앱. 근거: 하루 동안 터진 버그 대부분(CEF 크래시/캐시/Thread/무한로딩)이 내장 방식 자체의 문제. 실물 VizMaker도 "Server connection: Connected" = 로컬 서버 브릿지 방식임을 확인.
2. **BRIEFING v1의 스택 지시 폐기**: Vanilla JS/ES5/빌드금지/var 강제는 webapp에 적용하지 않음 (v2에 명시).
3. **실물 우선 원칙**: 명세(skills/)와 실물(VIDEO_ANALYSIS.md)이 다르면 실물이 정답.
4. **브릿지 프로토콜**: HTTP JSON + base64 일괄 (HtmlDialog식 30KB 청크 불필요). WEBrick 스레드에서 SketchUp API 직접 호출 금지 → **명령 큐 + 메인스레드 타이머**.
5. **모델 확정**: `gemini-2.0-*` 폐기됨(Google, 404). 텍스트=`gemini-2.5-flash`(+thinkingBudget:0 필수), 이미지=`gemini-2.5-flash-image`(Nanobanana), `gemini-3-pro-image`(Nanobanana Pro). 모델명은 UI에 그대로 노출할 것(숨기면 사용자 분노).
6. **API Key 자동 공급**: 플러그인(암호화 저장) → 브릿지 `/api/apikey`(신뢰 출처만) → 앱 localStorage 자동 등록. 사용자 재입력 불필요.
7. **보존(구조 불변)이 1번 규칙**: 렌더에 없는 가구가 생기면 실패작. 3겹 방어(LOCKED 시스템 지시문 + Auto 프롬프트 보존 섹션 + 강제 네거티브).
8. **노드 생성 UX**: 포트 드래그가 고장이라 우클릭 메뉴("+ 1. Main renderer" 등, 자동 연결)가 주 경로.
9. **카메라 기능 위치**: 노드 인스펙터가 아니라 **좌측 레일 Camera 페이지** (사용자 명시 결정).

---

## 3. 완료된 작업

### 레거시 플러그인 (07-03 하루 종일 잡은 잠복 버그들)
- `/tmp` 하드코딩 3곳 → `Dir.tmpdir` (Windows 캡처 불가 원인)
- 스크립트 `?v=` 쿼리 제거 (타 PC 무한 로딩 원인)
- 폐기 모델 → 현행 모델 + 저장설정 자동 마이그레이션
- 에러 메시지 `to_json` 직렬화 9곳 (여러 줄 에러가 JS 깨뜨려 무한로딩으로 위장하던 것)
- Auto 프롬프트: Thread → `UI.start_timer` 동기 (Thread는 SketchUp에서 조용히 멈춤) + 취소 버튼 + 150초 워치독
- 프롬프트 생성 thinking OFF (50초→7초)
- 네거티브 파싱 버그 (템플릿 제목 `[NEGATIVE PROMPT - ...]` vs 파서 `[NEGATIVE]` 불일치로 항상 기본값이 나오던 것)
- 씬 프리뷰 캐시 미초기화 (창 재오픈 시 씬 안 뜨던 것), 저해상 프리뷰가 렌더 소스 오염(자글자글)하던 것 → `@current_image_is_preview` 플래그
- 모델 선택 시 엔진 자동 전환 (replicate 고착으로 렌더 막히던 것)
- 진단: 모든 `[NanoBanana]` 로그가 `~/.sketchupshow/debug.log`에 자동 기록 (NanoBanana.puts 오버라이드)
- WEBrick `/dev/null` → `File::NULL` (Windows 서버 기동 실패)

### webapp
- geminiClient: 현행 모델, TEXT 전용은 gemini-2.5-flash+thinking:0, AbortSignal 취소, LOCKED 시스템 지시문(플러그인 검증본)
- **autoPrompt.ts**: prompt_engine.rb 3-Layer 공식 포팅 (구조보존 + 이미지 재질분석 + 실사화 강제[흠집/PHOTO REALISM DETAILS] + 네거티브 파싱/기본값). ⚠ 공식은 원본 그대로 유지할 것 — 임의 변경 시 사용자 분노
- PromptBar **Auto 버튼** (생성/취소 토글, 120초 워치독), RenderSettings **Time(Day/Eve/Night)+Lights(On/Off)**
- 사이드바 라우팅 완성: Render / **Camera(신설)** / History / Account / Tutorial / Support / Settings
- Settings: API Key localStorage 관리 (.env 없이 동작)
- CameraPage: 실시간 미러 프리뷰 + 씬 전환 + WASD/회전/상하 + 2점투시 + Height/FOV
- 우클릭 노드 추가(+자동연결), Enlarge 라이트박스(휠줌/팬/ESC), 노드 썸네일 16:9 무크롭
- MOCK 모드 배지, AI 이미지 미반환 시 명시적 에러 (조용한 원본 반환 금지)
- History Use → 그래프 복원 후 에디터 복귀, 프리셋 "View to render" 표기, 비디오 엔진 kling/seedance/sora/veo
- tsc 에러 0, 프로덕션 빌드 통과

### 브릿지 (nano_banana_renderer/services/web_sync.rb)
- `/api/ping` `/api/data` (기존) + `/api/scenes` `/api/command`(select_scene/camera/capture) `/api/result` `/api/apikey`(신뢰 출처만) 신설
- CORS + `Access-Control-Allow-Private-Network: true` (Chrome PNA/LNA)
- 명령 큐(Mutex) + 0.3초 메인스레드 타이머 실행, 씬 캐시 1초 갱신

### 실행/배포
- Electron 셸(단일 인스턴스, 창 포커스), electron-builder(mac dmg/win nsis), `/Applications/VizMaker.app` 설치됨
- SketchUp 툴바 [V] 버튼(새 아이콘) → `open -a VizMaker` (없으면 웹 폴백) — 엔스케이프식 원클릭
- Vercel: 루트 vercel.json이 webapp/ 빌드·서빙하도록 구성
- 툴바 아이콘 소스: scratchpad의 icon.html (SVG → playwright로 PNG 렌더)

---

## 4. 남은 작업 (우선순위순)

1. **UI/UX 대폭 업그레이드** — 사용자가 예고("각오해"). 기준: `skills/UI_DESIGN.md` 픽셀 명세 + 실물 스크린샷. 대상: 노드 카드, 캔버스(도트/엣지/미니맵), 인스펙터 디테일, 마이크로 인터랙션, 브랜딩(이름/로고/파비콘 — favicon 404 남아있음), 빈 캔버스 온보딩
2. **포트 드래그 버그** (아래 §5-1)
3. **그래프 영속화** — 새로고침하면 노드 날아감 (zustand persist)
4. 레거시 기능 추가 이관: 이미지 보정(editor_dialog), 핫스팟(hotspot_dialog), 믹스(mix_dialog) — Draw 탭/Details editor가 부분 대체, 사용자와 협의 후
5. Electron: 자동 업데이트, 코드 서명/공증, 앱에서 rbz 설치 버튼
6. 실 API: 비디오(Kling/Seedance/Sora/Veo), 업스케일(Magnific류) — 현재 mock 어댑터
7. 프로덕트 계층: 계정/크레딧(현재 mock 100)/결제 — 상용화 결정 시
8. 타 CAD 브릿지: Blender(쉬움) → Rhino → 3ds Max → Revit

## 5. 알려진 버그

1. **포트 드래그 연결 생성 안 됨** (xyflow v12): 핸들 pointerdown/mousedown 모두 connectionline 미생성. Playwright 실입력+JS 디스패치 모두 재현. 우클릭 메뉴로 우회 중. 원인 미상 — xyflow 설정/Handle 구성 조사 필요
2. **MOCK 배지 비반응형**: `useMock()`이 렌더 시점 평가라 키 저장 직후 안 사라짐 (재렌더/새로고침 필요). zustand 상태화 필요
3. **그래프 미영속** (§4-3)
4. favicon 404 (배포 사이트)
5. 노드 카드 라벨에 모델명 표시 미구현 (실물은 카드 하단에 모델명)

## 6. 아키텍처·컨벤션 (위반 시 사고났던 것들)

### 절대 규칙
- **Ruby에서 Thread로 SketchUp API/HTTP 금지** → `UI.start_timer` + 동기. WEBrick 핸들러에서 SketchUp API 직접 호출 금지(명령 큐 사용)
- **에러 메시지를 UI로 보낼 때 반드시 JSON 직렬화** (`to_json`)
- **플러그인 수정 시 세 폴더 전부 동기화**: `~/Library/Application Support/SketchUp {2022,2024,2025}/SketchUp/Plugins/` — 2022만 하면 "고쳐도 그대로" 사고 재발
- **비동기 작업 3종 세트**: 취소 버튼 + 시간제한 + 실패 시 원상복구. 무한 진행바 = 버그
- **표시용 프리뷰와 AI 전송용 고품질 캡처 분리**
- **보존 3겹 방어 유지** (§2-7), 프롬프트 공식 임의 변경 금지
- webapp: 다크(#0a0a14~#1a1a24), 틸 액센트 #00c9a7, lucide-react 아이콘, 이모지 금지

### 검증 방법 (확립된 절차)
- **"안 된다" 보고 → 추측 금지 → `tail -30 ~/.sketchupshow/debug.log` 먼저** (플러그인) / 사용자 Chrome 탭 직접 확인(claude-in-chrome) (webapp)
- Ruby 리로드: 콘솔에서 `load File.join(NanoBanana::PLUGIN_ROOT, 'services/파일명.rb')` (메뉴/콜백 변경만 재시작 필요)
- webapp E2E: **`tools/e2e/`** (리포에 보존) — mock_bridge.py(9876, 새 프로토콜 전체) + playwright 테스트. 실행법은 tools/e2e/README.md
- 기능 완료 보고 전 **완료 기준 명시 + E2E 스크린샷** — "됐다"는 검증 후에만

## 7. 주요 파일 변경 내역 (이번 세션)

### webapp/src
- `engine/geminiClient.ts` — 모델/thinking/키(localStorage)/AbortSignal/LOCKED 지시문
- `engine/autoPrompt.ts` — **신규**, 프롬프트 공식 포팅
- `engine/adapters/mainRenderer.ts` — 네거티브 합성, 이미지 미반환 시 throw
- `engine/pipelineExecutor.ts` — 조명 합성 + 네거티브 배선
- `api/sketchupBridge.ts` — scenes/command/camera/apikey 자동등록
- `state/uiStore.ts` — sketchUpScenes, SidebarItem에 camera
- `editor/NodeEditor.tsx` — 페이지 라우팅, MOCK 배지
- `editor/pages/` — SettingsPage, MiscPages, **CameraPage** 신규
- `editor/panels/` — SketchUpScenesPanel(신규, 씬만), ImageLightbox(신규), InspectorPanel(Enlarge), RenderSettings(Time/Lights/모델명 라벨), PromptBar(Auto)
- `editor/canvas/NodeCanvas.tsx` — 우클릭 노드추가(addNodeAt), 타입 수정
- `editor/nodes/BaseNode.tsx` — 16:9 contain
- `types/node.ts` — RenderParams(negativePrompt/timePreset/lightsOn), VideoParams 엔진 4종
- `electron/main.cjs` — **신규**, package.json(빌드 설정)

### nano_banana_renderer (레거시+브릿지)
- `main.rb` — NanoBanana.puts(debug.log), 모델 마이그레이션, open_vizmaker_app, 툴바 [V], 씬캐시 초기화, cancel_auto_prompt 콜백
- `services/web_sync.rb` — 브릿지 v2 전체 (§3)
- `services/prompt_engine.rb` — Thread 제거/토큰 취소/네거티브 파싱/프리뷰 재캡처
- `services/render_engine.rb`, `scene_manager.rb`, `settings_manager.rb`, `api_client.rb`, `camera_control.rb`, `image_manager.rb`, `mix_engine.rb`, `secondary_dialogs.rb` — §3의 버그픽스들
- `ui/` — HtmlDialog UI 수정(16:9, Auto 취소, 엔진 동기화 등) — **동결 상태, 추가 개발 금지**
- `assets/icons/vizmaker_{small,large}.png` — 신규 툴바 아이콘

### 루트
- `BRIEFING.md`(v2 전면 개정), `CLAUDE.md`(배포경로 3버전/debug.log/방향), `docs/VIDEO_ANALYSIS.md`(신규), `vercel.json`(webapp 빌드), `.gitignore`(*.rbz, temp.zip, webapp/release/)

## 8. 다음 세션 시작 절차

```bash
# 개발 서버 (웹)
cd webapp && npm run dev          # http://localhost:5173

# 데스크톱 앱 개발 모드
cd webapp && npm run app:dev

# 앱 재배포(설치 교체)
cd webapp && npm run build && npx electron-builder --dir
rm -rf /Applications/VizMaker.app && cp -R release/mac-arm64/VizMaker.app /Applications/

# 웹 배포 = git push hyper_real main (Vercel 자동)
# 플러그인 수정 후 = 세 SketchUp 폴더 rsync + 필요시 rbz 재생성(zip, §1 참고)
```

메모리 파일도 참고: `~/.claude/projects/.../memory/` — debug-log-diagnosis.md, webapp-status-2026-07-03.md, project-goal-vizmaker-clone.md

## 9. 사용자 커뮤니케이션 (중요)

- 짧고 직설적으로. 결론 먼저. 선택지는 2~3개로 압축해 제시
- **"완료" 선언은 완료 기준 + 실검증(E2E/스크린샷/로그) 후에만** — 과장 보고에 극도로 민감
- "안 된다" 보고는 정보가 부족해도 화면/로그를 직접 확인해서 원인 특정 (사용자에게 재현 절차 요구 최소화)
- 프롬프트 공식/보존 규칙은 사용자에게 신성한 영역 — 변경 전 반드시 설명·동의
- 실수했으면 한 문장으로 인정하고 즉시 고칠 것. 변명 금지
