"use client"

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Play, Loader2, TrendingUp, BarChart2, Sparkles, HelpCircle, GitBranch, ListTree, Table2, XCircle, History, ChevronRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import ReactFlow, {
    Background,
    Controls,
    useNodesState,
    useEdgesState,
    Node,
    Edge,
    Handle,
    Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';


import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { AppAlertDialog } from '@/components/ui/app-alert-dialog';
import { useAppAlert } from '@/hooks/use-app-alert';
import { apiClient } from '@/lib/api'
import { addNotification } from '@/lib/notifications'
import { buildColLabelsMap } from "@/lib/labelUtils"

// physical table name prefix を除去する（例: upload_p5_20260304161857_01_ → 削除）
const stripTablePrefix = (name: string) =>
    name.replace(/upload_p\d+_\d+_\d+_/g, '');

// ── 決定木ノードコンポーネント ────────────────────────────────
const DT_NODE_W = 200;
const DT_NODE_H = 88;

function DecisionTreeNode({ data }: { data: any }) {
    if (data.is_leaf) {
        return (
            <div style={{ width: DT_NODE_W, background: 'var(--success-muted)', border: '2px solid var(--success)', borderRadius: '0.625rem', padding: '8px 12px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
                <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
                <div style={{ fontSize: 10, color: 'var(--success)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>予測</div>
                <div style={{ fontWeight: 700, color: 'var(--foreground)', fontSize: 14 }} title={String(data.prediction)}>{String(data.prediction)}</div>
                {data.confidence != null && (
                    <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 2 }}>確信度 {Math.round(data.confidence * 100)}%</div>
                )}
                {data.std != null && (
                    <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 2 }}>
                        ±{data.std}&nbsp;
                        <span style={{ fontWeight: 600, color: stabilityLabel(data.std, data.prediction) === '高' ? 'var(--success)' : stabilityLabel(data.std, data.prediction) === '中' ? 'var(--warning)' : 'var(--muted-foreground)' }}>
                            安定度:{stabilityLabel(data.std, data.prediction)}
                        </span>
                    </div>
                )}
                <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 2 }}>n={data.samples.toLocaleString()}</div>
                <Handle type="source" position={Position.Bottom} style={{ visibility: 'hidden' }} />
            </div>
        );
    }
    return (
        <div style={{ width: DT_NODE_W, background: 'var(--primary-muted, hsl(243 75% 97%))', border: '2px solid var(--primary)', borderRadius: '0.625rem', padding: '8px 12px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
            <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
            <div style={{ fontSize: 10, color: 'var(--primary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>分岐</div>
            <div style={{ fontWeight: 700, color: 'var(--foreground)', fontSize: 12 }} title={stripTablePrefix(data.feature)}>{stripTablePrefix(data.feature)}</div>
            <div style={{ fontSize: 14, fontFamily: 'monospace', color: 'var(--foreground)' }}>≤ {data.threshold}</div>
            <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 2 }}>gini={data.impurity} &nbsp; n={data.samples.toLocaleString()}</div>
            <Handle type="source" position={Position.Bottom} id="left"  style={{ left: '25%', visibility: 'hidden' }} />
            <Handle type="source" position={Position.Bottom} id="right" style={{ left: '75%', visibility: 'hidden' }} />
        </div>
    );
}

const dtNodeTypes = { dtNode: DecisionTreeNode };

// ── ツリー JSON → ReactFlow nodes/edges 変換 ──────────────────
function flattenTree(node: any, nodes: Node[], edges: Edge[], parentId?: string, edgeLabel?: string) {
    const id = `dt-${node.id}`;
    nodes.push({
        id,
        type: 'dtNode',
        position: { x: 0, y: 0 },
        data: { ...node },
    });
    if (parentId) {
        edges.push({
            id: `dte-${parentId}-${id}`,
            source: parentId,
            target: id,
            label: edgeLabel,
            type: 'smoothstep',
            style: { stroke: '#94a3b8', strokeWidth: 1.5 },
            labelStyle: { fontSize: 10, fill: '#64748b' },
            labelBgStyle: { fill: 'white' },
        });
    }
    if (!node.is_leaf) {
        flattenTree(node.left,  nodes, edges, id, `≤ ${node.threshold}`);
        flattenTree(node.right, nodes, edges, id, `> ${node.threshold}`);
    }
}

function layoutTree(rawNodes: Node[], rawEdges: Edge[]) {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'TB', ranksep: 60, nodesep: 20 });
    rawNodes.forEach(n => g.setNode(n.id, { width: DT_NODE_W, height: DT_NODE_H }));
    rawEdges.forEach(e => g.setEdge(e.source, e.target));
    dagre.layout(g);
    rawNodes.forEach(n => {
        const pos = g.node(n.id);
        n.position = { x: pos.x - DT_NODE_W / 2, y: pos.y - DT_NODE_H / 2 };
    });
    return { nodes: rawNodes, edges: rawEdges };
}

