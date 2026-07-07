# NanoBanana SketchUp AI 렌더링 플러그인

## 프로젝트 개요

SketchUp 전용 AI 실사 렌더링 플러그인입니다.
Google Gemini API를 활용하여 인테리어 씬을 실사 이미지로 변환합니다.

## 절대 규칙 (Critical Rules)

### 1. SketchUp 모델 보호
- **벽, 바닥, 천장, 창문, 가구의 형상과 위치는 절대 변경 금지**
- AI는 오직 실사화, 조명, 분위기, 합성만 담당
- 모든 재생성은 시맨틱 마스킹 프롬프트로 구조 고정

### 2. 보안
- API Key는 로컬에 AES-256 암호화 저장
- .skp 파일에 API Key 포함 금지
- 모든 네트워크 통신은 HTTPS only

### 3. 코드 작성 규칙
- SketchUp Ruby API 2021+ 호환
- 들여쓰기: 2 spaces
- 모든 클래스는 `NanoBanana` 모듈 내부에 정의
- 에러 처리 필수 (begin/rescue)
- **절대로 임시방편(workaround/hack)으로 코딩하지 않는다** — 반드시 근본 원인을 찾아서 정상적인 방법으로 수정할 것

## 기술 스택

| 영역 | 기술 |
|------|------|
| 플러그인 | SketchUp Ruby API |
| UI | HtmlDialog (HTML/CSS/JS) |
| AI API | Google Gemini (`gemini-2.5-flash-image`) |
| 암호화 | OpenSSL AES-256 |
| 이미지 처리 | Canvas API (로컬 보정) |

## 프로젝트 구조

```
nano_banana_renderer/
├── main.rb                          # 진입점, 메뉴 등록
├── ui/
│   ├── main_dialog.html             # 메인 렌더링 UI
│   ├── settings_dialog.html         # API Key 설정
│   ├── editor_dialog.html           # 이미지 보정
│   └── hotspot_dialog.html          # 오브젝트 배치
├── services/
│   ├── scene_exporter.rb            # SketchUp → PNG
│   ├── prompt_builder.rb            # 3-Layer 프롬프트 조합
│   ├── semantic_mask_builder.rb     # 시맨틱 마스킹 프롬프트
│   ├── api_client.rb                # Gemini API 통신
│   ├── image_editor.rb              # 로컬 보정 처리
│   └── hotspot_manager.rb           # 오브젝트 배치 관리
├── assets/
│   └── object_library/              # 기본 오브젝트 PNG
├── storage/
│   └── config_store.rb              # API Key 암호화 저장
└── docs/
    ├── ARCHITECTURE.md
    ├── API_SPEC.md
    ├── WORKFLOW.md
    ├── UI_SPEC.md
    └── PROMPT_SYSTEM.md
```

## 핵심 워크플로우

```
SketchUp 씬 → 1차 렌더링 → 로컬 보정 → 조명 변경 → 오브젝트 배치 → 최종 재생성
```

## 개발 우선순위

1. 🔴 플러그인 골격 (main.rb)
2. 🔴 API Key 관리 (config_store.rb)
3. 🔴 씬 추출 (scene_exporter.rb)
4. 🔴 API 통신 (api_client.rb)
5. 🔴 프롬프트 시스템 (prompt_builder.rb)
6. 🔴 메인 UI (main_dialog.html)
7. 🟡 이미지 보정 (image_editor.rb)
8. 🟡 낮/밤/조명 컨트롤
9. 🟡 핫스팟 오브젝트 배치
10. 🟢 결과 관리/히스토리

## 참조 문서

> **필독**: [AGENT_PLAYBOOK.md](AGENT_PLAYBOOK.md) — 작업 방법론(진단→근본수정→검증 사다리→커밋 규율).
> [HANDOFF.md](HANDOFF.md) — 실전 함정 목록·도메인 트릭·열린 이슈. 두 문서를 먼저 읽고 작업할 것.

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - 전체 아키텍처
- [API_SPEC.md](docs/API_SPEC.md) - Gemini API 명세
- [WORKFLOW.md](docs/WORKFLOW.md) - 워크플로우 상세
- [UI_SPEC.md](docs/UI_SPEC.md) - UI 컴포넌트 명세
- [PROMPT_SYSTEM.md](docs/PROMPT_SYSTEM.md) - 프롬프트 설계

## 테스트 체크리스트

- [ ] API Key 없이 렌더 버튼 비활성화
- [ ] 1차 렌더링 후 벽/가구 형태 유지
- [ ] 로컬 보정 시 API 호출 없음
- [ ] 낮/밤 전환 후 구조 변형 없음
- [ ] 핫스팟 오브젝트 위치/스케일 정확도
- [ ] 최종 재생성 후 배치 상태 유지

---

## 🚨 작업 규칙 (절대 준수)

