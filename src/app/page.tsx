'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Image from 'next/image'
import VideoPlayer from '@/components/VideoPlayer'
import TranscriptView from '@/components/TranscriptView'
import ReplayMode from '@/components/ReplayMode'
import FloatingToolbar from '@/components/FloatingToolbar'
import Sidebar from '@/components/Sidebar'
import { useAnnotations } from '@/hooks/useAnnotations'
import { useSyncEngine } from '@/hooks/useSyncEngine'
import { TagType, VideoSession } from '@/types'
import { supabase } from '@/lib/supabase'
import {
  Trash2,
  Play,
  AlertCircle,
  X,
  Menu,
  Check,
  Loader2,
  Download,
  Pencil,
  FolderOpen,
  Upload,
  FileText,
} from 'lucide-react'
import clsx from 'clsx'

/* ─────────────── Parsers ─────────────── */
interface ParsedSegment { startTime: number; endTime: number; text: string }

function parseSRT(content: string): ParsedSegment[] {
  const toSec = (ts: string) => {
    const [h, m, rest] = ts.trim().replace(',', '.').split(':')
    return Number(h) * 3600 + Number(m) * 60 + Number(rest)
  }
  const blocks = content.trim().split(/\n\s*\n/)
  const out: ParsedSegment[] = []
  for (const block of blocks) {
    const lines = block.trim().split('\n')
    const timeLine = lines.find(l => l.includes('-->'))
    if (!timeLine) continue
    const [start, end] = timeLine.split('-->').map(toSec)
    const text = lines.filter(l => !l.includes('-->') && !/^\d+$/.test(l.trim())).join(' ').trim()
    if (text) out.push({ startTime: start, endTime: end, text })
  }
  return out
}

// Parse YouTube "Show transcript" copy-paste format:
// "0:00\ntext\n0:05\ntext" or "0:00:01\ntext\n0:00:05\ntext"
function parseYouTubeTranscript(content: string): ParsedSegment[] {
  const toSec = (ts: string) => {
    const parts = ts.trim().split(':').map(Number)
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return 0
  }
  const lines = content.trim().split('\n').map(l => l.trim()).filter(Boolean)
  const tsRe = /^\d+:\d+(:\d+)?(\.\d+)?$/
  const pairs: { time: number; text: string }[] = []
  let i = 0
  while (i < lines.length) {
    if (tsRe.test(lines[i])) {
      const time = toSec(lines[i])
      const textLines: string[] = []
      i++
      while (i < lines.length && !tsRe.test(lines[i])) {
        textLines.push(lines[i])
        i++
      }
      const text = textLines.join(' ').trim()
      if (text) pairs.push({ time, text })
    } else { i++ }
  }
  return pairs.map((p, idx) => ({
    startTime: p.time,
    endTime: pairs[idx + 1]?.time ?? p.time + 5,
    text: p.text,
  }))
}

