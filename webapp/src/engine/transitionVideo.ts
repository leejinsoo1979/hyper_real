// ---------------------------------------------------------------------------
// 소스 → 결과 오버레이(크로스페이드) 영상 생성 — 100% 클라이언트 로컬
//
// Canvas에 두 이미지를 이징 크로스페이드로 그리면서 captureStream +
// MediaRecorder로 녹화한다. AI 호출 없음 → 즉시·무료·구조 변형 없음.
// 출력: webm(vp9/vp8) Blob
// ---------------------------------------------------------------------------

export interface TransitionVideoOptions {
  /** 전체 길이(초). 기본 4 */
  duration?: number
  /** 시작/끝 정지 구간(초). 기본 0.8 */
  hold?: number
  fps?: number
  /** 긴 변 최대 픽셀. 기본 1920 */
  maxEdge?: number
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('이미지 로드 실패'))
    img.src = src.startsWith('data:') || src.startsWith('http') || src.startsWith('blob:')
      ? src
      : `data:image/png;base64,${src}`
  })
}

/** cover 방식으로 캔버스를 가득 채워 그린다 (비율 다른 두 이미지 대응) */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

function pickMimeType(): string {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? ''
}

/**
 * imageA(소스)가 imageB(결과)로 자연스럽게 디졸브되는 영상을 만든다.
 * 타임라인: [A 정지 hold] → [크로스페이드] → [B 정지 hold]
 */
export async function generateCrossfadeVideo(
  imageA: string,
  imageB: string,
  options: TransitionVideoOptions = {},
): Promise<Blob> {
  const duration = options.duration ?? 4
  const hold = options.hold ?? 0.8
  const fps = options.fps ?? 30
  const maxEdge = options.maxEdge ?? 1920

  const [a, b] = await Promise.all([loadImage(imageA), loadImage(imageB)])

  // 결과(B) 비율 기준, 긴 변 maxEdge 캡. 인코더 호환을 위해 짝수 크기로.
  const scale = Math.min(1, maxEdge / Math.max(b.naturalWidth, b.naturalHeight))
  const w = Math.max(2, Math.round((b.naturalWidth * scale) / 2) * 2)
  const h = Math.max(2, Math.round((b.naturalHeight * scale) / 2) * 2)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('캔버스 컨텍스트 생성 실패')

  const stream = canvas.captureStream(fps)
  const mimeType = pickMimeType()
  const recorder = new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: 12_000_000,
  })
  const chunks: BlobPart[] = []
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || 'video/webm' }))
    recorder.onerror = () => reject(new Error('영상 인코딩 실패'))
  })

  const fadeStart = hold
  const fadeEnd = Math.max(hold + 0.2, duration - hold)

  const drawFrame = (t: number) => {
    const raw = t <= fadeStart ? 0 : t >= fadeEnd ? 1 : (t - fadeStart) / (fadeEnd - fadeStart)
    const alpha = easeInOut(raw)
    ctx.clearRect(0, 0, w, h)
    ctx.globalAlpha = 1
    drawCover(ctx, a, w, h)
    ctx.globalAlpha = alpha
    drawCover(ctx, b, w, h)
    ctx.globalAlpha = 1
  }

  drawFrame(0)
  recorder.start()
  const t0 = performance.now()

  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000
      if (t >= duration) {
        drawFrame(duration)
        resolve()
        return
      }
      drawFrame(t)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  // 마지막 프레임이 확실히 기록되도록 잠깐 유지 후 종료
  await new Promise((r) => setTimeout(r, 120))
  recorder.stop()
  return done
}
