# VizMaker 공식 튜토리얼 영상 분석

> 출처: https://www.youtube.com/watch?v=WF5SBDPuULY (공식 데모, 9분 57초)
> 분석일: 2026-07-03
> 목적: 스크린샷/문서로 알 수 없는 실제 동작·워크플로우 파악. skills/ 명세와 대조.

## 1. CAD 연동 UX (0:00–0:29)

- 3ds Max / Revit / SketchUp 안에 **아이콘 하나**가 있고, 클릭하면 **뷰가 즉시 VizMaker 창으로 전환**된다 (앱이 앞으로 튀어나옴 + 현재 뷰포트가 Source로 전송).
- CAD 뷰포트뿐 아니라 **임의 이미지 전송** 가능: 최종 렌더, 손 스케치, 자동차 스케치 등.
- 시사점: 브릿지의 핵심 UX = "CAD에서 버튼 한 번 → VizMaker가 포커스되며 Source 노드 생성". 우리 브릿지에 "앱 창 활성화" 신호 필요.

## 2. 렌더링 워크플로우 (0:29–2:51)

- Source 노드 클릭 → 렌더링 엔진 선택 → Make.
- **같은 프롬프트로 엔진 3종(1st/2nd/experimental)을 병렬 실행해서 비교**하는 것이 기본 사용 패턴. 노드가 "multilevel and parallel"인 이유.
- 기본 프롬프트: `create photorealistic image` (스케치도 이 프롬프트로 충분).
- 뷰포트 raw 스크린샷 → "first main renderer가 이런 상황에 완벽" (텍스처 정리된 스크린샷 전제).
- experimental 엔진은 "제품/자동차에 잘 작동".

## 3. Preview / Compare (1:11–1:34, 4:07–4:32)

- 프리뷰 100% 확대 버튼, 프리뷰를 **왼쪽 영역으로 이동**(고해상 보기), **더블클릭 + 마우스휠 줌**.
- 우클릭 → **Compare A** 선택 → 다른 이미지를 **slot B**에 → A/B 비교 (임의 두 이미지 가능).

## 4. Details Editor 브랜칭 (2:55–3:30)

- 프리셋 클릭 → Make → **새 브랜치(가지) 노드가 생성**됨. 원본은 유지.
- 영상에서 쓰인 프리셋: make brighter / add people / add flowers / day to night.

## 5. Draw 탭 (3:30–5:28) ★ 킬러 기능

- 화살표 그리고 텍스트 설명 → 해당 객체 제거/추가. **프롬프트는 아무 언어나 가능**.
- **여러 영역을 색상별로 마킹**하고 프롬프트에서 색으로 지칭:
  - "이 자리에 개를 추가하고, 초록색으로 표시한 객체는 제거"
- **외부 이미지 붙여넣기**: 웹에서 우클릭 복사 → VizMaker에 우클릭 paste 또는 **Ctrl+V** → 위치/크기 조정 → 프롬프트로 합성 지시 (자동차 교체 데모).
- **포즈 스케치**: 빨간색으로 사람 포즈를 그리고 "add person in pose drawn in red". 여러 명이면 색으로 구분.

## 6. Upscale (5:28–5:55)

- 렌더 기본 해상도 **1200px** (SPEC의 1200x1200과 일치).
- 업스케일 **최대 4배**, 데모는 2배. 파라미터 조정 가능하나 보통 standard 포지션 사용.
- 사용 시점: "렌더가 거의 완성됐을 때" 마무리 단계.

## 7. Video / Image-to-Video (5:55–8:38)

- 엔진 2종 구성:
  - **한 장 → 애니메이션** 엔진 (Kling으로 추정, 전사에는 "link engine")
  - **두 프레임(시작/끝) → 트랜지션** 엔진 (**Seedance**, 전사에는 "seed dance")
- 두 프레임 워크플로우: Details editor로 다른 앵글 샷 생성(예: "벽난로 줌인") → 그 샷을 **다운로드** → image to video 노드에 **last frame으로 로드** → 시작→끝 카메라 트랜지션 영상.
- 초 수 설정 가능. "프롬프트보다 이미지가 더 중요".
- 비디오 프리셋: classic camera movement.
- 완성 시 클릭하면 자동 재생, 확대 가능.

## 8. 노드 정리 / 히스토리 (8:45–9:40)

- 우클릭 → **Rearrange nodes**: 추가 연결이 없는 노드는 아래로, 연결이 많을수록 위로 정렬.
- 전체 클리어 / 개별 노드 삭제 가능.
- 클리어 후 복구 경로 2개:
  1. 같은 이미지를 다시 가져오면 이전 작업이 보임
  2. **History → Use 클릭 → 이전 워크플로우(그래프 전체) 복원**
- 시사점: History 항목 = 이미지 목록이 아니라 **그래프 스냅샷**. (webapp historyStore의 snapshot 구조와 일치)

## 9. 지원 채널 (9:40–end)

- Telegram 그룹 + Support 탭에 이메일. 오류 제보/기능 제안 받음.

## 10. 우리 구현과의 대조 (2026-07-03 기준)

