# モデル診断レポート Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ダッシュボードの「AI アナリティクス・インサイト」を、ルールベースの診断ロジックと初学者向け解説を備えた「モデル診断レポート」に置き換える。

**Architecture:** バックエンド `ml_service.py` の `_generate_simple_insight` を `_generate_diagnostic_report` にリライトし、trainメトリクスの追加計算・6つの診断項目の判定ロジックを実装する。フロントエンドはタイトル・アイコン変更とアコーディオン化のみ。DBスキーマ・APIは変更なし。

**Tech Stack:** Python (sklearn metrics), Next.js (React, ReactMarkdown, Phosphor Icons), TailwindCSS

**Spec:** `docs/superpowers/specs/2026-04-02-diagnostic-report-design.md`

---

## File Structure

| ファイル | 操作 | 責務 |
|---|---|---|
| `backend/app/services/ml_service.py` | Modify | trainメトリクス計算追加 + `_generate_diagnostic_report` リライト |
| `frontend/src/app/projects/[projectId]/dashboard/page.tsx` | Modify | タイトル・アイコン変更 + アコーディオン化 |

---

### Task 1: trainメトリクスの計算を追加

**Files:**
- Modify: `backend/app/services/ml_service.py:8` (import追加)
- Modify: `backend/app/services/ml_service.py:195-232` (メトリクス計算部分)

- [ ] **Step 1: sklearn importに precision_score, recall_score を追加**

`backend/app/services/ml_service.py` の8行目を修正:

```python
from sklearn.metrics import mean_squared_error, r2_score, accuracy_score, roc_auc_score, f1_score, precision_score, recall_score
```

- [ ] **Step 2: trainメトリクスの計算を追加し、診断レポート呼び出しを変更**

`backend/app/services/ml_service.py` の196〜232行目付近を以下に置き換える。
変更点:
- `y_train_pred` を計算（線形モデルは `X_train_s`、LightGBMは `X_train` を使う）
- `train_metrics` dictを算出
- 分類タスクで `precision` / `recall` を `metrics` に追加（クラス不均衡検出用）
- `_generate_simple_insight` → `_generate_diagnostic_report` に呼び出し変更

```python
            logger.info("[ML-JOB] Starting prediction on test set...")
            logger.info(f"[ML-JOB] Prediction done. y_pred sample: {y_pred[:5]}")

            # trainデータへの予測（過学習検出用）
            if model_type == 'logistic_regression':
                y_train_pred = sk_model.predict(X_train_s)
            else:
                y_train_pred = sk_model.predict(X_train)

            # テストデータのメトリクス
            metrics = {}
            train_metrics = {}
            if config.task_type == 'regression':
                metrics['rmse'] = float(np.sqrt(mean_squared_error(y_test, y_pred)))
                metrics['r2']   = float(r2_score(y_test, y_pred))
                train_metrics['rmse'] = float(np.sqrt(mean_squared_error(y_train, y_train_pred)))
                train_metrics['r2']   = float(r2_score(y_train, y_train_pred))
            else:
                metrics['accuracy'] = float(accuracy_score(y_test, y_pred))
                train_metrics['accuracy'] = float(accuracy_score(y_train, y_train_pred))
                # Precision / Recall（クラス不均衡検出用）
                avg = 'binary' if y.nunique() == 2 else 'macro'
                try:
                    metrics['precision'] = float(precision_score(y_test, y_pred, average=avg, zero_division=0))
                    metrics['recall']    = float(recall_score(y_test, y_pred, average=avg, zero_division=0))
                except Exception as e:
                    logger.warning(f"[ML-JOB] Precision/Recall computation failed: {e}")
                # AUC: ロジスティック回帰・GBM ともに predict_proba があれば計算
                if hasattr(sk_model, 'predict_proba'):
                    try:
                        y_proba = sk_model.predict_proba(X_test_s)
                        if y_proba.shape[1] == 2:  # 二値分類
                            metrics['auc'] = float(roc_auc_score(y_test, y_proba[:, 1]))
                        else:
                            metrics['auc'] = float(roc_auc_score(
                                y_test, y_proba, multi_class='ovr', average='macro'
                            ))
                    except Exception as e:
                        logger.warning(f"[ML-JOB] AUC computation failed: {e}")

            # 5. 特徴量重要度 & 相関係数
            full_correlations = X.corrwith(y)

            fi_list = []
            for name, imp in zip(feature_names, importance):
                corr_val = full_correlations.get(name, 0.0)
                fi_list.append({
                    "feature": name,
                    "importance": float(imp),
                    "correlation": float(corr_val) if not pd.isna(corr_val) else 0.0
                })
            fi_list.sort(key=lambda x: x['importance'], reverse=True)

            # 6. モデル診断レポート生成
            insight_text = self._generate_diagnostic_report(
                config.task_type, metrics, train_metrics, fi_list, model_type
            )
```

