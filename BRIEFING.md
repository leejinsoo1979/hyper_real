# BRIEFING.md — 클로드 코드 프로젝트 브리핑 (v2)

> 이 문서는 프로젝트 총괄 담당자의 기술 브리핑이다.
> 클로드 코드는 이 문서를 최우선으로 읽고, 모든 작업에서 이 문서의 지시를 따르라.
>
> **v2 개정 (2026-07-03)**: 제품 방향이 "SketchUp HtmlDialog 내장 UI"에서
> **"VizMaker와 동일한 독립 데스크톱 앱"**으로 확정 전환되었다.
> 구버전 브리핑(v1)의 스택/경로/통신 지시는 폐기한다. (근거: 실물 VizMaker 분석 — §2)

---

## 1. 최종 목표

**VizMaker(vizmaker.vizacademy.co.uk, Microsoft Store "VizMaker" by VizAcademy Software)와
동일한 기능·UX의 독립 데스크톱 AI 렌더링 앱을 만든다.**

- 배포 형태: 설치형 데스크톱 앱 (Electron), 무료 배포 + 크레딧 과금 모델
- CAD 연동: SketchUp 우선. CAD 안의 아이콘 클릭 → 뷰포트가 앱으로 전송되며 앱이 포커스됨
- 핵심 기능: 노드 기반 AI 렌더링 파이프라인, Draw 탭(마스킹/레퍼런스 합성/포즈 스케치),
  프롬프트 프리셋, A/B 비교, 업스케일, 이미지→비디오, 히스토리(그래프 스냅샷 복원)

## 2. 확정 근거 자료 (모두 리포에 있음)

| 자료 | 위치 | 내용 |
|---|---|---|
| 실물 분석 | `docs/VIDEO_ANALYSIS.md` | MS Store 스크린샷 + 공식 영상 2편 분석. 실제 UX/기능의 1차 근거 |
| 코어 명세 | `docs/SPEC.md`, `skills/*.md` | UI 픽셀 명세, 노드 6종, 프리셋 28종, DAG 파이프라인 — **여전히 유효한 설계도** |
| 구현체 | `webapp/` | React 기반 앱. 코어 대부분 구현 완료 (§4 참조) |

**중요한 실물 확인 사항**: 실제 VizMaker의 타이틀바는 "Server connection: Connected" —
실물도 CAD 플러그인과 **로컬 서버**로 통신하는 독립 앱이다. webapp의 방식이 정답이었다.

## 3. 두 갈래 정리 (혼동 금지)

### 정본(제품): `webapp/`
- React 19 + TypeScript + Vite + Zustand + @xyflow/react + fabric.js
- 모든 신규 개발은 여기서 한다. skills/ 명세의 코어 규칙을 따르되, v1의 스택 관련 지시
  (Vanilla JS/ES5, 빌드 금지, `var` 강제, 스크립트 로드 순서, 외부 라이브러리 금지)는 **전부 폐기**한다.

### 레거시(동결): `nano_banana_renderer/`
- SketchUp HtmlDialog 기반 기존 플러그인. **기능 추가 금지, 버그픽스만.**
- 테스터 배포용(rbz)으로만 유지하며, webapp이 대체하면 UI 부분은 은퇴한다.
- 단, 로컬 서버(WEBrick, 포트 9876)는 **브릿지로 승격**되어 계속 발전시킨다.
- 수정 시 반드시 세 SketchUp 버전 폴더에 모두 동기화:
  `~/Library/Application Support/SketchUp {2022,2024,2025}/SketchUp/Plugins/`

## 4. 아키텍처 (확정)

```
[데스크톱 앱] ← webapp/을 Electron으로 패키징
  ├─ 노드 에디터 (React Flow)
  ├─ AI 엔진 허브 (Gemini 직접 호출 + Replicate/fal.ai로 Flux·Kling·Seedance·Magnific...)
  └─ 브릿지 클라이언트 (api/sketchupBridge.ts — localhost:9876 폴링)
        ↕ HTTP (이미지는 파일 경로 전달 — base64 청크 불필요)
[SketchUp Ruby 브릿지] ← nano_banana_renderer/의 로컬 서버
  ├─ 뷰포트 캡처 (고품질 1024~1920, Edge OFF)
  ├─ 씬 목록/전환, 카메라 제어
  └─ 앱 창 활성화 신호 (CAD 아이콘 클릭 → 앱 포커스)   ← 미구현
```

- Ruby 쪽은 **Thread 금지** (SketchUp에서 조용히 멈춤). `UI.start_timer` 폴링 + 동기 실행.
- HtmlDialog용 30KB 청크 폴링 규칙은 브릿지에는 해당 없음 (HTTP + 파일 경로 전달).

## 5. 검증된 기술 노하우 (2026-07-03 실전 확정 — webapp에 반드시 이식)

1. **모델**: `gemini-2.0-*`는 Google이 폐기함(404). 텍스트 분석=`gemini-2.5-flash`,
   이미지 생성=`gemini-2.5-flash-image`(Nanobanana) / `gemini-3-pro-image`(Nanobanana Pro).
   저장된 설정에 폐기 모델이 있으면 자동 마이그레이션할 것.
