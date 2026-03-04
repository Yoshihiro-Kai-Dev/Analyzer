"use client"

import { useState } from 'react';
import { Handle, Position } from 'reactflow';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp } from 'lucide-react';

const INITIAL_DISPLAY_COUNT = 5;

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

    const displayColumns = expanded ? data.columns : data.columns.slice(0, INITIAL_DISPLAY_COUNT);
    const hiddenCount = data.columns.length - INITIAL_DISPLAY_COUNT;

    return (
        <Card className="min-w-[200px] border-2 shadow-sm bg-white">
            <CardHeader className="p-3 bg-gray-50 border-b">
                <CardTitle className="text-sm font-bold text-gray-800 text-center">
                    {data.label}
                </CardTitle>
                <p className="text-[10px] text-center text-gray-400 truncate" title={data.physical_table_name}>{data.physical_table_name}</p>
                <p className="text-xs text-center text-gray-500">{data.row_count.toLocaleString()} 行</p>
            </CardHeader>
            <CardContent className="p-0">
                <div className="flex flex-col">
                    {displayColumns.map((col) => (
                        <div key={col.id} className="relative px-3 py-2 text-xs border-b last:border-b-0 flex justify-between items-center hover:bg-gray-50">
                            {/* Left Handle (Target) */}
                            <Handle
                                type="target"
                                position={Position.Left}
                                id={`target-${col.physical_name}`}
                                className="w-2 h-2 !bg-blue-400 !border-none"
                                style={{ left: -5, top: '50%' }}
                            />

                            <span className="font-medium text-gray-700">{col.physical_name}</span>
                            <span className="text-[10px] text-gray-400 bg-gray-100 px-1 rounded">{col.inferred_type}</span>

                            {/* Right Handle (Source) */}
                            <Handle
                                type="source"
                                position={Position.Right}
                                id={`source-${col.physical_name}`}
                                className="w-2 h-2 !bg-blue-400 !border-none"
                                style={{ right: -5, top: '50%' }}
                            />
                        </div>
                    ))}
                    {hiddenCount > 0 && (
                        <button
                            className="px-3 py-1.5 text-[10px] text-blue-500 text-center bg-gray-50 hover:bg-gray-100 flex items-center justify-center gap-1 w-full nodrag"
                            onClick={() => setExpanded(!expanded)}
                        >
                            {expanded ? (
                                <><ChevronUp className="w-3 h-3" />折りたたむ</>
                            ) : (
                                <><ChevronDown className="w-3 h-3" />他 {hiddenCount} 件のカラムを表示</>
                            )}
                        </button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
