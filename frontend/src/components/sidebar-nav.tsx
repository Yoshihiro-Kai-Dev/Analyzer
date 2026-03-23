"use client"

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Database, GitMerge, Settings2, LayoutDashboard, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

// ナビゲーション項目の定義
// step: サイドバーに表示するステップ番号バッジ
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

export function SidebarNav({ projectId }: { projectId: string }) {
    const pathname = usePathname();

    return (
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
            {navItems(projectId).map((item) => {
                const isActive = pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                            isActive
                                // アクティブ: 背景・テキスト色を強調し、左ボーダーで現在地を示す
                                ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-primary pl-[10px]"
                                : "text-slate-500 hover:bg-slate-50 hover:text-slate-800 border-l-2 border-transparent pl-[10px]"
                        )}
                    >
                        {/* ステップ番号バッジ */}
                        <span
                            className={cn(
                                "flex-shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center transition-colors",
                                isActive
                                    ? "bg-primary text-white"
                                    : "bg-slate-100 text-slate-400"
                            )}
                        >
                            {item.step}
                        </span>

                        {/* ナビゲーションアイコン */}
                        <Icon
                            className={cn(
                                "w-4 h-4 shrink-0 transition-colors",
                                isActive ? "text-primary" : "text-slate-400"
                            )}
                        />

                        {/* ナビゲーションラベル */}
                        <span className="flex-1 truncate">{item.name}</span>

                        {/* アクティブ状態のインジケータードット */}
                        {isActive && (
                            <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        )}
                    </Link>
                );
            })}
        </nav>
    );
}
