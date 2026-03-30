import pandas as pd
import numpy as np
import random
from datetime import datetime, timedelta

# ---------------------------------------------------------
# 設定・初期化
# ---------------------------------------------------------
# テーマ: 児童虐待通告の発生予測
# 目的変数: 児童虐待通告_発生 (0=期間中に通告なし, 1=期間中に通告あり)
# データ想定: ある自治体の要保護児童対策地域協議会（要対協）に
#             登録・支援中の家庭を対象としたケース管理データ
# 観察期間: 1年間（2023年4月〜2024年3月）
# レコード数: 5,000 件（1ケース = 1児童）
#
# 出力CSVの構成:
#   CSV① 01_説明変数.csv  … 家族構成・経済状況・生活環境・支援状況・リスク指標
#   CSV② 02_目的変数.csv  … 目的変数のみ（児童ID + 児童虐待通告_発生）
# 結合キー: 児童ID
# ---------------------------------------------------------

# シード固定なし（実行ごとに異なるデータを生成）
NUM_RECORDS = 5_000

def random_date(start: datetime, end: datetime) -> str:
    """start〜end の範囲でランダムな日付文字列 (YYYY-MM-DD) を返す"""
    delta = (end - start).days
    return (start + timedelta(days=random.randrange(delta))).strftime('%Y-%m-%d')

def sigmoid(x: np.ndarray) -> np.ndarray:
    """オーバーフローを防いだシグモイド関数"""
    return 1.0 / (1.0 + np.exp(-np.clip(x, -20, 20)))


# ---------------------------------------------------------
# CSV① 説明変数（家庭環境 + 支援履歴）
# ---------------------------------------------------------
# カラム:
#   児童ID         … ユニークID（C000001 〜）
#   児童年齢        … 0〜17歳（整数）
#   児童性別        … 0=女児, 1=男児
#   兄弟姉妹数      … 0〜5（整数）
#   発達障害_知的障害 … 0=なし, 1=あり（診断済み）
#   ひとり親世帯     … 0=ふたり親, 1=ひとり親
#   保護者年齢       … 18〜65歳（整数）
#   保護者就労状況   … 0=正規雇用, 1=非正規・パート, 2=無職
#   世帯収入区分     … 1(低)〜5(高)  ※生活保護含む場合は1
#   生活保護受給     … 0=なし, 1=あり
#   転居回数_3年    … 過去3年間の転居回数（0〜5）
#   近隣孤立度       … 0=交流あり, 1=交流少, 2=ほぼ孤立
#   観察期間開始日   … 2023-04-01〜2023-10-01 のランダム日
#   保護者精神疾患歴  … 0=なし, 1=あり（診断済み・治療中）
#   保護者飲酒問題   … 0=なし, 1=あり（問題飲酒・アルコール依存）
#   DV被害歴        … 0=なし, 1=あり（現在・過去のDV被害確認）
#   要対協登録区分   … 0=未登録, 1=要支援児童, 2=要保護児童
#   過去の通告歴     … 0=なし, 1=過去1年以内に通告あり
#   登校_通園状況    … 0=正常, 1=時々欠席, 2=頻繁欠席/不登校
#   家庭訪問実施状況 … 0=未実施, 1=定期訪問, 2=不定期
#   身体的異常所見   … 0=なし, 1=あり（傷・打撲痕・発育不良等の確認）
# ---------------------------------------------------------
print("CSV①（説明変数）と CSV②（目的変数）を作成中...")

ids = [f'C{str(i).zfill(6)}' for i in range(1, NUM_RECORDS + 1)]

# ── 児童属性 ──────────────────────────────────────────────
# 児童年齢: 0〜17歳。乳幼児（0〜5歳）が多め
_age_p = np.array([0.07, 0.07, 0.07, 0.07, 0.07, 0.07,
                   0.06, 0.06, 0.06, 0.06, 0.06, 0.06,
                   0.05, 0.05, 0.05, 0.05, 0.05, 0.05])
_age_p = _age_p / _age_p.sum()  # 合計が必ず1になるよう正規化する
ages = np.random.choice(range(18), NUM_RECORDS, p=_age_p)

# 児童性別: 0=女児, 1=男児
genders = np.random.choice([0, 1], NUM_RECORDS, p=[0.48, 0.52])