2. **속도**: gemini-2.5-flash는 thinking 기본 ON → 분석/프롬프트 용도에는
   `generationConfig.thinkingConfig.thinkingBudget: 0` 필수 (50초 → 7초).
3. **에러 전달**: 에러 메시지를 UI로 보낼 때 반드시 JSON 직렬화(`to_json`/`JSON.stringify`).
   수동 escape는 여러 줄 메시지에서 깨져 "무한 로딩"으로 위장된다.
4. **작업 상태 UX**: 모든 비동기 작업은 ①취소 버튼 ②시간제한(watchdog) ③실패 시
   원상복구를 갖춘다. 진행바만 돌고 끝나지 않는 상태는 버그로 취급한다.
5. **렌더 소스 품질**: 화면 표시용 저해상 프리뷰와 AI 전송용 고품질 캡처를 분리하고,
   실행 직전 소스가 프리뷰면 고품질로 재캡처한다 (자글자글 렌더 방지).
6. **프롬프트 시스템**: 3-Layer 구조(구조 고정 → 씬 컨텍스트 → 사용자 입력) 유지.
   네거티브는 AI 응답에서 파싱하되 섹션 제목 변형(`[NEGATIVE PROMPT - ...]`)을 허용,
   파싱 실패 시에만 기본값 폴백.

## 6. 핵심 규칙 (스택 무관 — 절대 위반 금지)

1. **자동 실행 금지**: AI 실행은 Make 버튼 클릭 시에만.
2. **DAG 강제**: 순환 연결 금지.
3. **크레딧 사전 계산**: Make 전 예상 크레딧 표시, 잔액 부족 시 차단.
4. **캐시 재사용**: 동일 파라미터+입력 조합은 재실행하지 않음 (해시 캐시 키).
5. **노드 = 결과물**: 완료된 노드는 썸네일 표시. 같은 노드에서 Make 반복 = 변형(variation) 추가.
6. **다크 테마**: #0a0a14 ~ #1a1a24. 흰 배경은 노드 카드 이미지 영역뿐.
7. **인라인 SVG 아이콘**: 이모지/외부 아이콘 폰트 금지 (lucide-react는 SVG이므로 허용).
8. **SketchUp 모델 보호**: 벽/바닥/천장/가구의 형상·위치 변경 금지 — 프롬프트로 구조 고정.
9. **API Key 보안**: 로컬 암호화 저장, 파일/히스토리에 평문 금지.

## 7. 로드맵

| 단계 | 작업 | 상태 |
|---|---|---|
| 1 | 문서 정합화 (이 문서 v2) | ✅ 2026-07-03 |
| 2a | webapp 마무리: 페이지 라우팅(History/Account/Settings), Rearrange, History Use 배선 | 예정 |
| 2b | webapp에 §5 노하우 이식 (geminiClient 모델/thinking/에러 처리) | 예정 |
| 2c | VIDEO_ANALYSIS 격차 반영: "View to render" 프리셋, 비디오 엔진 sora/veo, 다색 마킹·Ctrl+V 검증 | 예정 |
| 3 | 브릿지 확장: 씬 목록/전환/카메라/창 활성화 + 파일 경로 이미지 전달 | 예정 |
| 4 | Electron 패키징: 설치본, 자동 업데이트, SketchUp 플러그인 설치 메뉴 | |
| 5 | 프로덕트 계층: 계정/크레딧/결제, 설정 화면, 프로젝트 파일(.viz), 온보딩 | 상용화 결정 시 |
| 6 | 타 CAD 브릿지 (Rhino → Revit → 3ds Max) | 장기 |

## 8. 작업 수칙

1. 구현 전 `docs/VIDEO_ANALYSIS.md`와 해당 영역의 skills/ 문서를 읽어라.
2. 프로덕션 기준으로 작성하라. 목업/임시 코드 금지. (API mock은 실 API 계약 확정 전까지 허용 — 어댑터로 분리해 교체 가능하게)
3. 문서에 없는 기능을 임의로 추가하지 마라. 판단이 필요하면 물어라.
4. 레거시(`nano_banana_renderer/ui/`)에 신규 기능을 넣지 마라.
5. VizMaker의 기능·구조는 참고하되, 로고/상표/마케팅 문구는 사용하지 마라.

## 9. 문서 참조 우선순위

충돌 시 아래 순서를 따르라:

1. **BRIEFING.md (이 문서 v2)** — 최상위. 특히 §3의 갈래 구분
2. **docs/VIDEO_ANALYSIS.md** — 실물 동작 근거 (명세와 실물이 다르면 실물 우선)
3. **skills/UI_DESIGN.md** — UI 픽셀 명세
4. **docs/SPEC.md** — 전체 기획
5. **개별 skills/*.md** — 영역 상세 (단, SKETCHUP.md의 HtmlDialog 통신 부분은 레거시 전용)
6. **레거시 Ruby/JS 코드** — 패턴 참고용
