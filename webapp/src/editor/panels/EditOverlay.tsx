import { useCallback, useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// 이미지 로컬 보정 오버레이 — 레거시 editor_dialog.html 이식
// 슬라이더 10종(-100~100): 밝기/대비/하이라이트/그림자/색온도/틴트/채도/바이브런스/선명도/텍스처
// API 호출 없이 Canvas 픽셀 연산만 사용
// ---------------------------------------------------------------------------

const SLIDERS: { key: keyof Values; label: string }[] = [
  { key: 'brightness', label: '밝기' },
  { key: 'contrast', label: '대비' },
  { key: 'highlights', label: '하이라이트' },
  { key: 'shadows', label: '그림자' },
  { key: 'temperature', label: '색온도' },
  { key: 'tint', label: '틴트' },
  { key: 'saturation', label: '채도' },
  { key: 'vibrance', label: '바이브런스' },
  { key: 'sharpness', label: '선명도' },
  { key: 'texture', label: '텍스처' },
]

interface Values {
  brightness: number; contrast: number; highlights: number; shadows: number
  temperature: number; tint: number; saturation: number; vibrance: number
  sharpness: number; texture: number
}

const ZERO: Values = {
  brightness: 0, contrast: 0, highlights: 0, shadows: 0,
  temperature: 0, tint: 0, saturation: 0, vibrance: 0, sharpness: 0, texture: 0,
}

// 분리형 박스 블러 (선명도/텍스처의 언샤프 마스크용)
function boxBlur(src: Uint8ClampedArray, w: number, h: number, r: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length)
  const tmp = new Float32Array(src.length)
  const size = r * 2 + 1
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 3; c++) {
      let acc = 0
      for (let x = -r; x <= r; x++) acc += src[(y * w + Math.min(w - 1, Math.max(0, x))) * 4 + c]
      for (let x = 0; x < w; x++) {
        tmp[(y * w + x) * 4 + c] = acc / size
        const add = Math.min(w - 1, x + r + 1)
        const sub = Math.max(0, x - r)
        acc += src[(y * w + add) * 4 + c] - src[(y * w + sub) * 4 + c]
      }
    }
  }
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let acc = 0
      for (let y = -r; y <= r; y++) acc += tmp[(Math.min(h - 1, Math.max(0, y)) * w + x) * 4 + c]
      for (let y = 0; y < h; y++) {
        out[(y * w + x) * 4 + c] = acc / size
        const add = Math.min(h - 1, y + r + 1)
        const sub = Math.max(0, y - r)
        acc += tmp[(add * w + x) * 4 + c] - tmp[(sub * w + x) * 4 + c]
      }
    }
  }
  return out
}

function applyAdjustments(data: Uint8ClampedArray, w: number, h: number, v: Values) {
  const contrastF = (259 * (v.contrast * 1.27 + 255)) / (255 * (259 - v.contrast * 1.27))
  const needBlurSharp = v.sharpness !== 0 ? boxBlur(data.slice(), w, h, 1) : null
  const needBlurTex = v.texture !== 0 ? boxBlur(data.slice(), w, h, 4) : null

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2]

    // 언샤프 마스크 (선명도 r=1, 텍스처 r=4)
    if (needBlurSharp) {
      const k = v.sharpness / 100
      r += (r - needBlurSharp[i]) * k
      g += (g - needBlurSharp[i + 1]) * k
      b += (b - needBlurSharp[i + 2]) * k
    }
    if (needBlurTex) {
      const k = (v.texture / 100) * 0.7
      r += (r - needBlurTex[i]) * k
      g += (g - needBlurTex[i + 1]) * k
      b += (b - needBlurTex[i + 2]) * k
    }

    // 밝기 / 대비
    r = (r + v.brightness * 1.27 - 128) * contrastF + 128
    g = (g + v.brightness * 1.27 - 128) * contrastF + 128
    b = (b + v.brightness * 1.27 - 128) * contrastF + 128

    // 색온도 / 틴트
    r += v.temperature * 0.6
    b -= v.temperature * 0.6
    g += v.tint * 0.5

    // 하이라이트 / 그림자 (luma 기반)
    const luma = 0.299 * r + 0.587 * g + 0.114 * b
    if (v.highlights !== 0 && luma > 128) {
      const k = (v.highlights / 100) * ((luma - 128) / 127)
      r += (255 - r) * k * 0.6; g += (255 - g) * k * 0.6; b += (255 - b) * k * 0.6
    }
    if (v.shadows !== 0 && luma < 128) {
      const k = (v.shadows / 100) * ((128 - luma) / 128)
      r += (128 - r) * k * 0.6 + k * 20; g += (128 - g) * k * 0.6 + k * 20; b += (128 - b) * k * 0.6 + k * 20
    }

    // 채도 / 바이브런스
    const l2 = 0.299 * r + 0.587 * g + 0.114 * b
    const satK = 1 + v.saturation / 100
    r = l2 + (r - l2) * satK; g = l2 + (g - l2) * satK; b = l2 + (b - l2) * satK
    if (v.vibrance !== 0) {
      const maxc = Math.max(r, g, b), minc = Math.min(r, g, b)
      const satNow = maxc === 0 ? 0 : (maxc - minc) / 255
      const vibK = (v.vibrance / 100) * (1 - satNow)
      const l3 = 0.299 * r + 0.587 * g + 0.114 * b
      r = l3 + (r - l3) * (1 + vibK); g = l3 + (g - l3) * (1 + vibK); b = l3 + (b - l3) * (1 + vibK)
    }

    data[i] = r; data[i + 1] = g; data[i + 2] = b
  }
}

