"use client"

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Play, CircleNotch, Question, GitBranch, ListBullets, Table, Stethoscope } from '@phosphor-icons/react';
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
import { buildColLabelsMap, stripTablePrefix } from "@/lib/labelUtils"
import { JobStatusCard, JobStatus } from "@/components/job-status-card"

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
            style: { stroke: '#a1a1aa', strokeWidth: 1.5 },
            labelStyle: { fontSize: 10, fill: '#71717a' },
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
function pValueLabel(p: number | null | undefined): { mark: string; color: string } {
    if (p == null) return { mark: '—', color: 'text-muted-foreground' };
    if (p < 0.001) return { mark: '***', color: 'text-green-600' };
    if (p < 0.01)  return { mark: '**',  color: 'text-green-500' };
    if (p < 0.05)  return { mark: '*',   color: 'text-yellow-500' };
    return { mark: 'n.s.', color: 'text-muted-foreground' };
}

// ── ルールバッジ色（分類: 確信度 / 回帰: 安定度） ────────────
function confidenceBadge(conf: number | null) {
    if (conf == null) return 'secondary';
    if (conf >= 0.8) return 'default';
    if (conf >= 0.6) return 'secondary';
    return 'outline';
}

// CV = std / |prediction| による安定度 (回帰用)
function stabilityBadge(std: number, prediction: number): 'default' | 'secondary' | 'outline' {
    const cv = Math.abs(prediction) > 0.001 ? std / Math.abs(prediction) : 1;
    if (cv < 0.2) return 'default';
    if (cv < 0.4) return 'secondary';
    return 'outline';
}
function stabilityLabel(std: number, prediction: number): string {
    const cv = Math.abs(prediction) > 0.001 ? std / Math.abs(prediction) : 1;
    if (cv < 0.2) return '高';
    if (cv < 0.4) return '中';
    return '低';
}

// ── 指標の詳細説明（ツールチップ用）────────────────────────────
const METRIC_DETAILS: Record<string, { label: string; description: string; unit?: string }> = {
    rmse: {
        label: 'RMSE',
        description: '二乗平均平方根誤差（Root Mean Squared Error）。予測値と実測値の差を二乗して平均し、その平方根を取ります。0に近いほど予測精度が高く、外れ値の影響を受けやすい特性があります。単位は目的変数と同じです。',
    },
    mae: {
        label: 'MAE',
        description: '平均絶対誤差（Mean Absolute Error）。予測値と実測値の差の絶対値の平均です。外れ値の影響を受けにくく、直感的な解釈が可能です。単位は目的変数と同じです。',
    },
    r2: {
        label: 'R²',
        description: '決定係数（R-squared）。モデルがデータの変動をどれだけ説明できているかを示します。1.0が完全な予測、0.0がランダムと同等、負の値は予測が平均値より悪いことを意味します。回帰モデルの総合評価に使われます。',
        unit: '',
    },
    accuracy: {
        label: 'Accuracy',
        description: '正解率（Accuracy）。全データ件数のうち正しく分類できた割合です。0〜1の範囲で1に近いほど良好です。クラスの偏りが大きいデータセットでは過大評価されやすいため、AUCと合わせて確認することを推奨します。',
    },
    auc: {
        label: 'AUC',
        description: 'ROC曲線下面積（Area Under the Curve）。分類モデルが正例と負例をどれだけ区別できるかを示します。1.0が完全な識別、0.5がランダムと同等です。クラス不均衡に強く、閾値非依存な評価指標として広く使われます。',
    },
};

function getMetricDetailDescription(key: string): string {
    return METRIC_DETAILS[key.toLowerCase()]?.description ?? '評価指標';
}

function getMetricLabel(key: string): string {
    return METRIC_DETAILS[key.toLowerCase()]?.label ?? key.toUpperCase();
}

