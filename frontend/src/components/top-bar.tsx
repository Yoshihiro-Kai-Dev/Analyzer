"use client"

import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

const sectionNames: Record<string, string> = {
    data: 'データ管理',
    relations: '結合設定',
    analysis: '分析設定',
    dashboard: 'ダッシュボード',
};

export function TopBar({ projectId }: { projectId: string }) {
    const pathname = usePathname();
    const section = pathname.split('/').pop() ?? '';
    const sectionName = sectionNames[section];

    return (
        <header className="h-12 border-b border-border bg-white flex items-center px-6 gap-1.5 text-sm text-muted-foreground shrink-0">
            <span className="font-medium text-foreground">分析くん</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span>Project #{projectId}</span>
            {sectionName && (
                <>
                    <ChevronRight className="w-3.5 h-3.5" />
                    <span className="text-foreground font-medium">{sectionName}</span>
                </>
            )}
        </header>
    );
}
