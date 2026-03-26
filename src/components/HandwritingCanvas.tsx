'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { Eraser } from 'lucide-react'
import clsx from 'clsx'

interface HandwritingCanvasProps {
  segmentId: string
  initialData: string | null
  onSave: (base64: string) => void
  onClear: () => void
  activeTool: 'pen' | 'highlighter' | 'eraser'
  brushSize: number
  brushColor?: string
}

const CANVAS_HEIGHT = 84

/** H1: WebP with PNG fallback for older iPads */
function exportCanvas(canvas: HTMLCanvasElement, quality = 0.7): string {
  const webp = canvas.toDataURL('image/webp', quality)
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png')
}

export default function HandwritingCanvas({
  segmentId,
  initialData,
  onSave,
  onClear,
  activeTool,
  brushSize,
  brushColor = '#e0e0f0',
}: HandwritingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [isEmpty, setIsEmpty] = useState(!initialData)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const historyRef = useRef<string[]>([initialData || ''])

  // ── Helper: get CSS dimensions of canvas ──
  const getCssDims = () => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { w: rect.width, h: CANVAS_HEIGHT }
  }

  // ── Initialize canvas at correct DPR size (no fixed width attr) ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0) return
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(CANVAS_HEIGHT * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    if (initialData) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, CANVAS_HEIGHT)
      img.src = initialData
      setIsEmpty(false)
    }
    historyRef.current = [initialData || '']
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentId]) // re-init when segment changes

  // ── Restore when initialData changes (e.g. external reload) ──
  // NOTE: do NOT reset historyRef here — that would wipe undo history after every auto-save
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { w, h } = getCssDims()
    ctx.clearRect(0, 0, w, h)
    if (initialData) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, w, h)
      img.src = initialData
      setIsEmpty(false)
    } else {
      setIsEmpty(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData])

  // ── Global Undo ──
  useEffect(() => {
    const handleUndo = () => {
      if (historyRef.current.length <= 1) return
      historyRef.current.pop()
      const prev = historyRef.current[historyRef.current.length - 1]
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const { w, h } = getCssDims()
      ctx.clearRect(0, 0, w, h)
      if (prev) {
        const img = new Image()
        img.onload = () => ctx.drawImage(img, 0, 0, w, h)
        img.src = prev
        onSave(prev)
      } else {
        setIsEmpty(true)
        onClear()
      }
    }
    window.addEventListener('annotation-undo', handleUndo)
    return () => window.removeEventListener('annotation-undo', handleUndo)
  }, [onSave, onClear])

  // ── ResizeObserver: snapshot → resize → restore at CSS dims ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let skipFirst = true // skip initial fire before user draws
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0) return
      if (skipFirst) { skipFirst = false; return }

      // Snapshot at current CSS size
      const snapshot = canvas.toDataURL('image/webp', 1)
      const prevW = rect.width
      const prevH = CANVAS_HEIGHT

      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(CANVAS_HEIGHT * dpr)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)

      if (snapshot && snapshot !== 'data:,') {
        const img = new Image()
        img.onload = () => ctx.drawImage(img, 0, 0, prevW, prevH)
        img.src = snapshot
      }
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const canvas = canvasRef.current
      if (canvas) onSave(exportCanvas(canvas, 0.7))
    }, 400)
  }, [onSave])

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch' || activeTool !== 'pen') return
    e.preventDefault()
    isDrawingRef.current = true
    const canvas = canvasRef.current!
    canvas.setPointerCapture(e.pointerId)
    const ctx = canvas.getContext('2d')!
    const pt = getPoint(e)
    lastPointRef.current = pt
    const pressure = e.pressure > 0 ? e.pressure : 0.5
    const lw = brushSize * 1.5 * pressure
    ctx.globalCompositeOperation = 'source-over'
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, lw / 2, 0, Math.PI * 2)
    ctx.fillStyle = brushColor
    ctx.fill()
    setIsEmpty(false)
  }, [activeTool, brushSize, brushColor])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch' || !isDrawingRef.current || activeTool !== 'pen') return
    e.preventDefault()
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const pt = getPoint(e)
    const last = lastPointRef.current
    const pressure = e.pressure > 0 ? e.pressure : 0.5
    const lw = brushSize * 1.5 * pressure
    ctx.globalCompositeOperation = 'source-over'
    ctx.beginPath()
    if (last) ctx.moveTo(last.x, last.y)
    ctx.lineTo(pt.x, pt.y)
    ctx.strokeStyle = brushColor
    ctx.lineWidth = lw
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    lastPointRef.current = pt
  }, [activeTool, brushSize, brushColor])

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch' || activeTool !== 'pen') return
    if (!isDrawingRef.current) return
    isDrawingRef.current = false
    lastPointRef.current = null
    const canvas = canvasRef.current
    if (canvas) {
      const snap = exportCanvas(canvas, 0.9)
      historyRef.current.push(snap)
      if (historyRef.current.length > 10) historyRef.current.shift()
    }
    scheduleSave()
  }, [activeTool, scheduleSave])

  // Cancel: release capture + reset state, do NOT save to history (interrupted stroke)
  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDrawingRef.current) {
      try { canvasRef.current?.releasePointerCapture(e.pointerId) } catch {}
    }
    isDrawingRef.current = false
    lastPointRef.current = null
  }, [])

  const handleClear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { w, h } = getCssDims()
    canvas.getContext('2d')?.clearRect(0, 0, w, h)
    setIsEmpty(true)
    onClear()
  }

  return (
    <div className="relative group">
      {/* No width/height attributes — size is set via JS to match DPR */}
      <canvas
        ref={canvasRef}
        style={{ height: CANVAS_HEIGHT, touchAction: 'none', display: 'block' }}
        className={clsx(
          'w-full rounded-xl',
          'bg-slate-900/60 border border-slate-700/50',
          'cursor-crosshair'
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />

      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[11px] text-slate-600 select-none">
            Apple Pencil 書寫 · 手指不觸發
          </span>
        </div>
      )}

      {!isEmpty && (
        <button
          onClick={handleClear}
          className={clsx(
            'absolute top-2 right-2 p-1.5 rounded-lg',
            'bg-slate-800 border border-slate-600 text-slate-400',
            'hover:text-red-400 hover:border-red-700 hover:bg-red-950/40',
            'transition-all opacity-0 group-hover:opacity-100'
          )}
          title="清除畫布"
        >
          <Eraser className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
