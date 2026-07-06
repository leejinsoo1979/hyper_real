import type { VideoInput } from '../../types/engine'
import type { NodeResult } from '../../types/node'
import { generateGrokVideo } from '../xaiClient'

// Video generation:
// - 'grok'  → xAI Grok Imagine API (실제 생성)
// - 그 외(kling/seedance/sora/veo) → 어댑터 준비 전까지 mock

// ── Mock ───────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function generateVideo(input: VideoInput): Promise<NodeResult> {
  if (input.engine === 'grok') {
    const videoUrl = await generateGrokVideo({
      image: input.image,
      prompt: input.prompt,
      duration: input.duration,
      resolution: input.resolution ?? '1080p',
    })
    return {
      image: input.image,
      video: videoUrl,
      timestamp: new Date().toISOString(),
      cacheKey: '',
    }
  }

  await delay(5000)
  return {
    image: input.image,
    video: 'mock-video-url',
    timestamp: new Date().toISOString(),
    cacheKey: '',
  }
}
