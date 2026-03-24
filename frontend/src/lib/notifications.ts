// 通知の型定義
export interface Notification {
  id: string
  type: 'upload' | 'train' | 'predict'
  message: string
  createdAt: number  // Date.now()
  read: boolean
}

const STORAGE_KEY = 'notifications'

// localStorageから通知一覧を取得する
export function getNotifications(): Notification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

// 通知を追加する
export function addNotification(type: Notification['type'], message: string): void {
  const notifications = getNotifications()
  const newNotif: Notification = {
    id: crypto.randomUUID(),
    type,
    message,
    createdAt: Date.now(),
    read: false,
  }
  // 最大50件まで保持する（古いものを削除）
  const updated = [newNotif, ...notifications].slice(0, 50)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    // storage イベントを手動でディスパッチして同一タブの購読者に通知する
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
  } catch {
    // localStorage が使えない環境では無視する
  }
}

// すべての通知を既読にする
export function markAllRead(): void {
  const notifications = getNotifications()
  const updated = notifications.map(n => ({ ...n, read: true }))
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
  } catch {}
}

// 未読件数を返す
export function getUnreadCount(): number {
  return getNotifications().filter(n => !n.read).length
}
