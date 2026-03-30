"use client"

import { useState } from 'react';
import { Handle, Position } from 'reactflow';
import { CaretDown, CaretUp } from '@phosphor-icons/react';

const INITIAL_DISPLAY_COUNT = 5;

// 型ごとのアイコンラベルと色スタイル
const TYPE_META: Record<string, { icon: string; style: React.CSSProperties }> = {
    numeric:     { icon: '#', style: { background: 'hsl(243 75% 97%)', color: 'hsl(243 75% 55%)', border: '1px solid hsl(243 75% 80%)' } },
    categorical: { icon: 'A', style: { background: 'hsl(151 55% 95%)', color: 'hsl(151 55% 35%)', border: '1px solid hsl(151 55% 70%)' } },
    datetime:    { icon: 'D', style: { background: 'hsl(38 96% 95%)', color: 'hsl(38 96% 35%)',  border: '1px solid hsl(38 96% 70%)' } },
    id:          { icon: 'ID', style: { background: 'hsl(270 60% 96%)', color: 'hsl(270 60% 45%)', border: '1px solid hsl(270 60% 75%)' } },
    text:        { icon: 'T', style: { background: 'hsl(200 60% 95%)', color: 'hsl(200 60% 40%)', border: '1px solid hsl(200 60% 70%)' } },
}

interface Column {
    id: number;
    physical_name: string;
    inferred_type: string;
}

interface TableNodeProps {
    data: {
        label: string;
        physical_table_name: string;
        row_count: number;
        columns: Column[];
    }
}

export function TableNode({ data }: TableNodeProps) {
    const [expanded, setExpanded] = useState(false);

    // ID列を先頭に並べ替え
    const sortedColumns = [...data.columns].sort((a, b) => {
        if (a.inferred_type === 'id' && b.inferred_type !== 'id') return -1;
        if (a.inferred_type !== 'id' && b.inferred_type === 'id') return 1;
        return 0;
    });
    const displayColumns = expanded ? sortedColumns : sortedColumns.slice(0, INITIAL_DISPLAY_COUNT);
    const hiddenCount = data.columns.length - INITIAL_DISPLAY_COUNT;

    return (
        <div
            className="min-w-[220px] rounded-xl overflow-hidden"
            style={{
                border: '1px solid var(--border)',
                background: 'var(--card)',
                boxShadow: 'var(--shadow-md)',
            }}
        >
            {/* ─ ノードヘッダー（ダークインディゴ背景） ─ */}
            <div
                className="px-3 py-2.5"
                style={{ background: 'var(--sidebar)', borderBottom: '1px solid var(--sidebar-border)' }}
            >
                <p
                    className="text-sm font-bold leading-tight truncate"
                    style={{ color: 'var(--sidebar-foreground)' }}
                    title={data.label}
                >
                    {data.label}
                </p>
                <p
                    className="text-[10px] font-mono truncate mt-0.5 opacity-50"
                    style={{ color: 'var(--sidebar-foreground)' }}
                    title={data.physical_table_name}
                >
                    {data.physical_table_name}
                </p>
                <p
                    className="text-[11px] mt-0.5 opacity-70"
                    style={{ color: 'var(--sidebar-foreground)' }}
                >
                    {data.row_count.toLocaleString()} 行
                </p>
            </div>

            {/* ─ カラム一覧 ─ */}
            <div className="flex flex-col">
                {displayColumns.map((col) => {
                    const meta = TYPE_META[col.inferred_type] ?? { icon: '?', style: { background: 'var(--muted)', color: 'var(--muted-foreground)', border: '1px solid var(--border)' } }
                    return (
                        <div
                            key={col.id}
                            className="relative px-3 py-2 flex justify-between items-center"
                            style={{ borderBottom: '1px solid var(--border)' }}
                        >
                            {/* Left Handle（結合先ハンドル） */}
                            <Handle
                                type="target"
                                position={Position.Left}
                                id={`target-${col.physical_name}`}
                                style={{
                                    left: -6,
                                    top: '50%',
                                    width: 12,
                                    height: 12,
                                    background: 'var(--primary)',
                                    border: '2px solid white',
                                    borderRadius: '50%',
                                }}
                            />

                            <span
                                className="text-xs font-medium font-mono truncate pr-2"
                                style={{ color: 'var(--foreground)' }}
                            >
                                {col.physical_name}
                            </span>

                            {/* 型バッジ */}
                            <span
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                                style={meta.style}
                            >
                                {meta.icon}
                            </span>

                            {/* Right Handle（結合元ハンドル） */}
                            <Handle
                                type="source"
                                position={Position.Right}
                                id={`source-${col.physical_name}`}
                                style={{
                                    right: -6,
                                    top: '50%',
                                    width: 12,
                                    height: 12,
                                    background: 'var(--primary)',
                                    border: '2px solid white',
                                    borderRadius: '50%',
                                }}
                            />
                        </div>
                    )
                })}

                {/* 展開/折りたたみボタン */}
                {hiddenCount > 0 && (
                    <button
                        className="px-3 py-1.5 text-[11px] flex items-center justify-center gap-1 w-full nodrag transition-colors"
                        style={{
                            color: 'var(--primary)',
                            background: 'var(--secondary)',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--secondary)'}
                        onClick={() => setExpanded(!expanded)}
                    >
                        {expanded ? (
                            <><CaretUp className="w-3 h-3" weight="bold" />折りたたむ</>
                        ) : (
                            <><CaretDown className="w-3 h-3" weight="bold" />他 {hiddenCount} 件を表示</>
                        )}
                    </button>
                )}
            </div>
        </div>
    );
}