// ── p値 → 有意性ラベル ────────────────────────────────────────
function pValueLabel(p: number): { mark: string; color: string } {
    if (p < 0.001) return { mark: '***', color: 'text-green-600' };
    if (p < 0.01)  return { mark: '**',  color: 'text-green-500' };
    if (p < 0.05)  return { mark: '*',   color: 'text-yellow-500' };
    return { mark: 'n.s.', color: 'text-muted-foreground' };
}

// ── ルールバッジ色（分類: 確信度 / 回帰: 安定度） ────────────
function confidenceBadge(conf: number | null) {
    if (conf == null) return 'secondary';
    if (conf >= 0.8) return 'default';   // 緑
    if (conf >= 0.6) return 'secondary'; // 黄
    return 'outline';                     // 灰
}

// CV = std / |prediction| による安定度 (回帰用)
function stabilityBadge(std: number, prediction: number): 'default' | 'secondary' | 'outline' {
    const cv = Math.abs(prediction) > 0.001 ? std / Math.abs(prediction) : 1;
    if (cv < 0.2) return 'default';   // 緑: 安定
    if (cv < 0.4) return 'secondary'; // 黄: 普通
    return 'outline';                  // 灰: 不安定
}
function stabilityLabel(std: number, prediction: number): string {
    const cv = Math.abs(prediction) > 0.001 ? std / Math.abs(prediction) : 1;
    if (cv < 0.2) return '高';
    if (cv < 0.4) return '中';
    return '低';
}

// ── 指標の詳細説明（ツールチップ用）────────────────────────────
const METRIC_DETAILS: Record<string, { label: string; gradient: string; description: string }> = {
    rmse: {
        label: 'RMSE',
        gradient: 'from-violet-600 to-indigo-500',
        description: '二乗平均平方根誤差（Root Mean Squared Error）。予測値と実測値の差を二乗して平均し、その平方根を取ります。0に近いほど予測精度が高く、外れ値の影響を受けやすい特性があります。単位は目的変数と同じです。',
    },
    mae: {
        label: 'MAE',
        gradient: 'from-indigo-500 to-blue-500',
        description: '平均絶対誤差（Mean Absolute Error）。予測値と実測値の差の絶対値の平均です。外れ値の影響を受けにくく、直感的な解釈が可能です。単位は目的変数と同じです。',
    },
    r2: {
        label: 'R²',
        gradient: 'from-emerald-600 to-teal-500',
        description: '決定係数（R-squared）。モデルがデータの変動をどれだけ説明できているかを示します。1.0が完全な予測、0.0がランダムと同等、負の値は予測が平均値より悪いことを意味します。回帰モデルの総合評価に使われます。',
    },
    accuracy: {
        label: 'Accuracy',
        gradient: 'from-emerald-500 to-emerald-400',
        description: '正解率（Accuracy）。全データ件数のうち正しく分類できた割合です。0〜1の範囲で1に近いほど良好です。クラスの偏りが大きいデータセットでは過大評価されやすいため、AUCと合わせて確認することを推奨します。',
    },
    auc: {
        label: 'AUC',
        gradient: 'from-purple-600 to-violet-500',
        description: 'ROC曲線下面積（Area Under the Curve）。分類モデルが正例と負例をどれだけ区別できるかを示します。1.0が完全な識別、0.5がランダムと同等です。クラス不均衡に強く、閾値非依存な評価指標として広く使われます。',
    },
};

// 指標のグラデーション背景クラスを取得する（未登録はデフォルト値を返す）
function getMetricGradient(key: string): string {
    return METRIC_DETAILS[key.toLowerCase()]?.gradient ?? 'from-gray-500 to-gray-400';
}

// 指標の詳細説明テキストを取得する
function getMetricDetailDescription(key: string): string {
    return METRIC_DETAILS[key.toLowerCase()]?.description ?? '評価指標';
}

// ── 特徴量重要度グラフのグラデーション色計算（インディゴ→エメラルド）────────
function getFeatureImportanceColor(index: number, total: number): string {
    // 上位3件はインディゴ系、残りはエメラルド系
    if (index < 3) {
        const shades = ['hsl(243,75%,55%)', 'hsl(243,70%,63%)', 'hsl(243,65%,70%)'];
        return shades[index];
    }
    const ratio = total <= 4 ? 0 : (index - 3) / (total - 4);
    // インディゴ薄め → エメラルド系へのグラデーション
    const r = Math.round(99  + (52  - 99)  * ratio);
    const g = Math.round(102 + (168 - 102) * ratio);
    const b = Math.round(241 + (83  - 241) * ratio);
    return `rgb(${r},${g},${b})`;
}

// ── 学習ジョブの型定義 ────────────────────────────────────────
interface TrainJob {
    id: number;
    status: string;
    message?: string;
    progress?: number;
    error_message?: string;
    created_at?: string;
    updated_at?: string;
}

