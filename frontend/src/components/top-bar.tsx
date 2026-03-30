"use client"

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CaretRight, House, Bell } from '@phosphor-icons/react';
import { getNotifications, markAllRead, getUnreadCount } from '@/lib/notifications';
import type { Notification } from '@/lib/notifications';

// セクション名とステップ番号の定義
const sectionMeta: Record<string, { name: string; step: number }> = {
    data:      { name: 'データ管理',     step: 1 },
    relations: { name: 'リレーション',   step: 2 },
    analysis:  { name: '分析設定',       step: 3 },
    dashboard: { name: 'ダッシュボード', step: 4 },
    predict:   { name: '予測',           step: 5 },
};

export function TopBar({ projectId }: { projectId: string }) {
    const pathname = usePathname();
    // パスの末尾からセクション名を取得する
    const section = pathname.split('/').pop() ?? '';
    const meta = sectionMeta[section];

    // 通知ベルの状態管理
    const [unreadCount, setUnreadCount] = useState(0)
    const [open, setOpen] = useState(false)
    const [notifications, setNotifications] = useState<Notification[]>([])

    useEffect(() => {
        // 初回読み込み
        setUnreadCount(getUnreadCount())
        setNotifications(getNotifications())
        // storage イベントで更新する
        const handler = () => {
            setUnreadCount(getUnreadCount())
            setNotifications(getNotifications())
        }
        window.addEventListener('storage', handler)
        return () => window.removeEventListener('storage', handler)
    }, [])

    return (
        <header className="h-12 border-b border-border bg-white flex items-center px-6 gap-1.5 shrink-0">
            {/* パンくずナビゲーション */}
            <nav className="flex items-center gap-1.5 text-sm" aria-label="パンくずリスト">

                {/* ホームリンク */}
                <Link
                    href="/"
                    className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                    <House className="w-3.5 h-3.5" weight="regular" />
                    <span className="hidden sm:inline">分析くん</span>
                </Link>

                <CaretRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" weight="bold" />

                {/* プロジェクトID */}
                <Link
                    href={`/projects/${projectId}/data`}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                >
                    Project <span className="font-medium">#{projectId}</span>
                </Link>

                {/* 現在のセクション（最終パンくず） */}
                {meta && (
                    <>
                        <CaretRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" weight="bold" />
                        <span className="flex items-center gap-1.5 text-foreground font-medium">
                            {/* ステップ番号バッジ */}
                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-white text-[10px] font-bold shrink-0">
                                {meta.step}
                            </span>
                            {meta.name}
                        </span>
                    </>
                )}
            </nav>

            <div className="flex-1" />

            {/* 通知ベルボタン */}
            <div className="relative">
                <button
                    onClick={() => {
                        setOpen(!open)
                        if (!open) {
                            markAllRead()
                            setUnreadCount(0)
                        }
                    }}
                    className="relative p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label="通知"
                >
                    <Bell className="w-4 h-4" weight="regular" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    )}
                </button>

                {/* 通知ドロップダウン */}
                {open && (
                    <div
                        className="absolute right-0 top-full mt-1 w-80 rounded-xl border border-border bg-card shadow-lg py-1 z-50"
                        onMouseLeave={() => setOpen(false)}
                    >
                        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                            <p className="text-xs font-semibold text-foreground">通知</p>
                            <span className="text-xs text-muted-foreground">{notifications.length}件</span>
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                            {notifications.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-6">通知はありません</p>
                            ) : (
                                notifications.map(n => (
                                    <div key={n.id} className="px-3 py-2 border-b border-border last:border-0 hover:bg-muted/30">
                                        <p className="text-xs text-foreground">{n.message}</p>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">
                                            {new Date(n.createdAt).toLocaleString('ja-JP')}
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </header>
    );
}
