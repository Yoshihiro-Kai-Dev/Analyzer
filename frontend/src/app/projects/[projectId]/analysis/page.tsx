"use client"

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, Circle, ChevronRight, AlertCircle, Save } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { AppAlertDialog } from '@/components/ui/app-alert-dialog';
import { useAppAlert } from '@/hooks/use-app-alert';
import { useParams } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api'

export default function AnalysisConfigPage() {
    const params = useParams();
    const projectId = params.projectId as string;
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);

    // Data
    const [tables, setTables] = useState<any[]>([]);
    const [suggestions, setSuggestions] = useState<any[]>([]);

    // Selections
    const [configName, setConfigName] = useState<string>("");
    const [mainTableId, setMainTableId] = useState<string>("");
    const [targetColumnId, setTargetColumnId] = useState<string>("");
    const [taskType, setTaskType] = useState<"regression" | "classification">("regression");
    const [modelType, setModelType] = useState<"gradient_boosting" | "logistic_regression">("gradient_boosting");

    // 特徴量設定（簡易的に全部ONにするため、OFFにするものだけリスト化する等の実装もありだが、今回は全部持つ）
    // Array of indices or IDs
    const [selectedFeatureIndices, setSelectedFeatureIndices] = useState<number[]>([]);
    const [validationError, setValidationError] = useState<string | null>(null);
    const { alertState, showAlert, closeAlert } = useAppAlert();

    useEffect(() => {
        if (!projectId) return;
        const fetchTables = async () => {
            try {
                const response = await axios.get(`${API_BASE_URL}/api/projects/${projectId}/tables`);
                setTables(response.data);
            } catch (error) {
                console.error("Failed to fetch tables", error);
            }
        };
        fetchTables();
    }, [projectId]);

    // Step 3に入ったときに提案を取得
    useEffect(() => {
        if (step === 3 && mainTableId && projectId) {
            const fetchSuggestions = async () => {
                setLoading(true);
                try {
                    const response = await axios.get(`${API_BASE_URL}/api/projects/${projectId}/analysis/suggest_features?main_table_id=${mainTableId}`);
                    setSuggestions(response.data);
                    // デフォルトですべて選択（インデックスで管理）
                    setSelectedFeatureIndices(response.data.map((_: unknown, idx: number) => idx));
                } catch (error) {
                    console.error("Failed to fetch suggestions", error);
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

            const response = await axios.post(`${API_BASE_URL}/api/projects/${projectId}/analysis/config`, payload);
            localStorage.setItem('lastAnalysisConfigId', response.data.id);
            showAlert("保存完了", "分析設定を保存しました。");

        } catch (error) {
            console.error("Save failed", error);
            showAlert("保存エラー", "保存に失敗しました。");
        }
    }

    const getTargetTable = () => {
        return tables.find(t => t.id.toString() === mainTableId);
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

    return (
        <div className="w-full min-h-screen bg-background p-8 flex justify-center items-start">
            <Card className="w-full max-w-4xl">
                <CardHeader>
                    <CardTitle>分析設定ウィザード</CardTitle>
                    <CardDescription>分析のパラメータを設定します。</CardDescription>

                    {/* Stepper */}
                    <div className="flex items-center space-x-4 mt-4 text-sm font-medium">
                        <div className={`flex items-center ${step >= 1 ? "text-primary" : "text-muted-foreground"}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 mr-2 ${step >= 1 ? "border-primary bg-primary/10" : "border-muted"}`}>1</div>
                            テーブル選択
                        </div>
                        <div className="w-10 h-0.5 bg-muted"></div>
                        <div className={`flex items-center ${step >= 2 ? "text-primary" : "text-muted-foreground"}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 mr-2 ${step >= 2 ? "border-primary bg-primary/10" : "border-muted"}`}>2</div>
                            目的変数
                        </div>
                        <div className="w-10 h-0.5 bg-muted"></div>
                        <div className={`flex items-center ${step >= 3 ? "text-primary" : "text-muted-foreground"}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 mr-2 ${step >= 3 ? "border-primary bg-primary/10" : "border-muted"}`}>3</div>
                            特徴量設定
                        </div>
                    </div>
                    {validationError && (
                        <p className="text-sm text-destructive mt-2">{validationError}</p>
                    )}
                </CardHeader>
                <Separator />
                <CardContent className="py-8 min-h-[400px]">

                    {/* Step 1: Main Table Selection */}
                    {step === 1 && (
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="config-name" className="text-lg">設定名</Label>
                                <p className="text-sm text-gray-500">この分析設定の名前を入力してください。後からダッシュボードで識別するために使います。</p>
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
                                <p className="text-sm text-gray-500">分析の主体となるデータ（例: 売上データ、ユーザーマスタなど）を選択してください。</p>
                            </div>

                            <RadioGroup value={mainTableId} onValueChange={setMainTableId} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {tables.map((table) => (
                                    <div key={table.id} className={`max-w-full flex items-start space-x-3 border p-4 rounded-lg cursor-pointer hover:bg-secondary/20 transition-colors ${mainTableId === table.id.toString() ? "border-primary bg-primary/10" : "border-input"}`}>
                                        <RadioGroupItem value={table.id.toString()} id={`t-${table.id}`} className="mt-1 text-primary" />
                                        <div className="grid gap-1.5 overflow-hidden w-full">
                                            <Label htmlFor={`t-${table.id}`} className="font-semibold cursor-pointer truncate text-base">
                                                {table.physical_table_name}
                                            </Label>
                                            <p className="text-xs text-gray-500 truncate" title={table.original_filename}>
                                                元ファイル: {table.original_filename}
                                            </p>
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
                        </div>
                    )}

                    {/* Step 2: Target Column Selection */}
                    {step === 2 && getTargetTable() && (
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label className="text-lg">予測対象（目的変数）を選択</Label>
                                <p className="text-sm text-gray-500">
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
                                            <span className="text-xs text-gray-400">{col.data_type}</span>
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
                                <p className="text-sm text-gray-500">学習に使用するアルゴリズムを選択してください。</p>
                                <RadioGroup
                                    value={modelType}
                                    onValueChange={(v) => setModelType(v as "gradient_boosting" | "logistic_regression")}
                                    className="grid grid-cols-1 md:grid-cols-2 gap-3"
                                >
                                    <div className={`flex items-start space-x-3 border p-4 rounded-lg cursor-pointer transition-colors hover:bg-secondary/20 ${modelType === 'gradient_boosting' ? 'border-primary bg-primary/10' : 'border-input'}`}>
                                        <RadioGroupItem value="gradient_boosting" id="m-gb" className="mt-1 text-primary" />
                                        <div>
                                            <Label htmlFor="m-gb" className="font-semibold cursor-pointer text-sm">勾配ブースティング (LightGBM)</Label>
                                            <p className="text-xs text-gray-500 mt-0.5">非線形・複雑な関係の把握に強い高精度モデル</p>
                                        </div>
                                    </div>
                                    <div className={`flex items-start space-x-3 border p-4 rounded-lg cursor-pointer transition-colors hover:bg-secondary/20 ${modelType === 'logistic_regression' ? 'border-primary bg-primary/10' : 'border-input'}`}>
                                        <RadioGroupItem value="logistic_regression" id="m-lr" className="mt-1 text-primary" />
                                        <div>
                                            <Label htmlFor="m-lr" className="font-semibold cursor-pointer text-sm">
                                                {taskType === 'classification' ? 'ロジスティック回帰' : '線形回帰'}
                                            </Label>
                                            <p className="text-xs text-gray-500 mt-0.5">シンプルで解釈しやすい線形モデル</p>
                                        </div>
                                    </div>
                                </RadioGroup>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Feature Suggestions */}
                    {step === 3 && (
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label className="text-lg">特徴量エンジニアリング（自動提案）</Label>
                                <p className="text-sm text-gray-500">
                                    リレーション定義に基づき、以下の特徴量を自動生成します。<br />
                                    不要なものはチェックを外してください。
                                </p>
                            </div>

                            {loading ? (
                                <div className="flex justify-center py-10 text-gray-400">提案を生成中...</div>
                            ) : suggestions.length === 0 ? (
                                <div className="text-center py-10 text-muted-foreground bg-secondary/20 rounded-lg border border-dashed border-border">
                                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    提案可能な特徴量がありません。<br />
                                    <span className="text-xs">リレーションが定義されていないか、結合可能なテーブルがありません。「結合設定」画面を確認してください。</span>
                                </div>
                            ) : (
                                <div className="border rounded-lg overflow-hidden">
                                    <div className="flex items-center justify-between p-3 bg-secondary/30 border-b">
                                        <span className="text-sm font-medium">{suggestions.length} 個の提案</span>
                                        <Button variant="ghost" size="sm" onClick={() => setSelectedFeatureIndices(suggestions.map((_, i) => i))} className="text-xs h-8">
                                            すべて選択
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => setSelectedFeatureIndices([])} className="text-xs h-8">
                                            すべて解除
                                        </Button>
                                    </div>
                                    <div className="divide-y max-h-[400px] overflow-y-auto">
                                        {suggestions.map((sug, idx) => (
                                            <div key={idx} className="p-4 flex items-start gap-4 hover:bg-secondary/10">
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
                                                    <p className="text-gray-500 text-xs">
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

                    {step < 3 ? (
                        <Button onClick={handleNext}>
                            次へ <ChevronRight className="w-4 h-4 ml-2" />
                        </Button>
                    ) : (
                        <Button onClick={handleSave} className="bg-primary hover:opacity-90 text-primary-foreground">
                            <Save className="w-4 h-4 mr-2" />
                            設定を保存して完了
                        </Button>
                    )}
                </CardFooter>
            </Card>

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
