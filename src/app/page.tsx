'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import VideoPlayer from '@/components/VideoPlayer'
import TranscriptView from '@/components/TranscriptView'
import ReplayMode from '@/components/ReplayMode'
import { useAnnotations } from '@/hooks/useAnnotations'
import { useSyncEngine } from '@/hooks/useSyncEngine'
import { TagType, VideoSession } from '@/types'
import demoData from '@/data/demo.json'
import {
  BookOpen,
  Trash2,
  Play,
  AlertCircle,
  X,
} from 'lucide-react'
import clsx from 'clsx'

/* ─────────────── Toast ─────────────── */
interface ToastItem { id: number; msg: string; type: 'warn' | 'info' }
let toastId = 0

function Toast({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none">
      {items.map((t) => (
        <div
          key={t.id}
          className={clsx(
            'flex items-start gap-2 px-4 py-3 rounded-2xl shadow-2xl border max-w-sm pointer-events-auto',
            t.type === 'warn'
              ? 'bg-red-950/90 border-red-700 text-red-200'
              : 'bg-slate-800/90 border-slate-600 text-slate-200'
          )}
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="text-sm">{t.msg}</span>
          <button onClick={() => onDismiss(t.id)} className="ml-1 text-current opacity-50 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

/* ─────────────── Main Page ─────────────── */
export default function Home() {
  const [videoId, setVideoId] = useState<string>('')
  const [session, setSession] = useState<VideoSession | null>(null)
  const [isPlayerReady, setIsPlayerReady] = useState(false)
  const [mode, setMode] = useState<'read' | 'replay'>('read')
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const playerControlsRef = useRef<{
    seekTo: (s: number) => void
    getCurrentTime: () => number
    getPlayerState: () => number
  } | null>(null)

  /* ── Toast helpers ── */
  const addToast = useCallback((msg: string, type: ToastItem['type'] = 'info') => {
    const id = ++toastId
    setToasts((prev) => [...prev, { id, msg, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  /* ── Annotations ── */
  const { metas, saveHighlightCanvas, clearHighlightCanvas, setTag, saveHandwriting, clearHandwriting, clearAll, reloadForVideo } =
    useAnnotations({
      videoId: videoId || 'demo',
      onStorageFull: () =>
        addToast('本地空間不足，請清除筆記或升級至雲端儲存', 'warn'),
    })

  /* ── Sync Engine ── */
  const { activeId } = useSyncEngine({
    segments: session?.segments ?? [],
    getCurrentTime: playerControlsRef.current?.getCurrentTime ?? (() => 0),
    isReady: isPlayerReady,
  })

  /* ── Video Load ── */
  const handleVideoLoad = useCallback((id: string) => {
    setVideoId(id)
    setIsPlayerReady(false)
    setMode('read')
    // Use demo transcript for now (Day 2: swap for /api/transcript)
    const demo = demoData as VideoSession
    setSession({ ...demo, videoId: id })
    reloadForVideo(id)
  }, [reloadForVideo])

  /* ── Player ready ── */
  const handlePlayerReady = useCallback((controls: typeof playerControlsRef.current) => {
    playerControlsRef.current = controls!
    setIsPlayerReady(true)
  }, [])

  /* ── Seek ── */
  const handleSeek = useCallback((startTime: number) => {
    playerControlsRef.current?.seekTo(startTime)
  }, [])

  /* ── Load demo session on mount ── */
  useEffect(() => {
    const demo = demoData as VideoSession
    setSession(demo)
  }, [])

  const handleClearAll = () => {
    clearAll()
    setShowClearConfirm(false)
    addToast('已清除所有標註', 'info')
  }

  const annotatedCount = Array.from(metas.values()).filter(
    (m) => m.highlightCanvas !== null || m.tag !== null || m.handwriting !== null
  ).length

  return (
    <div className="flex flex-col h-[100dvh] bg-[#0a0d14] overflow-hidden">

      {/* ── Top Bar ── */}
      <header className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#0d111a]/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-indigo-400" />
          <span className="font-semibold text-sm text-slate-100 hidden sm:block">日文影片精讀</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Replay toggle */}
          <button
            onClick={() => setMode(mode === 'replay' ? 'read' : 'replay')}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border',
              mode === 'replay'
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            )}
          >
            <Play className="w-3.5 h-3.5" />
            Replay{annotatedCount > 0 && <span className="ml-0.5 opacity-70">({annotatedCount})</span>}
          </button>

          {/* Clear all */}
          {annotatedCount > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowClearConfirm(!showClearConfirm)}
                className="p-1.5 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-950/30 transition-all"
                title="清除所有標註"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              {showClearConfirm && (
                <div className="absolute right-0 top-full mt-2 z-30 p-3 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl min-w-[180px]">
                  <p className="text-xs text-slate-300 mb-2">確認清除所有標註？</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleClearAll}
                      className="flex-1 py-1.5 text-xs rounded-lg bg-red-700 hover:bg-red-600 text-white font-medium transition-all"
                    >
                      清除
                    </button>
                    <button
                      onClick={() => setShowClearConfirm(false)}
                      className="flex-1 py-1.5 text-xs rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-all"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ── Main Content Area ── */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        
        {/* Left Panel: Video & Session Title */}
        <div className="w-full lg:w-5/12 xl:w-1/2 flex flex-col shrink-0 border-r border-slate-800 bg-[#080b12]">
          {/* Player */}
          <div className="shrink-0 p-4 pb-0 w-full aspect-video">
            <VideoPlayer
              onPlayerReady={handlePlayerReady}
              onVideoLoad={handleVideoLoad}
            />
          </div>

          {/* Session Title */}
          {session && (
            <div className="shrink-0 px-5 pt-4 pb-2 flex items-center gap-2 border-b border-slate-800/50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-300 truncate">
                  {videoId ? `影片 ID: ${videoId}` : '示範逐字稿（貼入 YouTube URL 載入真實影片）'}
                </p>
              </div>
              <span className="text-xs text-slate-500 font-medium px-2 py-1 rounded-md bg-slate-800/50">
                {session.segments.length} 句
              </span>
            </div>
          )}
        </div>

        {/* Right Panel: Transcript / Replay */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0a0d14] relative">
          <div className="absolute inset-0 overflow-y-auto px-4 py-4 transcript-scroll">
            {mode === 'replay' ? (
              <ReplayMode
                segments={session?.segments ?? []}
                metas={metas}
                onSeek={handleSeek}
                onClose={() => setMode('read')}
              />
            ) : session ? (
              <TranscriptView
                segments={session.segments}
                activeId={activeId}
                metas={metas}
                onSeek={handleSeek}
                onSaveHighlightCanvas={saveHighlightCanvas}
                onClearHighlightCanvas={clearHighlightCanvas}
                onSetTag={(id, tag) => setTag(id, tag as TagType | null)}
                onSaveHandwriting={saveHandwriting}
                onClearHandwriting={clearHandwriting}
              />
            ) : (
              <div className="flex items-center justify-center h-full min-h-[50vh] text-slate-500 text-sm">
                載入逐字稿中…
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Toasts ── */}
      <Toast items={toasts} onDismiss={dismissToast} />
    </div>
  )
}
