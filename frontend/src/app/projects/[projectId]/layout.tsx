import Link from 'next/link';
import { ReactNode } from 'react';

export default async function ProjectLayout({
    children,
    params,
}: {
    children: ReactNode;
    params: Promise<{ projectId: string }>;
}) {
    const { projectId } = await params;

    const navItems = [
        { name: 'データ管理', href: `/projects/${projectId}/data`, icon: '📂' },
        { name: '結合設定', href: `/projects/${projectId}/relations`, icon: '🔗' },
        { name: '分析設定', href: `/projects/${projectId}/analysis`, icon: '⚙️' },
        { name: 'ダッシュボード', href: `/projects/${projectId}/dashboard`, icon: '📊' },
    ];

    return (
        <div className="flex h-screen bg-background">
            {/* Sidebar */}
            <aside className="w-64 bg-sidebar border-r border-sidebar-border shadow-md flex flex-col">
                <div className="p-4 border-b border-sidebar-border">
                    <Link href="/" className="text-xl font-bold text-sidebar-foreground hover:text-sidebar-primary flex items-center gap-2">
                        <span>⬅</span>
                        <span>Wel Analyzer</span>
                    </Link>
                    <div className="mt-2 text-xs text-muted-foreground">Project ID: {projectId}</div>
                </div>

                <nav className="flex-1 p-4 space-y-2">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="flex items-center px-4 py-2 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md transition-colors"
                        >
                            <span className="mr-3">{item.icon}</span>
                            <span className="font-medium">{item.name}</span>
                        </Link>
                    ))}
                </nav>

                <div className="p-4 border-t border-sidebar-border text-xs text-muted-foreground text-center">
                    &copy; 2026 Wel Analyzer
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto p-8">
                <div className="max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
