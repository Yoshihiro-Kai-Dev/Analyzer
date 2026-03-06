import pandas as pd
import numpy as np

# ---------------------------------------------------------
# 設定・初期化
# ---------------------------------------------------------
# シナリオ: 小売チェーンの商品カテゴリ別・月次売上予測
# 目的変数: 月次売上金額（万円） ← 回帰タスク
#
# テーブル構成（2テーブル結合）:
#   CSV①: 店舗マスタ       （親テーブル, 結合キー: 店舗ID）
#   CSV②: 販売実績テーブル  （子テーブル, 結合キー: 店舗ID, 目的変数あり）
#
# 主なリスク・影響因子:
#   店舗側: 店舗タイプ・売場面積・立地（地域/徒歩距離）・競合環境・開業年数
#   販売側: 商品カテゴリ・価格帯・販促実施・陳列位置・月・季節性・天候
# ---------------------------------------------------------

np.random.seed(42)

NUM_STORES = 300
NUM_RECORDS = 60000

print("CSV①（店舗マスタ）を作成中...")

# ---------------------------------------------------------
# CSV①: 店舗マスタ
# ---------------------------------------------------------
store_ids = [f'S{str(i).zfill(4)}' for i in range(1, NUM_STORES + 1)]

# 店舗タイプ: 1=SC型(ショッピングセンター), 2=駅前型, 3=郊外型
store_types = np.random.choice([1, 2, 3], NUM_STORES, p=[0.25, 0.45, 0.30])

# 地域ブロック: 1-8 (1-3=都市圏, 4-6=地方都市, 7-8=地方)
regions = np.random.choice(range(1, 9), NUM_STORES,
                           p=[0.10, 0.10, 0.10, 0.15, 0.15, 0.15, 0.15, 0.10])

# 開業年数: 1-25年
years_open = np.random.randint(1, 26, NUM_STORES)

# 売場面積 (㎡): 店舗タイプによって分布が異なる
floor_areas = []
for st in store_types:
    if st == 1:   # SC型: 大規模
        fa = np.clip(np.random.normal(1500, 400), 500, 3000)
    elif st == 2: # 駅前型: 小〜中規模
        fa = np.clip(np.random.normal(250, 80), 80, 600)
    else:         # 郊外型: 中〜大規模
        fa = np.clip(np.random.normal(700, 200), 200, 1500)
    floor_areas.append(round(fa))

# 最寄り駅徒歩分
walk_minutes = []
for st in store_types:
    if st == 2:   # 駅前型: 駅近
        wm = np.clip(np.random.normal(3, 2), 0, 10)
    elif st == 1: # SC型: やや遠い
        wm = np.clip(np.random.normal(15, 5), 5, 30)
    else:         # 郊外型: 遠い
        wm = np.clip(np.random.normal(20, 7), 5, 40)
    walk_minutes.append(int(wm))

# 競合店数 (半径1km): 都市圏ほど多い
competitor_counts = []
for r in regions:
    if r <= 3:   # 都市圏
        cc = np.clip(np.random.poisson(5), 0, 12)
    elif r <= 6: # 地方都市
        cc = np.clip(np.random.poisson(3), 0, 8)
    else:        # 地方
        cc = np.clip(np.random.poisson(1), 0, 5)
    competitor_counts.append(int(cc))

# 駐車場台数: 郊外型・SC型は多い
parking_spaces = []
for st in store_types:
    if st == 1:   # SC型
        ps = np.clip(np.random.normal(300, 100), 50, 600)
    elif st == 2: # 駅前型: 少ない
        ps = np.clip(np.random.normal(20, 15), 0, 60)
    else:         # 郊外型
        ps = np.clip(np.random.normal(120, 40), 20, 250)
    parking_spaces.append(int(ps))

df_store = pd.DataFrame({
    '店舗ID':         store_ids,
    '店舗タイプ':      store_types,        # 1=SC型, 2=駅前型, 3=郊外型
    '地域ブロック':    regions,             # 1-8 (1-3=都市圏, 4-6=地方都市, 7-8=地方)
    '開業年数':        years_open,          # 1-25年
    '売場面積':        floor_areas,         # ㎡
    '最寄り駅徒歩分':  walk_minutes,        # 分
    '競合店数':        competitor_counts,   # 半径1km以内の競合店舗数
    '駐車場台数':      parking_spaces,      # 収容台数
})

df_store.to_csv('01_店舗マスタ.csv', index=False, encoding='utf-8-sig')
print("-> '01_店舗マスタ.csv' を出力しました。")


# ---------------------------------------------------------
# CSV②: 販売実績テーブル（目的変数あり）
# ---------------------------------------------------------
print("CSV②（販売実績）を作成中...")

# 店舗参照用インデックスマップ（高速化）
store_lookup = {sid: i for i, sid in enumerate(store_ids)}

# 各レコードの店舗IDをランダム割り当て
rec_store_ids = np.random.choice(store_ids, NUM_RECORDS, replace=True)