# 兄弟姉妹数: 0〜5
siblings = np.random.choice(
    range(6), NUM_RECORDS,
    p=[0.20, 0.30, 0.28, 0.14, 0.06, 0.02],
)

# 発達障害・知的障害（診断済み）: 要対協ケースでは比較的高め
dev_disability = np.random.choice([0, 1], NUM_RECORDS, p=[0.80, 0.20])

# ── 保護者・家族 ──────────────────────────────────────────
# ひとり親世帯: 要対協ケースでは一般より高め
single_parent = np.random.choice([0, 1], NUM_RECORDS, p=[0.55, 0.45])

# 保護者年齢: 18〜65歳。若年保護者に注目
# 子どもの年齢に合わせて保護者年齢を設定
guardian_ages = np.array([
    int(np.clip(np.random.normal(ages[i] + 28, 5), 18, 65))
    for i in range(NUM_RECORDS)
])

# 保護者就労状況: 0=正規, 1=非正規, 2=無職
# ひとり親は無職・非正規が多い
employment = np.array([
    np.random.choice([0, 1, 2],
        p=[0.25, 0.35, 0.40] if single_parent[i] == 1 else [0.55, 0.30, 0.15])
    for i in range(NUM_RECORDS)
])

# 世帯収入区分: 1(低)〜5(高)
# 無職は低収入、正規雇用は高め
income_probs = {
    0: [0.05, 0.10, 0.30, 0.35, 0.20],  # 正規雇用
    1: [0.20, 0.35, 0.30, 0.12, 0.03],  # 非正規
    2: [0.55, 0.30, 0.12, 0.02, 0.01],  # 無職
}
household_income = np.array([
    np.random.choice(range(1, 6), p=income_probs[employment[i]])
    for i in range(NUM_RECORDS)
])

# 生活保護受給: 収入が最低区分（1）のケースで高め
welfare = np.array([
    int(np.random.rand() < (0.70 if household_income[i] == 1 else
                             0.10 if household_income[i] == 2 else 0.01))
    for i in range(NUM_RECORDS)
])

# ── 生活環境 ──────────────────────────────────────────────
# 転居回数_3年間: 0〜5回。経済的不安定・DV被害者は高め
move_counts = np.array([
    int(np.clip(np.random.poisson(
        1.8 if (single_parent[i] == 1 and welfare[i] == 1) else
        0.8 if single_parent[i] == 1 else 0.4
    ), 0, 5))
    for i in range(NUM_RECORDS)
])

# 近隣孤立度: 0=交流あり, 1=交流少, 2=ほぼ孤立
# 転居回数が多い・ひとり親で高め
isolation = np.array([
    np.random.choice(
        [0, 1, 2],
        p=[0.20, 0.35, 0.45] if move_counts[i] >= 3 else
          [0.35, 0.40, 0.25] if (single_parent[i] == 1 or move_counts[i] >= 2) else
          [0.60, 0.30, 0.10]
    )
    for i in range(NUM_RECORDS)
])

# DataFrame 作成
# ── 説明変数 DataFrame（家庭環境 + 支援履歴）は CSV② 生成後にまとめて作成する ──


# ---------------------------------------------------------
# CSV② 目的変数
# ---------------------------------------------------------
# カラム:
#   児童ID          … 結合キー
#   児童虐待通告_発生 … 0=なし, 1=あり（観察期間中に通告が発生）
# ---------------------------------------------------------
print("CSV②（目的変数）を作成中...")

mental_illness_list = []
alcohol_problem_list = []
dv_history_list = []
koukyo_category_list = []
past_report_list = []
attendance_list = []
home_visit_list = []
physical_finding_list = []
obs_start_dates = []
target_flags = []