// ── 特徴量重要度バーの色（1位: amber、残り: zinc） ─────────────
function getFeatureImportanceColor(index: number): string {
    if (index === 0) return '#d97706'; // amber-600（最重要特徴量）
    return '#52525b';                  // zinc-600（それ以外）
}

// ── 学習結果のメトリクスを1行の文字列にまとめる（JobStatusCard用）────────
function buildMetricsLabel(res: any): string | null {
    if (!res?.metrics) return null;
    const parts: string[] = [];
    if (res.metrics.r2 != null)       parts.push(`R² = ${res.metrics.r2.toFixed(3)}`);
    if (res.metrics.rmse != null)     parts.push(`RMSE = ${res.metrics.rmse.toFixed(2)}`);
    if (res.metrics.accuracy != null) parts.push(`Accuracy = ${(res.metrics.accuracy * 100).toFixed(1)}%`);
    if (res.metrics.auc != null)      parts.push(`AUC = ${res.metrics.auc.toFixed(3)}`);
    return parts.length > 0 ? parts.join('  |  ') : null;
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
    const resultRef = useRef<HTMLDivElement>(null);
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
            const res = await apiClient.get(`/api/projects/${projectId}/train/jobs`, {
                params: { config_id: cid },
            });
            // completedのジョブのみ絞り込み、新しい順に並べる
            const completed = (res.data as TrainJob[])
                .filter(j => j.status === 'completed')
                .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
            setPastJobs(completed);
        } catch {
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
            setResult(null);
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
                    fetchPastJobs(configId);
                    // 通知処理のエラーがポーリング全体を止めないよう分離する
                    try { addNotification('train', '学習が完了しました') } catch { /* ignore */ }
                } else if (res.data.status === "failed") {
                    clearInterval(pollingRef.current!);
                }
            } catch (err: any) {
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

    // SHAP チャートの高さをデータ件数に応じて動的に計算する（件数×28px、最小300px）
    const shapChartHeight = useMemo(() => {
        if (!result?.shap_importance) return 300;
        const count = Math.min(result.shap_importance.length, 20);
        return Math.max(count * 28, 300);
    }, [result?.shap_importance]);

    // 学習実行ボタンが無効化される理由（null の場合は有効）
    const trainDisabledReason = !configId
        ? "分析設定を選択してください"
        : (job?.status === "pending" || job?.status === "running")
            ? "学習が実行中です"
            : null;

    return (
        <div className="space-y-8 animate-fade-in">
            {/* ── ページヘッダー ─────────────────────────────────────── */}
            <div className="flex justify-between items-center pb-4 border-b border-zinc-200">
                <div>
                    <h1 className="text-xl font-semibold text-zinc-900">分析ダッシュボード</h1>
                    <p className="text-sm text-zinc-500 mt-0.5">モデルの学習・評価・結果確認</p>
                </div>
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
                    {/* 学習実行ボタン：無効時はツールチップで理由を表示 */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className={trainDisabledReason ? "cursor-not-allowed inline-flex" : "inline-flex"}>
                                <Button onClick={startTraining} disabled={!!trainDisabledReason} className="bg-primary hover:opacity-90 text-primary-foreground">
                                    {job !== null && (job.status === "running" || job.status === "pending")
                                        ? <CircleNotch className="w-4 h-4 mr-2 animate-spin" weight="bold" />
                                        : <Play className="w-4 h-4 mr-2" weight="fill" />}
                                    学習実行
                                </Button>
                            </span>
                        </TooltipTrigger>
                        {trainDisabledReason && (
                            <TooltipContent>{trainDisabledReason}</TooltipContent>
                        )}
                    </Tooltip>
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

            {/* ── 過去の学習結果 ─────────────────────────────────────── */}
            {configId && (
                <section className="py-5 border-b border-zinc-100">
                    <h2 className="text-sm font-medium text-zinc-700 mb-3">過去の学習結果</h2>
                    {loadingPastJobs ? (
                        <div className="flex items-center gap-2 text-sm text-zinc-400 py-1">
                            <CircleNotch className="w-4 h-4 animate-spin" weight="bold" />
                            読み込み中...
                        </div>
                    ) : pastJobs.length === 0 ? (
                        <p className="text-sm text-zinc-400 py-1">
                            この設定の完了済み学習ジョブはまだありません。「学習実行」ボタンで学習を開始してください。
                        </p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {pastJobs.map((j) => {
                                const isSelected =
                                    selectedJobId != null
                                        ? j.id === selectedJobId
                                        : j.id === pastJobs[0]?.id && result != null;
                                return (
                                    <button
                                        key={j.id}
                                        onClick={() => handleSelectPastJob(j.id)}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded border text-sm transition-colors
                                            ${isSelected
                                                ? 'border-amber-500 bg-amber-50 text-amber-900 font-medium'
                                                : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400'
                                            }`}
                                    >
                                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isSelected ? 'bg-amber-500' : 'bg-zinc-300'}`} />
                                        Job #{j.id}
                                        {j.created_at && (
                                            <span className={`text-xs ${isSelected ? 'text-amber-700' : 'text-zinc-400'}`}>
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
                </section>
            )}

            {/* ジョブステータス */}
            {job && (
                <JobStatusCard
                    status={job.status as JobStatus}
                    message={job.error_message ?? job.message ?? null}
                    metricsLabel={job.status === "completed" ? buildMetricsLabel(result) : null}
                    onCancel={job.status === "running" || job.status === "pending" ? cancelTraining : undefined}
                    onRetry={job.status === "failed" ? () => startTraining() : undefined}
                    onScrollToResult={job.status === "completed" ? () => resultRef.current?.scrollIntoView({ behavior: "smooth" }) : undefined}
                    className="mb-6"
                />
            )}

            {/* ── 学習結果 ──────────────────────────────────────────── */}
            {result && (
                <div ref={resultRef} className="space-y-10">

                    {/* モデル診断レポート */}
                    {result.ai_analysis_text && (
                        <section className="border-l-4 border-amber-400 pl-5 py-1">
                            <details>
                                <summary className="flex items-center gap-1.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden py-2">
                                    <Stethoscope className="w-4 h-4 text-amber-500" weight="fill" />
                                    <h2 className="text-sm font-medium text-zinc-700">モデル診断レポート</h2>
                                    <span className="text-xs text-zinc-400 ml-1">（クリックで展開）</span>
                                </summary>
                                <div className="prose prose-sm max-w-none text-zinc-600 leading-relaxed mt-3">
                                    <ReactMarkdown>{stripTablePrefix(result.ai_analysis_text)}</ReactMarkdown>
                                </div>
                            </details>
                        </section>
                    )}

                    {/* ── 評価指標 ──────────────────────────────────── */}
                    <section className="py-5 border-b border-zinc-100">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm font-medium text-zinc-700">評価指標</h2>
                            {result.model_type && (
                                <span className="text-xs text-zinc-400 border border-zinc-200 rounded px-2 py-0.5 bg-white">
                                    {{
                                        gradient_boosting: '勾配ブースティング (LightGBM)',
                                        logistic_regression: 'ロジスティック回帰 / 線形回帰',
                                    }[result.model_type as string] ?? result.model_type}
                                </span>
                            )}
                        </div>
                        {/* インラインメトリクス — グラデーション背景カードを廃止 */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-zinc-200 rounded-lg overflow-hidden border border-zinc-200">
                            {Object.entries(result.metrics).map(([key, value]: [string, any]) => {
                                const detail = getMetricDetailDescription(key);
                                const label = getMetricLabel(key);
                                return (
                                    <Tooltip key={key}>
                                        <TooltipTrigger asChild>
                                            <div className="bg-white px-5 py-4 cursor-help">
                                                <div className="flex items-center gap-1 mb-2">
                                                    <span className="text-xs text-zinc-500 font-medium">{label}</span>
                                                    <Question className="w-3 h-3 text-zinc-400" />
                                                </div>
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-2xl font-semibold tabular-nums text-zinc-900">
                                                        {typeof value === 'number' ? value.toFixed(4) : value}
                                                    </span>
                                                </div>
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs text-xs leading-relaxed">
                                            <p>{detail}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                );
                            })}
                        </div>
                    </section>

                    {/* ── 特徴量重要度 ──────────────────────────────── */}
                    {result.feature_importance && result.feature_importance.length > 0 && (
                        <section className="py-5 border-b border-zinc-100">
                            <div className="mb-4">
                                <h2 className="text-sm font-medium text-zinc-700">重要特徴量（Feature Importance）</h2>
                                <p className="text-xs text-zinc-400 mt-0.5">分岐回数ベースのモデル内部重要度。上位20件。{' '}
                                    <span className="inline-block w-2 h-2 rounded-sm bg-amber-600 align-middle" /> 最重要特徴量</p>
                            </div>
                            <div style={{ height: featureImportanceChartHeight + 40 }}>
                                <ResponsiveContainer width="100%" height={featureImportanceChartHeight}>
                                    <BarChart
                                        data={result.feature_importance.slice(0, 20).map((item: any) => ({
                                            ...item,
                                            feature: stripTablePrefix(item.feature)
                                        }))}
                                        layout="vertical"
                                        margin={{ top: 5, right: 80, left: 40, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e4e4e7" />
                                        <XAxis type="number" tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} />
                                        <YAxis type="category" dataKey="feature" width={150} tick={{ fontSize: 11, fill: '#52525b' }} axisLine={false} tickLine={false} />
                                        <RechartsTooltip
                                            formatter={(value: any) => [
                                                typeof value === 'number' ? value.toFixed(4) : value,
                                                '重要度'
                                            ]}
                                            contentStyle={{ backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #e4e4e7', fontSize: 12 }}
                                        />
                                        <Bar dataKey="importance" radius={[0, 3, 3, 0]}>
                                            {result.feature_importance.slice(0, 20).map((_entry: any, index: number) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={getFeatureImportanceColor(index)}
                                                />
                                            ))}
                                            <LabelList
                                                dataKey="importance"
                                                position="right"
                                                formatter={(v: unknown) => typeof v === 'number' ? v.toFixed(3) : String(v)}
                                                style={{ fontSize: 10, fill: '#71717a' }}
                                            />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </section>
                    )}

                    {/* ── 重要特徴量（SHAP）── LightGBMのみ表示 ─────────── */}
                    {result.shap_importance && result.shap_importance.length > 0 && (
                        <section className="py-5 border-b border-zinc-100">
                            <div className="mb-4">
                                <h2 className="text-sm font-medium text-zinc-700">重要特徴量（SHAP）</h2>
                                <p className="text-xs text-zinc-400 mt-0.5">
                                    各特徴量が予測値に与えた平均的な影響量（LightGBMのみ）。{' '}
                                    <span className="inline-block w-2 h-2 rounded-sm align-middle" style={{ backgroundColor: 'hsl(0, 84%, 60%)' }} />{' '}
                                    正（予測値を押し上げ）{' '}
                                    <span className="inline-block w-2 h-2 rounded-sm align-middle ml-2" style={{ backgroundColor: 'hsl(155, 40%, 30%)' }} />{' '}
                                    負（予測値を押し下げ）
                                </p>
                            </div>
                            <div style={{ height: shapChartHeight + 40 }}>
                                <ResponsiveContainer width="100%" height={shapChartHeight}>
                                    <BarChart
                                        data={result.shap_importance.slice(0, 20).map((item: any) => ({
                                            ...item,
                                            feature: stripTablePrefix(item.feature),
                                        }))}
                                        layout="vertical"
                                        margin={{ top: 5, right: 80, left: 40, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e4e4e7" />
                                        <XAxis type="number" tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                                        <YAxis type="category" dataKey="feature" width={150} tick={{ fontSize: 11, fill: '#52525b' }} axisLine={false} tickLine={false} />
                                        <RechartsTooltip
                                            formatter={(value: any) => [
                                                typeof value === 'number' ? value.toFixed(4) : value,
                                                'SHAP値',
                                            ]}
                                            contentStyle={{ backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #e4e4e7', fontSize: 12 }}
                                        />
                                        <Bar dataKey="shap_value" radius={[0, 3, 3, 0]}>
                                            {result.shap_importance.slice(0, 20).map((entry: any, index: number) => (
                                                <Cell
                                                    key={`shap-cell-${index}`}
                                                    fill={entry.shap_value >= 0 ? 'hsl(0, 84%, 60%)' : 'hsl(155, 40%, 30%)'}
                                                />
                                            ))}
                                            <LabelList
                                                dataKey="shap_value"
                                                position="right"
                                                formatter={(v: unknown) => typeof v === 'number' ? v.toFixed(3) : String(v)}
                                                style={{ fontSize: 10, fill: '#71717a' }}
                                            />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </section>
                    )}

                    {/* 係数統計 — 線形モデルで coef_stats が未計算の場合の注意表示 */}
                    {result.model_type === 'logistic_regression' && (!result.coef_stats || result.coef_stats.length === 0) && (
                        <div className="border-l-4 border-amber-400 pl-4 py-2 bg-amber-50 rounded-r-lg">
                            <p className="text-sm text-amber-900">
                                <span className="font-semibold">係数統計（p値・信頼区間）</span>はまだ計算されていません。<br />
                                「学習実行」ボタンで再実行すると、この欄に統計量が表示されます。
                            </p>
                        </div>
                    )}

                    {/* 係数統計 (線形モデルのみ) */}
                    {result.model_type === 'logistic_regression' && result.coef_stats && result.coef_stats.length > 0 && (
                        <section className="py-5 border-b border-zinc-100">
                            <div className="mb-4">
                                <h2 className="text-sm font-medium text-zinc-700">係数統計</h2>
                                <p className="text-xs text-zinc-400 mt-0.5">
                                    {result.coef_stats[0]?.odds_ratio != null
                                        ? '各特徴量のオッズ比・p値・95%信頼区間（ロジスティック回帰）。係数はStandardScalerで標準化済みのため、ORは「値が1SD増えたときの効果」を表します。'
                                        : '各特徴量の標準化偏回帰係数・p値・95%信頼区間（線形回帰）。係数はStandardScalerで標準化済み（1SD変化あたりの効果）。'}
                                    <span className="ml-2">*** p&lt;0.001　** p&lt;0.01　* p&lt;0.05　n.s. 非有意</span>
                                </p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="border-b border-zinc-200 text-left">
                                            <th className="px-3 py-2 text-xs font-medium text-zinc-500">特徴量</th>
                                            {result.coef_stats[0]?.odds_ratio != null ? (
                                                <>
                                                    <th className="px-3 py-2 text-xs font-medium text-zinc-500 text-right">オッズ比 (OR)</th>
                                                    <th className="px-3 py-2 text-xs font-medium text-zinc-500 text-right">95%信頼区間</th>
                                                </>
                                            ) : (
                                                <>
                                                    <th className="px-3 py-2 text-xs font-medium text-zinc-500 text-right">標準化偏回帰係数 (β)</th>
                                                    <th className="px-3 py-2 text-xs font-medium text-zinc-500 text-right">95%信頼区間</th>
                                                </>
                                            )}
                                            <th className="px-3 py-2 text-xs font-medium text-zinc-500 text-right">p値</th>
                                            <th className="px-3 py-2 text-xs font-medium text-zinc-500 text-center">有意性</th>
                                            <th className="px-3 py-2 text-xs font-medium text-zinc-500 text-center">方向</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.coef_stats.slice(0, 20).map((row: any, idx: number) => {
                                            const sig = pValueLabel(row.p_value);
                                            const isOdds = row.odds_ratio != null;
                                            const mainVal = isOdds ? row.odds_ratio : row.coef;
                                            const isSignificant = row.p_value < 0.05;
                                            const labels = colLabelsMap[row.feature] ?? colLabelsMap[stripTablePrefix(row.feature)]
                                            const isUp = isOdds ? mainVal > 1.0 : row.coef > 0
                                            const dirLabel = isOdds
                                                ? (isUp ? '値↑→リスク↑' : '値↑→リスク↓')
                                                : (isUp ? '値↑→予測↑' : '値↑→予測↓')
                                            const dirColor = isUp
                                                ? 'text-destructive bg-destructive/10'
                                                : 'text-primary bg-primary/10'
                                            return (
                                                <tr key={idx} className={`border-b border-zinc-100 transition-colors hover:bg-zinc-50 ${isSignificant ? '' : 'opacity-60'}`}>
                                                    <td className="px-3 py-2 max-w-[220px]">
                                                        <div className="font-mono text-xs truncate" title={stripTablePrefix(row.feature)}>
                                                            {stripTablePrefix(row.feature)}
                                                        </div>
                                                        {labels && (
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                {Object.entries(labels).map(([val, lbl]) => (
                                                                    <span key={val} className="text-[10px] text-zinc-400 bg-zinc-100 px-1 py-0.5 rounded leading-none">
                                                                        {val}:{lbl as string}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className={`px-3 py-2 text-right font-semibold tabular-nums ${mainVal != null && (mainVal > 1 || mainVal >= 0) ? 'text-destructive' : 'text-primary'}`}>
                                                        {mainVal != null ? mainVal.toFixed(3) : '—'}
                                                    </td>
                                                    <td className="px-3 py-2 text-right text-xs text-zinc-400 tabular-nums">
                                                        {row.ci_lower != null && row.ci_upper != null
                                                            ? `[${row.ci_lower.toFixed(3)}, ${row.ci_upper.toFixed(3)}]`
                                                            : '—'}
                                                    </td>
                                                    <td className="px-3 py-2 text-right tabular-nums text-xs text-zinc-600">
                                                        {row.p_value != null
                                                            ? (row.p_value < 0.001 ? '< 0.001' : row.p_value.toFixed(3))
                                                            : '—'}
                                                    </td>
                                                    <td className={`px-3 py-2 text-center font-bold text-sm ${sig.color}`}>
                                                        {sig.mark}
                                                    </td>
                                                    <td className="px-3 py-2 text-center">
                                                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${dirColor}`}>
                                                            {dirLabel}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}

                    {/* 数式の出力 — 線形/ロジスティック回帰のcoef_statsがある場合のみ表示 */}
                    {result.model_type === 'logistic_regression' && result.coef_stats && result.coef_stats.length > 0 && (
                        <section className="py-5 border-b border-zinc-100">
                            <div className="mb-4">
                                <h2 className="text-sm font-medium text-zinc-700">数式</h2>
                                <p className="text-xs text-zinc-400 mt-0.5">
                                    {result.coef_stats[0]?.odds_ratio != null
                                        ? 'ロジスティック回帰の対数オッズ式（log-odds = Σ coef * x + const）'
                                        : '線形回帰の予測式（y = Σ coef * x + const）'}
                                </p>
                            </div>
                            {(() => {
                                const intercept = result.coef_stats.find((r: any) =>
                                    r.feature === 'const' || r.feature === 'Intercept' || r.feature === 'intercept'
                                )
                                const features = result.coef_stats.filter((r: any) =>
                                    r.feature !== 'const' && r.feature !== 'Intercept' && r.feature !== 'intercept'
                                )
                                const isOdds = result.coef_stats[0]?.odds_ratio != null
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
                                        <pre className="text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-lg p-4 overflow-x-auto whitespace-pre leading-relaxed text-zinc-800 max-h-64 overflow-y-auto">
                                            {formula}
                                        </pre>
                                        <button
                                            className="absolute top-2 right-2 text-[10px] px-2 py-0.5 bg-white border border-zinc-200 rounded text-zinc-500 hover:text-zinc-800 transition-colors"
                                            onClick={() => navigator.clipboard.writeText(formula)}
                                        >
                                            コピー
                                        </button>
                                    </div>
                                )
                            })()}
                        </section>
                    )}

                    {/* 値のシミュレーション — 線形/ロジスティック回帰のcoef_statsがある場合のみ表示 */}
                    {result.model_type === 'logistic_regression' && result.coef_stats && result.coef_stats.length > 0 && (
                        <section className="py-5 border-b border-zinc-100">
                            <div className="mb-4">
                                <h2 className="text-sm font-medium text-zinc-700">値のシミュレーション</h2>
                                <p className="text-xs text-zinc-400 mt-0.5">特徴量の値を変えて予測値をシミュレーションします（係数×入力値の合計）</p>
                            </div>
                            {(() => {
                                const features = result.coef_stats.filter((r: any) =>
                                    r.feature !== 'const' && r.feature !== 'Intercept' && r.feature !== 'intercept'
                                )
                                const intercept = result.coef_stats.find((r: any) =>
                                    r.feature === 'const' || r.feature === 'Intercept' || r.feature === 'intercept'
                                )
                                const isOdds = result.coef_stats[0]?.odds_ratio != null

                                const logOdds = features.reduce((sum: number, r: any) => {
                                    const labels = colLabelsMap[r.feature] ?? colLabelsMap[stripTablePrefix(r.feature)]
                                    const defaultVal = labels
                                        ? (parseFloat(Object.keys(labels)[0] ?? '0') || 0)
                                        : 0
                                    const val = simValues[r.feature] ?? defaultVal
                                    return sum + (r.coef ?? 0) * val
                                }, intercept?.coef ?? 0)

                                const predicted = isOdds
                                    ? (1 / (1 + Math.exp(-logOdds)))
                                    : logOdds

                                return (
                                    <div className="space-y-4">
                                        {/* 予測値表示 — テキスト中心で大きく */}
                                        <div className="bg-zinc-50 border border-zinc-200 rounded-lg px-6 py-5 flex items-baseline gap-3">
                                            <span className="text-xs text-zinc-500">
                                                {isOdds ? '予測確率' : '予測値'}
                                            </span>
                                            <span className="text-3xl font-semibold font-mono text-zinc-900 tabular-nums">
                                                {isOdds
                                                    ? `${(predicted * 100).toFixed(2)}%`
                                                    : predicted.toFixed(4)}
                                            </span>
                                        </div>

                                        {/* 特徴量入力 */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                                            {features.slice(0, 20).map((r: any) => {
                                                const fname = stripTablePrefix(r.feature)
                                                const val = simValues[r.feature] ?? 0
                                                const labels = colLabelsMap[r.feature] ?? colLabelsMap[stripTablePrefix(r.feature)]
                                                return (
                                                    <div key={r.feature} className="flex items-center gap-2">
                                                        <span className="text-xs font-mono text-zinc-500 truncate flex-1 min-w-0" title={fname}>
                                                            {fname}
                                                        </span>
                                                        {labels ? (
                                                            <select
                                                                value={String(simValues[r.feature] ?? Object.keys(labels)[0] ?? '0')}
                                                                onChange={(e) => {
                                                                    const num = parseFloat(e.target.value)
                                                                    setSimValues(prev => ({
                                                                        ...prev,
                                                                        [r.feature]: isNaN(num) ? 0 : num,
                                                                    }))
                                                                }}
                                                                className="w-32 h-7 text-xs border border-zinc-200 rounded px-2 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-400"
                                                            >
                                                                {Object.entries(labels).map(([rawVal, label]) => (
                                                                    <option key={rawVal} value={rawVal}>{label}</option>
                                                                ))}
                                                            </select>
                                                        ) : (
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
                                                                className="w-24 h-7 text-xs font-mono border border-zinc-200 rounded px-2 text-right bg-white focus:outline-none focus:ring-1 focus:ring-zinc-400"
                                                            />
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>

                                        {features.length > 20 && (
                                            <p className="text-xs text-zinc-400 text-center">
                                                上位20件の特徴量のみ表示しています
                                            </p>
                                        )}

                                        <button
                                            className="text-xs text-zinc-400 hover:text-zinc-700 underline"
                                            onClick={() => setSimValues({})}
                                        >
                                            すべて0にリセット
                                        </button>
                                    </div>
                                )
                            })()}
                        </section>
                    )}

                    {/* 決定木 可視化 */}
                    {result.model_type !== 'logistic_regression' && result.tree_structure && dtNodes.length > 0 && (
                        <section className="py-5 border-b border-zinc-100">
                            <div className="mb-4">
                                <h2 className="text-sm font-medium text-zinc-700">決定木 可視化</h2>
                                <p className="text-xs text-zinc-400 mt-0.5">
                                    最大深度 5 の決定木。青=分岐ノード（条件）、緑=葉ノード（予測結果）。ドラッグ・スクロールで移動/ズームできます。
                                </p>
                            </div>
                            <div style={{ height: 520 }} className="rounded-lg overflow-hidden border border-zinc-200">
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
                                    <Background gap={16} size={1} color="#e4e4e7" />
                                    <Controls showInteractive={false} />
                                </ReactFlow>
                            </div>
                        </section>
                    )}

                    {/* 分岐ルール一覧 */}
                    {result.model_type !== 'logistic_regression' && result.decision_rules && result.decision_rules.length > 0 && (
                        <section className="py-5">
                            <div className="mb-4">
                                <h2 className="text-sm font-medium text-zinc-700">分岐ルール一覧</h2>
                                <p className="text-xs text-zinc-400 mt-0.5">
                                    決定木から抽出した IF/THEN ルール。各ルールは葉ノードまでの条件パスを表します。
                                    {result.decision_rules[0]?.confidence != null
                                        ? '分類タスクでは陽性クラス（1）のルールを優先表示します。'
                                        : '安定度の高い順に表示します。'}
                                </p>
                            </div>
                            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                                {[...result.decision_rules]
                                    .sort((a: any, b: any) => {
                                        if (a.confidence != null) {
                                            // 分類: 陽性クラス（0以外）を優先し、その中で確信度降順
                                            const aPositive = String(a.prediction) !== '0' ? 1 : 0;
                                            const bPositive = String(b.prediction) !== '0' ? 1 : 0;
                                            if (aPositive !== bPositive) return bPositive - aPositive;
                                            return (b.confidence ?? 0) - (a.confidence ?? 0);
                                        }
                                        // 回帰: 安定度（std）の低い順
                                        return (a.std ?? Infinity) - (b.std ?? Infinity);
                                    })
                                    .map((rule: any, idx: number) => (
                                        <div key={idx} className="border border-zinc-200 rounded-lg p-3 bg-zinc-50 hover:bg-white transition-colors">
                                            <div className="flex flex-wrap gap-1 mb-2">
                                                {rule.conditions.map((cond: string, ci: number) => (
                                                    <span key={ci} className="inline-flex items-center gap-1 text-xs font-mono bg-white border border-zinc-200 rounded px-2 py-0.5">
                                                        {ci > 0 && <span className="text-zinc-400 font-sans">AND</span>}
                                                        {stripTablePrefix(cond)}
                                                    </span>
                                                ))}
                                            </div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-xs text-zinc-400">→ 予測:</span>
                                                <span className="font-semibold text-sm text-zinc-900">{String(rule.prediction)}</span>
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
                                                <span className="text-xs text-zinc-400 ml-auto">n={rule.samples.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    ))
                                }
                            </div>
                        </section>
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
