'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { Eraser } from 'lucide-react'
import clsx from 'clsx'

interface HighlightOverlayProps {
  segmentId: string
  initialData: string | null
  onSave: (base64: string) => void
  onClear: () => void
  isActive?: boolean
  activeTool?: 'pen' | 'highlighter' | 'eraser'
  brushSize?: number
  brushColor?: string
}

// Fixed dimensions relative to the text block for simplicity.
// In a real app we might dynamicly match text bounds, but for iPad N3 readers a fixed 80px height covering 1-2 lines is ideal.
const CANVAS_HEIGHT = 80

export default function HighlightOverlay({
  segmentId,
  initialData,
  onSave,
  onClear,
  isActive = false,
  activeTool = 'highlighter',
  brushSize = 20,
  brushColor = 'rgba(250, 204, 21, 0.4)',
}: HighlightOverlayProps) {
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

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = canvas.width
      tempCanvas.height = canvas.height
      tempCanvas.getContext('2d')?.drawImage(canvas, 0, 0)
      
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr) // Match container height
      
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.scale(dpr, dpr)
        ctx.drawImage(tempCanvas, 0, 0, rect.width, rect.height)
      }
    })
    ro.observe(canvas.parentElement!) // Observe the container text area
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
    if (e.pointerType === 'touch' || activeTool === 'pen') return
    e.preventDefault()
    
    isDrawingRef.current = true
    const canvas = canvasRef.current!
    canvas.setPointerCapture(e.pointerId)
    const ctx = canvas.getContext('2d')!
    
    const pt = getPoint(e)
    lastPointRef.current = pt

    const pressure = e.pressure > 0 ? e.pressure : 0.5
    const lineWidth = brushSize * pressure

    ctx.globalCompositeOperation = activeTool === 'eraser' ? 'destination-out' : 'source-over'
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, lineWidth / 2, 0, Math.PI * 2)
    ctx.fillStyle = activeTool === 'eraser' ? 'rgba(0,0,0,1)' : brushColor
    ctx.fill()
    setIsEmpty(false)
  }, [activeTool, brushSize, brushColor])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== 'pen' || !isDrawingRef.current || activeTool === 'pen') return
    e.preventDefault()
    
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const pt = getPoint(e)
    const last = lastPointRef.current

    const pressure = e.pressure > 0 ? e.pressure : 0.5
    const lineWidth = brushSize * pressure

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
    if (e.pointerType === 'touch' || activeTool === 'pen') return
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
    <>
      <canvas
        ref={canvasRef}
        width={800}
        height={CANVAS_HEIGHT}
        style={{ touchAction: 'none' }}
        className={clsx(
          'absolute inset-0 w-full h-full z-10',
          'cursor-crosshair'
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      {!isEmpty && isActive && (
        <button
          onClick={(e) => { e.stopPropagation(); handleClear(); }}
          className={clsx(
            'absolute -top-3 -right-3 z-20 p-1 rounded-full',
            'bg-slate-800 border border-slate-600 text-slate-400',
            'hover:text-red-400 hover:border-red-700 hover:bg-red-950/80 shadow-md',
            'transition-all'
          )}
          title="清除螢光筆"
        >
          <Eraser className="w-3 h-3" />
        </button>
      )}
    </>
  )
}