for i in range(NUM_RECORDS):
    age        = ages[i]
    gender     = genders[i]
    sibling    = siblings[i]
    dev_dis    = dev_disability[i]
    single     = single_parent[i]
    g_age      = guardian_ages[i]
    employ     = employment[i]
    income     = household_income[i]
    welf       = welfare[i]
    moves      = move_counts[i]
    iso        = isolation[i]

    # ── 保護者精神疾患歴 ──────────────────────────────────
    # 低収入・無職・孤立と関連
    mental_prob = sigmoid(
        -2.5
        + (employ == 2) * 0.8   # 無職は高め
        + (income <= 2)  * 0.5
        + iso            * 0.4
        + moves          * 0.1
    )
    mental_illness = int(np.random.rand() < mental_prob)

    # ── 保護者飲酒問題 ────────────────────────────────────
    # 精神疾患・孤立・男性保護者で高め
    alcohol_prob = sigmoid(
        -2.8
        + mental_illness * 0.6
        + (employ == 2)  * 0.5
        + iso            * 0.3
        + (gender == 1)  * 0.2   # 男児の保護者（父親）は若干高め ※粗い近似
    )
    alcohol_problem = int(np.random.rand() < alcohol_prob)

    # ── DV被害歴（保護者が被害者） ────────────────────────
    # ひとり親・精神疾患・飲酒問題と相関
    dv_prob = sigmoid(
        -2.2
        + single         * 0.7   # ひとり親はDV被害後の分離を含む
        + mental_illness * 0.5
        + alcohol_problem* 0.6
        + (income <= 2)  * 0.4
        + iso            * 0.3
    )
    dv_history = int(np.random.rand() < dv_prob)

    # ── 要対協登録区分 ────────────────────────────────────
    # 0=未登録, 1=要支援, 2=要保護
    # ※全ケースが要対協関与前提だが、重篤度にばらつきを持たせる
    reg_prob_2 = sigmoid(   # 要保護（重篤）の確率
        -2.0
        + dv_history     * 1.0
        + mental_illness * 0.6
        + alcohol_problem* 0.7
        + (age <= 2)     * 0.5   # 乳幼児はリスク大
        + (income <= 2)  * 0.3
    )
    reg_prob_1 = sigmoid(   # 要支援の確率（要保護でない場合）
        1.0
        + (welf == 1)    * 0.4
        + single         * 0.3
    )
    if np.random.rand() < reg_prob_2:
        reg_category = 2
    elif np.random.rand() < reg_prob_1:
        reg_category = 1
    else:
        reg_category = 0

    # ── 過去の通告歴（過去1年以内） ──────────────────────
    past_rep_prob = sigmoid(
        -2.5
        + (reg_category == 2) * 1.5
        + dv_history          * 0.8
        + mental_illness      * 0.5
        + alcohol_problem     * 0.5
    )
    past_report = int(np.random.rand() < past_rep_prob)

    # ── 登校・通園状況 ────────────────────────────────────
    # 0=正常, 1=時々欠席, 2=頻繁欠席/不登校
    # 乳幼児（保育園未就園）・DV・精神疾患と関連
    if age < 3:
        # 0〜2歳は登園状況ではなく「定期的な乳幼児健診の受診状況」で代替
        att_prob_2 = sigmoid(-2.0 + (welf == 1) * 0.5 + iso * 0.6)
        att_prob_1 = sigmoid( 0.5 + (single == 1) * 0.3)
    else:
        att_prob_2 = sigmoid(
            -2.5
            + dv_history     * 0.7
            + mental_illness * 0.5
            + (income <= 2)  * 0.4
            + iso            * 0.4
        )
        att_prob_1 = sigmoid(
            -0.5
            + dev_dis        * 0.5
            + (employ == 2)  * 0.3
        )
    if np.random.rand() < att_prob_2:
        attendance = 2
    elif np.random.rand() < att_prob_1:
        attendance = 1
    else:
        attendance = 0

    # ── 家庭訪問実施状況 ──────────────────────────────────
    # 0=未実施, 1=定期訪問, 2=不定期
    # 要保護は定期訪問が多いが、孤立・拒否によって不定期も生じる
    if reg_category == 2:
        hv_probs = [0.05, 0.60, 0.35]
    elif reg_category == 1:
        hv_probs = [0.20, 0.45, 0.35]
    else:
        hv_probs = [0.55, 0.25, 0.20]
    home_visit = np.random.choice([0, 1, 2], p=hv_probs)

    # ── 身体的異常所見 ────────────────────────────────────
    # 傷・打撲痕・発育不良等が家庭訪問や健診で確認された場合
    # 乳幼児・要保護・過去通告歴と強く相関
    phys_find_prob = sigmoid(
        -4.0
        + (age <= 5)          * 0.8   # 乳幼児
        + past_report         * 1.5   # 過去の通告
        + (reg_category == 2) * 1.2
        + dv_history          * 0.7
        + alcohol_problem     * 0.5
        + (home_visit == 0)   * 0.4   # 訪問なしでも発見されることはある
    )
    physical_finding = int(np.random.rand() < phys_find_prob)

    # ──────────────────────────────────────────────────────
    # 【目的変数】児童虐待通告_発生 の確率計算
    # ──────────────────────────────────────────────────────
    # 切片: 全体の通告発生率が約10〜15%になるよう設定
    logit = -5.8

    # --- 主要リスク因子（直接的な暴力・ネグレクトの指標） ---
    logit += physical_finding * 2.5   # 身体的異常所見: 最強のシグナル
    logit += past_report      * 1.8   # 過去の通告歴: 再発リスクが高い
    logit += dv_history       * 1.0   # DV被害歴
    logit += (attendance == 2) * 0.9  # 頻繁欠席・不登校
    logit += (attendance == 1) * 0.4  # 時々欠席

    # --- 保護者リスク因子 ---
    logit += alcohol_problem  * 0.9   # 保護者の飲酒問題
    logit += mental_illness   * 0.7   # 保護者の精神疾患
    logit += (employ == 2)    * 0.4   # 保護者の無職

    # --- 支援状況 ---
    logit += (reg_category == 2) * 0.8   # 要保護児童登録
    logit += (reg_category == 1) * 0.3   # 要支援児童登録
    logit += (home_visit == 0)   * 0.5   # 家庭訪問未実施（支援の目が届いていない）
    logit += (home_visit == 2)   * 0.2   # 不定期訪問

    # --- 脆弱性要因 ---
    logit += (age <= 2)     * 0.7   # 2歳以下（自ら助けを求められない）
    logit += (age <= 5)     * 0.4   # 未就学児
    logit += dev_dis        * 0.4   # 発達障害・知的障害
    logit += single         * 0.3   # ひとり親
    logit += welf           * 0.2   # 生活保護受給
    logit += iso            * 0.2   # 近隣孤立度

    # --- 【交互作用効果】GBTが捉えるべき非線形パターン ---
    # 「DV歴あり」かつ「アルコール問題あり」の複合リスク（家庭内暴力の多重化）
    if dv_history == 1 and alcohol_problem == 1:
        logit += 0.8
    # 「過去の通告歴あり」かつ「家庭訪問未実施」（支援断絶による再発）
    if past_report == 1 and home_visit == 0:
        logit += 0.7
    # 「乳幼児（0〜2歳）」かつ「保護者精神疾患あり」（最も脆弱な組み合わせ）
    if age <= 2 and mental_illness == 1:
        logit += 0.6
    # 「身体的異常所見あり」かつ「DV歴あり」（複合的身体的虐待）
    if physical_finding == 1 and dv_history == 1:
        logit += 0.5
    # 「頻繁欠席」かつ「家庭訪問未実施」（完全な孤立）
    if attendance == 2 and home_visit == 0:
        logit += 0.5
    # 「要保護登録」かつ「過去通告歴あり」（高リスク継続ケース）
    if reg_category == 2 and past_report == 1:
        logit += 0.4
    # 「定期訪問実施」かつ「アルコール問題なし」「DV歴なし」（保護的要因）
    if home_visit == 1 and alcohol_problem == 0 and dv_history == 0:
        logit -= 0.5

    prob = float(sigmoid(np.array([logit]))[0])
    target = int(np.random.rand() < prob)

    mental_illness_list.append(mental_illness)
    alcohol_problem_list.append(alcohol_problem)
    dv_history_list.append(dv_history)
    koukyo_category_list.append(reg_category)
    past_report_list.append(past_report)
    attendance_list.append(attendance)
    home_visit_list.append(home_visit)
    physical_finding_list.append(physical_finding)
    obs_start_dates.append(
        random_date(datetime(2023, 4, 1), datetime(2023, 10, 1))
    )
    target_flags.append(target)