### Git 복원/복구 시 필수 사항
- **복원/복구 전 반드시 사용자 허락 받을 것**
- **커밋 해시 또는 날짜/시간을 명시할 것**
  - 예: "2026-02-05 21:30 커밋 7f2acec로 복원할까요?"
- **허락 없이 `git checkout`, `git reset`, `git restore` 절대 금지**

---

## ⚠️ 중요 기술 이슈 (반드시 읽을 것)

### HtmlDialog 이미지 전송 크래시 문제

**문제**: `execute_script()`로 큰 데이터(~1MB base64)를 한 번에 전송하면 HtmlDialog가 크래시됨

**해결책 (현재 구현)**: JS-driven 청크 폴링
1. Ruby가 이미지를 30KB 청크로 분할하여 `@pending_chunks` 배열에 저장
2. Ruby가 `onChunkStart(sceneName, totalChunks)` 호출
3. JS가 `sketchup.getNextChunk()` 콜백으로 청크 요청
4. Ruby가 `onChunkData(data, isLast)` 호출하여 한 청크 전송
5. JS가 10ms 딜레이 후 다음 청크 요청 반복
6. 마지막 청크 수신 시 이미지 조합하여 처리

**관련 코드**:
- `main.rb`: `poll_render_complete()`, `get_next_chunk()`
- `main_dialog.html`: `onChunkStart()`, `onChunkData()`

**절대 하지 말 것**:
- ❌ `execute_script()`로 500KB 이상 데이터 한 번에 전송
- ❌ Thread 내에서 직접 `execute_script()` 호출 (UI.start_timer 사용)

### 2차 렌더링 (regenerate) 필수 파라미터

**문제**: 2차 렌더링 호출 시 `negative_prompt` 파라미터 누락하면 작동 안 함

**해결책**: JS에서 `sketchup.regenerate()` 호출 시 4개 파라미터 필수
```javascript
sketchup.regenerate(sourceBase64, prompt, negativePrompt, panelId);
```

### SketchUp 플러그인 배포 경로 (세 버전 모두!)

```
~/Library/Application Support/SketchUp {2022,2024,2025}/SketchUp/Plugins/nano_banana_renderer/
```

이 Mac에는 SketchUp이 3개 버전 설치되어 있다. 수정 후 반드시 **세 폴더 모두**에 복사해야 한다.
(2022만 복사하면 사용자가 실행하는 버전에 반영되지 않는 사고가 발생함 — 2026-07-03 실증)

### 진단 로그

플러그인의 모든 `[NanoBanana]` 로그는 `~/.sketchupshow/debug.log`에 자동 기록된다.
"안 된다"는 보고를 받으면 추측하지 말고 이 파일부터 읽어라.
Ruby 파일 수정은 재시작 대신 루비 콘솔에서
`load File.join(NanoBanana::PLUGIN_ROOT, 'services/파일명.rb')` 로 즉시 리로드 가능하다
(메뉴/콜백 등록 변경만 SketchUp 재시작 필요).

### 히스토리 저장 위치

```
~/.sketchupshow/history.json
```

최대 500개 항목 저장

---

## 제품 방향 (2026-07-03 확정): VizMaker와 동일한 독립 데스크톱 앱

최종 목표는 **VizMaker(MS Store, VizAcademy Software)와 동일한 독립 데스크톱 앱**이다.

- **정본(제품) = `webapp/`** — React 19 + TS + Vite + Zustand + @xyflow/react. 모든 신규 개발은 여기서.
- **레거시(동결) = `nano_banana_renderer/`** — HtmlDialog UI는 버그픽스만. 로컬 서버(9876)는 브릿지로 승격.
- 실물 VizMaker도 로컬 서버 방식("Server connection: Connected")임이 확인됨.

상세 지시 문서 (읽는 순서):

1. **BRIEFING.md (v2)** — 최상위 지시. 갈래 구분, 아키텍처, 로드맵, 검증된 기술 노하우
2. **docs/VIDEO_ANALYSIS.md** — 실물 VizMaker 분석 (MS Store + 공식 영상 2편). 명세와 실물이 다르면 실물 우선
3. **docs/SPEC.md** — 전체 기획 문서
4. **skills/UI_DESIGN.md** — UI 픽셀 단위 명세
5. **skills/NODE_TYPES.md** — 노드 타입별 상세 정의
6. **skills/PROMPT_PRESETS.md** — 프롬프트 프리셋 목록 (+"View to render" 추가 필요)
7. **skills/PIPELINE.md** — DAG 실행 파이프라인 의사코드
8. **skills/UI_RULES.md** — UI/UX 동작 규칙
9. **skills/SKETCHUP.md** — SketchUp 연동 명세 (HtmlDialog 통신 부분은 레거시 전용)

⚠ BRIEFING v1의 스택 지시(Vanilla JS/ES5/빌드 금지)는 폐기됨. webapp에는 적용하지 않는다.
