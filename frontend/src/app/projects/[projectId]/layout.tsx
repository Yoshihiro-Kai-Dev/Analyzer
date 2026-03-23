import Link from 'next/link';
import { ReactNode } from 'react';
import { ArrowLeft, Cpu } from 'lucide-react';
import { SidebarNav } from '@/components/sidebar-nav';
import { TopBar } from '@/components/top-bar';

export default async function ProjectLayout({
    children,
    params,
}: {
    children: ReactNode;
    params: Promise<{ projectId: string }>;
}) {
    const { projectId } = await params;

    return (
        <div className="flex h-screen bg-background">
            {/* サイドバー */}
            <aside className="w-60 bg-white border-r border-border flex flex-col shrink-0">

                {/* ロゴエリア */}
                <div className="h-12 px-4 border-b border-border flex items-center gap-2.5 shrink-0">
                    <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
                        <Cpu className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-semibold text-sm text-foreground">分析くん</span>
                </div>

                {/* プロジェクト情報バッジ */}
                <div className="px-4 py-3 border-b border-border shrink-0">
                    {/* プロジェクト一覧へ戻るリンク */}
                    <Link
                        href="/"
                        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group mb-2"
                    >
                        <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                        プロジェクト一覧
                    </Link>
                    {/* プロジェクトID表示 */}
                    <div className="px-3 py-2 bg-primary/5 rounded-lg border border-primary/15">
                        <p className="text-[10px] font-medium text-primary/70 uppercase tracking-wide">Project</p>
                        <p className="text-sm font-bold text-primary mt-0.5">#{projectId}</p>
                    </div>
                </div>

                {/* ナビゲーション */}
                <SidebarNav projectId={projectId} />

                {/* サイドバーフッター */}
                <div className="px-4 py-3 border-t border-border shrink-0">
                    <p className="text-[11px] text-muted-foreground text-center">&copy; 2026 分析くん</p>
                </div>
            </aside>

            {/* メインコンテンツエリア */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* トップバー（パンくずナビ） */}
                <TopBar projectId={projectId} />

                {/* ページコンテンツ */}
                <main className="flex-1 overflow-auto p-8 scrollbar-thin">
                    <div className="max-w-7xl mx-auto">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
