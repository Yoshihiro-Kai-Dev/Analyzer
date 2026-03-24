"use client"

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Database, GitMerge, Settings2, LayoutDashboard, Sparkles, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ナビゲーション項目の定義
const navItems = (projectId: string) => [
    {
        step: 1,
        name: 'データ管理',
        href: `/projects/${projectId}/data`,
        icon: Database,
    },
    {
        step: 2,
        name: 'リレーション',
        href: `/projects/${projectId}/relations`,
        icon: GitMerge,
    },
    {
        step: 3,
        name: '分析設定',
        href: `/projects/${projectId}/analysis`,
        icon: Settings2,
    },
    {
        step: 4,
        name: 'ダッシュボード',
        href: `/projects/${projectId}/dashboard`,
        icon: LayoutDashboard,
    },
    {
        step: 5,
        name: '予測',
        href: `/projects/${projectId}/predict`,
        icon: Sparkles,
    },
];

interface SidebarNavProps {
    projectId: string
    completedSteps?: Set<number>
}

export function SidebarNav({ projectId, completedSteps = new Set() }: SidebarNavProps) {
    const pathname = usePathname();

    return (
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
            {navItems(projectId).map((item) => {
                const isActive = pathname.startsWith(item.href);
                const isCompleted = completedSteps.has(item.step);
                const Icon = item.icon;
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                            isActive
                                // アクティブ状態: サイドバーアクセント背景 + 左ボーダー
                                ? "border-l-2 pl-[10px]"
                                : "border-l-2 border-transparent pl-[10px] hover:opacity-80"
                        )}
                        style={isActive ? {
                            backgroundColor: "var(--sidebar-accent)",
                            color: "var(--sidebar-accent-foreground)",
                            borderLeftColor: "var(--sidebar-primary)",
                        } : {
                            color: "var(--sidebar-foreground)",
                            opacity: isActive ? 1 : undefined,
                        }}
                    >
                        {/* ステップ番号バッジ / 完了チェックマーク */}
                        {isCompleted && !isActive ? (
                            <CheckCircle2
                                className="flex-shrink-0 w-5 h-5"
                                style={{ color: "hsl(151, 55%, 55%)" }}
                            />
                        ) : (
                            <span
                                className={cn(
                                    "flex-shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center transition-colors"
                                )}
                                style={isActive ? {
                                    backgroundColor: "var(--sidebar-primary)",
                                    color: "white",
                                } : {
                                    backgroundColor: "var(--sidebar-accent)",
                                    color: "var(--sidebar-foreground)",
                                    opacity: 0.7,
                                }}
                            >
                                {item.step}
                            </span>
                        )}

                        {/* ナビゲーションアイコン */}
                        <Icon
                            className="w-4 h-4 shrink-0 transition-colors"
                            style={{ opacity: isActive ? 1 : 0.65 }}
                        />

                        {/* ナビゲーションラベル */}
                        <span
                            className="flex-1 truncate"
                            style={{ opacity: isActive ? 1 : 0.8 }}
                        >
                            {item.name}
                        </span>

                        {/* アクティブ状態のインジケータードット */}
                        {isActive && (
                            <div
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: "var(--sidebar-primary)" }}
                            />
                        )}
                    </Link>
                );
            })}
        </nav>
    );
}
