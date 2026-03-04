"use client"

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Database, GitMerge, Settings2, LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = (projectId: string) => [
    { name: 'データ管理', href: `/projects/${projectId}/data`, icon: Database },
    { name: '結合設定', href: `/projects/${projectId}/relations`, icon: GitMerge },
    { name: '分析設定', href: `/projects/${projectId}/analysis`, icon: Settings2 },
    { name: 'ダッシュボード', href: `/projects/${projectId}/dashboard`, icon: LayoutDashboard },
];

export function SidebarNav({ projectId }: { projectId: string }) {
    const pathname = usePathname();

    return (
        <nav className="flex-1 px-3 py-4 space-y-0.5">
            {navItems(projectId).map((item) => {
                const isActive = pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                            isActive
                                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                        )}
                    >
                        <Icon className={cn("w-4 h-4 shrink-0", isActive ? "text-primary" : "text-slate-400")} />
                        <span>{item.name}</span>
                        {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
                    </Link>
                );
            })}
        </nav>
    );
}