- [ ] **Step 3: Dockerビルドして起動確認**

```bash
docker compose up --build -d
docker compose logs backend --tail=50
```

確認: バックエンドが正常に起動していること（import エラーがないこと）。

- [ ] **Step 4: コミット**

```bash
git add backend/app/services/ml_service.py
git commit -m "feat: trainメトリクス計算を追加（過学習検出・クラス不均衡検出用）"
```

---

### Task 2: `_generate_diagnostic_report` の実装

**Files:**
- Modify: `backend/app/services/ml_service.py:528-585` (`_generate_simple_insight` を置き換え)

- [ ] **Step 1: `_generate_simple_insight` を `_generate_diagnostic_report` に置き換え**

`backend/app/services/ml_service.py` の528〜585行目（`_generate_simple_insight` メソッド全体）を以下に置き換える:

```python
    def _generate_diagnostic_report(self, task_type: str, metrics: dict,
                                     train_metrics: dict, fi_list: list,
                                     model_type: str = "gradient_boosting") -> str:
        """
        ルールベースのモデル診断レポートを生成する。
        各診断項目は「判定 → 根拠 → 初学者向け解説 → 対策」の構造で出力する。
        """
        model_label = {
            "gradient_boosting": "勾配ブースティング (LightGBM)",
            "logistic_regression": "ロジスティック回帰" if task_type == "classification" else "線形回帰",
        }.get(model_type, model_type)

        lines = []
        lines.append(f"## モデル診断レポート（{task_type} / {model_label}）")

        # ── 1. モデル精度の総合判定 ──
        lines.append("\n### モデル精度")
        if task_type == 'regression':
            r2 = metrics.get('r2', 0)
            rmse = metrics.get('rmse', 0)
            if r2 > 0.8:
                lines.append(f"✅ 良好な予測精度です（R² = {r2:.2f}, RMSE = {rmse:.2f}）。")
            elif r2 > 0.5:
                lines.append(f"⚠ 一定の傾向を捉えていますが、改善の余地があります（R² = {r2:.2f}, RMSE = {rmse:.2f}）。")
            else:
                lines.append(f"🔴 予測精度が低い状態です（R² = {r2:.2f}, RMSE = {rmse:.2f}）。")
            lines.append(f"> R²は「モデルがデータの変動をどれだけ説明できるか」を表す指標で、")
            lines.append(f"> 1.0に近いほど優秀です。0.8以上なら実用的な水準といえます。")
            lines.append(f"> RMSEは予測のズレの大きさで、小さいほど正確です。")
        else:
            acc = metrics.get('accuracy', 0)
            if acc > 0.9:
                lines.append(f"✅ 非常に高い分類精度です（Accuracy = {acc:.2f}）。")
            elif acc > 0.7:
                lines.append(f"⚠ 良好ですが、さらに改善できる可能性があります（Accuracy = {acc:.2f}）。")
            else:
                lines.append(f"🔴 分類精度が低い状態です（Accuracy = {acc:.2f}）。")
            lines.append(f"> Accuracyは「全データのうち正しく分類できた割合」です。")
            lines.append(f"> 0.9以上なら非常に良好、0.7以上なら実用的な水準です。")

        # ── 2. 過学習の兆候検出 ──
        lines.append("\n### 過学習チェック")
        if task_type == 'regression':
            train_val = train_metrics.get('r2', 0)
            test_val = metrics.get('r2', 0)
            metric_name = "R²"
        else:
            train_val = train_metrics.get('accuracy', 0)
            test_val = metrics.get('accuracy', 0)
            metric_name = "Accuracy"

        gap = train_val - test_val
        if gap >= 0.2:
            lines.append(f"🔴 過学習の可能性が高いです（学習データ {metric_name}: {train_val:.2f} → テストデータ {metric_name}: {test_val:.2f}）")
            lines.append(f"> 学習データでは高精度なのに、未知のデータでは大きく精度が落ちています。")
            lines.append(f"> モデルがデータの「ノイズ」まで覚えてしまっている状態です。")
            lines.append(f">")
            lines.append(f"> **対策**: 特徴量を減らす、データ件数を増やす、またはモデルの複雑さを下げることを検討してください。")
        elif gap >= 0.1:
            lines.append(f"⚠ 過学習の兆候があります（学習データ {metric_name}: {train_val:.2f} → テストデータ {metric_name}: {test_val:.2f}）")
            lines.append(f"> 学習データと未知のデータで精度に差が出ています。")
            lines.append(f"> まだ深刻ではありませんが、特徴量の見直しを検討してもよいでしょう。")
        else:
            lines.append(f"✅ 過学習の兆候はありません（学習データ {metric_name}: {train_val:.2f} → テストデータ {metric_name}: {test_val:.2f}）。")
            lines.append(f"> 学習データとテストデータで精度に大きな差がなく、安定したモデルです。")

        # ── 3. クラス不均衡の指摘（分類のみ） ──
        if task_type == 'classification':
            lines.append("\n### クラス不均衡チェック")
            prec = metrics.get('precision', None)
            rec = metrics.get('recall', None)
            if prec is not None and rec is not None:
                diff = abs(prec - rec)
                if diff >= 0.15:
                    lines.append(f"⚠ クラス不均衡の可能性があります（Precision: {prec:.2f}, Recall: {rec:.2f}）。")
                    lines.append(f"> Precisionは「モデルが陽性と予測したもののうち、実際に陽性だった割合」、")
                    lines.append(f"> Recallは「実際の陽性のうち、モデルが正しく検出できた割合」です。")
                    lines.append(f"> この2つに大きな差がある場合、データの偏り（あるクラスが極端に多い/少ない）が原因の可能性があります。")
                    lines.append(f">")
                    lines.append(f"> **対策**: データのクラス比率を確認し、少数クラスのデータを増やすか、サンプリング手法の適用を検討してください。")
                else:
                    lines.append(f"✅ クラス不均衡の問題は見られません（Precision: {prec:.2f}, Recall: {rec:.2f}）。")
                    lines.append(f"> PrecisionとRecallのバランスが取れており、特定クラスへの偏りはありません。")
            else:
                lines.append("ℹ Precision/Recallが計算できなかったため、チェックをスキップしました。")

        # ── 4. 特徴量の支配度チェック ──
        lines.append("\n### 特徴量の支配度")
        if fi_list:
            total_importance = sum(f['importance'] for f in fi_list)
            if total_importance > 0:
                top_ratio = fi_list[0]['importance'] / total_importance
                top_name = fi_list[0]['feature']
                if top_ratio >= 0.5:
                    lines.append(f"⚠ 特徴量「{top_name}」が重要度の {top_ratio:.0%} を占めています。")
                    lines.append(f"> 1つの特徴量にモデルが頼りすぎている状態です。")
                    lines.append(f"> その特徴量に欠損やノイズがあると、予測全体に大きく影響します。")
                    lines.append(f">")
                    lines.append(f"> **対策**: 「{top_name}」に関連する別の特徴量を追加するか、この特徴量が本当に予測に使って良いものか確認してください。")
                else:
                    lines.append(f"✅ 特徴量の重要度は分散しています（最大:「{top_name}」= {top_ratio:.0%}）。")
                    lines.append(f"> 特定の特徴量に過度に依存しておらず、バランスの良いモデルです。")
            else:
                lines.append("ℹ 特徴量の重要度が計算できませんでした。")
        else:
            lines.append("ℹ 特徴量情報がありません。")

        # ── 5. 低寄与特徴量の指摘 ──
        lines.append("\n### 低寄与の特徴量")
        if fi_list:
            total_importance = sum(f['importance'] for f in fi_list)
            if total_importance > 0:
                low_features = [f for f in fi_list if f['importance'] / total_importance < 0.01]
                if low_features:
                    lines.append("以下の特徴量はモデルにほとんど影響を与えていません:")
                    for f in low_features:
                        ratio = f['importance'] / total_importance
                        lines.append(f"- {f['feature']}（重要度: {ratio:.2%}）")
                    lines.append(f"> これらを除外しても精度はほぼ変わりません。")
                    lines.append(f"> 特徴量を減らすことでモデルがシンプルになり、過学習の防止にもつながります。")
                else:
                    lines.append("✅ すべての特徴量が一定の寄与を持っています。除外すべき特徴量はありません。")
            else:
                lines.append("ℹ 特徴量の重要度が計算できませんでした。")
        else:
            lines.append("ℹ 特徴量情報がありません。")

        # ── 6. 改善のヒント ──
        hints = self._build_improvement_hints(
            task_type, metrics, train_metrics, fi_list
        )
        if hints:
            lines.append("\n### 💡 改善のヒント")
            for i, hint in enumerate(hints, 1):
                lines.append(f"{i}. {hint}")

        return "\n".join(lines)

    def _build_improvement_hints(self, task_type: str, metrics: dict,
                                  train_metrics: dict, fi_list: list) -> list[str]:
        """
        診断結果に基づいて改善のヒントを生成する。
        """
        hints = []

        # 過学習 → 低寄与特徴量の除外を提案
        if task_type == 'regression':
            gap = train_metrics.get('r2', 0) - metrics.get('r2', 0)
        else:
            gap = train_metrics.get('accuracy', 0) - metrics.get('accuracy', 0)

        total_importance = sum(f['importance'] for f in fi_list) if fi_list else 0
        low_features = []
        if total_importance > 0:
            low_features = [f['feature'] for f in fi_list if f['importance'] / total_importance < 0.01]

        if gap >= 0.1 and low_features:
            names = "、".join(low_features[:5])
            hints.append(f"過学習の兆候があるため、低寄与の特徴量（{names}）を除外して再学習してみてください。")
        elif gap >= 0.1:
            hints.append("過学習の兆候があります。特徴量の数を減らすか、データ件数を増やすことを検討してください。")
        elif low_features:
            names = "、".join(low_features[:5])
            hints.append(f"低寄与の特徴量（{names}）を除外すると、モデルがシンプルになります。")

        # 特徴量支配度 → 補完特徴量の追加を提案
        if fi_list and total_importance > 0:
            top_ratio = fi_list[0]['importance'] / total_importance
            if top_ratio >= 0.5:
                hints.append(f"「{fi_list[0]['feature']}」への依存度が高いため、これを補完する特徴量の追加を検討してください。")

        # クラス不均衡
        if task_type == 'classification':
            prec = metrics.get('precision', 0)
            rec = metrics.get('recall', 0)
            if abs(prec - rec) >= 0.15:
                hints.append("PrecisionとRecallに偏りがあります。データのクラス比率を確認してください。")

        # 精度が低い場合の一般的な提案
        if task_type == 'regression' and metrics.get('r2', 0) < 0.5:
            hints.append("予測精度が低めです。特徴量の追加やデータの前処理（欠損値補完、外れ値除去など）を検討してください。")
        elif task_type == 'classification' and metrics.get('accuracy', 0) < 0.7:
            hints.append("分類精度が低めです。特徴量の追加やデータの前処理を検討してください。")

        return hints
```

