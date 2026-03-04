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
            {/* Sidebar */}
            <aside className="w-60 bg-white border-r border-border flex flex-col shrink-0">
                {/* Logo */}
                <div className="h-12 px-4 border-b border-border flex items-center gap-2.5 shrink-0">
                    <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
                        <Cpu className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-semibold text-sm text-foreground">分析くん</span>
                </div>

                {/* Project badge */}
                <div className="px-4 py-3 border-b border-border">
                    <Link
                        href="/"
                        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group"
                    >
                        <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                        プロジェクト一覧
                    </Link>
                    <div className="mt-2 px-2 py-1 bg-slate-50 rounded-md border border-border">
                        <p className="text-xs text-muted-foreground">Project ID</p>
                        <p className="text-sm font-semibold text-foreground">#{projectId}</p>
                    </div>
                </div>

                {/* Nav */}
                <SidebarNav projectId={projectId} />

                {/* Footer */}
                <div className="px-4 py-3 border-t border-border">
                    <p className="text-xs text-muted-foreground text-center">&copy; 2026 分析くん</p>
                </div>
            </aside>

            {/* Right side */}
            <div className="flex-1 flex flex-col min-w-0">
                <TopBar projectId={projectId} />
                <main className="flex-1 overflow-auto p-8">
                    <div className="max-w-7xl mx-auto">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
