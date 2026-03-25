'use client'

import { useEffect, useRef, useState } from 'react'
import { TranscriptSegment, SegmentMeta } from '@/types'
import { Play, Pause, SkipForward, ListFilter } from 'lucide-react'

function sanitizeRuby(html: string): string {
  return html.replace(/<\/?(?!ruby|rt|rp\b)[a-zA-Z][^>]*>/g, '')
}
import clsx from 'clsx'
import HighlightOverlay from './HighlightOverlay' // Assuming HighlightOverlay is in a separate file
import HandwritingCanvas from './HandwritingCanvas' // Assuming HandwritingCanvas is in a separate file

interface ReplayModeProps {
  segments: TranscriptSegment[]
  metas: Map<string, SegmentMeta>
  onSeek: (startTime: number) => void
  onClose: () => void
  activeTool: 'pen' | 'highlighter' | 'eraser'
  brushSize: number
  brushColor: string
}

export default function ReplayMode({
  segments,
  metas,
  onSeek,
  onClose,
  activeTool,
  brushSize,
  brushColor,
}: ReplayModeProps) {
  const queue = segments.filter((s) => {
    const m = metas.get(s.id)
    return m && (m.highlightCanvas !== null || m.tag !== null) && s.startTime >= 0
  })

  const [currentIdx, setCurrentIdx] = useState(0)
  const [isActive, setIsActive] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopCheck = () => {
    if (intervalRef.current) clearTimeout(intervalRef.current)
    intervalRef.current = null
  }

  const playSegment = (idx: number) => {
    if (idx >= queue.length) {
      setIsActive(false)
      stopCheck()
      return
    }
    const seg = queue[idx]
    setCurrentIdx(idx)
    onSeek(seg.startTime)

    // Wait for segment to finish then advance
    const duration = (seg.endTime - seg.startTime + 1) * 1000
    stopCheck()
    intervalRef.current = setTimeout(() => {
      playSegment(idx + 1)
    }, duration)
  }

  const handlePlay = () => {
    setIsActive(true)
    playSegment(currentIdx)
  }

  const handlePause = () => {
    setIsActive(false)
    stopCheck()
  }

  const handleSkip = () => {
    const next = currentIdx + 1
    if (next < queue.length) {
      if (isActive) {
        playSegment(next)
      } else {
        setCurrentIdx(next)
        onSeek(queue[next].startTime)
      }
    }
  }

  useEffect(() => () => stopCheck(), [])

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
        <ListFilter className="w-10 h-10 text-slate-600" />
        <p className="text-slate-400 font-medium">尚未標記任何句子</p>
        <p className="text-sm text-slate-600">請先用螢光筆或標籤標記句子，再開啟 Replay 模式。</p>
        <button
          onClick={onClose}
          className="mt-2 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm hover:bg-slate-700 transition-all"
        >
          返回精讀
        </button>
      </div>
    )
  }

  const current = queue[currentIdx]
  const currentMeta = current ? metas.get(current.id) : null

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-slate-300">
          Replay 模式 · {currentIdx + 1} / {queue.length} 句
        </div>
        <button
          onClick={onClose}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          結束 Replay
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
          style={{ width: `${((currentIdx + 1) / queue.length) * 100}%` }}
        />
      </div>

      {/* Current sentence */}
      <div className="p-4 rounded-2xl bg-slate-800 border border-indigo-500/40 relative overflow-hidden">
        <div className="relative z-10">
          <p
            className="text-xl text-white leading-relaxed"
            dangerouslySetInnerHTML={{ __html: sanitizeRuby(current?.kanji ?? '') }}
          />
          {current?.translation && (
            <p className="text-sm text-slate-400 mt-1">{current.translation}</p>
          )}
        </div>

        {/* Highlight Overlay (Read-only in Replay Mode) */}
        {currentMeta?.highlightCanvas && (
          <div className="absolute inset-0 z-0 pointer-events-none">
            <HighlightOverlay
              segmentId={current.id}
              initialData={currentMeta.highlightCanvas}
              onSave={() => {}}
              onClear={() => {}}
              isActive={false}
              activeTool={activeTool}
              brushSize={brushSize}
              brushColor={brushColor}
            />
          </div>
        )}

        {/* Handwriting Canvas (Read-only in Replay Mode) */}
        {currentMeta?.handwriting && (
          <div className="w-full mt-3 pointer-events-none relative z-20">
            <HandwritingCanvas
              segmentId={current.id}
              initialData={currentMeta.handwriting}
              onSave={() => {}}
              onClear={() => {}}
              activeTool={activeTool}
              brushSize={brushSize}
              brushColor={brushColor}
            />
          </div>
        )}
      </div>

      {/* Segment list */}
      <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
        {queue.map((seg, i) => (
          <button
            key={seg.id}
            onClick={() => {
              if (isActive) { stopCheck(); setIsActive(false) }
              setCurrentIdx(i)
              onSeek(seg.startTime)
            }}
            className={clsx(
              'flex items-center gap-2 px-3 py-2 rounded-xl text-left text-sm transition-all',
              i === currentIdx
                ? 'bg-indigo-600/30 border border-indigo-500/50 text-indigo-200'
                : 'bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            )}
          >
            <span className="w-5 text-center text-xs font-mono text-slate-500">{i + 1}</span>
            <span
              className="truncate"
              dangerouslySetInnerHTML={{ __html: sanitizeRuby(seg.kanji) }}
            />
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={handleSkip}
          disabled={currentIdx >= queue.length - 1 || isActive}
          className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <SkipForward className="w-5 h-5" />
        </button>
        <button
          onClick={isActive ? handlePause : handlePlay}
          className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-2 transition-all"
        >
          {isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isActive ? '暫停' : '播放標記句'}
        </button>
      </div>
    </div>
  )
}
