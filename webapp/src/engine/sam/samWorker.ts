/// <reference lib="webworker" />
// ---------------------------------------------------------------------------
// SAM(Segment Anything) 웹워커 — 업로드 이미지 매직툴의 실시간 hover 인식 엔진
//
// 브라우저에서 SlimSAM을 직접 실행한다. 인코딩(이미지 임베딩)은 업로드당 1회만
// 수행하고(수 초), 이후 포인트 프롬프트 디코딩은 수십 ms라 hover마다 호출해도
// 실시간 하이라이트가 가능하다. 워커에서 돌려 인코딩 중에도 UI가 멈추지 않는다.
//
// 프로토콜: main → worker  { type: 'encode', image } | { type: 'decode', id, fx, fy }
//           worker → main { type: 'encoded', w, h } | { type: 'mask', id, w, h, score, data }
//                         | { type: 'error', stage, message }
// 좌표는 이미지 비율(fx, fy ∈ 0..1), 마스크는 원본 해상도 이진(0/255) Uint8Array.
// ---------------------------------------------------------------------------

import { SamModel, AutoProcessor, RawImage, Tensor, type Processor, type PreTrainedModel } from '@huggingface/transformers'

const MODEL_ID = 'Xenova/slimsam-77-uniform'

// 모듈(transformers.js 포함) 로드 완료 신호 — 메인 스레드 진단용
self.postMessage({ type: 'boot' })

interface SamInputs {
  pixel_values: Tensor
  original_sizes: number[][]
  reshaped_input_sizes: number[][]
}

let model: PreTrainedModel | null = null
let processor: Processor | null = null
// 현재 인코딩된 이미지의 전처리 결과와 임베딩 (디코딩마다 재사용)
let imageInputs: SamInputs | null = null
let imageEmbeddings: Record<string, Tensor> | null = null

async function loadModel() {
  if (model && processor) return
  // WebGPU 우선, 실패 시 WASM(양자화)으로 폴백
  try {
    const hasWebGPU = 'gpu' in navigator && Boolean((navigator as { gpu?: unknown }).gpu)
    if (!hasWebGPU) throw new Error('WebGPU 미지원')
    model = await SamModel.from_pretrained(MODEL_ID, { dtype: 'fp16', device: 'webgpu' })
  } catch {
    model = await SamModel.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'wasm' })
  }
  processor = await AutoProcessor.from_pretrained(MODEL_ID)
}

async function encode(image: string) {
  await loadModel()
  const raw = await RawImage.read(image)
  imageInputs = await processor!(raw) as unknown as SamInputs
  imageEmbeddings = await (model as SamModel).get_image_embeddings(imageInputs) as Record<string, Tensor>
  const [h, w] = imageInputs.original_sizes[0]
  self.postMessage({ type: 'encoded', w, h })
}

async function decode(id: number, fx: number, fy: number) {
  if (!model || !processor || !imageInputs || !imageEmbeddings) {
    throw new Error('이미지가 아직 인코딩되지 않음')
  }
  // 포인트는 리사이즈된 입력 좌표계 기준
  const [rh, rw] = imageInputs.reshaped_input_sizes[0]
  const input_points = new Tensor('float32', new Float32Array([fx * rw, fy * rh]), [1, 1, 1, 2])
  const input_labels = new Tensor('int64', new BigInt64Array([1n]), [1, 1, 1])

  const outputs = await (model as SamModel)({ ...imageEmbeddings, input_points, input_labels })
  const masks = await (processor as unknown as {
    post_process_masks: (m: Tensor, o: unknown, r: unknown) => Promise<Tensor[]>
  }).post_process_masks(
    outputs.pred_masks,
    imageInputs.original_sizes,
    imageInputs.reshaped_input_sizes,
  )

  // masks[0]: [1, 3, H, W] bool — iou 최고 채널 선택
  const tensor = masks[0]
  const [, numMasks, h, w] = tensor.dims as number[]
  const scores = (outputs.iou_scores as Tensor).data as Float32Array
  let best = 0
  for (let i = 1; i < numMasks; i++) {
    if (scores[i] > scores[best]) best = i
  }
  const plane = h * w
  const src = tensor.data as Uint8Array
  const out = new Uint8Array(plane)
  const off = best * plane
  for (let i = 0; i < plane; i++) out[i] = src[off + i] ? 255 : 0

  self.postMessage({ type: 'mask', id, w, h, score: scores[best], data: out.buffer }, { transfer: [out.buffer] })
}

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as { type: string; image?: string; id?: number; fx?: number; fy?: number }
  void (async () => {
    try {
      if (msg.type === 'encode') {
        await encode(msg.image!)
      } else if (msg.type === 'decode') {
        await decode(msg.id!, msg.fx!, msg.fy!)
      }
    } catch (err) {
      self.postMessage({
        type: 'error',
        stage: msg.type,
        id: msg.id,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })()
}
