"use client"

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, ChevronRight, AlertCircle, Save, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { AppAlertDialog } from '@/components/ui/app-alert-dialog';
import { useAppAlert } from '@/hooks/use-app-alert';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/api'

// ステップの定義（ラベルと番号の対応）
const STEPS = [
    { number: 1, label: 'テーブル選択' },
    { number: 2, label: '目的変数' },
    { number: 3, label: '特徴量設定' },
];

export default function AnalysisConfigPage() {
    const params = useParams();
    const projectId = params.projectId as string;
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);

    // データ
    const [tables, setTables] = useState<any[]>([]);
    const [suggestions, setSuggestions] = useState<any[]>([]);

    // 既存の分析設定一覧
    const [configs, setConfigs] = useState<any[]>([]);
    const [loadingConfigs, setLoadingConfigs] = useState(false);

    // 削除確認ダイアログの状態
    const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
    const [deleting, setDeleting] = useState(false);
    // 削除対象の分析設定に紐づく影響件数（学習ジョブ数）
    const [deleteConfigImpact, setDeleteConfigImpact] = useState<{ count: number; loading: boolean }>({ count: 0, loading: false });

    // 選択値
    const [configName, setConfigName] = useState<string>("");
    const [mainTableId, setMainTableId] = useState<string>("");
    const [targetColumnId, setTargetColumnId] = useState<string>("");
    const [taskType, setTaskType] = useState<"regression" | "classification">("regression");
    const [modelType, setModelType] = useState<"gradient_boosting" | "logistic_regression">("gradient_boosting");

    // 特徴量設定（選択中インデックスの配列）
    const [selectedFeatureIndices, setSelectedFeatureIndices] = useState<number[]>([]);
    const [validationError, setValidationError] = useState<string | null>(null);
    const { alertState, showAlert, closeAlert } = useAppAlert();

    // 既存の分析設定一覧を取得する関数
    const fetchConfigs = async () => {
        setLoadingConfigs(true);
        try {
            const res = await apiClient.get(`/api/projects/${projectId}/analysis/configs`);
            setConfigs(res.data);
        } catch (error) {
            console.error("分析設定一覧の取得に失敗しました", error);
        } finally {
            setLoadingConfigs(false);
        }
    };

    useEffect(() => {
        if (!projectId) return;
        const fetchTables = async () => {
            try {
                const response = await apiClient.get(`/api/projects/${projectId}/tables`);
                setTables(response.data);
            } catch (error) {
                console.error("テーブル一覧の取得に失敗しました", error);
            }
        };
        fetchTables();
        // 初回表示時に既存の分析設定一覧も取得
        fetchConfigs();
    }, [projectId]);

    // Step 3 に入ったときに特徴量提案を取得
    useEffect(() => {
        if (step === 3 && mainTableId && projectId) {
            const fetchSuggestions = async () => {
                setLoading(true);
                try {
                    const response = await apiClient.get(`/api/projects/${projectId}/analysis/suggest_features?main_table_id=${mainTableId}`);
                    setSuggestions(response.data);
                    // デフォルトですべての特徴量を選択済みにする
                    setSelectedFeatureIndices(response.data.map((_: unknown, idx: number) => idx));
                } catch (error) {
                    console.error("特徴量提案の取得に失敗しました", error);
                } finally {
                    setLoading(false);
                }
            };
            fetchSuggestions();
        }
    }, [step, mainTableId, projectId]);

    const handleNext = () => {
        if (step === 1 && !configName.trim()) { setValidationError("設定名を入力してください"); return; }
        if (step === 1 && !mainTableId) { setValidationError("テーブルを選択してください"); return; }
        if (step === 2 && !targetColumnId) { setValidationError("目的変数を選択してください"); return; }
        setValidationError(null);
        setStep(step + 1);
    }

    const handleBack = () => {
        setStep(step - 1);
    }

    const handleSave = async () => {
        if (!mainTableId || !targetColumnId) return;

        try {
            const payload = {
                name: configName.trim(),
                main_table_id: parseInt(mainTableId),
                target_column_id: parseInt(targetColumnId),
                task_type: taskType,
                model_type: modelType,
                feature_settings: {
                    selected_indices: selectedFeatureIndices,
                    details: suggestions.filter((_, idx) => selectedFeatureIndices.includes(idx))
                }
            };

            const response = await apiClient.post(`/api/projects/${projectId}/analysis/config`, payload);
            localStorage.setItem('lastAnalysisConfigId', response.data.id);
            // 保存成功後は一覧を再取得して最新状態を反映
            await fetchConfigs();
            showAlert("保存完了", "分析設定を保存しました。");

        } catch (error) {
            console.error("保存に失敗しました", error);
            showAlert("保存エラー", "保存に失敗しました。");
        }
    }

    // 選択中のメインテーブルオブジェクトを返す
    const getTargetTable = () => {
        return tables.find(t => t.id.toString() === mainTableId);
    }

    // 選択中の目的変数カラムオブジェクトを返す
    const getTargetColumn = () => {
        const table = getTargetTable();
        if (!table) return null;
        return table.columns.find((c: any) => c.id.toString() === targetColumnId);
    }

    const toggleFeature = (index: number) => {
        setSelectedFeatureIndices(prev => {
            if (prev.includes(index)) {
                return prev.filter(i => i !== index);
            } else {
                return [...prev, index];
            }
        });
    }

    // 削除ボタンクリック時：確認ダイアログを開く
    const handleDeleteClick = (config: any) => {
        setDeleteTarget({ id: config.id, name: config.name || `設定 #${config.id}` });
        // 影響件数をフェッチ（削除ダイアログ表示中にAPIを叩く）
        setDeleteConfigImpact({ count: 0, loading: true });
        apiClient.get(`/api/projects/${projectId}/train/jobs`).then(res => {
            const jobs: any[] = res.data ?? []
            const affected = jobs.filter((j: any) => j.config_id === config.id).length
            setDeleteConfigImpact({ count: affected, loading: false })
        }).catch(() => setDeleteConfigImpact({ count: 0, loading: false }));
    };

    // 削除確認後の実際の削除処理
    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await apiClient.delete(`/api/projects/${projectId}/analysis/config/${deleteTarget.id}`);
            // 削除後は一覧を再取得して表示を更新
            await fetchConfigs();
            setDeleteTarget(null);
        } catch (error: any) {
            const msg = error.response?.data?.detail || "分析設定の削除に失敗しました";
            showAlert("削除エラー", msg);
            setDeleteTarget(null);
        } finally {
            setDeleting(false);
        }
    };

    // タスクタイプの表示名を返す
    const taskTypeLabel = (t: string) => t === 'classification' ? '分類' : t === 'regression' ? '回帰' : t;

    // モデルタイプの表示名を返す
    const modelTypeLabel = (m: string) => m === 'gradient_boosting' ? 'LightGBM' : m === 'logistic_regression' ? '線形モデル' : m;

    return (
        <div className="w-full min-h-screen bg-background p-8 flex flex-col items-center gap-8">

            {/* ── 既存の分析設定一覧セクション ── */}
            <div className="w-full max-w-4xl">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-foreground">保存済みの分析設定</h2>
                    <Button variant="outline" size="sm" onClick={fetchConfigs} disabled={loadingConfigs}>
                        {loadingConfigs ? "読み込み中..." : "更新"}
                    </Button>
                </div>

                {loadingConfigs ? (
                    <p className="text-sm text-muted-foreground">設定を読み込んでいます...</p>
                ) : configs.length === 0 ? (
                    <div className="border border-dashed border-border rounded-lg p-6 text-center text-muted-foreground text-sm">
                        保存済みの分析設定がありません。下のウィザードで設定を作成してください。
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {configs.map((config) => (
                            <Card key={config.id} className="border border-border">
                                <CardHeader className="pb-2 flex flex-row items-start justify-between space-y-0">
                                    <CardTitle className="text-base font-semibold truncate pr-2" title={config.name}>
                                        {config.name || `設定 #${config.id}`}
                                    </CardTitle>
                                    {/* 削除ボタン */}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                                        onClick={() => handleDeleteClick(config)}
                                        title="この設定を削除"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <div className="flex gap-2 flex-wrap">
                                        <Badge variant="secondary" className="text-xs font-normal">
                                            {taskTypeLabel(config.task_type)}
                                        </Badge>
                                        <Badge variant="outline" className="text-xs font-normal bg-white">
                                            {modelTypeLabel(config.model_type)}
                                        </Badge>
                                    </div>
                                    {config.created_at && (
                                        <p className="text-xs text-muted-foreground">
                                            作成日: {new Date(config.created_at).toLocaleDateString('ja-JP')}
                                        </p>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            <Separator className="w-full max-w-4xl" />

            {/* ── 分析設定ウィザード ── */}
            <Card className="w-full max-w-4xl">
                <CardHeader>
                    <CardTitle>分析設定ウィザード</CardTitle>
                    <CardDescription>分析のパラメータを設定します。</CardDescription>

                    {/* ── ステップインジケーター（視覚的強化版） ── */}
                    <div className="flex items-center mt-6">
                        {STEPS.map((s, index) => {
                            // 完了済み: step番号より前、現在: 一致、未完了: 後
                            const isCompleted = step > s.number;
                            const isCurrent = step === s.number;
                            const isPending = step < s.number;

                            return (
                                <div key={s.number} className="flex items-center">
                                    {/* ステップ円とラベル */}
                                    <div className="flex flex-col items-center gap-1.5">
                                        <div
                                            className={`
                                                w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold
                                                transition-all duration-200
                                                ${isCompleted
                                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                                    : isCurrent
                                                    ? 'bg-primary/15 border-2 border-primary text-primary'
                                                    : 'bg-muted border-2 border-muted-foreground/20 text-muted-foreground'}
                                            `}
                                        >
                                            {/* 完了済みはチェックマークアイコンを表示 */}
                                            {isCompleted
                                                ? <CheckCircle2 className="w-5 h-5" />
                                                : s.number}
                                        </div>
                                        <span
                                            className={`
                                                text-xs whitespace-nowrap
                                                ${isCurrent
                                                    ? 'font-bold text-primary'
                                                    : isCompleted
                                                    ? 'font-medium text-primary/80'
                                                    : 'text-muted-foreground'}
                                            `}
                                        >
                                            {s.label}
                                        </span>
                                    </div>

                                    {/* ステップ間の接続線（最後のステップには不要） */}
                                    {index < STEPS.length - 1 && (
                                        <div
                                            className={`
                                                w-16 h-0.5 mx-2 mb-5 rounded-full transition-all duration-300
                                                ${isCompleted ? 'bg-primary' : 'bg-muted-foreground/20'}
                                            `}
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* バリデーションエラー表示 */}
                    {validationError && (
                        <p className="text-sm text-destructive mt-2 flex items-center gap-1">
                            <AlertCircle className="w-4 h-4" />
                            {validationError}
                        </p>
                    )}
                </CardHeader>
                <Separator />
                <CardContent className="py-8 min-h-[400px]">

                    {/* ── Step 1: メインテーブル選択 ── */}
                    {step === 1 && (
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="config-name" className="text-lg">設定名</Label>
                                <p className="text-sm text-muted-foreground">この分析設定の名前を入力してください。後からダッシュボードで識別するために使います。</p>
                                <Input
                                    id="config-name"
                                    value={configName}
                                    onChange={(e) => setConfigName(e.target.value)}
                                    placeholder="例: 健診データ 糖尿病リスク分類"
                                    className="max-w-md"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-lg">メインテーブルを選択</Label>
                                <p className="text-sm text-muted-foreground">分析の主体となるデータ（例: 売上データ、ユーザーマスタなど）を選択してください。</p>
                            </div>

                            <RadioGroup value={mainTableId} onValueChange={setMainTableId} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {tables.map((table) => (
                                    <div
                                        key={table.id}
                                        className={`
                                            max-w-full flex items-start space-x-3 border p-4 rounded-lg cursor-pointer
                                            hover:bg-secondary/20 transition-colors
                                            ${mainTableId === table.id.toString() ? "border-primary bg-primary/10" : "border-input"}
                                        `}
                                    >
                                        <RadioGroupItem value={table.id.toString()} id={`t-${table.id}`} className="mt-1 text-primary" />
                                        <div className="grid gap-1.5 overflow-hidden w-full">
                                            <Label htmlFor={`t-${table.id}`} className="font-semibold cursor-pointer truncate text-base">
                                                {table.physical_table_name}
                                            </Label>
                                            <p className="text-xs text-muted-foreground truncate" title={table.original_filename}>
                                                元ファイル: {table.original_filename}
                                            </p>
                                            {/* テーブルの行数・カラム数情報をバッジで表示 */}
                                            <div className="flex gap-2 mt-1">
                                                <Badge variant="secondary" className="text-xs font-normal">
                                                    {table.row_count.toLocaleString()} 行
                                                </Badge>
                                                <Badge variant="outline" className="text-xs font-normal bg-white">
                                                    {table.columns.length} 列
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </RadioGroup>

                            {/* テーブルが選択されたときに「次へ」ボタンを目立たせる誘導エリア */}
                            {mainTableId && configName.trim() && (
                                <div className="mt-2 p-4 bg-primary/5 border border-primary/20 rounded-lg flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-sm text-primary">
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span>
                                            <span className="font-semibold">{getTargetTable()?.physical_table_name}</span> を選択しました。次のステップへ進んでください。
                                        </span>
                                    </div>
                                    <Button onClick={handleNext} size="sm" className="gap-1">
                                        次のステップへ <ChevronRight className="w-4 h-4" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Step 2: 目的変数選択 ── */}
                    {step === 2 && getTargetTable() && (
                        <div className="space-y-6">
                            {/* Step 2 上部：選択済みテーブル名のサマリーバッジ */}
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span>選択済み:</span>
                                <Badge variant="secondary" className="text-xs font-medium">
                                    {getTargetTable()?.physical_table_name}
                                </Badge>
                                <span className="text-xs">
                                    ({getTargetTable()?.row_count.toLocaleString()} 行 / {getTargetTable()?.columns.length} 列)
                                </span>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-lg">予測対象（目的変数）を選択</Label>
                                <p className="text-sm text-muted-foreground">
                                    {getTargetTable()?.physical_table_name} の中から、予測したいカラムを選択してください。<br />
                                    数値型を選ぶと「回帰」、カテゴリ型を選ぶと「分類」タスクとして自動設定されます。
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto p-1">
                                {getTargetTable()?.columns.map((col: any) => (
                                    <div
                                        key={col.id}
                                        onClick={() => {
                                            setTargetColumnId(col.id.toString());
                                            setTaskType(col.inferred_type === 'numeric' ? 'regression' : 'classification');
                                        }}
                                        className={`
                                            cursor-pointer border rounded-md p-3 transition-all
                                            ${targetColumnId === col.id.toString()
                                                ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                                                : "border-input hover:border-primary/50 hover:bg-secondary/20"}
                                        `}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="font-medium text-sm truncate w-full" title={col.physical_name}>{col.physical_name}</span>
                                            {targetColumnId === col.id.toString() && <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 ml-2" />}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className={`text-[10px] h-5 ${col.inferred_type === 'numeric' ? 'bg-primary/10 text-primary border-primary/20' :
                                                col.inferred_type === 'categorical' ? 'bg-secondary text-secondary-foreground border-border' : 'bg-muted'
                                                }`}>
                                                {col.inferred_type}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">{col.data_type}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {targetColumnId && (
                                <Alert className="bg-primary/10 border-primary/20">
                                    <AlertTitle className="text-primary">
                                        予測タスク: {taskType === "regression" ? "回帰予測 (数値)" : "分類予測 (カテゴリ)"}
                                    </AlertTitle>
                                    <AlertDescription className="text-primary/90 text-xs mt-1">
                                        {taskType === "regression"
                                            ? "選択されたカラムは数値データです。売上金額や点数などの連続値を予測します。"
                                            : "選択されたカラムはカテゴリデータ（または極端に少ない数値）です。クラス分類（はい/いいえ、A/B/Cなど）を行います。"}
                                        <div className="mt-2">
                                            <span
                                                className="underline cursor-pointer hover:text-primary-foreground font-medium"
                                                onClick={() => setTaskType(prev => prev === "regression" ? "classification" : "regression")}
                                            >
                                                タスクタイプを手動で切り替える ({taskType === "regression" ? "分類へ" : "回帰へ"})
                                            </span>
                                        </div>
                                    </AlertDescription>
                                </Alert>
                            )}

                            {/* モデル選択 */}
                            <div className="space-y-3 pt-2">
                                <Label className="text-base font-medium">使用モデルを選択</Label>
                                <p className="text-sm text-muted-foreground">学習に使用するアルゴリズムを選択してください。</p>
                                <RadioGroup
                                    value={modelType}
                                    onValueChange={(v) => setModelType(v as "gradient_boosting" | "logistic_regression")}
                                    className="grid grid-cols-1 md:grid-cols-2 gap-3"
                                >
                                    <div className={`flex items-start space-x-3 border p-4 rounded-lg cursor-pointer transition-colors hover:bg-secondary/20 ${modelType === 'gradient_boosting' ? 'border-primary bg-primary/10' : 'border-input'}`}>
                                        <RadioGroupItem value="gradient_boosting" id="m-gb" className="mt-1 text-primary" />
                                        <div>
                                            <Label htmlFor="m-gb" className="font-semibold cursor-pointer text-sm">勾配ブースティング (LightGBM)</Label>
                                            <p className="text-xs text-muted-foreground mt-0.5">非線形・複雑な関係の把握に強い高精度モデル</p>
                                        </div>
                                    </div>
                                    <div className={`flex items-start space-x-3 border p-4 rounded-lg cursor-pointer transition-colors hover:bg-secondary/20 ${modelType === 'logistic_regression' ? 'border-primary bg-primary/10' : 'border-input'}`}>
                                        <RadioGroupItem value="logistic_regression" id="m-lr" className="mt-1 text-primary" />
                                        <div>
                                            <Label htmlFor="m-lr" className="font-semibold cursor-pointer text-sm">
                                                {taskType === 'classification' ? 'ロジスティック回帰' : '線形回帰'}
                                            </Label>
                                            <p className="text-xs text-muted-foreground mt-0.5">シンプルで解釈しやすい線形モデル</p>
                                        </div>
                                    </div>
                                </RadioGroup>
                            </div>
                        </div>
                    )}

                    {/* ── Step 3: 特徴量選択 ── */}
                    {step === 3 && (
                        <div className="space-y-6">
                            {/* Step 3 上部：選択済みテーブル・目的変数・タスクのサマリーバッジ */}
                            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                <span>テーブル:</span>
                                <Badge variant="secondary" className="text-xs font-medium">
                                    {getTargetTable()?.physical_table_name}
                                </Badge>
                                <span>/</span>
                                <span>目的変数:</span>
                                <Badge variant="secondary" className="text-xs font-medium">
                                    {getTargetColumn()?.physical_name ?? targetColumnId}
                                </Badge>
                                <span>/</span>
                                <span>タスク:</span>
                                <Badge
                                    variant="outline"
                                    className={`text-xs font-medium ${taskType === 'regression' ? 'bg-primary/10 text-primary border-primary/30' : 'bg-secondary text-secondary-foreground'}`}
                                >
                                    {taskType === 'regression' ? '回帰' : '分類'}
                                </Badge>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-lg">特徴量エンジニアリング（自動提案）</Label>
                                <p className="text-sm text-muted-foreground">
                                    リレーション定義に基づき、以下の特徴量を自動生成します。<br />
                                    不要なものはチェックを外してください。
                                </p>
                            </div>

                            {loading ? (
                                <div className="flex justify-center py-10 text-muted-foreground">提案を生成中...</div>
                            ) : suggestions.length === 0 ? (
                                <div className="text-center py-10 text-muted-foreground bg-secondary/20 rounded-lg border border-dashed border-border">
                                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    提案可能な特徴量がありません。<br />
                                    <span className="text-xs">リレーションが定義されていないか、結合可能なテーブルがありません。「結合設定」画面を確認してください。</span>
                                </div>
                            ) : (
                                <div className="border rounded-lg overflow-hidden">
                                    {/* ヘッダー：選択件数表示 + 全選択・全解除ボタン */}
                                    <div className="flex items-center justify-between p-3 bg-secondary/30 border-b gap-3">
                                        {/* 選択中件数のバッジ表示 */}
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-muted-foreground">{suggestions.length} 個の提案</span>
                                            <Badge
                                                variant={selectedFeatureIndices.length > 0 ? "default" : "secondary"}
                                                className="text-xs"
                                            >
                                                {selectedFeatureIndices.length} 件選択中
                                            </Badge>
                                        </div>
                                        {/* 全選択・全解除ボタン（デザイン改善版） */}
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setSelectedFeatureIndices(suggestions.map((_, i) => i))}
                                                className="text-xs h-7 px-3 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary hover:border-primary"
                                            >
                                                全選択
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setSelectedFeatureIndices([])}
                                                className="text-xs h-7 px-3 text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40"
                                            >
                                                全解除
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="divide-y max-h-[400px] overflow-y-auto">
                                        {suggestions.map((sug, idx) => (
                                            <div
                                                key={idx}
                                                className={`p-4 flex items-start gap-4 transition-colors ${selectedFeatureIndices.includes(idx) ? 'hover:bg-primary/5' : 'hover:bg-secondary/10 opacity-60'}`}
                                            >
                                                <Checkbox
                                                    id={`sug-${idx}`}
                                                    checked={selectedFeatureIndices.includes(idx)}
                                                    onCheckedChange={() => toggleFeature(idx)}
                                                    className="mt-1"
                                                />
                                                <div className="grid gap-1 text-sm">
                                                    <Label htmlFor={`sug-${idx}`} className="font-medium cursor-pointer flex items-center gap-2">
                                                        {sug.description}
                                                        <Badge variant="secondary" className="text-[10px] font-normal h-5">{sug.suggestion_type}</Badge>
                                                    </Label>
                                                    <p className="text-muted-foreground text-xs">
                                                        テーブル: <span className="font-mono">{sug.table_name}</span> /
                                                        カラム: <span className="font-mono">{sug.column_name}</span> /
                                                        操作: <span className="font-mono">{sug.operations.join(", ")}</span>
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                </CardContent>
                <CardFooter className="flex justify-between pt-4 pb-6">
                    <Button variant="outline" onClick={handleBack} disabled={step === 1}>
                        戻る
                    </Button>

                    {step < 3 ? (() => {
                        // ステップごとに「次へ」ボタンが無効化される理由を計算する
                        const nextDisabledReason =
                            step === 1
                                ? !configName.trim()
                                    ? "設定名を入力してください"
                                    : !mainTableId
                                        ? "テーブルを選択してください"
                                        : null
                                : step === 2
                                    ? !targetColumnId
                                        ? "目的変数を選択してください"
                                        : null
                                    : null;
                        return (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className={nextDisabledReason ? "cursor-not-allowed inline-flex" : "inline-flex"}>
                                        <Button onClick={handleNext} size="default" className="gap-1" disabled={!!nextDisabledReason}>
                                            次へ <ChevronRight className="w-4 h-4" />
                                        </Button>
                                    </span>
                                </TooltipTrigger>
                                {nextDisabledReason && (
                                    <TooltipContent>{nextDisabledReason}</TooltipContent>
                                )}
                            </Tooltip>
                        );
                    })() : (
                        <Button onClick={handleSave} className="bg-primary hover:opacity-90 text-primary-foreground">
                            <Save className="w-4 h-4 mr-2" />
                            設定を保存して完了
                        </Button>
                    )}
                </CardFooter>
            </Card>

            {/* 分析設定削除確認ダイアログ */}
            <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>分析設定を削除しますか？</DialogTitle>
                        <DialogDescription>
                            「{deleteTarget?.name}」を削除します。<br />
                            この操作は元に戻せません。
                        </DialogDescription>
                        {deleteConfigImpact.count > 0 && !deleteConfigImpact.loading && (
                            <p className="text-sm text-destructive font-medium mt-1">
                                この設定を削除すると、{deleteConfigImpact.count}件の学習ジョブも削除されます。
                            </p>
                        )}
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                            キャンセル
                        </Button>
                        <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleting || deleteConfigImpact.loading}>
                            {deleting ? "削除中..." : "削除する"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
