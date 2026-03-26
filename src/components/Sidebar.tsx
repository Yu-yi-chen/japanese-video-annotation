'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import {
  FolderPlus, Folder, FolderOpen, FileAudio, ChevronRight, ChevronDown,
  X, MoreVertical, Pencil, Trash2, FolderInput, Search
} from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '@/lib/supabase'

/* ─── Types ─── */
interface SavedSession {
  id: string
  title: string
  date: string
  duration: string
}

interface FolderData {
  id: string
  name: string
  isExpanded: boolean
  sessions: SavedSession[]
}

type MenuTarget =
  | { kind: 'folder'; folderId: string }
  | { kind: 'session'; folderId: string; sessionId: string }
  | null

/* ─── Props ─── */
interface SidebarProps {
  isOpen: boolean
  onClose: () => void
  onSelectSession: (id: string) => void
  user?: { id: string; email?: string; avatar?: string; name?: string } | null
}

/* ══════════════════════════════════════════════════════════ */
export default function Sidebar({ isOpen, onClose, onSelectSession, user }: SidebarProps) {
  const [folders, setFolders] = useState<FolderData[]>([])
  const [unfiledSessions, setUnfiledSessions] = useState<SavedSession[]>([])

  // Search
  const [searchQuery, setSearchQuery] = useState('')

  // Menus & inline edit
  const [menuTarget, setMenuTarget] = useState<MenuTarget>(null)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<MenuTarget>(null)

  // Move modal
  const [moveTarget, setMoveTarget] = useState<{ folderId: string; sessionId: string } | null>(null)

  // ── Load from Supabase on mount ──
  useEffect(() => {
    ;(async () => {
      const { data: folderRows } = await supabase.from('folders').select('id, name, created_at').order('created_at')
      const { data: fsRows } = await supabase.from('folder_sessions').select('folder_id, video_id, sessions(video_id, title, created_at)')
      if (!folderRows) return
      const built: FolderData[] = folderRows.map(f => {
        const sessions: SavedSession[] = (fsRows ?? [])
          .filter(fs => fs.folder_id === f.id)
          .map(fs => {
            const rows = fs.sessions as unknown as { video_id: string; title: string; created_at: string }[]
            const s = Array.isArray(rows) ? rows[0] : (rows ?? null)
            return {
              id: s?.video_id ?? '',
              title: s?.title ?? '',
              date: s?.created_at ? s.created_at.slice(0, 10) : '',
              duration: '',
            }
          })
          .filter(s => s.id !== '')
        return { id: f.id, name: f.name, isExpanded: true, sessions }
      })
      setFolders(built)

      // 未分類：所有 sessions 中不在任何 folder_sessions 的
      const { data: allSessions } = await supabase.from('sessions').select('video_id, title, created_at').order('created_at', { ascending: false })
      const filedIds = new Set<string>((fsRows ?? []).map(fs => fs.video_id as string))
      setUnfiledSessions(
        (allSessions ?? [])
          .filter(s => !filedIds.has(s.video_id))
          .map(s => ({ id: s.video_id, title: s.title, date: s.created_at.slice(0, 10), duration: '' }))
      )
    })()
  }, [])

  // ── Focus edit input ──
  useEffect(() => {
    if (editingId) editInputRef.current?.focus()
  }, [editingId])

  // ── Close menu on outside click ──
  useEffect(() => {
    if (!menuTarget) return
    const handler = () => setMenuTarget(null)
    window.addEventListener('pointerdown', handler, { capture: true })
    return () => window.removeEventListener('pointerdown', handler, { capture: true })
  }, [menuTarget])

  /* ── Helpers ── */
  const update = (fn: (prev: FolderData[]) => FolderData[]) => setFolders(fn)

  const toggleFolder = (id: string) =>
    update(prev => prev.map(f => f.id === id ? { ...f, isExpanded: !f.isExpanded } : f))

  const openMenu = (e: React.MouseEvent, target: MenuTarget) => {
    e.stopPropagation()
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMenuPos({ x: rect.right, y: rect.bottom })
    setMenuTarget(target)
  }

  /* ── Create folder ── */
  const handleCreateFolder = async () => {
    const id = `f_${Date.now()}`
    await supabase.from('folders').insert({ id, name: '新資料夾' })
    update(prev => [{ id, name: '新資料夾', isExpanded: true, sessions: [] }, ...prev])
    setEditingId(id)
    setEditingValue('新資料夾')
  }

  /* ── Rename commit ── */
  const commitRename = async () => {
    const val = editingValue.trim()
    if (!val || !editingId) { setEditingId(null); return }
    // Check if it's a folder id or session id
    const isFolder = folders.some(f => f.id === editingId)
    if (isFolder) {
      await supabase.from('folders').update({ name: val }).eq('id', editingId)
      update(prev => prev.map(f => f.id === editingId ? { ...f, name: val } : f))
    } else {
      await supabase.from('sessions').update({ title: val }).eq('video_id', editingId)
      update(prev => prev.map(f => ({
        ...f,
        sessions: f.sessions.map(s => s.id === editingId ? { ...s, title: val } : s)
      })))
    }
    setEditingId(null)
  }

  /* ── Delete ── */
  const confirmDelete = async () => {
    if (!deleteTarget) return
    if (deleteTarget.kind === 'folder') {
      await supabase.from('folders').delete().eq('id', deleteTarget.folderId)
      update(prev => prev.filter(f => f.id !== deleteTarget.folderId))
    } else {
      await supabase.from('folder_sessions')
        .delete()
        .eq('folder_id', deleteTarget.folderId)
        .eq('video_id', deleteTarget.sessionId)
      update(prev => prev.map(f =>
        f.id === deleteTarget.folderId
          ? { ...f, sessions: f.sessions.filter(s => s.id !== deleteTarget.sessionId) }
          : f
      ))
    }
    setDeleteTarget(null)
  }

  /* ── Move session ── */
  const moveSession = async (targetFolderId: string) => {
    if (!moveTarget) return
    const { folderId: srcId, sessionId } = moveTarget
    if (srcId === targetFolderId) { setMoveTarget(null); return }
    await supabase.from('folder_sessions').delete().eq('folder_id', srcId).eq('video_id', sessionId)
    await supabase.from('folder_sessions').upsert({ folder_id: targetFolderId, video_id: sessionId })
    update(prev => {
      let session: SavedSession | null = null
      const next = prev.map(f => {
        if (f.id === srcId) {
          const s = f.sessions.find(s => s.id === sessionId)
          if (s) session = s
          return { ...f, sessions: f.sessions.filter(s => s.id !== sessionId) }
        }
        return f
      })
      if (!session) return prev
      return next.map(f =>
        f.id === targetFolderId ? { ...f, sessions: [...f.sessions, session!] } : f
      )
    })
    setMoveTarget(null)
  }

  /* ── Search filter ── */
  const filteredFolders = folders.map(f => ({
    ...f,
    sessions: searchQuery
      ? f.sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
      : f.sessions,
    isExpanded: searchQuery ? true : f.isExpanded,
  })).filter(f => !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase()) || f.sessions.length > 0)

  /* ════════════════════════════════ RENDER ════════════════════════════════ */
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Panel */}
      <div
        className={clsx(
          "fixed top-0 left-0 h-full w-80 bg-[#0a0d14] border-r border-slate-800 z-50 flex flex-col transition-transform duration-300 shadow-2xl",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-slate-800 shrink-0">
          <h2 className="text-sm font-bold tracking-wider text-slate-200 uppercase">學習紀錄</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-3 pt-3 pb-1 shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/50 focus-within:border-indigo-500/50 transition-colors">
            <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜尋記錄…"
              className="flex-1 bg-transparent text-xs text-slate-300 placeholder:text-slate-600 outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-slate-500 hover:text-slate-300">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* New Folder Button */}
        <div className="px-3 pt-2 pb-2 shrink-0">
          <button
            onClick={handleCreateFolder}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 font-medium transition-colors border border-indigo-500/20"
          >
            <FolderPlus className="w-4 h-4" />
            <span className="text-sm">新增資料夾</span>
          </button>
        </div>

        {/* Folder List */}
        <div className="flex-1 overflow-y-auto px-2 pb-6 flex flex-col gap-1 custom-scrollbar">
          {filteredFolders.length === 0 && unfiledSessions.length === 0 && (
            <div className="text-center py-10 text-xs text-slate-600">找不到相關記錄</div>
          )}

          {/* 未分類 */}
          {unfiledSessions.filter(s => !searchQuery || s.title.toLowerCase().includes(searchQuery.toLowerCase())).length > 0 && (
            <div className="flex flex-col mb-1">
              <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                未分類
              </div>
              <div className="flex flex-col gap-0.5 ml-2 pl-3 border-l border-slate-800">
                {unfiledSessions
                  .filter(s => !searchQuery || s.title.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(s => (
                    <div
                      key={s.id}
                      onClick={() => onSelectSession(s.id)}
                      className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-slate-800/80 cursor-pointer group transition-colors"
                    >
                      <FileAudio className="w-3.5 h-3.5 text-emerald-400/70 shrink-0 group-hover:text-emerald-400" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium text-slate-300 group-hover:text-white truncate block">
                          {s.title}
                        </span>
                        <span className="text-[10px] text-slate-500">{s.date}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
          {filteredFolders.map(folder => (
            <div key={folder.id} className="flex flex-col">
              {/* Folder Row */}
              <div
                className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-slate-800/80 cursor-pointer text-slate-300 group transition-colors"
                onClick={() => !editingId && toggleFolder(folder.id)}
              >
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  {folder.isExpanded
                    ? <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />}
                  {folder.isExpanded
                    ? <FolderOpen className="w-4 h-4 text-indigo-400 shrink-0" />
                    : <Folder className="w-4 h-4 text-indigo-400 shrink-0" />}

                  {/* Inline rename */}
                  {editingId === folder.id ? (
                    <input
                      ref={editInputRef}
                      value={editingValue}
                      onChange={e => setEditingValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null) }}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 bg-slate-700 text-slate-100 text-sm rounded px-1.5 py-0.5 outline-none border border-indigo-500"
                    />
                  ) : (
                    <span className="text-sm font-medium truncate">{folder.name}</span>
                  )}
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-xs text-slate-500 font-medium">{folder.sessions.length}</span>
                  <button
                    onClick={e => openMenu(e, { kind: 'folder', folderId: folder.id })}
                    className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Sessions */}
              {folder.isExpanded && (
                <div className="flex flex-col gap-0.5 mt-1 mb-2 ml-6 pl-3 border-l text-slate-400 border-slate-800">
                  {folder.sessions.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-600">空資料夾</div>
                  ) : (
                    folder.sessions.map(session => (
                      <div
                        key={session.id}
                        onClick={() => { if (!editingId) onSelectSession(session.id) }}
                        className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-slate-800/80 cursor-pointer group transition-colors"
                      >
                        <FileAudio className="w-3.5 h-3.5 text-emerald-400/70 shrink-0 group-hover:text-emerald-400" />
                        <div className="flex-1 min-w-0 flex flex-col">
                          {/* Inline rename session */}
                          {editingId === session.id ? (
                            <input
                              ref={editInputRef}
                              value={editingValue}
                              onChange={e => setEditingValue(e.target.value)}
                              onBlur={commitRename}
                              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null) }}
                              onClick={e => e.stopPropagation()}
                              className="w-full bg-slate-700 text-slate-100 text-xs rounded px-1.5 py-0.5 outline-none border border-indigo-500"
                            />
                          ) : (
                            <span className="text-xs font-medium text-slate-300 group-hover:text-white truncate">
                              {session.title}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-500">{session.date} · {session.duration}</span>
                        </div>
                        <button
                          onClick={e => openMenu(e, { kind: 'session', folderId: folder.id, sessionId: session.id })}
                          className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-slate-200 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="h-16 shrink-0 border-t border-slate-800 flex items-center px-4 gap-3 bg-slate-900/50">
          {user?.avatar
            ? <Image src={user.avatar} width={32} height={32} className="rounded-full shrink-0" alt="" />
            : <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/20">
                <span className="text-xs font-bold text-white">{user ? (user.name ?? user.email ?? '?')[0].toUpperCase() : '?'}</span>
              </div>
          }
          <div className="flex-1 min-w-0 flex flex-col">
            <span className="text-sm font-medium text-slate-200 truncate">{user?.name ?? user?.email ?? '未登入'}</span>
            <span className="text-xs text-slate-500 truncate">{user ? user.email : '請登入以同步資料'}</span>
          </div>
        </div>
      </div>

      {/* ── Context Menu ── */}
      {menuTarget && (
        <div
          className="fixed z-[100] min-w-[160px] rounded-xl bg-slate-900 border border-slate-700 shadow-2xl py-1 overflow-hidden"
          style={{ left: menuPos.x - 164, top: menuPos.y + 4 }}
          onPointerDown={e => e.stopPropagation()}
        >
          {/* Rename */}
          <button
            onClick={() => {
              const t = menuTarget
              setMenuTarget(null)
              if (t.kind === 'folder') {
                const f = folders.find(f => f.id === t.folderId)
                if (f) { setEditingId(f.id); setEditingValue(f.name) }
              } else {
                const f = folders.find(f => f.id === t.folderId)
                const s = f?.sessions.find(s => s.id === t.sessionId)
                if (s) { setEditingId(s.id); setEditingValue(s.title) }
              }
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <Pencil className="w-3.5 h-3.5 text-slate-400" />
            重新命名
          </button>

          {/* Move (sessions only) */}
          {menuTarget.kind === 'session' && (
            <button
              onClick={() => {
                const t = menuTarget as { kind: 'session'; folderId: string; sessionId: string }
                setMoveTarget({ folderId: t.folderId, sessionId: t.sessionId })
                setMenuTarget(null)
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <FolderInput className="w-3.5 h-3.5 text-slate-400" />
              移動到資料夾
            </button>
          )}

          <div className="h-px bg-slate-800 my-1" />

          {/* Delete */}
          <button
            onClick={() => { setDeleteTarget(menuTarget); setMenuTarget(null) }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-950/40 hover:text-red-300 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            刪除
          </button>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl w-72">
            <p className="text-sm font-semibold text-slate-100 mb-1">
              {deleteTarget.kind === 'folder' ? '刪除資料夾' : '刪除記錄'}
            </p>
            <p className="text-xs text-slate-400 mb-4">
              {deleteTarget.kind === 'folder'
                ? '資料夾內所有學習記錄都會一併刪除，無法復原。'
                : '確定要刪除這筆學習記錄嗎？'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={confirmDelete}
                className="flex-1 py-2 text-sm rounded-xl bg-red-700 hover:bg-red-600 text-white font-medium transition-all"
              >
                刪除
              </button>
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 text-sm rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 transition-all"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Move to Folder Modal ── */}
      {moveTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl w-72">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-100">移動到資料夾</p>
              <button onClick={() => setMoveTarget(null)} className="text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-col gap-1 max-h-52 overflow-y-auto custom-scrollbar">
              {folders
                .filter(f => f.id !== moveTarget.folderId)
                .map(f => (
                  <button
                    key={f.id}
                    onClick={() => moveSession(f.id)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors text-left"
                  >
                    <Folder className="w-4 h-4 text-indigo-400 shrink-0" />
                    {f.name}
                    <span className="ml-auto text-xs text-slate-500">{f.sessions.length} 筆</span>
                  </button>
                ))}
              {folders.filter(f => f.id !== moveTarget.folderId).length === 0 && (
                <p className="text-xs text-slate-600 text-center py-4">沒有其他資料夾</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
