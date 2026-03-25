'use client'

import { useEffect, useRef } from 'react'
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
}: TranscriptViewProps) {
  const activeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [activeId])

  return (
    <div className="flex flex-col gap-2 py-2">
      {segments.map((seg) => {
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
                  'relative flex-1 min-w-0', // Need relative for the absolute canvas overlay
                  hasTimestamp
                    ? 'cursor-pointer hover:text-indigo-300 transition-colors'
                    : 'cursor-default text-slate-500'
                )}
                onClick={() => hasTimestamp && onSeek(seg.startTime)}
              >
                <div className="relative z-0">
                  <p
                    className={clsx(
                      'text-lg leading-relaxed font-medium',
                      isActive ? 'text-white' : hasTimestamp ? 'text-slate-200' : 'text-slate-500'
                    )}
                    dangerouslySetInnerHTML={{ __html: seg.kanji }}
                  />
                  {seg.translation && (
                    <p className="text-xs text-slate-500 mt-0.5 relative z-20">{seg.translation}</p>
                  )}
                  {!hasTimestamp && (
                    <p className="text-[10px] text-slate-600 mt-0.5 relative z-20">點擊跳轉不適用（無時間戳）</p>
                  )}
                </div>
                {/* Pencil Highlight Overlay */}
                <HighlightOverlay
                  segmentId={seg.id}
                  initialData={meta?.highlightCanvas ?? null}
                  onSave={(base64) => onSaveHighlightCanvas(seg.id, base64)}
                  onClear={() => onClearHighlightCanvas(seg.id)}
                  isActive={isActive}
                />
              </div>

              {/* Annotation Controls */}
              <div className="shrink-0 flex items-center gap-1.5">


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
            <div className="px-3 pb-3">
              <HandwritingCanvas
                segmentId={seg.id}
                initialData={meta?.handwriting ?? null}
                onSave={(base64) => onSaveHandwriting(seg.id, base64)}
                onClear={() => onClearHandwriting(seg.id)}
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
  const tags: TagType[] = ['important', 'unknown', 'lookup']
  return (
    <div className="relative group">
      <button
        className={clsx(
          'p-1.5 rounded-lg transition-all',
          currentTag
            ? 'text-slate-300 hover:text-white'
            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700'
        )}
        title="標籤"
      >
        <Tag className="w-4 h-4" />
      </button>
      <div className="absolute right-0 top-full mt-1 z-20 hidden group-hover:flex flex-col gap-1 p-1.5 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl min-w-[90px]">
        {tags.map((tag) => (
          <button
            key={tag}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onSelect(currentTag === tag ? null : tag)}
            className={clsx(
              'flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-all',
              TAG_CONFIG[tag].color,
              'hover:opacity-100',
              currentTag === tag ? 'opacity-100' : 'opacity-60'
            )}
          >
            {TAG_CONFIG[tag].icon}
            {TAG_CONFIG[tag].label}
            {currentTag === tag && <X className="w-3 h-3 ml-auto" />}
          </button>
        ))}
      </div>
    </div>
  )
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