export default function DashboardPage() {
    const params = useParams();
    const projectId = params.projectId as string;
    const [config, setConfig] = useState<any>(null);
    const [job, setJob] = useState<TrainJob | null>(null);
    const [result, setResult] = useState<any>(null);
    const [configId, setConfigId] = useState<string>("");
    const [configs, setConfigs] = useState<any[]>([]);
    // ポーリング中エラーをUI上に表示するための状態
    const [pollingError, setPollingError] = useState<string | null>(null);
    // キャンセル処理中フラグ
    const [cancelling, setCancelling] = useState(false);
    const pollingRef = useRef<NodeJS.Timeout | null>(null);
    const { alertState, showAlert, closeAlert } = useAppAlert();

    // 過去の学習ジョブ一覧（completedのみ）
    const [pastJobs, setPastJobs] = useState<TrainJob[]>([]);
    // 過去ジョブ読み込み中フラグ
    const [loadingPastJobs, setLoadingPastJobs] = useState(false);
    // 過去ジョブから選択した jobId（nullのとき最新結果を表示）
    const [selectedJobId, setSelectedJobId] = useState<number | null>(null);

    // 決定木 ReactFlow state
    const [dtNodes, setDtNodes, onDtNodesChange] = useNodesState([]);
    const [dtEdges, setDtEdges, onDtEdgesChange] = useEdgesState([]);

    useEffect(() => {
        apiClient.get(`/api/projects/${projectId}/analysis/configs`)
            .then(res => {
                setConfigs(res.data);
                const lastId = localStorage.getItem('lastAnalysisConfigId');
                if (lastId && res.data.some((c: any) => String(c.id) === lastId)) {
                    setConfigId(lastId);
                } else if (res.data.length > 0) {
                    setConfigId(String(res.data[0].id));
                }
            })
            .catch(() => {});
        // テーブル一覧を取得して値ラベルマップを構築する
        apiClient.get(`/api/projects/${projectId}/tables`)
            .then(res => setColLabelsMap(buildColLabelsMap(res.data)))
            .catch(() => {}) // ラベルマップ取得失敗はサイレントに無視
    }, [projectId]);

    // configId が変わったら過去ジョブ一覧を再取得する
    useEffect(() => {
        if (!configId) {
            setPastJobs([]);
            return;
        }
        fetchPastJobs(configId);
    }, [configId, projectId]);

    // 指定した configId に紐づく完了済みジョブ一覧を取得する
    const fetchPastJobs = async (cid: string) => {
        setLoadingPastJobs(true);
        try {
            // config ごとのジョブ一覧を取得するエンドポイント
            const res = await apiClient.get(`/api/projects/${projectId}/train/jobs`, {
                params: { config_id: cid },
            });
            // completedのジョブのみ絞り込み、新しい順に並べる
            const completed = (res.data as TrainJob[])
                .filter(j => j.status === 'completed')
                .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
            setPastJobs(completed);
        } catch {
            // エンドポイントが未実装またはエラーの場合は空リストとして扱う
            setPastJobs([]);
        } finally {
            setLoadingPastJobs(false);
        }
    };

    const startTraining = async () => {
        if (!configId) {
            showAlert("設定が未選択", "分析設定を選択してください。");
            return;
        }

        // 学習開始時にポーリングエラーと選択ジョブをリセット
        setPollingError(null);
        setSelectedJobId(null);

        try {
            const response = await apiClient.post(`/api/projects/${projectId}/train/run/${configId}`);
            setJob(response.data);
            setResult(null); // 結果をリセット
            startPolling(response.data.id);
        } catch (error: any) {
            console.error("Start training failed", error);
            const msg = error.response?.data?.detail || error.message || "不明なエラー";
            showAlert("学習開始エラー", `学習開始に失敗しました。\nエラー: ${msg}`);
        }
    };

    // 学習をキャンセルする
    const cancelTraining = async () => {
        if (!job) return;
        setCancelling(true);
        try {
            await apiClient.post(`/api/projects/${projectId}/train/cancel/${job.id}`);
            // キャンセル成功後はポーリングを停止してUIをリセット
            if (pollingRef.current) clearInterval(pollingRef.current);
            setJob(null);
            setPollingError(null);
        } catch (error: any) {
            console.error("Cancel training failed", error);
            const msg = error.response?.data?.detail || error.message || "キャンセルに失敗しました";
            showAlert("キャンセルエラー", msg);
        } finally {
            setCancelling(false);
        }
    };

    const startPolling = (jobId: number) => {
        if (pollingRef.current) clearInterval(pollingRef.current);

        pollingRef.current = setInterval(async () => {
            try {
                const res = await apiClient.get(`/api/projects/${projectId}/train/status/${jobId}`);
                setJob(res.data);

                if (res.data.status === "completed") {
                    clearInterval(pollingRef.current!);
                    fetchResult(jobId);
                    // 完了後に過去ジョブ一覧を更新する
                    fetchPastJobs(configId);
                    // 学習完了通知を送る
                    addNotification('train', '学習が完了しました');
                } else if (res.data.status === "failed") {
                    clearInterval(pollingRef.current!);
                }
            } catch (err: any) {
                // ポーリングエラーはコンソールに加えて状態変数にも設定してUIに表示する
                console.error("Polling error", err);
                const msg = err?.response?.data?.detail || err?.message || "ステータス確認中にエラーが発生しました";
                setPollingError(msg);
                clearInterval(pollingRef.current!);
            }
        }, 1000);
    };

    const fetchResult = async (jobId: number) => {
        try {
            const res = await apiClient.get(`/api/projects/${projectId}/train/result/${jobId}`);
            setResult(res.data);

            // 決定木の可視化データを生成
            if (res.data.tree_structure) {
                const rawNodes: Node[] = [];
                const rawEdges: Edge[] = [];
                flattenTree(res.data.tree_structure, rawNodes, rawEdges);
                const { nodes: ln, edges: le } = layoutTree(rawNodes, rawEdges);
                setDtNodes(ln);
                setDtEdges(le);
            }
        } catch (err) {
            console.error("Fetch result failed", err);
        }
    };

    // 過去ジョブを選択して結果を表示する
    const handleSelectPastJob = (jobId: number) => {
        setSelectedJobId(jobId);
        // 実行中の学習があればポーリングを停止せずに結果だけ切り替える
        fetchResult(jobId);
    };

    // Cleanup
    useEffect(() => {
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, []);

    // シミュレーション用の特徴量値（特徴量名 → 入力値）
    const [simValues, setSimValues] = useState<Record<string, number>>({})
    // カラム物理名 → 値ラベル辞書のマップ（テーブル一覧から構築）
    const [colLabelsMap, setColLabelsMap] = useState<Record<string, Record<string, string>>>({})

    // 特徴量重要度グラフの高さをデータ件数に応じて動的に計算する（件数×28px、最小300px）
    const featureImportanceChartHeight = useMemo(() => {
        if (!result?.feature_importance) return 300;
        const count = Math.min(result.feature_importance.length, 20);
        return Math.max(count * 28, 300);
    }, [result?.feature_importance]);

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">分析ダッシュボード</h1>
                <div className="flex gap-2">
                    {/* 分析設定選択 */}
                    <Select value={configId} onValueChange={setConfigId} disabled={configs.length === 0}>
                        <SelectTrigger className="w-56 bg-white">
                            <SelectValue placeholder={configs.length === 0 ? "分析設定がありません" : "設定を選択"} />
                        </SelectTrigger>
                        <SelectContent>
                            {configs.map((c) => (
                                <SelectItem key={c.id} value={String(c.id)}>
                                    {c.name || `設定 #${c.id}`}
                                    <span className="ml-1.5 text-xs text-muted-foreground">({c.task_type === 'classification' ? '分類' : c.task_type === 'regression' ? '回帰' : c.task_type})</span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button onClick={startTraining} disabled={!configId || (job !== null && (job.status === "running" || job.status === "pending"))} className="bg-primary hover:opacity-90 text-primary-foreground">
                        {job !== null && (job.status === "running" || job.status === "pending") ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                        学習実行
                    </Button>
                    {/* 学習中・待機中のときのみキャンセルボタンを表示 */}
                    {job !== null && (job.status === "running" || job.status === "pending") && (
                        <Button
                            variant="outline"
                            onClick={cancelTraining}
                            disabled={cancelling}
                            className="border-destructive text-destructive hover:bg-destructive/10"
                        >
                            {cancelling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                            {cancelling ? "キャンセル中..." : "キャンセル"}
                        </Button>
                    )}
                </div>
            </div>

            {/* ポーリングエラー表示 */}
            {pollingError && (
                <Alert variant="destructive">
                    <AlertTitle>ステータス取得エラー</AlertTitle>
                    <AlertDescription>
                        {pollingError}
                        <Button
                            variant="link"
                            size="sm"
                            className="ml-2 p-0 h-auto text-destructive underline"
                            onClick={() => setPollingError(null)}
                        >
                            閉じる
                        </Button>
                    </AlertDescription>
                </Alert>
            )}

            {/* ── 過去の学習結果セクション ─────────────────────────────── */}
            {configId && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <History className="w-4 h-4 text-muted-foreground" />
                            過去の学習結果
                        </CardTitle>
                        <CardDescription>
                            選択中の設定で完了した学習ジョブ一覧。クリックして結果を切り替えられます。
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loadingPastJobs ? (
                            // ジョブ一覧読み込み中のスピナー
                            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                読み込み中...
                            </div>
                        ) : pastJobs.length === 0 ? (
                            // 完了済みジョブが存在しない場合のメッセージ
                            <p className="text-sm text-muted-foreground py-2">
                                この設定の完了済み学習ジョブはまだありません。「学習実行」ボタンで学習を開始してください。
                            </p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {pastJobs.map((j) => {
                                    // 選択中かどうかを判定（selectedJobId がない場合は最新ジョブを選択中扱い）
                                    const isSelected =
                                        selectedJobId != null
                                            ? j.id === selectedJobId
                                            : j.id === pastJobs[0]?.id && result != null;
                                    return (
                                        <button
                                            key={j.id}
                                            onClick={() => handleSelectPastJob(j.id)}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-colors
                                                ${isSelected
                                                    ? 'bg-primary text-primary-foreground border-primary font-semibold'
                                                    : 'bg-white border-border text-foreground hover:bg-secondary/60'
                                                }`}
                                        >
                                            <ChevronRight className="w-3.5 h-3.5" />
                                            Job #{j.id}
                                            {j.created_at && (
                                                <span className={`text-xs ${isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                                                    {new Date(j.created_at).toLocaleString('ja-JP', {
                                                        month: '2-digit', day: '2-digit',
                                                        hour: '2-digit', minute: '2-digit',
                                                    })}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Status Card */}
            {job && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex justify-between">
                            ステータス: <span className={`font-semibold ${job.status === 'running' ? 'text-primary' :
                                job.status === 'completed' ? 'text-primary' :
                                    job.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'
                                }`}>{job.status === 'running' ? '実行中' : job.status === 'completed' ? '完了' : job.status === 'failed' ? '失敗' : job.status}</span>
                        </CardTitle>
                        <CardDescription>{job.message}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Progress value={job.progress} className="h-2" />
                        {job.error_message && (
                            <Alert variant="destructive" className="mt-4">
                                <AlertTitle>学習エラー</AlertTitle>
                                <AlertDescription>{job.error_message}</AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Result Section */}
            {result && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                    {/* AI Analysis Insight */}
                    {result.ai_analysis_text && (
                        <div className="col-span-1 md:col-span-2">
                            <Card className="border-primary/20 bg-primary/5">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-primary">
                                        <Sparkles className="w-5 h-5 text-yellow-500 fill-yellow-500" /> AI アナリティクス・インサイト
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed">
                                        <ReactMarkdown>{stripTablePrefix(result.ai_analysis_text)}</ReactMarkdown>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* ── 評価指標カード（グラデーション背景） ──────────────── */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <TrendingUp className="w-5 h-5" /> 評価指標
                            </CardTitle>
                            {result.model_type && (
                                <div className="flex items-center gap-1.5 pt-0.5">
                                    <span className="text-xs text-muted-foreground">使用モデル:</span>
                                    <Badge variant="outline" className="text-xs h-5 bg-white">
                                        {{
                                            gradient_boosting: '勾配ブースティング (LightGBM)',
                                            logistic_regression: 'ロジスティック回帰 / 線形回帰',
                                        }[result.model_type as string] ?? result.model_type}
                                    </Badge>
                                </div>
                            )}
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-4">
                                <TooltipProvider>
                                    {Object.entries(result.metrics).map(([key, value]: [string, any]) => {
                                        const gradient = getMetricGradient(key);
                                        const detail = getMetricDetailDescription(key);
                                        return (
                                            <Tooltip key={key}>
                                                <TooltipTrigger asChild>
                                                    {/* グラデーション背景カード */}
                                                    <div className={`bg-gradient-to-br ${gradient} p-4 rounded-xl text-center cursor-help transition-opacity hover:opacity-90 shadow-sm`}>
                                                        <div className="text-xs text-white/80 uppercase font-semibold flex items-center justify-center gap-1 mb-1">
                                                            {key} <HelpCircle className="w-3 h-3" />
                                                        </div>
                                                        {/* 数値を大きく強調 */}
                                                        <div className="text-3xl font-bold text-white drop-shadow">
                                                            {typeof value === 'number' ? value.toFixed(4) : value}
                                                        </div>
                                                    </div>
                                                </TooltipTrigger>
                                                <TooltipContent className="max-w-xs text-xs leading-relaxed">
                                                    <p>{detail}</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        );
                                    })}
                                </TooltipProvider>
                            </div>
                        </CardContent>
                    </Card>

                    {/* ── 特徴量重要度グラフ（上位20件・グラデーション・動的高さ） ─ */}
                    <Card className="col-span-1 md:col-span-2 lg:col-span-1">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <BarChart2 className="w-5 h-5" /> 重要特徴量
                            </CardTitle>
                            <CardDescription>モデルの予測に寄与した上位20件の特徴量</CardDescription>
                        </CardHeader>
                        {/* グラフ高さはデータ件数×28px（最小300px）で動的に変わる */}
                        <CardContent style={{ height: featureImportanceChartHeight + 40 }}>
                            <ResponsiveContainer width="100%" height={featureImportanceChartHeight}>
                                <BarChart
                                    data={result.feature_importance.slice(0, 20).map((item: any) => ({
                                        ...item,
                                        feature: stripTablePrefix(item.feature)
                                    }))}
                                    layout="vertical"
                                    margin={{ top: 5, right: 80, left: 40, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                    <XAxis type="number" />
                                    <YAxis type="category" dataKey="feature" width={150} tick={{ fontSize: 11 }} />
                                    {/* バーホバー時のツールチップ */}
                                    <RechartsTooltip
                                        formatter={(value: any) => [
                                            typeof value === 'number' ? value.toFixed(4) : value,
                                            '重要度'
                                        ]}
                                        contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #ddd' }}
                                    />
                                    <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
                                        {/* 青→水色のグラデーション色をインデックスに応じて設定 */}
                                        {result.feature_importance.slice(0, 20).map((_entry: any, index: number) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={getFeatureImportanceColor(index, Math.min(result.feature_importance.length, 20))}
                                            />
                                        ))}
                                        {/* バーの右端に重要度の数値を表示 */}
                                        <LabelList
                                            dataKey="importance"
                                            position="right"
                                            formatter={(v: unknown) => typeof v === 'number' ? v.toFixed(3) : String(v)}
                                            style={{ fontSize: 10, fill: '#64748b' }}
                                        />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    {/* 係数統計 — 線形モデルで coef_stats が未計算の場合の注意表示 */}
                    {result.model_type === 'logistic_regression' && (!result.coef_stats || result.coef_stats.length === 0) && (
                        <Card className="col-span-1 md:col-span-2" style={{ borderColor: 'var(--warning)', background: 'var(--warning-muted)' }}>
                            <CardContent className="pt-4 pb-3">
                                <p className="text-sm" style={{ color: 'var(--warning-foreground)' }}>
                                    <span className="font-semibold">係数統計（p値・信頼区間）</span>はまだ計算されていません。<br />
                                    「学習実行」ボタンで再実行すると、この欄に統計量が表示されます。
                                </p>
                            </CardContent>
                        </Card>
                    )}

                    {/* 係数統計 (線形モデルのみ) */}
                    {result.model_type === 'logistic_regression' && result.coef_stats && result.coef_stats.length > 0 && (
                        <Card className="col-span-1 md:col-span-2">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Table2 className="w-5 h-5" /> 係数統計
                                </CardTitle>
                                <CardDescription>
                                    {result.coef_stats[0]?.odds_ratio != null
                                        ? '各特徴量のオッズ比・p値・95%信頼区間（ロジスティック回帰）。OR>1 でリスク増加、OR<1 でリスク低下を示します。'
                                        : '各特徴量の標準化偏回帰係数・p値・95%信頼区間（線形回帰）。係数の絶対値が大きいほど影響が強い特徴量です。'}
                                    <span className="ml-2 text-xs text-muted-foreground">*** p&lt;0.001　** p&lt;0.01　* p&lt;0.05　n.s. 非有意</span>
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="border-b bg-secondary/30 text-left">
                                                <th className="px-3 py-2 font-medium text-muted-foreground">特徴量</th>
                                                {result.coef_stats[0]?.odds_ratio != null ? (
                                                    <>
                                                        <th className="px-3 py-2 font-medium text-muted-foreground text-right">オッズ比 (OR)</th>
                                                        <th className="px-3 py-2 font-medium text-muted-foreground text-right">95%信頼区間</th>
                                                    </>
                                                ) : (
                                                    <>
                                                        <th className="px-3 py-2 font-medium text-muted-foreground text-right">標準化偏回帰係数 (β)</th>
                                                        <th className="px-3 py-2 font-medium text-muted-foreground text-right">95%信頼区間</th>
                                                    </>
                                                )}
                                                <th className="px-3 py-2 font-medium text-muted-foreground text-right">p値</th>
                                                <th className="px-3 py-2 font-medium text-muted-foreground text-center">有意性</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {result.coef_stats.slice(0, 20).map((row: any, idx: number) => {
                                                const sig = pValueLabel(row.p_value);
                                                const isOdds = row.odds_ratio != null;
                                                const mainVal = isOdds ? row.odds_ratio : row.coef;
                                                const isSignificant = row.p_value < 0.05;
                                                return (
                                                    <tr key={idx} className={`border-b transition-colors hover:bg-secondary/10 ${isSignificant ? '' : 'opacity-60'}`}>
                                                        <td className="px-3 py-2 font-mono text-xs max-w-[200px] truncate" title={stripTablePrefix(row.feature)}>
                                                            {stripTablePrefix(row.feature)}
                                                        </td>
                                                        <td className={`px-3 py-2 text-right font-semibold tabular-nums ${mainVal > 1 || mainVal >= 0 ? 'text-destructive' : 'text-primary'}`}>
                                                            {mainVal.toFixed(3)}
                                                        </td>
                                                        <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">
                                                            [{row.ci_lower.toFixed(3)}, {row.ci_upper.toFixed(3)}]
                                                        </td>
                                                        <td className="px-3 py-2 text-right tabular-nums text-xs">
                                                            {row.p_value < 0.001 ? '< 0.001' : row.p_value.toFixed(3)}
                                                        </td>
                                                        <td className={`px-3 py-2 text-center font-bold text-sm ${sig.color}`}>
                                                            {sig.mark}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* 数式の出力 — 線形/ロジスティック回帰のcoef_statsがある場合のみ表示 */}
                    {result.model_type === 'logistic_regression' && result.coef_stats && result.coef_stats.length > 0 && (
                        <Card className="col-span-1 md:col-span-2">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <ListTree className="w-5 h-5" /> 数式
                                </CardTitle>
                                <CardDescription>
                                    {result.coef_stats[0]?.odds_ratio != null
                                        ? 'ロジスティック回帰の対数オッズ式（log-odds = Σ coef * x + const）'
                                        : '線形回帰の予測式（y = Σ coef * x + const）'}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {(() => {
                                    // intercept（定数項）を探す
                                    const intercept = result.coef_stats.find((r: any) =>
                                        r.feature === 'const' || r.feature === 'Intercept' || r.feature === 'intercept'
                                    )
                                    // 説明変数のみ抽出する
                                    const features = result.coef_stats.filter((r: any) =>
                                        r.feature !== 'const' && r.feature !== 'Intercept' && r.feature !== 'intercept'
                                    )
                                    const isOdds = result.coef_stats[0]?.odds_ratio != null
                                    // 数式文字列を組み立てる
                                    const terms = features
                                        .filter((r: any) => r.coef != null)
                                        .map((r: any) => {
                                            const coef = (r.coef as number).toFixed(4)
                                            const fname = stripTablePrefix(r.feature)
                                            return `  ${Number(coef) >= 0 ? '+' : ''}${coef} × ${fname}`
                                        })
                                    const interceptTerm = intercept?.coef != null
                                        ? `  ${Number(intercept.coef.toFixed(4)) >= 0 ? '+' : ''}${intercept.coef.toFixed(4)}`
                                        : ''
                                    const lhs = isOdds ? 'log-odds' : 'y'
                                    const formula = `${lhs} =\n${terms.join('\n')}${interceptTerm}`
                                    return (
                                        <div className="relative">
                                            <pre className="text-xs font-mono bg-muted rounded-lg p-4 overflow-x-auto whitespace-pre leading-relaxed text-foreground max-h-64 overflow-y-auto">
                                                {formula}
                                            </pre>
                                            <button
                                                className="absolute top-2 right-2 text-[10px] px-2 py-0.5 bg-background border border-border rounded text-muted-foreground hover:text-foreground transition-colors"
                                                onClick={() => navigator.clipboard.writeText(formula)}
                                            >
                                                コピー
                                            </button>
                                        </div>
                                    )
                                })()}
                            </CardContent>
                        </Card>
                    )}

                    {/* 値のシミュレーション — 線形/ロジスティック回帰のcoef_statsがある場合のみ表示 */}
                    {result.model_type === 'logistic_regression' && result.coef_stats && result.coef_stats.length > 0 && (
                        <Card className="col-span-1 md:col-span-2">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Sparkles className="w-5 h-5" /> 値のシミュレーション
                                </CardTitle>
                                <CardDescription>
                                    特徴量の値を変えて予測値をシミュレーションします（係数×入力値の合計）
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {(() => {
                                    // 説明変数のみ（intercept を除く）
                                    const features = result.coef_stats.filter((r: any) =>
                                        r.feature !== 'const' && r.feature !== 'Intercept' && r.feature !== 'intercept'
                                    )
                                    const intercept = result.coef_stats.find((r: any) =>
                                        r.feature === 'const' || r.feature === 'Intercept' || r.feature === 'intercept'
                                    )
                                    const isOdds = result.coef_stats[0]?.odds_ratio != null

                                    // 予測値を計算する（線形: y = Σcoef*x + intercept, ロジスティック: sigmoid(Σcoef*x + intercept)）
                                    const logOdds = features.reduce((sum: number, r: any) => {
                                        const labels = colLabelsMap[stripTablePrefix(r.feature)]
                                        // ラベルがある場合は最初のキーを数値デフォルトにして表示と計算を一致させる
                                        const defaultVal = labels
                                            ? (parseFloat(Object.keys(labels)[0] ?? '0') || 0)
                                            : 0
                                        const val = simValues[r.feature] ?? defaultVal
                                        return sum + (r.coef ?? 0) * val
                                    }, intercept?.coef ?? 0)

                                    const predicted = isOdds
                                        ? (1 / (1 + Math.exp(-logOdds)))  // シグモイド関数で確率に変換
                                        : logOdds

                                    return (
                                        <div className="space-y-4">
                                            {/* 予測値表示 */}
                                            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-center">
                                                <p className="text-xs text-muted-foreground mb-1">
                                                    {isOdds ? '予測確率' : '予測値'}
                                                </p>
                                                <p className="text-3xl font-bold font-mono text-primary tabular-nums">
                                                    {isOdds
                                                        ? `${(predicted * 100).toFixed(2)}%`
                                                        : predicted.toFixed(4)}
                                                </p>
                                            </div>

                                            {/* 特徴量入力 */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                                                {features.slice(0, 20).map((r: any) => {
                                                    const fname = stripTablePrefix(r.feature)
                                                    const val = simValues[r.feature] ?? 0
                                                    // カラム名からラベルマップを取得する（テーブルプレフィックスを除去して照合）
                                                    const labels = colLabelsMap[stripTablePrefix(r.feature)]
                                                    return (
                                                        <div key={r.feature} className="flex items-center gap-2">
                                                            <span className="text-xs font-mono text-muted-foreground truncate flex-1 min-w-0" title={fname}>
                                                                {fname}
                                                            </span>
                                                            {labels ? (
                                                                // カテゴリ値ラベルがある場合はドロップダウンを表示する（キーは数値文字列）
                                                                <select
                                                                    value={String(simValues[r.feature] ?? Object.keys(labels)[0] ?? '0')}
                                                                    onChange={(e) => {
                                                                        const num = parseFloat(e.target.value)
                                                                        setSimValues(prev => ({
                                                                            ...prev,
                                                                            [r.feature]: isNaN(num) ? 0 : num,
                                                                        }))
                                                                    }}
                                                                    className="w-32 h-7 text-xs border border-border rounded px-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                                                                >
                                                                    {Object.entries(labels).map(([rawVal, label]) => (
                                                                        <option key={rawVal} value={rawVal}>{label}</option>
                                                                    ))}
                                                                </select>
                                                            ) : (
                                                                // ラベルなしの場合は数値入力（既存のまま）
                                                                <input
                                                                    type="number"
                                                                    step="any"
                                                                    value={val}
                                                                    onChange={(e) => {
                                                                        const num = parseFloat(e.target.value)
                                                                        setSimValues(prev => ({
                                                                            ...prev,
                                                                            [r.feature]: isNaN(num) ? 0 : num,
                                                                        }))
                                                                    }}
                                                                    className="w-24 h-7 text-xs font-mono border border-border rounded px-2 text-right bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                                                                />
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                            </div>

                                            {features.length > 20 && (
                                                <p className="text-xs text-muted-foreground text-center">
                                                    上位20件の特徴量のみ表示しています
                                                </p>
                                            )}

                                            {/* リセットボタン */}
                                            <button
                                                className="text-xs text-muted-foreground hover:text-foreground underline"
                                                onClick={() => setSimValues({})}
                                            >
                                                すべて0にリセット
                                            </button>
                                        </div>
                                    )
                                })()}
                            </CardContent>
                        </Card>
                    )}

                    {/* 決定木 可視化 */}
                    {result.model_type !== 'logistic_regression' && result.tree_structure && dtNodes.length > 0 && (
                        <Card className="col-span-1 md:col-span-2">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <GitBranch className="w-5 h-5" /> 決定木 可視化
                                </CardTitle>
                                <CardDescription>
                                    最大深度 5 の決定木。青=分岐ノード（条件）、緑=葉ノード（予測結果）。ドラッグ・スクロールで移動/ズームできます。
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div style={{ height: 520 }} className="rounded-b-lg overflow-hidden border-t">
                                    <ReactFlow
                                        nodes={dtNodes}
                                        edges={dtEdges}
                                        onNodesChange={onDtNodesChange}
                                        onEdgesChange={onDtEdgesChange}
                                        nodeTypes={dtNodeTypes}
                                        fitView
                                        fitViewOptions={{ padding: 0.2 }}
                                        nodesDraggable={false}
                                        nodesConnectable={false}
                                        elementsSelectable={false}
                                    >
                                        <Background gap={16} size={1} color="#e2e8f0" />
                                        <Controls showInteractive={false} />
                                    </ReactFlow>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* 分岐ルール一覧 */}
                    {result.model_type !== 'logistic_regression' && result.decision_rules && result.decision_rules.length > 0 && (
                        <Card className="col-span-1 md:col-span-2">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <ListTree className="w-5 h-5" /> 分岐ルール一覧
                                </CardTitle>
                                <CardDescription>
                                    決定木から抽出した IF/THEN ルール
                                    {result.decision_rules[0]?.confidence != null
                                        ? '（確信度の高い順）'
                                        : '（安定度の高い順）'}
                                    。各ルールは葉ノードまでの条件パスを表します。
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                                    {[...result.decision_rules]
                                        .sort((a: any, b: any) =>
                                            a.confidence != null
                                                ? (b.confidence ?? 0) - (a.confidence ?? 0)   // 分類: 確信度降順
                                                : (a.std ?? Infinity) - (b.std ?? Infinity)   // 回帰: std昇順（安定順）
                                        )
                                        .map((rule: any, idx: number) => (
                                            <div key={idx} className="border rounded-lg p-3 bg-secondary/20 hover:bg-secondary/40 transition-colors">
                                                <div className="flex flex-wrap gap-1 mb-2">
                                                    {rule.conditions.map((cond: string, ci: number) => (
                                                        <span key={ci} className="inline-flex items-center gap-1 text-xs font-mono bg-card border rounded px-2 py-0.5">
                                                            {ci > 0 && <span className="text-muted-foreground font-sans">AND</span>}
                                                            {stripTablePrefix(cond)}
                                                        </span>
                                                    ))}
                                                </div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-xs text-muted-foreground">→ 予測:</span>
                                                    <span className="font-semibold text-sm">{String(rule.prediction)}</span>
                                                    {rule.confidence != null && (
                                                        <Badge variant={confidenceBadge(rule.confidence) as any} className="text-xs">
                                                            確信度 {Math.round(rule.confidence * 100)}%
                                                        </Badge>
                                                    )}
                                                    {rule.std != null && (
                                                        <Badge variant={stabilityBadge(rule.std, rule.prediction)} className="text-xs">
                                                            安定度:{stabilityLabel(rule.std, rule.prediction)} &nbsp;±{rule.std}
                                                        </Badge>
                                                    )}
                                                    <span className="text-xs text-muted-foreground ml-auto">n={rule.samples.toLocaleString()}</span>
                                                </div>
                                            </div>
                                        ))
                                    }
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

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
