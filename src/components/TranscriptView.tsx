'use client'

import { useEffect, useRef, useState } from 'react'
import { TranscriptSegment, SegmentMeta, TagType } from '@/types'
import HandwritingCanvas from './HandwritingCanvas'
import HighlightOverlay from './HighlightOverlay'
import { Star, HelpCircle, Search, X, Tag } from 'lucide-react'
import clsx from 'clsx'

interface TranscriptViewProps {
  segments: TranscriptSegment[]
  activeId: string | null
  metas: Map<string, SegmentMeta>
  onSeek: (startTime: number) => void
  onSaveHighlightCanvas: (id: string, base64: string) => void
  onClearHighlightCanvas: (id: string) => void
  onSetTag: (id: string, tag: TagType | null) => void
  onSaveHandwriting: (id: string, base64: string) => void
  onClearHandwriting: (id: string) => void
  activeTool: 'pen' | 'highlighter' | 'eraser'
  brushSize: number
  brushColor: string
  scrollContainerRef?: React.RefObject<HTMLDivElement>
}

const TAG_CONFIG: Record<TagType, { icon: React.ReactNode; label: string; color: string }> = {
  important: { icon: <Star className="w-3.5 h-3.5" />, label: '重要', color: 'text-amber-400 bg-amber-400/20 border-amber-500/40' },
  unknown: { icon: <HelpCircle className="w-3.5 h-3.5" />, label: '不懂', color: 'text-blue-400 bg-blue-400/20 border-blue-500/40' },
  lookup: { icon: <Search className="w-3.5 h-3.5" />, label: '要查', color: 'text-emerald-400 bg-emerald-400/20 border-emerald-500/40' },
}