- [ ] **Step 2: Dockerビルドして起動確認**

```bash
docker compose up --build -d
docker compose logs backend --tail=50
```

確認: バックエンドが正常に起動していること。

- [ ] **Step 3: コミット**

```bash
git add backend/app/services/ml_service.py
git commit -m "feat: _generate_diagnostic_report を実装（6つの診断項目+改善ヒント）"
```

---

### Task 3: フロントエンド — タイトル・アイコン変更とアコーディオン化

**Files:**
- Modify: `frontend/src/app/projects/[projectId]/dashboard/page.tsx:8` (import変更)
- Modify: `frontend/src/app/projects/[projectId]/dashboard/page.tsx:530-541` (表示部分)

- [ ] **Step 1: Phosphor Icons の import を変更**

`frontend/src/app/projects/[projectId]/dashboard/page.tsx` の8行目:

変更前:
```typescript
import { Play, CircleNotch, Question, GitBranch, ListBullets, Table, Sparkle } from '@phosphor-icons/react';
```

変更後:
```typescript
import { Play, CircleNotch, Question, GitBranch, ListBullets, Table, Stethoscope } from '@phosphor-icons/react';
```

`Sparkle` → `Stethoscope` に変更。`Sparkle` が他の箇所で使われていなければ削除してよい。

