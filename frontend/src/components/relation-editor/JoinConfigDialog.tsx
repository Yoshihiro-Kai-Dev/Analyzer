import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface JoinConfigDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (config: JoinConfig) => void;
    sourceNode: any;
    targetNode: any;
    initialParentColumn?: string;
    initialChildColumn?: string;
}

export interface JoinConfig {
    parentColumn: string;
    childColumn: string;
    cardinality: "OneToOne" | "OneToMany";
}

export function JoinConfigDialog({ isOpen, onClose, onSave, sourceNode, targetNode, initialParentColumn, initialChildColumn }: JoinConfigDialogProps) {
    const [parentColumn, setParentColumn] = useState<string>("");
    const [childColumn, setChildColumn] = useState<string>("");
    const [cardinality, setCardinality] = useState<"OneToOne" | "OneToMany">("OneToMany");
    const [validationError, setValidationError] = useState<string | null>(null);

    // ダイアログを開くたびに初期値をセット
    useEffect(() => {
        if (isOpen) {
            setParentColumn(initialParentColumn ?? "");
            setChildColumn(initialChildColumn ?? "");
            setCardinality("OneToMany");
            setValidationError(null);
        }
    }, [isOpen, initialParentColumn, initialChildColumn]);

    const handleSave = () => {
        if (!parentColumn || !childColumn) {
            setValidationError("結合キーを両方選択してください");
            return;
        }
        setValidationError(null);
        onSave({
            parentColumn,
            childColumn,
            cardinality
        });
        onClose();
    };

    if (!sourceNode || !targetNode) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            {/* 動的な幅調整: コンテンツに合わせて広がるが、画面幅の95%を超えないようにする */}
            <DialogContent className="sm:max-w-none w-fit max-w-[95vw] min-w-[500px]">
                <DialogHeader>
                    <DialogTitle>リレーション設定</DialogTitle>
                    <DialogDescription>
                        テーブル間の結合条件を設定してください。
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-6 py-4">
                    <div className="flex items-center justify-between gap-8">
                        {/* Parent Table (Source) */}
                        <div className="flex flex-col gap-2 min-w-[200px]">
                            <Label className="font-bold whitespace-nowrap" title={sourceNode.data.label}>
                                元: {sourceNode.data.label}
                            </Label>
                            <Select onValueChange={setParentColumn} value={parentColumn}>
                                <SelectTrigger>
                                    <SelectValue placeholder="カラム選択" />
                                </SelectTrigger>
                                <SelectContent>
                                    {sourceNode.data.columns.map((col: any) => (
                                        <SelectItem key={col.physical_name} value={col.physical_name}>
                                            {col.physical_name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Child Table (Target) */}
                        <div className="flex flex-col gap-2 min-w-[200px]">
                            <Label className="font-bold whitespace-nowrap" title={targetNode.data.label}>
                                先: {targetNode.data.label}
                            </Label>
                            <Select onValueChange={setChildColumn} value={childColumn}>
                                <SelectTrigger>
                                    <SelectValue placeholder="カラム選択" />
                                </SelectTrigger>
                                <SelectContent>
                                    {targetNode.data.columns.map((col: any) => (
                                        <SelectItem key={col.physical_name} value={col.physical_name}>
                                            {col.physical_name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Cardinality */}
                    <div className="space-y-3">
                        <Label className="font-bold">カーディナリティ（関係性）</Label>
                        <RadioGroup defaultValue="OneToMany" value={cardinality} onValueChange={(val) => setCardinality(val as any)} className="flex gap-6 whitespace-nowrap">
                            <div className="flex items-center space-x-2 border p-3 rounded-md flex-1 hover:bg-slate-50 cursor-pointer min-w-[250px]">
                                <RadioGroupItem value="OneToMany" id="r1" />
                                <Label htmlFor="r1" className="cursor-pointer">
                                    1 : N（1対多）
                                    <span className="block text-xs text-gray-500 font-normal mt-1">通常はこちらを選択</span>
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2 border p-3 rounded-md flex-1 hover:bg-slate-50 cursor-pointer min-w-[250px]">
                                <RadioGroupItem value="OneToOne" id="r2" />
                                <Label htmlFor="r2" className="cursor-pointer">
                                    1 : 1（1対1）
                                    <span className="block text-xs text-gray-500 font-normal mt-1">正副テーブルの関係など</span>
                                </Label>
                            </div>
                        </RadioGroup>
                    </div>
                </div>

                {validationError && (
                    <p className="text-sm text-destructive">{validationError}</p>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>キャンセル</Button>
                    <Button onClick={handleSave}>設定を保存</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
