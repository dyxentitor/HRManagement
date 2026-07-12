import { useCallback, useEffect, useRef, useState } from "react"

import {
  clearAll as clearAllApi,
  dismissNotification,
  getUnreadCount,
  listNotifications,
  markAllRead,
  markRead,
} from "./api"
import type { Notification } from "./api"

const PAGE = 20

export function useNotifications(pollMs = 35_000) {
  const [items, setItems] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [filter, setFilter] = useState<"all" | "unread">("all")
  const mounted = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const [rows, count] = await Promise.all([
        listNotifications({ limit: PAGE, unreadOnly: filter === "unread" }),
        getUnreadCount(),
      ])
      if (!mounted.current) return
      setItems(rows)
      setUnreadCount(count)
      setHasMore(rows.length === PAGE)
      setError(false)
    } catch {
      if (mounted.current) setError(true)
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [filter])

  const refreshCount = useCallback(async () => {
    try {
      const count = await getUnreadCount()
      if (mounted.current) setUnreadCount(count)
    } catch {
      /* count poll failures are non-fatal */
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || items.length === 0) return
    setLoadingMore(true)
    try {
      const oldest = items[items.length - 1]
      const rows = await listNotifications({
        limit: PAGE,
        before: oldest.id,
        unreadOnly: filter === "unread",
      })
      if (!mounted.current) return
      setItems((prev) => [...prev, ...rows])
      setHasMore(rows.length === PAGE)
    } catch {
      /* keep existing items; nothing destructive */
    } finally {
      if (mounted.current) setLoadingMore(false)
    }
  }, [items, hasMore, loadingMore, filter])

  const markOneRead = useCallback(
    async (id: number) => {
      setItems((prev) =>
        prev.map((n) =>
          n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n,
        ),
      )
      setUnreadCount((c) => Math.max(0, c - 1))
      try {
        await markRead(id)
      } catch {
        refresh()
      }
    },
    [refresh],
  )

  const markAll = useCallback(async () => {
    setItems((prev) =>
      prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })),
    )
    setUnreadCount(0)
    try {
      await markAllRead()
    } catch {
      refresh()
    }
  }, [refresh])

  const dismiss = useCallback(
    async (id: number) => {
      const target = items.find((n) => n.id === id)
      setItems((prev) => prev.filter((n) => n.id !== id))
      if (target && !target.read_at) setUnreadCount((c) => Math.max(0, c - 1))
      try {
        await dismissNotification(id)
      } catch {
        refresh()
      }
    },
    [items, refresh],
  )

  const clearAll = useCallback(async () => {
    setItems([])
    setUnreadCount(0)
    setHasMore(false)
    try {
      await clearAllApi()
    } catch {
      refresh()
    }
  }, [refresh])

  const onOpen = useCallback(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    mounted.current = true
    refresh()
    return () => {
      mounted.current = false
    }
  }, [refresh])

  useEffect(() => {
    if (pollMs <= 0) return
    const id = setInterval(refreshCount, pollMs)
    const onFocus = () => refresh()
    window.addEventListener("visibilitychange", onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener("visibilitychange", onFocus)
    }
  }, [pollMs, refresh, refreshCount])

  return {
    items,
    unreadCount,
    loading,
    loadingMore,
    error,
    hasMore,
    filter,
    setFilter,
    refresh,
    loadMore,
    markOneRead,
    markAll,
    dismiss,
    clearAll,
    onOpen,
  }
}