- [ ] **Step 2: 表示セクションをアコーディオン化**

`frontend/src/app/projects/[projectId]/dashboard/page.tsx` の530〜541行目付近:

変更前:
```tsx
                    {/* AI アナリティクス・インサイト */}
                    {result.ai_analysis_text && (
                        <section className="border-l-4 border-amber-400 pl-5 py-1">
                            <div className="flex items-center gap-1.5 mb-3">
                                <Sparkle className="w-4 h-4 text-amber-500" weight="fill" />
                                <h2 className="text-sm font-medium text-zinc-700">AI アナリティクス・インサイト</h2>
                            </div>
                            <div className="prose prose-sm max-w-none text-zinc-600 leading-relaxed">
                                <ReactMarkdown>{stripTablePrefix(result.ai_analysis_text)}</ReactMarkdown>
                            </div>
                        </section>
                    )}
```

変更後:
```tsx
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
```

ポイント:
- `<details>` + `<summary>` でネイティブHTMLアコーディオン（デフォルト閉じ）
- `list-none` と `[&::-webkit-details-marker]:hidden` でブラウザデフォルトの三角マーカーを非表示
- 「（クリックで展開）」の補助テキストで操作方法を明示

- [ ] **Step 3: フロントエンドをビルドして動作確認**

```bash
docker compose build frontend && docker compose up -d frontend
```

