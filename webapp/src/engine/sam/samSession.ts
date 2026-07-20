// ---------------------------------------------------------------------------
// SAM 세션 (메인 스레드) — samWorker의 클라이언트
//
// 업로드 이미지 매직툴의 실시간 hover 인식용. 워커/모델은 최초 사용 시에만
// 지연 생성되고(번들 영향 없음), 이미지당 1회 인코딩 후 포인트 디코딩을
// 요청-응답으로 처리한다. 진행 상태는 classicStore.samStatus로 노출한다.
// ---------------------------------------------------------------------------

import { useClassicStore } from '../../state/classicStore'

export interface SamMask {
  /** 원본 해상도 이진 마스크 (0 | 255), 길이 w*h */
  data: Uint8Array
  w: number
  h: number
  score: number
}

interface WorkerMsg {
  type: 'boot' | 'encoded' | 'mask' | 'error'
  id?: number
  w?: number
  h?: number
  score?: number
  data?: ArrayBuffer
  stage?: string
  message?: string
}

let worker: Worker | null = null
let encodedImage: string | null = null
let encodePromise: Promise<boolean> | null = null
let encodeResolve: ((ok: boolean) => void) | null = null
let nextId = 1
const pending = new Map<number, (mask: SamMask | null) => void>()

function setStatus(status: 'idle' | 'loading' | 'ready' | 'error') {
  useClassicStore.getState().set({ samStatus: status })
}

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./samWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<WorkerMsg>) => {
    const msg = e.data
    if (msg.type === 'boot') {
      console.log('[SAM] 워커 모듈 로드 완료')
    } else if (msg.type === 'encoded') {
      setStatus('ready')
      encodeResolve?.(true)
      encodeResolve = null
    } else if (msg.type === 'mask' && msg.id !== undefined) {
      const cb = pending.get(msg.id)
      pending.delete(msg.id)
      cb?.(msg.data
        ? { data: new Uint8Array(msg.data), w: msg.w!, h: msg.h!, score: msg.score ?? 0 }
        : null)
    } else if (msg.type === 'error') {
      console.warn(`[SAM] ${msg.stage} 실패:`, msg.message)
      if (msg.stage === 'encode') {
        encodedImage = null
        setStatus('error')
        encodeResolve?.(false)
        encodeResolve = null
      } else if (msg.id !== undefined) {
        const cb = pending.get(msg.id)
        pending.delete(msg.id)
        cb?.(null)
      }
    }
  }
  worker.onerror = (e) => {
    console.warn('[SAM] 워커 에러:', e.message)
    encodedImage = null
    setStatus('error')
    encodeResolve?.(false)
    encodeResolve = null
    pending.forEach((cb) => cb(null))
    pending.clear()
  }
  return worker
}

/**
 * 이미지 인코딩 준비 (모델 로드 포함, 이미지당 1회 — 중복 호출은 같은 결과 공유).
 * 성공 시 true. 실패하면 samStatus='error'로 남고 false.
 */
export function prepareSam(image: string): Promise<boolean> {
  if (encodedImage === image && encodePromise) return encodePromise
  encodedImage = image
  setStatus('loading')
  encodePromise = new Promise<boolean>((resolve) => {
    encodeResolve = resolve
    getWorker().postMessage({ type: 'encode', image })
  })
  return encodePromise
}

/** 현재 이 이미지로 디코딩 가능한 상태인가 */
export function isSamReadyFor(image: string): boolean {
  return encodedImage === image && useClassicStore.getState().samStatus === 'ready'
}

/**
 * 클릭/호버 지점(비율 좌표)의 세그멘테이션 마스크 요청.
 * 준비 안 됐거나 다른 이미지가 인코딩돼 있으면 null.
 */
export function decodeSamPoint(image: string, fx: number, fy: number): Promise<SamMask | null> {
  if (!isSamReadyFor(image)) return Promise.resolve(null)
  const id = nextId++
  return new Promise((resolve) => {
    pending.set(id, resolve)
    getWorker().postMessage({ type: 'decode', id, fx, fy })
  })
}

/** 이진 마스크 → 흰색(선택)/검정(배경) PNG dataURL — 기존 aiSelMask 파이프라인 형식 */
export function samMaskToDataUrl(mask: SamMask): string | null {
  const c = document.createElement('canvas')
  c.width = mask.w
  c.height = mask.h
  const ctx = c.getContext('2d')
  if (!ctx) return null
  const img = ctx.createImageData(mask.w, mask.h)
  for (let i = 0; i < mask.w * mask.h; i++) {
    const v = mask.data[i]
    img.data[i * 4] = v
    img.data[i * 4 + 1] = v
    img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return c.toDataURL('image/png')
}
