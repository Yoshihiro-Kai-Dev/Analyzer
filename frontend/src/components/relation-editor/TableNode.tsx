import { Handle, Position } from 'reactflow';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

// カラムの型定義（簡易版）
interface Column {
    id: number;
    physical_name: string;
    inferred_type: string;
}

interface TableNodeProps {
    data: {
        label: string; // テーブル名
        row_count: number;
        columns: Column[];
    }
}

export function TableNode({ data }: TableNodeProps) {
    return (
        <Card className="min-w-[200px] border-2 shadow-sm bg-white">
            <CardHeader className="p-3 bg-gray-50 border-b">
                <CardTitle className="text-sm font-bold text-gray-800 text-center">
                    {data.label}
                </CardTitle>
                <p className="text-xs text-center text-gray-500">{data.row_count.toLocaleString()} rows</p>
            </CardHeader>
            <CardContent className="p-0">
                <div className="flex flex-col">
                    {data.columns.slice(0, 5).map((col, index) => (
                        <div key={index} className="relative px-3 py-2 text-xs border-b last:border-b-0 flex justify-between items-center hover:bg-gray-50">
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
                    {data.columns.length > 5 && (
                        <div className="px-3 py-1 text-[10px] text-gray-400 text-center bg-gray-50">
                            + {data.columns.length - 5} more columns
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