| 영상 확인 기능 | webapp 상태 |
|---|---|
| 노드 병렬 렌더/브랜칭 | ✅ 구현됨 (pipelineExecutor) |
| 프리셋 (brighter/people/day-to-night 등) | ✅ 28종 구현 |
| Compare A/B 슬롯 | ✅ CompareNode + Inspector Compare 탭 |
| Draw 화살표+설명 | ✅ fabric.js Draw 탭 |
| Draw 색상별 다중 마킹 | 확인 필요 (색상 선택 있음, 다색 워크플로우 검증 필요) |
| Ctrl+V 외부 이미지 붙여넣기 | 확인 필요 (HtmlDialog판 node-draw-tab에는 paste 리스너 있음) |
| 프리뷰 더블클릭/휠 줌/왼쪽 이동 | 확인 필요 |
| 업스케일 2x/4x 파라미터 | ✅ UpscaleNode 구현 |
| 비디오 1프레임/2프레임(endFrame) | ✅ VideoNode에 endFrame 포트 있음 (실 API 미연결) |
| Rearrange nodes | 명세(UI_RULES)에 있음, webapp 구현 확인 필요 |
| History Use(그래프 복원) | historyStore 스냅샷 구조 있음, UI 배선 확인 필요 |
| CAD 아이콘 → 앱 포커스 전환 | ❌ 브릿지에 창 활성화 신호 없음 |

---

# 영상 2: SketchUp + Nano Banana 2 워크플로우

> 출처: https://www.youtube.com/watch?v=TC83l8Acalc (공식, SketchUp 주방 씬 데모)
> 분석일: 2026-07-03

## 1. SketchUp 진입 흐름

- SketchUp에서 **원하는 구도를 먼저 잡고** → 툴바의 VizMaker 아이콘 클릭 → **현재 뷰가 앱으로 전송**됨.
- 대상 모델은 저디테일이어도 됨 — "디테일 추가는 VizMaker 안에서" 라는 포지셔닝.

## 2. 렌더링과 변형(Variations)

- Source 클릭 → 우측 프리셋에서 **"View to render"** 클릭 → Make. (⚠ 이 프리셋명은 우리 28종 목록에 없음 — 신규 프리셋. 명세 갱신 필요)
- **같은 노드에서 Make를 반복 클릭하면 변형(variation)이 병렬 생성**됨. "Nano Banana Pro가 첫 시도에 못 맞출 때가 있으니 3번이든 몇 번이든 돌려라." → 한 소스에 결과 여러 개가 기본 UX.
- **노드 카드 하단에 사용 중인 AI 모델명 표시**.
- 결과 선택 → **Enlarge** 버튼으로 확대 검토.
- 결과 이미지를 선택하고 바로 텍스트 입력("remove the curtains") → 수정 노드 생성. 커튼 등 부분 제거가 한 문장으로 처리됨.

## 3. 컬러 팔레트 워크플로우 ★ (이 영상의 핵심)

- 웹에서 컬러 팔레트 이미지 복사 → Draw 탭 → **Ctrl+V 붙여넣기** → 프롬프트: `change the materials based on the color palette` → **씬 전체 마감재가 팔레트 기준으로 교체**됨.
- 팔레트 교체(다른 팔레트로 재시도): Draw 탭에서 **휴지통(bin) 아이콘**으로 기존 레퍼런스 삭제 → 새로 Ctrl+V.
- **팔레트 내 특정 재질을 특정 객체에 지정**: `use the wood from the color palette on the floor and the ivory material for the cupboards`.
- 후속 부분 수정: `make the walls white plaster`.

## 4. 멀티 에딧 (한 번의 Make로 여러 수정)

- Draw 탭에서: ① 웹에서 복사한 스툴 이미지를 붙여넣고 마커로 위치 표시, ② 원하는 스케일로 화분을 **직접 그려서** 크기 지정, ③ 램프 위치 스케치.
- 프롬프트 하나로 처리: `change the lamps, add two stools where marked based on the images, and add a plant on the right side` — **3가지 수정이 한 번에**.
- 결과물에서 레퍼런스 이미지 제거: `remove the spotlights and reference image`.
- 마케팅 포인트: "스니핑툴/포토샵 왕복이 필요 없다."

## 5. 품질 회복 패스 (중요한 운영 노하우)

- **반복 수정을 거치면 이미지 품질이 점점 열화**됨 → 최종 결과가 나오면 **다시 "View to render" 프리셋으로 한 번 더 렌더**해서 고해상 실사 품질로 복원. (= 마무리 리렌더 패스가 공식 워크플로우)

## 6. 비디오 엔진 목록 확정

- Image to video 엔진 4종: **Seedance, Kling, Sora, Veo** (전사 오타: "seance cling zora vio").
- 데모: **Kling 2.1** 선택, 프롬프트 `move forward` + `slowly`, **길이 5초/10초 선택지**.
- (NODE_TYPES의 VIDEO duration 5/10 정의와 일치. 엔진 목록은 kling/seedance 외 sora/veo 추가 필요)

## 7. 영상 2에서 갱신된 요구사항

| 항목 | 반영 필요 |
|---|---|
| "View to render" 프리셋 | 프리셋 목록에 추가 (28종에 없음) |
| 같은 노드 Make 반복 = variation 생성 | 파이프라인/UX에 다중 결과 지원 확인 |
| 노드 카드에 모델명 표시 | BaseNode 라벨 확인 (label2가 이 역할인지) |
| Draw 탭 bin(레퍼런스 삭제) | Draw 탭 UI 확인 |
| 비디오 엔진 sora/veo 추가 | VideoNode engine 옵션 확장 |
| 품질 회복 리렌더 패스 | 튜토리얼/가이드 콘텐츠에 반영 |