# 説明変数 DataFrame（家庭環境 + 支援履歴をまとめる）
df_features = pd.DataFrame({
    '児童ID':          ids,
    '児童年齢':         ages,
    '児童性別':         genders,
    '兄弟姉妹数':       siblings,
    '発達障害_知的障害':  dev_disability,
    'ひとり親世帯':     single_parent,
    '保護者年齢':       guardian_ages,
    '保護者就労状況':   employment,
    '世帯収入区分':     household_income,
    '生活保護受給':     welfare,
    '転居回数_3年':     move_counts,
    '近隣孤立度':       isolation,
    '観察期間開始日':   obs_start_dates,
    '保護者精神疾患歴': mental_illness_list,   # 0=なし, 1=あり
    '保護者飲酒問題':   alcohol_problem_list,  # 0=なし, 1=あり
    'DV被害歴':        dv_history_list,        # 0=なし, 1=あり
    '要対協登録区分':   koukyo_category_list,  # 0=未登録, 1=要支援, 2=要保護
    '過去の通告歴':    past_report_list,       # 0=なし, 1=過去1年以内にあり
    '登校_通園状況':   attendance_list,        # 0=正常, 1=時々欠席, 2=頻繁欠席/不登校
    '家庭訪問実施状況': home_visit_list,       # 0=未実施, 1=定期, 2=不定期
    '身体的異常所見':  physical_finding_list,  # 0=なし, 1=あり
})
df_features.to_csv('01_説明変数.csv', index=False, encoding='utf-8-sig')
print("-> '01_説明変数.csv' を出力しました。")

