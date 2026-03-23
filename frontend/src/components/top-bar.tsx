"use client"

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';

// セクション名とステップ番号の定義
const sectionMeta: Record<string, { name: string; step: number }> = {
    data:      { name: 'データ管理',    step: 1 },
    relations: { name: 'リレーション', step: 2 },
    analysis:  { name: '分析設定',      step: 3 },
    dashboard: { name: 'ダッシュボード', step: 4 },
};

export function TopBar({ projectId }: { projectId: string }) {
    const pathname = usePathname();
    // パスの末尾からセクション名を取得する
    const section = pathname.split('/').pop() ?? '';
    const meta = sectionMeta[section];

    return (
        <header className="h-12 border-b border-border bg-white flex items-center px-6 gap-1.5 shrink-0">
            {/* パンくずナビゲーション */}
            <nav className="flex items-center gap-1.5 text-sm" aria-label="パンくずリスト">

                {/* ホームリンク */}
                <Link
                    href="/"
                    className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                    <Home className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">分析くん</span>
                </Link>

                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />

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
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
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
        </header>
    );
}