function renderTo(canvas: HTMLCanvasElement, img: HTMLImageElement, v: Values, maxW: number) {
  const scale = Math.min(1, maxW / img.naturalWidth)
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const id = ctx.getImageData(0, 0, canvas.width, canvas.height)
  applyAdjustments(id.data, canvas.width, canvas.height, v)
  ctx.putImageData(id, 0, 0)
}

export function EditOverlay({ image, onApply, onClose }: {
  image: string
  onApply: (dataUrl: string) => void
  onClose: () => void
}) {
  const [values, setValues] = useState<Values>(ZERO)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      if (canvasRef.current) renderTo(canvasRef.current, img, ZERO, 960)
    }
    img.src = image
  }, [image])

  // 슬라이더 변경 → 120ms 디바운스로 미리보기(≤960px) 갱신
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (imgRef.current && canvasRef.current) renderTo(canvasRef.current, imgRef.current, values, 960)
    }, 120)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [values])

  const apply = useCallback(() => {
    if (!imgRef.current) return
    const full = document.createElement('canvas')
    renderTo(full, imgRef.current, values, imgRef.current.naturalWidth) // 원본 해상도로 최종 적용
    onApply(full.toDataURL('image/png'))
  }, [values, onApply])

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div className="flex overflow-hidden rounded-lg" style={{ background: '#141414', border: '1px solid #333', maxWidth: '92vw', maxHeight: '90vh' }}>
        {/* 미리보기 */}
        <div className="flex items-center justify-center" style={{ background: '#0a0a0a', minWidth: 480 }}>
          <canvas ref={canvasRef} style={{ maxWidth: '62vw', maxHeight: '86vh', objectFit: 'contain' }} />
        </div>

        {/* 슬라이더 열 */}
        <div className="flex w-64 flex-col" style={{ borderLeft: '1px solid #333' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #333', fontSize: 12, fontWeight: 600, color: '#fff' }}>
            이미지 보정 (로컬 - API 호출 없음)
          </div>
          <div className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
            {SLIDERS.map(({ key, label }) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <div className="flex justify-between" style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>
                  <span>{label}</span>
                  <span style={{ color: values[key] !== 0 ? '#00c9a7' : '#555' }}>{values[key]}</span>
                </div>
                <input
                  type="range" min={-100} max={100} value={values[key]}
                  onChange={(e) => setValues((p) => ({ ...p, [key]: Number(e.target.value) }))}
                  className="w-full"
                  style={{ accentColor: '#00c9a7' }}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2" style={{ padding: 12, borderTop: '1px solid #333' }}>
            <button onClick={() => setValues(ZERO)} style={btn('#222', '#ccc')}>초기화</button>
            <button onClick={onClose} style={btn('#222', '#ccc')}>취소</button>
            <button onClick={apply} style={btn('#00c9a7', '#0a0a14')}>적용</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function btn(bg: string, color: string): React.CSSProperties {
  return { flex: 1, height: 34, borderRadius: 6, fontSize: 12, fontWeight: 600, background: bg, color }
}