# 目的変数 DataFrame（IDと通告フラグのみ）
df_target = pd.DataFrame({
    '児童ID':             ids,
    '児童虐待通告_発生':   target_flags,   # 0=観察期間中に通告なし, 1=通告あり
})
df_target.to_csv('02_目的変数.csv', index=False, encoding='utf-8-sig')
print("-> '02_目的変数.csv' を出力しました。")

# ---------------------------------------------------------
# サマリー出力
# ---------------------------------------------------------
total = NUM_RECORDS
notified = sum(target_flags)
print(f"\n通告発生率: {notified}/{total} = {notified/total:.2%}")
print(f"身体的異常所見あり: {sum(physical_finding_list)/total:.2%}")
print(f"過去の通告歴あり:   {sum(past_report_list)/total:.2%}")
print(f"DV被害歴あり:       {sum(dv_history_list)/total:.2%}")
print(f"保護者飲酒問題あり: {sum(alcohol_problem_list)/total:.2%}")
print(f"保護者精神疾患あり: {sum(mental_illness_list)/total:.2%}")
print(f"要保護登録:         {sum(1 for x in koukyo_category_list if x==2)/total:.2%}")

print("""
========================================
変数一覧
========================================
【CSV① 01_説明変数.csv】
  児童ID          … ユニークID（結合キー）
  児童年齢         … 0〜17歳（整数）
  児童性別         … 0=女児, 1=男児
  兄弟姉妹数       … 0〜5（整数）
  発達障害_知的障害  … 0=なし, 1=診断済み
  ひとり親世帯      … 0=ふたり親, 1=ひとり親
  保護者年齢        … 18〜65歳（整数）
  保護者就労状況    … 0=正規, 1=非正規, 2=無職
  世帯収入区分      … 1(低)〜5(高)
  生活保護受給      … 0=なし, 1=あり
  転居回数_3年     … 0〜5回
  近隣孤立度        … 0=交流あり, 1=交流少, 2=ほぼ孤立
  観察期間開始日    … YYYY-MM-DD
  保護者精神疾患歴  … 0=なし, 1=あり
  保護者飲酒問題    … 0=なし, 1=あり
  DV被害歴        … 0=なし, 1=あり
  要対協登録区分   … 0=未登録, 1=要支援, 2=要保護
  過去の通告歴     … 0=なし, 1=過去1年以内にあり
  登校_通園状況    … 0=正常, 1=時々欠席, 2=頻繁欠席/不登校
  家庭訪問実施状況  … 0=未実施, 1=定期, 2=不定期
  身体的異常所見   … 0=なし, 1=あり

【CSV② 02_目的変数.csv】
  児童ID          … ユニークID（結合キー）
  児童虐待通告_発生 ★ … 0=なし, 1=あり（目的変数）

【結合キー】
  児童ID（CSV① と CSV② を 1:1 で結合可能）

【推奨利用手順 in 分析くん】
  1. CSV①「01_説明変数.csv」をアップロード
  2. CSV②「02_目的変数.csv」をアップロード
  3. リレーション設定: 「児童ID」で 1:1 結合
  4. 分析設定:
       - 目的変数: 「児童虐待通告_発生」
       - タスク種別: 分類（Classification）
       - モデル: LightGBM または ロジスティック回帰
  5. 学習・予測を実行
========================================
""")