確認: ダッシュボードで学習結果を表示し、以下を確認:
1. 「モデル診断レポート」というタイトルで表示されること
2. デフォルトで閉じた状態であること
3. クリックで展開し、Markdown内容が正しくレンダリングされること
4. 聴診器アイコンが表示されること

- [ ] **Step 4: コミット**

```bash
git add frontend/src/app/projects/[projectId]/dashboard/page.tsx
git commit -m "feat: AIアナリティクス・インサイトをモデル診断レポートにリニューアル（アコーディオン化）"
```

---

### Task 4: 結合テスト（Docker環境で実データ確認）

- [ ] **Step 1: 回帰タスクでの動作確認**

ブラウザで既存プロジェクトの回帰モデルを再学習し、ダッシュボードで診断レポートの内容を確認する。

確認項目:
- 「モデル精度」セクションにR²とRMSEが表示されること
- 「過学習チェック」セクションに学習/テストの比較が表示されること
- 「クラス不均衡チェック」が回帰タスクでは表示されないこと
- 「特徴量の支配度」と「低寄与の特徴量」が正しく判定されていること
- 「改善のヒント」が診断結果に応じて生成されていること
- 引用ブロック（`>`）の解説文が正しくレンダリングされていること

- [ ] **Step 2: 分類タスクでの動作確認**

分類モデルを学習し、ダッシュボードで診断レポートを確認する。

確認項目:
- 「モデル精度」セクションにAccuracyが表示されること
- 「クラス不均衡チェック」セクションにPrecision/Recallが表示されること
- 全6セクション + 改善のヒントが正しく表示されること

- [ ] **Step 3: 最終コミット（必要に応じて修正があれば）**

```bash
git add -u
git commit -m "fix: モデル診断レポートの微修正"
```
