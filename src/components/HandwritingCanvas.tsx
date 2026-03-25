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

  // Restore from initial data
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (initialData) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0)
      img.src = initialData
      setIsEmpty(false)
    } else {
      setIsEmpty(true)
    }
    historyRef.current = [initialData || '']
  }, [initialData, segmentId])

  // Global Undo Listener
  useEffect(() => {
    const handleUndo = () => {
      // Basic undo: if this canvas was just drawn on, pop the history
      if (historyRef.current.length > 1) {
        historyRef.current.pop() // remove latest
        const previousState = historyRef.current[historyRef.current.length - 1]
        
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        if (previousState) {
          const img = new Image()
          img.onload = () => ctx.drawImage(img, 0, 0)
          img.src = previousState
          onSave(previousState)
        } else {
          setIsEmpty(true)
          onClear()
        }
      }
    }
    window.addEventListener('annotation-undo', handleUndo)
    return () => window.removeEventListener('annotation-undo', handleUndo)
  }, [onSave, onClear])

  // Resize observer to keep canvas physical pixel size matched
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      // Save current content
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = canvas.width
      tempCanvas.height = canvas.height
      tempCanvas.getContext('2d')?.drawImage(canvas, 0, 0)
      // Resize
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(CANVAS_HEIGHT * dpr)
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.scale(dpr, dpr)
        ctx.drawImage(tempCanvas, 0, 0, rect.width, CANVAS_HEIGHT)
      }
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const canvas = canvasRef.current
      if (canvas) {
        const base64 = canvas.toDataURL('image/webp', 0.7)
        onSave(base64)
      }
    }, 400)
  }, [onSave])

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch' || activeTool === 'highlighter') return
    e.preventDefault()
    isDrawingRef.current = true
    const canvas = canvasRef.current!
    canvas.setPointerCapture(e.pointerId)
    const ctx = canvas.getContext('2d')!
    const pt = getPoint(e)
    lastPointRef.current = pt

    const pressure = e.pressure > 0 ? e.pressure : 0.5
    const lineWidth = brushSize * 1.5 * pressure

    ctx.globalCompositeOperation = activeTool === 'eraser' ? 'destination-out' : 'source-over'
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, lineWidth / 2, 0, Math.PI * 2)
    ctx.fillStyle = activeTool === 'eraser' ? 'rgba(0,0,0,1)' : brushColor
    ctx.fill()
    setIsEmpty(false)
  }, [activeTool, brushSize, brushColor])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch' || !isDrawingRef.current || activeTool === 'highlighter') return
    e.preventDefault()
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const pt = getPoint(e)
    const last = lastPointRef.current

    const pressure = e.pressure > 0 ? e.pressure : 0.5
    const lineWidth = brushSize * 1.5 * pressure

    ctx.globalCompositeOperation = activeTool === 'eraser' ? 'destination-out' : 'source-over'
    ctx.beginPath()
    if (last) ctx.moveTo(last.x, last.y)
    ctx.lineTo(pt.x, pt.y)
    ctx.strokeStyle = activeTool === 'eraser' ? 'rgba(0,0,0,1)' : brushColor
    ctx.lineWidth = lineWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()

    lastPointRef.current = pt
  }, [activeTool, brushSize, brushColor])

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch' || activeTool === 'highlighter') return
    isDrawingRef.current = false
    lastPointRef.current = null
    
    // Save state to history array for undo
    const canvas = canvasRef.current
    if (canvas) {
      historyRef.current.push(canvas.toDataURL('image/png'))
      // Keep only last 20 strokes to save memory
      if (historyRef.current.length > 20) historyRef.current.shift()
    }
    
    scheduleSave()
  }, [activeTool, scheduleSave])

  const handleClear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx?.clearRect(0, 0, canvas.width, canvas.height)
    setIsEmpty(true)
    onClear()
  }

  return (
    <div className="relative group">
      <canvas
        ref={canvasRef}
        width={800}
        height={CANVAS_HEIGHT}
        style={{ height: CANVAS_HEIGHT, touchAction: 'none' }}
        className={clsx(
          'w-full rounded-xl',
          'bg-slate-900/60 border border-slate-700/50',
          'cursor-crosshair'
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {/* Hint text when empty */}
      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[11px] text-slate-600 select-none">
            Apple Pencil 書寫 · 手指滑動不觸發墨跡
          </span>
        </div>
      )}

      {/* Clear button */}
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