# 商品カテゴリ: 1=食品, 2=飲料, 3=日用品, 4=衣料・服飾, 5=家電・雑貨, 6=趣味・スポーツ
product_categories = np.random.choice(range(1, 7), NUM_RECORDS,
                                       p=[0.25, 0.15, 0.20, 0.15, 0.15, 0.10])

# 価格帯: 1(低価格)〜5(高価格)
price_ranges = np.random.choice(range(1, 6), NUM_RECORDS,
                                 p=[0.15, 0.25, 0.30, 0.20, 0.10])

# 販促実施フラグ: 0=なし, 1=あり（セール・チラシ等）
promotion_flags = np.random.choice([0, 1], NUM_RECORDS, p=[0.65, 0.35])

# 陳列位置スコア: 1(悪い)〜5(目立つ場所・エンド棚等)
display_positions = np.random.choice(range(1, 6), NUM_RECORDS,
                                      p=[0.10, 0.20, 0.35, 0.25, 0.10])

# 対象月: 1-12月
months = np.random.choice(range(1, 13), NUM_RECORDS)

# 季節指数: カテゴリ×月で変化（食品は冬高め、飲料は夏高め等）
SEASON_MAP = {
    1: [0.90, 0.85, 0.95, 1.00, 1.05, 1.10, 1.15, 1.10, 1.00, 1.00, 1.05, 1.15], # 食品: 夏・冬高
    2: [0.80, 0.80, 0.90, 1.00, 1.10, 1.20, 1.30, 1.30, 1.00, 0.90, 0.85, 0.85], # 飲料: 夏高
    3: [1.00, 0.95, 1.05, 1.00, 0.95, 0.90, 0.95, 0.95, 1.00, 1.00, 1.10, 1.20], # 日用品: 年末高
    4: [1.00, 0.90, 1.10, 1.00, 0.90, 0.85, 0.85, 0.90, 1.00, 1.00, 1.10, 1.20], # 衣料: 春秋・冬高
    5: [0.90, 0.90, 0.95, 1.00, 1.00, 0.95, 0.95, 0.95, 1.00, 1.00, 1.10, 1.30], # 家電: 冬(年末)高
    6: [0.90, 0.90, 1.00, 1.00, 1.10, 1.10, 1.20, 1.20, 1.00, 1.00, 0.95, 1.00], # 趣味: 夏高
}

seasonal_indices = np.array([
    round(float(np.clip(SEASON_MAP[cat][m - 1] + np.random.normal(0, 0.05), 0.5, 1.8)), 2)
    for cat, m in zip(product_categories, months)
])

# 天候スコア: 1(悪天候)〜5(好天候)
weather_scores = np.random.choice(range(1, 6), NUM_RECORDS,
                                   p=[0.10, 0.15, 0.40, 0.25, 0.10])


# ---------------------------------------------------------
# 【目的変数】月次売上金額（万円）の計算
# ---------------------------------------------------------
CATEGORY_BASE   = {1: 180.0, 2: 120.0, 3: 150.0, 4: 100.0, 5: 200.0, 6:  80.0}
STORE_TYPE_MULT = {1: 2.5,   2: 1.0,   3: 1.5}                         # SC型が最大
REGION_MULT     = {1: 1.3, 2: 1.3, 3: 1.3, 4: 1.0, 5: 1.0, 6: 1.0, 7: 0.75, 8: 0.75}

monthly_sales = []

