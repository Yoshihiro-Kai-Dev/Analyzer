"use client"

import { useCallback, useEffect, useState } from 'react';
import ReactFlow, {
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    Edge,
    Node,
    MarkerType,
    OnConnect,
} from 'reactflow';
import 'reactflow/dist/style.css';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { TableNode } from '@/components/relation-editor/TableNode';
import { JoinConfigDialog, JoinConfig } from '@/components/relation-editor/JoinConfigDialog';
import { AppAlertDialog } from '@/components/ui/app-alert-dialog';
import { useAppAlert } from '@/hooks/use-app-alert';
import dagre from 'dagre';

const nodeTypes = {
    table: TableNode,
};

// Layout Helper
const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    // ノードサイズは概算 (本来はレンダリング後に計測すべきだが簡易実装)
    const nodeWidth = 220;
    const nodeHeight = 200;

    dagreGraph.setGraph({ rankdir: 'LR' }); // Left to Right

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    nodes.forEach((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        // ReactFlowの原点は左上だがDagreは中心
        node.position = {
            x: nodeWithPosition.x - nodeWidth / 2,
            y: nodeWithPosition.y - nodeHeight / 2,
        };
    });

    return { nodes, edges };
};


import { useParams } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api'

export default function RelationsPage() {
    const params = useParams();
    const projectId = params.projectId as string;
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [loading, setLoading] = useState(true);
    const { alertState, showAlert, closeAlert } = useAppAlert();

    // Dialog State
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [tablesRes, relationsRes] = await Promise.all([
                axios.get(`${API_BASE_URL}/api/projects/${projectId}/tables`),
                axios.get(`${API_BASE_URL}/api/projects/${projectId}/relations`)
            ]);

            const tables = tablesRes.data;
            const relations = relationsRes.data;

            // Nodes
            const initialNodes: Node[] = tables.map((table: any) => ({
                id: table.id.toString(),
                type: 'table',
                position: { x: 0, y: 0 }, // レイアウト計算前にリセット
                data: {
                    label: table.original_filename.replace(/\.csv$/i, ''),
                    physical_table_name: table.physical_table_name,
                    row_count: table.row_count,
                    columns: table.columns
                },
            }));

            // Edges
            const initialEdges: Edge[] = relations.map((rel: any) => ({
                id: `e${rel.parent_table_id}-${rel.child_table_id}`,
                source: rel.parent_table_id.toString(),
                target: rel.child_table_id.toString(),
                sourceHandle: `source-${rel.join_keys.parent_col}`,
                targetHandle: `target-${rel.join_keys.child_col}`,
                label: rel.cardinality === 'OneToMany' ? '1:N' : '1:1',
                type: 'smoothstep',
                animated: false,
                style: { stroke: 'var(--color-foreground)', strokeWidth: 2 },
                markerEnd: { type: MarkerType.ArrowClosed },
                data: { join_keys: rel.join_keys }
            }));

            // Auto Layout
            const layouted = getLayoutedElements(initialNodes, initialEdges);

            // 初回配置で位置が重ならないように、まだエッジがない場合でもグリッド配置などの工夫が必要だが
            // dagreはエッジがないとすべて(0,0)に重ねてしまう可能性があるため、簡易的な分散処理を入れる
            if (initialEdges.length === 0) {
                layouted.nodes.forEach((node, index) => {
                    node.position = {
                        x: (index % 3) * 350,
                        y: Math.floor(index / 3) * 300
                    };
                });
            }

            setNodes(layouted.nodes);
            setEdges(layouted.edges);

        } catch (error) {
            console.error("Failed to fetch data:", error);
            showAlert("読み込みエラー", "データの読み込みに失敗しました。サーバーの状態を確認してください。");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (projectId) {
            fetchData();
        }
    }, [projectId]);

    const onConnect: OnConnect = useCallback((params: Connection) => {
        // 自己結合禁止
        if (params.source === params.target) {
            showAlert("結合エラー", "テーブル自身への結合は定義できません（自己結合は現在サポートされていません）。");
            return;
        }

        // ハンドルIDからカラム名は取得できない（APIに問い合わせが必要）
        // ただし、Dialog側でノードデータを参照してユーザーに選ばせるので、
        // ここでは単にDialogを開き、Source/Targetのノード情報を渡す準備をする。
        setPendingConnection(params);
        setIsDialogOpen(true);

    }, []);

    const handleSaveRelation = async (config: JoinConfig) => {
        if (!pendingConnection) return;

        try {
            // API Call
            const payload = {
                parent_table_id: parseInt(pendingConnection.source!),
                child_table_id: parseInt(pendingConnection.target!),
                join_keys: {
                    parent_col: config.parentColumn,
                    child_col: config.childColumn
                },
                cardinality: config.cardinality
            };

            await axios.post(`${API_BASE_URL}/api/projects/${projectId}/relations`, payload);

            // エッジを追加
            const newEdge: Edge = {
                id: `e${payload.parent_table_id}-${payload.child_table_id}`,
                source: pendingConnection.source!,
                target: pendingConnection.target!,
                label: config.cardinality === 'OneToMany' ? '1:N' : '1:1',
                type: 'smoothstep',
                animated: true, // 新規追加分はアニメーションで強調
                style: { stroke: 'var(--color-primary)', strokeWidth: 2 },
                markerEnd: { type: MarkerType.ArrowClosed },
                data: { join_keys: payload.join_keys }
            };

            setEdges((eds) => addEdge(newEdge, eds));
            setIsDialogOpen(false);
            setPendingConnection(null);

        } catch (error: any) {
            console.error("Failed to save relation:", error);
            const msg = error.response?.data?.detail || "リレーションの保存に失敗しました";
            showAlert("保存エラー", msg);
            // Dialogは閉じないでおく（修正できるように）
        }
    };

    const getPendingNodes = () => {
        if (!pendingConnection) return { source: null, target: null, sourceColumn: "", targetColumn: "" };
        const source = nodes.find(n => n.id === pendingConnection.source);
        const target = nodes.find(n => n.id === pendingConnection.target);
        const sourceColumn = pendingConnection.sourceHandle?.replace(/^source-/, "") ?? "";
        const targetColumn = pendingConnection.targetHandle?.replace(/^target-/, "") ?? "";
        return { source, target, sourceColumn, targetColumn };
    };

    const { source, target, sourceColumn, targetColumn } = getPendingNodes();

    return (
        <div className="w-full h-screen flex flex-col">
            <header className="p-4 border-b bg-background flex justify-between items-center shadow-sm z-10">
                <div className="flex flex-col">
                    <h1 className="text-xl font-bold text-foreground">リレーション定義 (ER図)</h1>
                    <p className="text-xs text-gray-500">テーブルのコネクタをドラッグ＆ドロップして結合を定義します。</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={fetchData} title="最新のテーブル情報を取得して配置をリセットします">
                        リロード & 自動配置
                    </Button>
                </div>
            </header>

            <div className="flex-1 bg-background relative">
                {loading ? (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        <div className="flex flex-col items-center gap-2">
                            <span className="animate-spin text-2xl">⏳</span>
                            <span>データを読み込んでいます...</span>
                        </div>
                    </div>
                ) : (
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        nodeTypes={nodeTypes}
                        fitView
                        className="bg-background"
                    >
                        <Controls />
                        <MiniMap style={{ height: 120 }} zoomable pannable />
                        <Background gap={12} size={1} color="var(--color-border)" />
                    </ReactFlow>
                )}
            </div>

            <JoinConfigDialog
                isOpen={isDialogOpen}
                onClose={() => { setIsDialogOpen(false); setPendingConnection(null); }}
                onSave={handleSaveRelation}
                sourceNode={source}
                targetNode={target}
                initialParentColumn={sourceColumn}
                initialChildColumn={targetColumn}
            />

            {alertState && (
                <AppAlertDialog
                    open={true}
                    title={alertState.title}
                    description={alertState.description}
                    onClose={closeAlert}
                />
            )}
        </div>
    );
}