export default function TranscriptView({
  segments,
  activeId,
  metas,
  onSeek,
  onSaveHighlightCanvas,
  onClearHighlightCanvas,
  onSetTag,
  onSaveHandwriting,
  onClearHandwriting,
  activeTool,
  brushSize,
  brushColor,
  scrollContainerRef,
}: TranscriptViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const activeRef = useRef<HTMLDivElement>(null)
  const userScrollingRef = useRef(false)
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Pause auto-scroll for 3s after user manually scrolls
  useEffect(() => {
    const container = scrollContainerRef?.current
    if (!container) return
    const onScroll = () => {
      userScrollingRef.current = true
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
      scrollTimerRef.current = setTimeout(() => {
        userScrollingRef.current = false
      }, 3000)
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', onScroll)
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
    }
  }, [scrollContainerRef])

  useEffect(() => {
    if (activeRef.current && !userScrollingRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [activeId])

  const q = searchQuery.trim().toLowerCase()
  const visibleSegments = q
    ? segments.filter(s =>
        s.kanji.toLowerCase().includes(q) ||
        (s.translation ?? '').toLowerCase().includes(q)
      )
    : segments

  return (
    <div className="flex flex-col gap-2 py-2">
      {/* Search bar */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/50 focus-within:border-indigo-500/50 transition-colors mb-1">
        <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="搜尋逐字稿…"
          className="flex-1 bg-transparent text-sm text-slate-300 placeholder:text-slate-600 outline-none"
        />
        {q && (
          <>
            <span className="text-xs text-slate-500">{visibleSegments.length} 筆</span>
            <button onClick={() => setSearchQuery('')} className="text-slate-500 hover:text-slate-300">
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {visibleSegments.map((seg) => {
        const meta = metas.get(seg.id)
        const isActive = seg.id === activeId
        const hasTimestamp = seg.startTime >= 0
        const currentTag = meta?.tag ?? null

        return (
          <div
            key={seg.id}
            ref={isActive ? activeRef : null}
            className={clsx(
              'rounded-2xl border transition-all duration-300',
              'overflow-hidden',
              isActive
                ? 'border-indigo-500/60 shadow-lg shadow-indigo-500/10'
                : 'border-slate-700/50',
              meta?.highlightCanvas
                ? 'bg-amber-400/10'
                : isActive
                ? 'bg-slate-800'
                : 'bg-slate-800/40'
            )}
          >
            {/* Sentence Row */}
            <div className="flex items-start gap-2 px-4 pt-3 pb-1">
              {/* Timestamp badge */}
              <div className="shrink-0 mt-1">
                {hasTimestamp ? (
                  <span className="text-[10px] text-slate-500 font-mono tabular-nums">
                    {formatTime(seg.startTime)}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-600 font-mono">--:--</span>
                )}
              </div>

              {/* Japanese text with Highlight Canvas Overlay */}
              <div
                className={clsx(
                  'relative flex-1 min-w-0',
                  activeTool === 'pen'
                    ? 'pointer-events-none'
                    : hasTimestamp
                      ? 'cursor-pointer hover:text-indigo-300 transition-colors'
                      : 'cursor-default text-slate-500'
                )}
                onClick={() => activeTool !== 'pen' && hasTimestamp && onSeek(seg.startTime)}
              >
                <div className="relative z-0">
                  <p
                    className={clsx(
                      'text-lg leading-relaxed font-medium',
                      isActive ? 'text-white' : hasTimestamp ? 'text-slate-200' : 'text-slate-500'
                    )}
                    dangerouslySetInnerHTML={{ __html: sanitizeRuby(seg.kanji) }}
                  />
                  {seg.translation && (
                    <p className="text-xs text-slate-500 mt-0.5 relative z-20">{seg.translation}</p>
                  )}
                  {!hasTimestamp && (
                    <p className="text-[10px] text-slate-600 mt-0.5 relative z-20">點擊跳轉不適用（無時間戳）</p>
                  )}
                </div>
                {/* Highlight Overlay Canvas (Layer 2) */}
                <div 
                  className={clsx(
                    "absolute inset-0 z-0",
                    activeTool === 'highlighter' || activeTool === 'eraser' ? "pointer-events-auto" : "pointer-events-none"
                  )}
                >
                  <HighlightOverlay
                    segmentId={seg.id}
                    initialData={meta?.highlightCanvas ?? null}
                    onSave={(base64) => onSaveHighlightCanvas(seg.id, base64)}
                    onClear={() => onClearHighlightCanvas(seg.id)}
                    isActive={isActive}
                    activeTool={activeTool}
                    brushSize={brushSize}
                    brushColor={brushColor}
                  />
                </div>
              </div>

              {/* Annotation Controls */}
              <div className={clsx(
                'relative z-30 shrink-0 flex items-center gap-1.5',
                activeTool === 'pen' && 'pointer-events-none opacity-40'
              )}>


                {/* Tag picker */}
                <TagPicker
                  currentTag={currentTag}
                  onSelect={(tag) => onSetTag(seg.id, tag)}
                />

                {/* Current tag badge */}
                {currentTag && (
                  <span
                    className={clsx(
                      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-medium',
                      TAG_CONFIG[currentTag].color
                    )}
                  >
                    {TAG_CONFIG[currentTag].icon}
                    {TAG_CONFIG[currentTag].label}
                  </span>
                )}
              </div>
            </div>

            {/* Active indicator bar */}
            {isActive && (
              <div className="mx-4 h-[2px] bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full mb-1" />
            )}

            {/* Handwriting Canvas */}
            <div className="px-3 pb-3 relative z-20">
              <HandwritingCanvas
                segmentId={seg.id}
                initialData={meta?.handwriting ?? null}
                onSave={(base64) => onSaveHandwriting(seg.id, base64)}
                onClear={() => onClearHandwriting(seg.id)}
                activeTool={activeTool}
                brushSize={brushSize}
                brushColor={brushColor}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TagPicker({
  currentTag,
  onSelect,
}: {
  currentTag: TagType | null
  onSelect: (tag: TagType | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const tags: TagType[] = ['important', 'unknown', 'lookup']

  // Close when clicking outside
  useEffect(() => {
    if (!open) return
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('pointerdown', handler)
    return () => window.removeEventListener('pointerdown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onPointerDown={(e) => { e.stopPropagation(); e.preventDefault() }}
        onClick={() => setOpen(v => !v)}
        className={clsx(
          'min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors',
          open || currentTag
            ? 'text-slate-300'
            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700'
        )}
        title="標籤"
      >
        <Tag className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-[200] flex flex-col gap-1 p-1.5 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl min-w-[90px]">
          {tags.map((tag) => (
            <button
              key={tag}
              onPointerDown={(e) => { e.stopPropagation(); e.preventDefault() }}
              onClick={() => { onSelect(currentTag === tag ? null : tag); setOpen(false) }}
              className={clsx(
                'flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors',
                TAG_CONFIG[tag].color,
                currentTag === tag ? 'opacity-100' : 'opacity-60 hover:opacity-100'
              )}
            >
              {TAG_CONFIG[tag].icon}
              {TAG_CONFIG[tag].label}
              {currentTag === tag && <X className="w-3 h-3 ml-auto" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Allow only ruby/rt/rp tags — strips everything else to prevent XSS */
function sanitizeRuby(html: string): string {
  return html.replace(/<\/?(?!ruby|rt|rp\b)[a-zA-Z][^>]*>/g, '')
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