function parseAnyTranscript(content: string): ParsedSegment[] {
  if (content.includes('-->')) return parseSRT(content)
  return parseYouTubeTranscript(content)
}

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
  const [loadVideoId, setLoadVideoId] = useState<string | null>(null)
  const [session, setSession] = useState<VideoSession | null>(null)
  const [isPlayerReady, setIsPlayerReady] = useState(false)
  const [mounted, setMounted] = useState(false)

  /* ── Auth ── */
  const [user, setUser] = useState<{ id: string; email?: string; avatar?: string; name?: string } | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      if (u) setUser({ id: u.id, email: u.email, avatar: u.user_metadata?.avatar_url, name: u.user_metadata?.full_name })
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user
      setUser(u ? { id: u.id, email: u.email, avatar: u.user_metadata?.avatar_url, name: u.user_metadata?.full_name } : null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const signInWithGoogle = () => supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
  const signOut = () => supabase.auth.signOut()
  
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

  /* ── Transcript Upload / Auto-fetch ── */
  const [isImporting, setIsImporting] = useState(false)
  const [showPasteModal, setShowPasteModal] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const importParsed = async (parsed: ParsedSegment[]) => {
    if (!session || !videoId) return
    setIsImporting(true)
    const rows = parsed.map((s, i) => ({
      id: `${videoId}_${i}`,
      video_id: videoId,
      index: i,
      start_time: s.startTime,
      end_time: s.endTime,
      kanji: s.text,
      translation: null,
    }))
    await supabase.from('segments').upsert(rows)
    const segments = rows.map(r => ({ id: r.id, startTime: r.start_time, endTime: r.end_time, kanji: r.kanji }))
    setSession(prev => prev ? { ...prev, segments } : prev)
    setIsImporting(false)
    addToast(`已匯入 ${segments.length} 句逐字稿`, 'info')
  }

  const handleTranscriptFile = async (file: File) => {
    if (!session || !videoId) return
    const text = await file.text()
    const parsed = parseAnyTranscript(text)
    if (parsed.length === 0) { addToast('無法解析，請確認格式正確', 'warn'); return }
    await importParsed(parsed)
  }

  const handlePasteSubmit = async () => {
    const parsed = parseAnyTranscript(pasteText)
    if (parsed.length === 0) { addToast('無法解析，請確認格式正確', 'warn'); return }
    setShowPasteModal(false)
    setPasteText('')
    await importParsed(parsed)
  }

  /* ── Title Edit ── */
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)

  /* ── Folder Picker ── */
  const [showFolderPicker, setShowFolderPicker] = useState(false)
  const [folderPickerList, setFolderPickerList] = useState<{ id: string; name: string }[]>([])
  const [sessionFolderIds, setSessionFolderIds] = useState<Set<string>>(new Set())
  const folderPickerRef = useRef<HTMLDivElement>(null)

  const openFolderPicker = async () => {
    const { data: folders } = await supabase.from('folders').select('id, name').order('created_at')
    const { data: fs } = await supabase.from('folder_sessions').select('folder_id').eq('video_id', videoId || 'demo')
    setFolderPickerList(folders ?? [])
    setSessionFolderIds(new Set<string>((fs ?? []).map(r => r.folder_id as string)))
    setShowFolderPicker(true)
  }

  const toggleFolder = async (folderId: string) => {
    const vid = videoId || 'demo'
    if (sessionFolderIds.has(folderId)) {
      await supabase.from('folder_sessions').delete().eq('folder_id', folderId).eq('video_id', vid)
      setSessionFolderIds(prev => { const s = new Set<string>(Array.from(prev)); s.delete(folderId); return s })
    } else {
      await supabase.from('folder_sessions').upsert({ folder_id: folderId, video_id: vid })
      setSessionFolderIds(prev => new Set<string>([...Array.from(prev), folderId]))
    }
  }

  useEffect(() => {
    if (!showFolderPicker) return
    const handler = (e: PointerEvent) => {
      if (folderPickerRef.current && !folderPickerRef.current.contains(e.target as Node))
        setShowFolderPicker(false)
    }
    window.addEventListener('pointerdown', handler)
    return () => window.removeEventListener('pointerdown', handler)
  }, [showFolderPicker])

  const startEditTitle = () => {
    setTitleDraft(session?.title ?? '')
    setIsEditingTitle(true)
    setTimeout(() => titleInputRef.current?.select(), 0)
  }

  const commitTitle = async () => {
    const trimmed = titleDraft.trim()
    if (trimmed && session) {
      setSession(prev => prev ? { ...prev, title: trimmed } : prev)
      await supabase.from('sessions').update({ title: trimmed }).eq('video_id', session.videoId)
    }
    setIsEditingTitle(false)
  }

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
  const [scrollTrigger, setScrollTrigger] = useState(0)
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

  const autoFetchTranscript = useCallback(async (vid: string) => {
    try {
      const res = await fetch(`/api/transcript?videoId=${vid}`)
      if (!res.ok) return false
      const data = await res.json()
      if (!data.segments?.length) return false
      const rows = data.segments.map((s: { index: number; startTime: number; endTime: number; text: string }) => ({
        id: `${vid}_${s.index}`,
        video_id: vid,
        index: s.index,
        start_time: s.startTime,
        end_time: s.endTime,
        kanji: s.text,
        translation: null,
      }))
      await supabase.from('segments').upsert(rows)
      const segments = rows.map((r: { id: string; start_time: number; end_time: number; kanji: string }) => ({
        id: r.id, startTime: r.start_time, endTime: r.end_time, kanji: r.kanji,
      }))
      setSession(prev => prev ? { ...prev, segments } : prev)
      addToast(`已自動載入 ${segments.length} 句字幕`, 'info')
      return true
    } catch {
      return false
    }
  }, [addToast])

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

  /* ── Load session from Supabase ── */
  const loadSession = useCallback(async (id: string) => {
    const { data: sessionRow } = await supabase
      .from('sessions')
      .select('video_id, title')
      .eq('video_id', id)
      .single()
    const { data: segmentRows } = await supabase
      .from('segments')
      .select('id, start_time, end_time, kanji, translation')
      .eq('video_id', id)
      .order('index')
    if (!sessionRow || !segmentRows) return null
    return {
      videoId: sessionRow.video_id,
      title: sessionRow.title,
      segments: segmentRows.map((r) => ({
        id: r.id,
        startTime: r.start_time,
        endTime: r.end_time,
        kanji: r.kanji,
        translation: r.translation ?? undefined,
      })),
    } as VideoSession
  }, [])

  /* ── Video Load ── */
  const handleVideoLoad = useCallback(async (id: string, fetchedTitle?: string) => {
    setVideoId(id)
    setIsPlayerReady(false)
    setMode('read')
    setShowFolderPicker(false)
    const s = await loadSession(id)
    if (s) {
      // If we got a fresh title from oEmbed, update it
      if (fetchedTitle && fetchedTitle !== s.title) {
        await supabase.from('sessions').update({ title: fetchedTitle }).eq('video_id', id)
        setSession({ ...s, title: fetchedTitle })
      } else {
        setSession(s)
      }
      // Auto-fetch transcript if no segments yet
      if (s.segments.length === 0) autoFetchTranscript(id)
    } else {
      // New video — auto-create session record with real title
      const title = fetchedTitle ?? id
      await supabase.from('sessions').upsert({ video_id: id, title })
      setSession({ videoId: id, title, segments: [] })
      autoFetchTranscript(id)
    }
    reloadForVideo()
  }, [reloadForVideo, loadSession, autoFetchTranscript])

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
    loadSession('demo').then((s) => { if (s) setSession(s) })
  }, [loadSession])

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
          {/* Auth */}
          {mounted && (
            user ? (
              <button
                onClick={signOut}
                className="flex items-center gap-1.5 px-2 py-1 rounded-xl hover:bg-slate-800 transition-colors"
                title="登出"
              >
                {user.avatar
                  ? <Image src={user.avatar} width={24} height={24} className="rounded-full" alt="" />
                  : <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-[10px] font-bold text-white">{(user.name ?? user.email ?? '?')[0].toUpperCase()}</div>
                }
                <span className="text-xs text-slate-400 max-w-[80px] truncate hidden sm:block">{user.name ?? user.email}</span>
              </button>
            ) : (
              <button
                onClick={signInWithGoogle}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-all"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Google 登入
              </button>
            )
          )}
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
            Replay{mounted && annotatedCount > 0 && <span className="ml-0.5 opacity-70">({annotatedCount})</span>}
          </button>

          {/* Export */}
          {mounted && annotatedCount > 0 && (
            <button
              onClick={handleExport}
              className="p-1.5 rounded-xl text-slate-500 hover:text-indigo-400 hover:bg-indigo-950/30 transition-all"
              title="匯出筆記"
            >
              <Download className="w-4 h-4" />
            </button>
          )}

          {/* Clear all */}
          {mounted && annotatedCount > 0 && (
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
              loadVideoId={loadVideoId}
            />
          </div>

          {/* Session Title */}
          {session && (
            <div className="shrink-0 px-4 pt-3 pb-2 flex items-center gap-2 border-b border-slate-800/50">
              {isEditingTitle ? (
                <input
                  ref={titleInputRef}
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitTitle()
                    if (e.key === 'Escape') setIsEditingTitle(false)
                  }}
                  className="flex-1 min-w-0 bg-slate-800 border border-indigo-500/60 rounded-lg px-2 py-1 text-sm font-medium text-slate-100 outline-none"
                  autoFocus
                />
              ) : (
                <button
                  onClick={startEditTitle}
                  className="flex-1 min-w-0 flex items-center gap-1.5 group text-left"
                  title="點擊修改筆記名稱"
                >
                  <span className="text-sm font-medium text-slate-300 truncate group-hover:text-white transition-colors">
                    {session.title || '未命名筆記'}
                  </span>
                  <Pencil className="w-3 h-3 text-slate-600 group-hover:text-slate-400 shrink-0 transition-colors" />
                </button>
              )}
              {/* Folder picker */}
              <div ref={folderPickerRef} className="relative shrink-0">
                <button
                  onClick={openFolderPicker}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-400 hover:bg-indigo-950/30 transition-all"
                  title="加入資料夾"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>
                {showFolderPicker && (
                  <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-xl bg-slate-900 border border-slate-700 shadow-2xl py-1">
                    {folderPickerList.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-slate-500">尚無資料夾，請先在側邊欄新增</p>
                    ) : (
                      folderPickerList.map(f => (
                        <button
                          key={f.id}
                          onClick={() => toggleFolder(f.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors text-left"
                        >
                          <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 ${sessionFolderIds.has(f.id) ? 'bg-indigo-500 border-indigo-500' : 'border-slate-600'}`}>
                            {sessionFolderIds.has(f.id) && <Check className="w-2.5 h-2.5 text-white" />}
                          </span>
                          {f.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <span className="text-xs text-slate-500 font-medium px-2 py-1 rounded-md bg-slate-800/50 shrink-0">
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
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".srt,.txt"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleTranscriptFile(f); e.target.value = '' }}
              />

              {/* Empty transcript placeholder */}
              {session && session.segments.length === 0 && mode === 'read' && (
                <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6">
                  <div className="w-16 h-16 rounded-2xl bg-slate-800/60 flex items-center justify-center">
                    <FileText className="w-8 h-8 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium mb-1">尚無逐字稿</p>
                    <p className="text-xs text-slate-500 max-w-xs">在 YouTube 影片下方點「…」→「顯示逐字稿」，全選複製後貼入</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={() => setShowPasteModal(true)}
                      disabled={isImporting}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all disabled:opacity-50"
                    >
                      {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                      {isImporting ? '匯入中…' : '貼上逐字稿'}
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isImporting}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium transition-all disabled:opacity-50"
                    >
                      <Upload className="w-4 h-4" />
                      上傳 SRT 檔
                    </button>
                  </div>
                </div>
              )}

              {/* Paste Modal */}
              {showPasteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
                  <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-white">貼上逐字稿</h2>
                      <button onClick={() => setShowPasteModal(false)} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="text-xs text-slate-400 bg-slate-800/60 rounded-xl p-3 leading-relaxed">
                      <p className="font-medium text-slate-300 mb-1">如何取得 YouTube 逐字稿：</p>
                      <p>1. 在 YouTube 影片下方點「⋯」→「顯示逐字稿」</p>
                      <p>2. 點逐字稿面板右上角「⋮」→「切換時間戳記」</p>
                      <p>3. 全選（Cmd+A）→ 複製（Cmd+C）→ 貼到下方</p>
                    </div>
                    <textarea
                      value={pasteText}
                      onChange={e => setPasteText(e.target.value)}
                      placeholder="0:00&#10;こんにちは&#10;0:05&#10;今日は..."
                      rows={8}
                      className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono"
                    />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setShowPasteModal(false)} className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white transition-colors">取消</button>
                      <button
                        onClick={handlePasteSubmit}
                        disabled={!pasteText.trim() || isImporting}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all disabled:opacity-50"
                      >
                        {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        匯入
                      </button>
                    </div>
                  </div>
                </div>
              )}

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
                  scrollTrigger={scrollTrigger}
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

          {/* Scroll-to-current button — rendered after scroll container so z-index works */}
          {isPlayerReady && activeId && mode === 'read' && (
            <button
              onClick={() => setScrollTrigger(n => n + 1)}
              className="absolute top-3 right-3 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800/90 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white backdrop-blur-sm transition-all shadow-lg"
            >
              <Play className="w-3 h-3" />
              當前句子
            </button>
          )}

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
        user={user}
        onSelectSession={(id) => {
          setLoadVideoId(id)
          setIsSidebarOpen(false)
        }}
      />
      {/* ── Toasts ── */}
      <Toast items={toasts} onDismiss={dismissToast} />
    </div>
  )
}
