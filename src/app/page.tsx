'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import VideoPlayer from '@/components/VideoPlayer'
import TranscriptView from '@/components/TranscriptView'
import ReplayMode from '@/components/ReplayMode'
import FloatingToolbar from '@/components/FloatingToolbar'
import Sidebar from '@/components/Sidebar'
import { useAnnotations } from '@/hooks/useAnnotations'
import { useSyncEngine } from '@/hooks/useSyncEngine'
import { TagType, VideoSession } from '@/types'
import demoData from '@/data/demo.json'
import {
  Trash2,
  Play,
  AlertCircle,
  X,
  Menu,
  Check,
  Loader2,
  Download,
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
  const [mounted, setMounted] = useState(false)
  
  /* ── Layout Resizer ── */
  const [leftWidth, setLeftWidth] = useState(45)
  const [, setWindowWidth] = useState(0)
  const transcriptScrollRef = useRef<HTMLDivElement>(null)

  /* ── Annotation Tools ── */
  const [activeTool, setActiveTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen')
  const [brushSize, setBrushSize] = useState(3)
  const [brushColor, setBrushColor] = useState('#e0e0f0')
  const [highlighterColor, setHighlighterColor] = useState('rgba(250, 204, 21, 0.25)')

  /* ── Sidebar State ── */
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  useEffect(() => {
    setMounted(true)
    setWindowWidth(window.innerWidth)
  }, [])

  // M1: re-render on orientation change so flex-basis recalculates
  useEffect(() => {
    const handler = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handler)
    window.addEventListener('orientationchange', handler)
    return () => {
      window.removeEventListener('resize', handler)
      window.removeEventListener('orientationchange', handler)
    }
  }, [])

  // Cmd/Ctrl+Z global undo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('annotation-undo'))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
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
  const { metas, saveStatus, saveHighlightCanvas, clearHighlightCanvas, setTag, saveHandwriting, clearHandwriting, clearAll, reloadForVideo } =
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

  const handleExport = () => {
    if (!session) return
    const annotated = session.segments
      .filter(s => metas.has(s.id))
      .map(s => {
        const m = metas.get(s.id)!
        return {
          id: s.id,
          startTime: s.startTime,
          kanji: s.kanji.replace(/<[^>]+>/g, ''), // strip ruby tags for plain text
          translation: s.translation ?? '',
          tag: m.tag ?? null,
          hasHighlight: m.highlightCanvas !== null,
          hasHandwriting: m.handwriting !== null,
        }
      })
    const payload = {
      exportedAt: new Date().toISOString(),
      videoId: videoId || 'demo',
      title: session.title ?? 'Nihonote Export',
      segments: annotated,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nihonote_${videoId || 'demo'}_${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    addToast('筆記已匯出', 'info')
  }

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

      {/* ── Header ── */}
      <header className="h-16 shrink-0 bg-slate-900/50 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-4 sm:px-6 relative z-30" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 -ml-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Play className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            Nihonote
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Save status indicator */}
          {saveStatus !== 'idle' && (
            <div className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
              saveStatus === 'saving'
                ? 'text-slate-400'
                : 'text-emerald-400'
            )}>
              {saveStatus === 'saving'
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Check className="w-3 h-3" />}
              {saveStatus === 'saving' ? '儲存中' : '已儲存'}
            </div>
          )}
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

          {/* Export */}
          {annotatedCount > 0 && (
            <button
              onClick={handleExport}
              className="p-1.5 rounded-xl text-slate-500 hover:text-indigo-400 hover:bg-indigo-950/30 transition-all"
              title="匯出筆記"
            >
              <Download className="w-4 h-4" />
            </button>
          )}

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
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden relative">
        
        {/* Left Panel: Video & Session Title */}
        <div 
          className="w-full lg:w-auto flex flex-col shrink-0 bg-[#080b12]"
          style={{ flexBasis: mounted && window.innerWidth >= 1024 ? `${leftWidth}%` : 'auto' }}
        >
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

        {/* Resizer Handle (Visible on lg+ screens) */}
        <div
          className="hidden lg:flex w-2 cursor-col-resize items-center justify-center shrink-0 bg-slate-900 border-x border-slate-800 hover:bg-indigo-500/20 active:bg-indigo-500/40 transition-colors z-20 group"
          style={{ touchAction: 'none' }}
          onPointerDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = leftWidth;
            
            const handlePointerMove = (moveEvent: PointerEvent) => {
              const deltaX = moveEvent.clientX - startX;
              const newPct = startWidth + (deltaX / window.innerWidth) * 100;
              setLeftWidth(Math.min(Math.max(newPct, 25), 75)); // Limit width between 25% and 75%
            };
            
            const handlePointerUp = () => {
              window.removeEventListener('pointermove', handlePointerMove);
              window.removeEventListener('pointerup', handlePointerUp);
              document.body.style.cursor = '';
            };
            
            document.body.style.cursor = 'col-resize';
            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handlePointerUp);
          }}
        >
          <div className="w-0.5 h-8 bg-slate-700 rounded-full group-hover:bg-indigo-400/50 transition-colors" />
        </div>

        {/* Right Panel: Transcript / Replay */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0a0d14] relative">
          <div ref={transcriptScrollRef} className="absolute inset-0 overflow-y-auto px-4 py-4 transcript-scroll">
            <div className="max-w-4xl mx-auto pb-48">
              {mode === 'read' ? (
                <TranscriptView
                  segments={session?.segments || []}
                  activeId={activeId}
                  metas={metas}
                  onSeek={handleSeek}
                  onSaveHighlightCanvas={saveHighlightCanvas}
                  onClearHighlightCanvas={clearHighlightCanvas}
                  onSetTag={(id, tag) => setTag(id, tag as TagType | null)}
                  onSaveHandwriting={saveHandwriting}
                  onClearHandwriting={clearHandwriting}
                  activeTool={activeTool}
                  brushSize={brushSize}
                  brushColor={activeTool === 'highlighter' ? highlighterColor : brushColor}
                  scrollContainerRef={transcriptScrollRef}
                />
              ) : (
                <ReplayMode
                  segments={session?.segments ?? []}
                  metas={metas}
                  onSeek={handleSeek}
                  onClose={() => setMode('read')}
                  activeTool={activeTool}
                  brushSize={brushSize}
                  brushColor={activeTool === 'highlighter' ? highlighterColor : brushColor}
                />
              )}
            </div>
          </div>

          <FloatingToolbar 
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            brushSize={brushSize}
            setBrushSize={setBrushSize}
            brushColor={brushColor}
            setBrushColor={setBrushColor}
            highlighterColor={highlighterColor}
            setHighlighterColor={setHighlighterColor}
            onUndo={() => window.dispatchEvent(new CustomEvent('annotation-undo'))}
          />
        </div>
      </div>

      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        onSelectSession={(id) => {
          console.log('Load session', id)
          setIsSidebarOpen(false)
        }} 
      />
      {/* ── Toasts ── */}
      <Toast items={toasts} onDismiss={dismissToast} />
    </div>
  )
}
