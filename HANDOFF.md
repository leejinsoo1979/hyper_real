# HANDOFF.md — 후임 AI/개발자 인수인계 문서

작성: 2026-07-07 (Claude Fable 5 마지막 세션)
이 문서는 코드만 봐서는 절대 알 수 없는, 실전에서 피 흘리며 배운 것들의 기록이다.
**작업 시작 전에 CLAUDE.md와 함께 반드시 끝까지 읽을 것.**

---

## 0. 제품이 무엇인가

**Lumanova** — VizMaker(MS Store) 클론이 목표인 AI 실사 렌더링 SaaS.
- 정본 = `webapp/` (React 19 + TS + Vite + Zustand + @xyflow/react)
- 브릿지 플러그인 = SketchUp(`nano_banana_renderer/`, 포트 9876) / Blender(`plugins/blender/`, 9877) / Rhino(`plugins/rhino/`, 9878)
- 엔진 = Google Gemini(이미지, 사용자 개인 API키·클라이언트 직접 호출) + xAI Grok(영상)
- 배포 = Vercel `nanobanana-renderer` 프로젝트. **개인키 정책이라 서버 프록시 없음 — 엔진 수정은 전부 클라이언트 코드다**
- `NanoBanana`라는 내부 이름(루비 모듈, 폴더, 로그 태그)은 개발 코드명. 제품명은 Lumanova. 리네임은 설치 호환성 때문에 보류 중 — 사용자 동의 없이 하지 말 것

## 1. 검증 루틴 (이 순서를 지켜라)

1. **"안 된다"는 보고를 받으면 추측 금지. `~/.sketchupshow/debug.log`부터 읽어라.** 플러그인의 모든 [NanoBanana] 로그가 여기 쌓인다. 원인의 80%는 로그에 있다.
2. 웹앱 수정 후에는 **CLI에서 `npx tsc --noEmit` + `npm run build`** 를 믿어라. **IDE 진단(new-diagnostics)은 자주 낡은 상태다** — 파일이 이미 고쳐졌는데 에러라고 우기는 일이 반복됐다.
3. 기능은 **브라우저에서 실제 클릭으로 E2E 검증**한 뒤에 완료라고 말해라. dev 서버 localhost:5173, `window.__classicStore`/`window.__graphStore`로 상태 주입 가능(DEV 전용).
4. 브릿지 상태는 curl로 직접 확인: `curl localhost:9876/api/ping` (미응답이면 서버 다운 — 재시작 안내).

## 2. 함정 목록 — SketchUp 플러그인

