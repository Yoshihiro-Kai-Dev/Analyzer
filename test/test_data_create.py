import pandas as pd
import numpy as np
import random
from datetime import datetime, timedelta

# ---------------------------------------------------------
# 設定・初期化
# ---------------------------------------------------------
np.random.seed(999) # シード変更
random.seed(999)
NUM_RECORDS = 100000

def generate_date(start_date, end_date):
    days = (end_date - start_date).days
    return start_date + timedelta(days=random.randrange(days))

def sigmoid(x):
    return 1 / (1 + np.exp(-x))

# ---------------------------------------------------------
# CSV①：基本属性・生活習慣アンケート（特徴量）
# ---------------------------------------------------------
print("CSV①を作成中...")

ids = [f'P{str(i).zfill(6)}' for i in range(1, NUM_RECORDS + 1)]

# 属性
ages = np.random.randint(35, 75, NUM_RECORDS)
genders = np.random.choice(['男性', '女性'], NUM_RECORDS, p=[0.6, 0.4])

# 生活習慣（カテゴリカル変数）
# ※これらが複雑に絡み合ってリスクを形成します
smokings = []
alcohol_freqs = []
exercises = []
sleep_quality = []
stress_levels = []

for _ in range(NUM_RECORDS):
    smokings.append(np.random.choice(['なし', '過去あり', '現在あり'], p=[0.5, 0.3, 0.2]))
    alcohol_freqs.append(np.random.choice(['飲まない', '時々', '毎日'], p=[0.3, 0.5, 0.2]))
    exercises.append(np.random.choice(['しない', '週1回', '週3回以上'], p=[0.5, 0.3, 0.2]))
    sleep_quality.append(np.random.choice(['良い', '普通', '悪い'], p=[0.3, 0.5, 0.2]))
    stress_levels.append(np.random.choice(['低い', '中程度', '高い'], p=[0.3, 0.5, 0.2]))

df_attr = pd.DataFrame({
    '個人ID': ids,
    '年齢': ages,
    '性別': genders,
    '喫煙状況': smokings,
    '飲酒頻度': alcohol_freqs,
    '運動習慣': exercises,
    '睡眠の質': sleep_quality,
    'ストレス度': stress_levels,
    '家族の病歴': np.random.choice(['なし', 'あり'], NUM_RECORDS, p=[0.7, 0.3])
})

df_attr.to_csv('01_基本属性データ.csv', index=False, encoding='utf-8')
print("-> '01_基本属性データ.csv' を出力しました。")


# ---------------------------------------------------------
# CSV②：健診結果・ターゲット（特徴量＋目的変数）
# ---------------------------------------------------------
print("CSV②を作成中...")

# バイタルデータの生成（ある程度相関を持たせるが、決定打にはしない）
bmis = []
systolic_bps = [] # 収縮期血圧
tg_vals = []      # 中性脂肪
hdl_vals = []     # HDLコレステロール
alt_vals = []     # 肝機能
checkup_dates = []

# 目的変数生成用の確率リスト
onset_probs = []
target_flags = []

for idx, row in df_attr.iterrows():
    # 1. 特徴量の生成（ベースライン + ノイズ）
    # 年齢が高いほど血圧・中性脂肪が高くなりやすい傾向
    age_factor = (row['年齢'] - 35) * 0.5
    
    # BMI
    base_bmi = 22
    if row['運動習慣'] == 'しない': base_bmi += 2
    if row['飲酒頻度'] == '毎日': base_bmi += 1.5
    bmi = np.random.normal(base_bmi, 3.5)
    bmi = max(16, min(40, bmi)) # 外れ値クリップ

    # 血圧 (BMIと年齢に相関)
    base_bp = 110 + age_factor + (bmi - 22) * 1.5
    if row['喫煙状況'] == '現在あり': base_bp += 5
    if row['ストレス度'] == '高い': base_bp += 5
    sys_bp = int(np.random.normal(base_bp, 10))

    # 中性脂肪
    base_tg = 100 + (bmi - 22) * 5
    if row['飲酒頻度'] == '毎日': base_tg += 50
    tg = int(np.random.normal(base_tg, 40))
    tg = max(30, tg)

    # 2. 【重要】真のリスク確率の計算（隠されたロジック）
    # AIに解かせたいのはこの複雑な数式です
    logit = -4.0 # 切片（基本発症率を低く抑える）
    
    # 線形要因
    logit += (row['年齢'] - 40) * 0.05       # 加齢リスク
    logit += (bmi - 22) * 0.1                # 肥満リスク
    logit += (sys_bp - 120) * 0.02           # 高血圧リスク
    
    # 質的変数のスコア化
    if row['家族の病歴'] == 'あり': logit += 0.8
    if row['喫煙状況'] == '現在あり': logit += 0.6
    
    # 【交互作用】（ここがGBDTの腕の見せ所）
    # 「ストレスが高い」かつ「睡眠が悪い」とリスク倍増
    if row['ストレス度'] == '高い' and row['睡眠の質'] == '悪い':
        logit += 1.2 
    
    # 「運動している」かつ「飲酒しない」とリスク低減効果が相乗する
    if row['運動習慣'] == '週3回以上' and row['飲酒頻度'] == '飲まない':
        logit -= 1.0

    # 3. 確率への変換とラベル生成（ベルヌーイ試行）
    # 確率pを算出し、その確率に基づいて0か1を決める（＝同じデータでも運によって結果が変わる）
    prob = sigmoid(logit)
    onset_flag = 1 if np.random.rand() < prob else 0
    
    # リスト格納
    bmis.append(round(bmi, 1))
    systolic_bps.append(sys_bp)
    tg_vals.append(tg)
    hdl_vals.append(int(np.random.normal(60, 15))) # あまり関係ない変数も混ぜる
    alt_vals.append(int(np.random.normal(25, 10))) # あまり関係ない変数も混ぜる
    checkup_dates.append(generate_date(datetime(2023, 4, 1), datetime(2024, 3, 31)).strftime('%Y-%m-%d'))
    
    onset_probs.append(prob) # デバッグ用（CSVには出力しない）
    target_flags.append(onset_flag)

df_checkup = pd.DataFrame({
    '個人ID': ids,
    '健診日': checkup_dates,
    'BMI': bmis,
    '収縮期血圧': systolic_bps,
    '中性脂肪': tg_vals,
    'HDLコレステロール': hdl_vals,
    '肝機能ALT': alt_vals,
    # これが予測ターゲット：3年後にハイリスク群になったかどうか
    '3年後_生活習慣病発症': target_flags
})

df_checkup.to_csv('02_健診結果_ターゲット.csv', index=False, encoding='utf-8')
print("-> '02_健診結果_ターゲット.csv' を出力しました。")
print(f"発症率: {sum(target_flags)/NUM_RECORDS:.2%}") # 全体のバランス確認
print("完了。")