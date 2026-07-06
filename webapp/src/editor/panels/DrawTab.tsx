import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas as FabricCanvas, PencilBrush, FabricImage } from 'fabric'
import { Pen, Eraser, MousePointer, Trash2, ChevronDown } from 'lucide-react'
import type { NodeData, ModifierParams } from '../../types/node'
import { useGraphStore } from '../../state/graphStore'

type DrawTool = 'pen' | 'eraser' | 'move' | 'delete'

const COLORS = [
  { label: 'Red', value: 'rgba(255, 0, 0, 0.7)' },
  { label: 'Green', value: 'rgba(0, 200, 0, 0.7)' },
  { label: 'Blue', value: 'rgba(0, 100, 255, 0.7)' },
  { label: 'Yellow', value: 'rgba(255, 220, 0, 0.7)' },
]

const COLOR_DOTS: Record<string, string> = {
  Red: '#ff0000',
  Green: '#00c800',
  Blue: '#0064ff',
  Yellow: '#ffdc00',
}

interface DrawTabProps {
  selectedNode: NodeData | null
  variant?: 'panel' | 'lightbox'
}

export function DrawTab({ selectedNode, variant = 'panel' }: DrawTabProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<FabricCanvas | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const updateNodeParams = useGraphStore((s) => s.updateNodeParams)

  const [activeTool, setActiveTool] = useState<DrawTool>('pen')
  const [brushSize, setBrushSize] = useState(20)
  const [activeColor, setActiveColor] = useState(COLORS[0])
  const [colorMenuOpen, setColorMenuOpen] = useState(false)

  const resultImage = selectedNode?.result?.image ?? null
  const isModifier = selectedNode?.type === 'MODIFIER'

  // Initialize Fabric canvas
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return

    const container = containerRef.current
    const width = container.clientWidth
    const height = variant === 'lightbox'
      ? Math.max(360, container.clientHeight)
      : Math.max(200, width * 0.75)

    const fc = new FabricCanvas(canvasRef.current, {
      width,
      height,
      backgroundColor: 'transparent',
      isDrawingMode: true,
    })

    fc.freeDrawingBrush = new PencilBrush(fc)
    fc.freeDrawingBrush.color = activeColor.value
    fc.freeDrawingBrush.width = brushSize

    fabricRef.current = fc

    return () => {
      fc.dispose()
      fabricRef.current = null
    }
    // Only re-init when selectedNode changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode?.id, variant])

  // Load background image when result changes
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc || !resultImage) return

    FabricImage.fromURL(resultImage).then((img) => {
      const canvasWidth = fc.getWidth()
      const canvasHeight = fc.getHeight()
      const scaleX = canvasWidth / (img.width ?? canvasWidth)
      const scaleY = canvasHeight / (img.height ?? canvasHeight)
      const scale = Math.min(scaleX, scaleY)
      img.set({
        scaleX: scale,
        scaleY: scale,
        originX: 'center',
        originY: 'center',
        left: canvasWidth / 2,
        top: canvasHeight / 2,
      })
      fc.backgroundImage = img
      fc.renderAll()
    })
  }, [resultImage])

  // Update brush when tool/size/color changes
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return

    if (activeTool === 'pen') {
      fc.isDrawingMode = true
      fc.freeDrawingBrush = new PencilBrush(fc)
      fc.freeDrawingBrush.color = activeColor.value
      fc.freeDrawingBrush.width = brushSize
    } else if (activeTool === 'eraser') {
      fc.isDrawingMode = true
      // Use white brush as eraser (will be transparent in exported mask)
      fc.freeDrawingBrush = new PencilBrush(fc)
      fc.freeDrawingBrush.color = 'rgba(0, 0, 0, 1)'
      fc.freeDrawingBrush.width = brushSize
      // The eraser effect: we set globalCompositeOperation on path:created
    } else if (activeTool === 'move') {
      fc.isDrawingMode = false
      fc.selection = true
    }
  }, [activeTool, brushSize, activeColor])

  // Handle eraser: set composite operation on newly created paths
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return

    const handlePathCreated = (e: { path: { globalCompositeOperation: string } }) => {
      if (activeTool === 'eraser' && e.path) {
        e.path.globalCompositeOperation = 'destination-out'
        fc.renderAll()
      }
    }

    fc.on('path:created', handlePathCreated as never)
    return () => {
      fc.off('path:created', handlePathCreated as never)
    }
  }, [activeTool])

  // Export mask and save to MODIFIER node params
  const exportMask = useCallback(() => {
    const fc = fabricRef.current
    if (!fc || !selectedNode || !isModifier) return

    // Export without background to get transparent PNG mask
    const bgImage = fc.backgroundImage
    fc.backgroundImage = undefined
    fc.renderAll()

    const maskData = fc.toDataURL({ format: 'png', multiplier: 1 })

    fc.backgroundImage = bgImage
    fc.renderAll()

    updateNodeParams(selectedNode.id, { mask: maskData } as Partial<ModifierParams>)
  }, [selectedNode, isModifier, updateNodeParams])

  // Auto-export on drawing change
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return

    const handleModified = () => exportMask()
    fc.on('path:created', handleModified as never)
    fc.on('object:modified', handleModified as never)

    return () => {
      fc.off('path:created', handleModified as never)
      fc.off('object:modified', handleModified as never)
    }
  }, [exportMask])

  // Handle delete all
  const handleDelete = useCallback(() => {
    const fc = fabricRef.current
    if (!fc) return
    const bg = fc.backgroundImage
    fc.clear()
    fc.backgroundImage = bg
    fc.renderAll()
    if (selectedNode && isModifier) {
      updateNodeParams(selectedNode.id, { mask: null } as Partial<ModifierParams>)
    }
  }, [selectedNode, isModifier, updateNodeParams])

  // Ctrl+V paste image onto canvas
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const fc = fabricRef.current
      if (!fc) return

      const items = e.clipboardData?.items
      if (!items) return

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (!file) continue

          const reader = new FileReader()
          reader.onload = () => {
            const dataUrl = reader.result as string
            FabricImage.fromURL(dataUrl).then((img) => {
              img.set({
                left: 50,
                top: 50,
                scaleX: 0.5,
                scaleY: 0.5,
              })
              fc.add(img)
              fc.setActiveObject(img)
              fc.renderAll()
            })
          }
          reader.readAsDataURL(file)
          e.preventDefault()
          break
        }
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [])

  if (!selectedNode) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ minHeight: variant === 'lightbox' ? '100%' : 200, color: '#555555', fontSize: 13 }}
      >
        Select a node to start drawing
      </div>
    )
  }

  if (!resultImage) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ minHeight: variant === 'lightbox' ? '100%' : 200, color: '#555555', fontSize: 13 }}
      >
        Run the pipeline first to get a result image
      </div>
    )
  }

  const tools: { id: DrawTool; icon: typeof Pen; label: string }[] = [
    { id: 'pen', icon: Pen, label: 'Pen' },
    { id: 'eraser', icon: Eraser, label: 'Eraser' },
    { id: 'move', icon: MousePointer, label: 'Move' },
  ]

  return (
    <div
      className={variant === 'lightbox' ? 'flex h-full min-h-0 flex-col' : undefined}
      style={{ minHeight: variant === 'lightbox' ? 0 : 200 }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center px-3"
        style={{ height: 46, gap: 4, borderBottom: '1px solid #222233' }}
      >
        {/* Tool buttons */}
        {tools.map((tool) => {
          const Icon = tool.icon
          const isActive = activeTool === tool.id
          return (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              title={tool.label}
              className="flex flex-shrink-0 items-center justify-center transition-colors duration-150"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: isActive ? '#00c9a7' : 'transparent',
                color: isActive ? '#06251f' : '#8a8a96',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = '#26262f'
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <Icon size={15} />
            </button>
          )
        })}

        {/* Delete button */}
        <button
          onClick={handleDelete}
          title="Delete all"
          className="flex flex-shrink-0 items-center justify-center transition-colors duration-150"
          style={{ width: 32, height: 32, borderRadius: 8, color: '#8a8a96' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#26262f')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <Trash2 size={15} />
        </button>

        {/* Separator */}
        <div className="flex-shrink-0" style={{ width: 1, height: 18, backgroundColor: '#2c2c37', margin: '0 6px' }} />

        {/* Size slider */}
        <span className="flex-shrink-0" style={{ color: '#8a8a96', fontSize: 11.5 }}>Size</span>
        <input
          type="range"
          min={1}
          max={80}
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          className="draw-slider min-w-0 flex-1"
          style={{ accentColor: '#00c9a7', margin: '0 6px' }}
        />

        {/* Color dropdown */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setColorMenuOpen(!colorMenuOpen)}
            className="flex items-center gap-1.5 px-2.5 transition-colors duration-150"
            style={{
              height: 32,
              backgroundColor: '#1c1c25',
              border: '1px solid #2c2c37',
              borderRadius: 8,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3d3d4b' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2c2c37' }}
          >
            <div
              className="rounded-full"
              style={{
                width: 9,
                height: 9,
                backgroundColor: COLOR_DOTS[activeColor.label],
              }}
            />
            <span style={{ color: '#ccccd6', fontSize: 12 }}>{activeColor.label}</span>
            <ChevronDown size={12} style={{ color: '#71717f' }} />
          </button>

          {colorMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setColorMenuOpen(false)} />
              <div
                className="absolute right-0 top-full z-50 mt-1 py-1"
                style={{
                  backgroundColor: '#1e1e28',
                  border: '1px solid #30303c',
                  borderRadius: 9,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.55)',
                  minWidth: 110,
                }}
              >
                {COLORS.map((color) => (
                  <button
                    key={color.label}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors duration-100"
                    style={{ color: '#ccccd6', fontSize: 12 }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2a2a36')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    onClick={() => {
                      setActiveColor(color)
                      setColorMenuOpen(false)
                    }}
                  >
                    <div
                      className="rounded-full"
                      style={{
                        width: 9,
                        height: 9,
                        backgroundColor: COLOR_DOTS[color.label],
                      }}
                    />
                    {color.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative"
        style={{
          backgroundColor: '#111118',
          flex: variant === 'lightbox' ? '1 1 auto' : undefined,
          minHeight: variant === 'lightbox' ? 0 : undefined,
        }}
      >
        <canvas ref={canvasRef} />
      </div>
    </div>
  )
}