- **`Thread.new` 안에서 SketchUp API 호출 금지.** 로그도 에러도 없이 조용히 죽는다. WEBrick 핸들러 스레드도 마찬가지 — 명령 큐에 넣고 `UI.start_timer` 메인 스레드에서 처리한다 (`web_sync.rb`의 기존 패턴 따라갈 것).
- **카메라/씬 변경은 타이머 컨텍스트에서 조용히 무시된다.** `BridgeExec`(View#animation) 패턴을 써야 적용된다.
- **`execute_script`로 500KB 이상 한 번에 보내면 HtmlDialog 크래시.** 30KB 청크 폴링 패턴 사용 (레거시 UI에만 해당).
- **배포는 세 폴더 전부**: `~/Library/Application Support/SketchUp {2022,2024,2025}/SketchUp/Plugins/nano_banana_renderer/`. 2022만 복사하면 "반영이 안 돼요" 사고가 난다 (실제 발생).
- **실행 중인 SketchUp은 디스크 파일을 다시 읽지 않는다.** 함수 수정 = 루비 콘솔 `load` 또는 재시작. **WEBrick mount(엔드포인트 추가/응답 필드 변경) = 서버 재시작 필수** → 사용자에게는 그냥 "SketchUp 재시작"이 가장 확실하다. 콘솔 3줄 안내는 절반만 실행되는 사고가 났었다.
- **rbz 재패키징 주의**: 다운로드용 rbz가 낡은 코드로 패키징되면, 사용자가 Extension Manager로 설치할 때 최신 플러그인을 덮어써서 **기능이 역행**한다 (v1.0.6 사고). 플러그인을 고치면 rbz도 다시 만들고 버전을 올려라. 현재 v1.0.7.
- **히든라인 렌더모드는 면을 '배경색'으로 칠한다.** 깊이맵 캡처에서 배경을 검정으로 두면 전부 검정이 된다 (실제 사고 — 렌더 지연 + AI가 가구를 지어냄). 현재 코드는 배경 흰색 + 검정 안개.
- SketchUp 내부 길이 단위는 인치. `rendering_options` 키는 존재하지 않아도 대입 시 조용히 무시될 수 있으니 저장/복원은 키별 rescue로 감쌀 것.

## 3. 함정 목록 — 웹앱

- **병렬 AI 에이전트(Codex)가 같은 파일을 동시에 고친다.** 대응 수칙: ① Edit 전에 반드시 다시 읽기 ② 완성 즉시 커밋(작업물이 몇 분 만에 삭제된 사고 4회+) ③ Codex의 변경은 절대 되돌리지 말고 흡수 ④ 빌드가 남의 미완성 코드로 깨지면 잠시 기다렸다 재시도. 화면 전체가 빈 화면이 되면 십중팔구 Codex의 미완성 심볼 참조다 — 콘솔 에러 확인.
- **Vercel 무료 플랜 하루 100 배포 제한.** 소진되면 24시간 대기. 커밋·푸시는 계속하고 배포만 미뤄라.
- **MCP 브라우저 자동화의 첫 클릭이 자주 무시된다** (페이지 로드 직후). 클릭 후 상태를 확인하고 안 먹었으면 한 번 더.
- 재질 라이브러리 데이터는 `src/data/materialLibrary.ts` (MaterialsPage에서 분리됨).
- 상태는 Zustand: `classicStore`(클래식 렌더 화면), `graphStore`(노드), `uiStore`(브릿지/사이드바), `historyStore`(서버가 계정별 정본).

## 4. 도메인 지식 — 이 제품의 핵심 트릭들

- **재질 ID 마스크**: SketchUp이 재질별 고유 평면색으로 뷰를 그려주면(`capture_mask`), 색→재질명 매핑으로 픽셀 단위 재질 식별이 된다. 색 비교는 안티앨리어싱 때문에 **±3 허용오차**. 같은 평균색 재질은 "A 외 N"으로 병합됨. **카메라가 바뀌면 마스크는 무효** — 새 캡처 도착 시 자동 무효화+재캡처 코드가 있다 (RenderClassicPage liveImage effect).
- **Gemini는 마스크를 '참고'만 한다.** 영역 밖도 마음대로 고친다. 그래서 결과를 원본과 **픽셀 강제 합성**한다: `compositeEditedIntoRegion`/`compositeMasked` (detailsEditor.ts) — 경계 flood-fill, 팽창, 페더 포함. 영역 편집 기능을 만들면 반드시 이 합성을 통과시켜라.
- **깊이맵 구조 고정**: 렌더에 깊이맵을 두 번째 이미지로 첨부 + "형상·카메라 절대 불변" 지시. **SketchUp(fog 근사)=밝음이 가까움, Blender(Mist)=밝음이 멂 — 명암 방향이 반대**라 프롬프트가 툴별로 다르다. 깊이맵이 균일하면(정보 없음) 자동 폐기 + 연속 2회면 세션 내 캡처 생략 — 이 안전장치를 지워선 안 된다.
- **xAI 영상은 `resolution` 미지정 시 480p가 기본.** 반드시 명시 (현재 기본 1080p, VIDEO 노드에 선택 UI 있음).
- **Gemini 멀티 이미지**: `extraImages`로 참조 이미지 첨부. 프롬프트에서 "image N"으로 지칭하므로 **배열 순서와 프롬프트 번호가 일치**해야 한다 (doRender의 조립 순서: 깊이맵 → 스타일 참조 → 영역 재질 → 재질 교체).
- 히스토리는 **서버가 계정별 source of truth**. 클래식 렌더는 `classic-` 접두사 노드로 저장됨 — 히스토리 복원 시 이 접두사로 클래식/노드 스냅샷을 구분한다 (HistoryPage handleUse). 클래식 스냅샷을 그래프에 넣으면 라이브 소스 탐색이 오염된다.

## 5. 작업 규칙 (사용자와의 약속)

- 파일 수정 후 즉시 `git add` + `git commit` (허락 불필요). "커밋푸시" = 커밋+푸시. "완벽하게 다해" = 배포·검증까지.
- **임시방편 금지. 근본 원인을 찾아 고쳐라.** 사용자가 크롭-흉내 같은 눈속임을 정확히 잡아낸다.
- `git checkout/reset/restore`는 **커밋 해시를 명시하고 허락받은 뒤에만**.
- 사용자는 한국어 사용. 보고는 짧고 결론부터. 실화면 검증 결과를 같이 말하면 신뢰한다.
- 사용자에게 콘솔 명령을 시키지 마라 — "SketchUp 재시작 한 번"으로 안내하는 게 가장 확실하다.

## 6. 지금 열려 있는 것들 (2026-07-07 아침 기준)

1. **프로덕션 배포 대기** — Vercel 한도 오늘 해제. `vercel deploy --prod` 한 번이면 커밋 `a869fde` 이후 전부(매직툴, 깊이맵, 히스토리 Edit/Node, 1080p 영상, 스타일 참조 등) 반영된다.
2. **SketchUp 재시작 필요** — 검정 깊이맵 수정본(20:21 배포)이 아직 로드 전. 재시작해야 구조 고정이 실제로 작동.
3. **연필(펜슬) 툴 미구현** — 소스/결과 툴바에 자리만 있음("준비 중"). 사용자가 동작을 정의해주면 구현.
4. **Blender 깊이맵 실기 미검증** — 코드는 있으나 Blender 실행 테스트 전 (사용자가 세션 중단). Mist 패스 뷰포트 렌더 경로 확인 필요.
5. **스타일 참조/깊이맵의 노드 에디터 통합** — 클래식에만 있음. Inspector Render settings에 동일 항목 추가하면 됨.
6. NanoBanana→Lumanova 내부 리네임 — 보류 (호환성 리스크, 사용자 결정 필요).

## 7. 핵심 파일 지도

| 파일 | 역할 |
|---|---|
| `webapp/src/editor/pages/RenderClassicPage.tsx` | 클래식 렌더 화면 (가장 크고 가장 자주 충돌하는 파일) |
| `webapp/src/api/sketchupBridge.ts` | 브릿지 클라이언트 (포트 스캔, 캡처/마스크/깊이/재질) |
| `webapp/src/engine/geminiClient.ts` / `adapters/` | Gemini 호출, 합성(detailsEditor), 영상(imageToVideo) |
| `webapp/src/engine/xaiClient.ts` | Grok 영상 (resolution 필수) |
| `nano_banana_renderer/services/web_sync.rb` | SketchUp 브릿지 서버 (명령 큐 + 캐시 패턴) |
| `plugins/blender/lumanova_bridge.py` | Blender 브릿지 (동일 프로토콜, 9877) |
| `~/.sketchupshow/debug.log` | 플러그인 진단 로그 — 항상 여기부터 |
