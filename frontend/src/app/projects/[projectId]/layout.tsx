import { ReactNode } from 'react';
import { ProjectSidebar } from '@/components/project-sidebar';
import { TopBar } from '@/components/top-bar';
import { TooltipProvider } from '@/components/ui/tooltip';

export default async function ProjectLayout({
    children,
    params,
}: {
    children: ReactNode;
    params: Promise<{ projectId: string }>;
}) {
    const { projectId } = await params;

    return (
        // TooltipProvider でラップすることで、配下の全ページで Tooltip を使用可能にする
        <TooltipProvider>
            <div className="flex h-screen bg-background">
                {/* サイドバー（クライアントコンポーネント：プロジェクト名・進捗を動的取得） */}
                <ProjectSidebar projectId={projectId} />

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
        </TooltipProvider>
    );
}