for i in range(NUM_RECORDS):
    si = store_lookup[rec_store_ids[i]]

    st    = store_types[si]
    reg   = regions[si]
    years = years_open[si]
    area  = floor_areas[si]
    walk  = walk_minutes[si]
    comps = competitor_counts[si]
    park  = parking_spaces[si]

    cat    = product_categories[i]
    price  = price_ranges[i]
    promo  = promotion_flags[i]
    disp   = display_positions[i]
    season = seasonal_indices[i]
    wthr   = weather_scores[i]

    # --- カテゴリ基準売上 × 店舗タイプ補正 ---
    base = CATEGORY_BASE[cat] * STORE_TYPE_MULT[st]

    # --- 売場面積効果（対数スケール: 面積が広いほど増加するが逓減）---
    base *= np.log(area / 200 + 1) * 0.5 + 0.7

    # --- 地域補正（都市圏ほど高い）---
    base *= REGION_MULT[reg]

    # --- 開業年数（ブランド・常連客効果、対数逓増）---
    base *= 1.0 + np.log(years + 1) * 0.08

    # --- 競合環境（競合が多いほど売上減）---
    base *= np.exp(-comps * 0.05)

    # --- 販促効果（強いプラス効果）---
    if promo == 1:
        base *= 1.45

    # --- 陳列位置（1〜5: 目立つ棚ほど購買促進）---
    base *= 0.70 + disp * 0.12

    # --- 価格帯（最適価格帯は3: 高すぎも低すぎも販売金額は伸びにくい）---
    base *= 1.0 + (price - 3) * 0.08 - (price - 3) ** 2 * 0.03

    # --- 季節効果 ---
    base *= season

    # --- 天候効果（食品・飲料は天候依存度が高い）---
    if cat in [1, 2]:
        base *= 0.80 + wthr * 0.08

    # --- 郊外型: 駐車場が多いほど集客力UP ---
    if st == 3:
        base *= 0.80 + min(park, 200) / 200 * 0.40

    # --- 駅前型: 駅から遠くなるほど集客減 ---
    if st == 2:
        base *= np.exp(-walk * 0.05)

    # -------------------------------------------------------
    # 【交互作用効果】決定木・GBDTが捉えるべき非線形パターン
    # -------------------------------------------------------
    # 「販促実施」×「目立つ陳列位置」のシナジー効果
    if promo == 1 and disp >= 4:
        base *= 1.20

    # 「SC型」×「季節ピーク」の相乗効果（イベント・混雑集客）
    if st == 1 and season >= 1.1:
        base *= 1.15

    # 「都市圏」×「家電カテゴリ」の特需（家電量販店競合が少ない場合）
    if cat == 5 and reg <= 3:
        base *= 1.25

    # 「低競合」×「高開業年数」の地域独占効果
    if comps <= 1 and years >= 15:
        base *= 1.10

    # --- ノイズ付加（対数正規分布: 実際の売上は右裾が長い）---
    noise = np.random.lognormal(mean=0, sigma=0.18)
    sales = max(round(base * noise, 1), 5.0)  # 最低5万円
    monthly_sales.append(sales)


df_sales = pd.DataFrame({
    '売上ID':         [f'R{str(i).zfill(7)}' for i in range(1, NUM_RECORDS + 1)],
    '店舗ID':         rec_store_ids,          # 結合キー
    '商品カテゴリ':    product_categories,     # 1=食品 2=飲料 3=日用品 4=衣料 5=家電 6=趣味
    '価格帯':          price_ranges,           # 1(低価格)〜5(高価格)
    '販促実施':        promotion_flags,         # 0=なし, 1=あり
    '陳列位置スコア':  display_positions,       # 1(悪)〜5(目立つ棚)
    '対象月':          months,                  # 1-12月
    '季節指数':        seasonal_indices,        # 0.5-1.8（カテゴリ×月の季節性）
    '天候スコア':      weather_scores,          # 1(悪天候)〜5(好天候)
    '月次売上金額':    monthly_sales,           # 万円（目的変数）
})

df_sales.to_csv('02_販売実績.csv', index=False, encoding='utf-8-sig')
print("-> '02_販売実績.csv' を出力しました。")

sales_arr = np.array(monthly_sales)
print(f"月次売上金額 統計: 平均={sales_arr.mean():.1f}万円 / 中央値={np.median(sales_arr):.1f}万円 / 最大={sales_arr.max():.1f}万円")
print("完了。")

# ---------------------------------------------------------
# データセットの概要サマリー出力
# ---------------------------------------------------------
print("\n========== 変数対応表 ==========")
print("【CSV① 店舗マスタ】")
print("  店舗ID          → 結合キー（CSV②と1:Nで結合）")
print("  店舗タイプ       → 1=SC型, 2=駅前型, 3=郊外型")
print("  地域ブロック     → 1-8 (1-3=都市圏, 4-6=地方都市, 7-8=地方)")
print("  開業年数         → 1-25年")
print("  売場面積         → 店舗の売場面積(㎡)")
print("  最寄り駅徒歩分   → 最寄り駅からの徒歩分数")
print("  競合店数         → 半径1km以内の競合店舗数")
print("  駐車場台数       → 駐車場の収容台数")
print("\n【CSV② 販売実績】")
print("  売上ID          → レコードID")
print("  店舗ID          → 結合キー（店舗マスタと結合）")
print("  商品カテゴリ    → 1=食品 2=飲料 3=日用品 4=衣料 5=家電 6=趣味")
print("  価格帯          → 1(低価格)〜5(高価格)")
print("  販促実施        → 0=なし, 1=あり（セール・チラシ等）")
print("  陳列位置スコア  → 1(悪い)〜5(エンド棚等・目立つ場所)")
print("  対象月          → 1-12月")
print("  季節指数        → 0.5-1.8（カテゴリ別の季節性インデックス）")
print("  天候スコア      → 1(悪天候)〜5(好天候)")
print("  月次売上金額 ★  → 万円（目的変数、回帰タスク）")
print("================================")
print("\n【主な分析ポイント（交互作用）】")
print("  ・販促実施 × 陳列位置スコア（高）→ 相乗効果あり")
print("  ・SC型 × 季節ピーク時期       → 集客増の相乗効果")
print("  ・都市圏 × 家電カテゴリ       → 高売上の特需")
print("  ・低競合 × 長期開業            → 地域独占による売上増")
