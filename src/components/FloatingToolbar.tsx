'use client'

import { useState, useEffect } from 'react'
import { Pen, Highlighter, Eraser, Undo2 } from 'lucide-react'
import clsx from 'clsx'

export type ToolType = 'pen' | 'highlighter' | 'eraser'

interface FloatingToolbarProps {
  activeTool: ToolType
  setActiveTool: (tool: ToolType) => void
  brushSize: number
  setBrushSize: (size: number) => void
  brushColor: string
  setBrushColor: (color: string) => void
  highlighterColor: string
  setHighlighterColor: (color: string) => void
  onUndo: () => void
}

/* ── Size presets ── */
const SIZES = [
  { label: '01', value: 1 },
  { label: '02', value: 2 },
  { label: '03', value: 4 },
  { label: '05', value: 7 },
  { label: '09', value: 12 },
]

/* ── Pen colors (solid) ── */
const PEN_COLORS = [
  '#e0e0f0', '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#a855f7', '#ec4899', '#ffffff', '#64748b',
]

/* ── Highlighter colors (semi-transparent) ── */
const HL_COLORS = [
  'rgba(250,204,21,0.25)',  'rgba(249,115,22,0.22)',  'rgba(239,68,68,0.2)',
  'rgba(34,197,94,0.22)',   'rgba(96,165,250,0.25)',
  'rgba(168,85,247,0.22)',  'rgba(236,72,153,0.22)',  'rgba(255,255,255,0.18)',
  'rgba(100,116,139,0.2)', 'rgba(250,204,21,0.12)',
]

/* ── Nearest size label ── */
function nearestLabel(value: number) {
  return SIZES.reduce((p, c) =>
    Math.abs(c.value - value) < Math.abs(p.value - value) ? c : p
  ).label
}

/* ════════════════════════════════════════════ */
export default function FloatingToolbar({
  activeTool,
  setActiveTool,
  brushSize,
  setBrushSize,
  brushColor,
  setBrushColor,
  highlighterColor,
  setHighlighterColor,
  onUndo,
}: FloatingToolbarProps) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [bottomOffset, setBottomOffset] = useState(24) // 24px = bottom-6

  // C2: adjust position when iOS virtual keyboard appears
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      const keyboardHeight = window.innerHeight - vv.height - vv.offsetTop
      setBottomOffset(Math.max(24, keyboardHeight + 12))
    }
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  const isHL = activeTool === 'highlighter'
  const currentColor = isHL ? highlighterColor : brushColor
  const currentColors = isHL ? HL_COLORS : PEN_COLORS
  const setCurrentColor = isHL ? setHighlighterColor : setBrushColor

  /* solid preview color for HL */
  const solidPreview = isHL
    ? currentColor.replace(/rgba\((.+),[\s\d.]+\)/, 'rgb($1)')
    : currentColor

  const sizeLabel = nearestLabel(brushSize)

  const tools = [
    { id: 'pen'         as ToolType, Icon: Pen,         label: '鋼筆' },
    { id: 'highlighter' as ToolType, Icon: Highlighter, label: '螢光筆' },
    { id: 'eraser'      as ToolType, Icon: Eraser,      label: '橡皮擦' },
  ]

  return (
    <div className="fixed right-6 z-50 flex flex-col items-end gap-2 select-none" style={{ bottom: bottomOffset }}>

      {/* ── Options Panel (size + color) ── */}
      {panelOpen && (
        <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl px-4 py-3 flex flex-col gap-3 w-[232px]">

          {/* Size dots row */}
          <div className="flex items-center justify-between px-1">
            {SIZES.map(s => {
              const isActive = sizeLabel === s.label
              const dotPx = Math.round(s.value * 2.4 + 4)
              const dotColor = activeTool === 'eraser' ? '#64748b' : solidPreview
              return (
                <button
                  key={s.label}
                  onClick={() => setBrushSize(s.value)}
                  className="flex flex-col items-center gap-1.5 group"
                >
                  <div className="w-8 h-8 flex items-center justify-center">
                    <div
                      className={clsx(
                        'rounded-full transition-all duration-150',
                        isActive
                          ? 'ring-2 ring-offset-[3px] ring-indigo-400 ring-offset-slate-900'
                          : 'opacity-60 group-hover:opacity-90'
                      )}
                      style={{
                        width: Math.min(dotPx, 28),
                        height: Math.min(dotPx, 28),
                        backgroundColor: dotColor,
                      }}
                    />
                  </div>
                  <span className={clsx(
                    'text-[10px] font-mono tabular-nums',
                    isActive ? 'text-indigo-300 font-bold' : 'text-slate-500'
                  )}>
                    {s.label}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Divider + Color grid — hidden for eraser */}
          {activeTool !== 'eraser' && <div className="h-px bg-slate-800" />}

          {/* Color grid 2×5 — hidden for eraser */}
          {activeTool !== 'eraser' && (
            <div className="grid grid-cols-5 gap-1 px-1">
              {currentColors.map((color) => {
                const solidColor = color.startsWith('rgba')
                  ? color.replace(/rgba\((.+),[\s\d.]+\)/, 'rgb($1)')
                  : color
                const isActive = color === currentColor
                const isLight = solidColor === '#ffffff' || solidColor === '#e0e0f0'
                return (
                  <button
                    key={color}
                    onClick={() => setCurrentColor(color)}
                    className="flex items-center justify-center min-w-[44px] min-h-[44px]"
                  >
                    <div
                      className={clsx(
                        'w-7 h-7 rounded-full transition-transform duration-150 hover:scale-110',
                        isActive
                          ? 'ring-2 ring-offset-[3px] ring-indigo-400 ring-offset-slate-900 scale-110'
                          : '',
                        isLight ? 'ring-1 ring-slate-600' : ''
                      )}
                      style={{ backgroundColor: solidColor }}
                    />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Main Tool Bar ── */}
      <div className="flex items-center gap-1 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl px-2 py-1.5">
        {tools.map(({ id, Icon, label }) => {
          const isActive = activeTool === id
          const showColor = id !== 'eraser'
          return (
            <button
              key={id}
              onClick={() => {
                if (activeTool === id) {
                  if (id === 'eraser') setPanelOpen(false)
                  else setPanelOpen(v => !v)
                } else {
                  setActiveTool(id)
                  if (id === 'eraser') setPanelOpen(false)
                  else setPanelOpen(true)
                }
              }}
              title={label}
              className={clsx(
                'relative flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all duration-150',
                isActive
                  ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/40'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'
              )}
            >
              <Icon
                className="w-[18px] h-[18px]"
                strokeWidth={isActive ? 2.5 : 2}
                style={showColor && isActive
                  ? { color: solidPreview }
                  : undefined
                }
              />
              {/* Size label under active pen/hl */}
              {isActive && id !== 'eraser' ? (
                <span className="text-[9px] font-mono text-indigo-400/80 leading-none">{sizeLabel}</span>
              ) : (
                <span className="text-[9px] leading-none opacity-0">00</span>
              )}
            </button>
          )
        })}

        {/* Divider */}
        <div className="w-px h-8 bg-slate-700 mx-1" />

        {/* Undo */}
        <button
          onClick={onUndo}
          title="上一步 (Undo)"
          className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent transition-all duration-150"
        >
          <Undo2 className="w-[18px] h-[18px]" strokeWidth={2} />
          <span className="text-[9px] leading-none opacity-0">00</span>
        </button>
      </div>
    </div>
  )
}
