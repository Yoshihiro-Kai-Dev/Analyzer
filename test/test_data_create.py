import pandas as pd
import numpy as np
import random
from datetime import datetime, timedelta

# ---------------------------------------------------------
# 設定・初期化
# ---------------------------------------------------------
# 参考データセット: CDC Diabetes Health Indicators (Kaggle / UCI ML Repository)
# https://www.kaggle.com/datasets/alexteboul/diabetes-health-indicators-dataset
# 目的変数: Diabetes_binary (0=糖尿病なし, 1=糖尿病・予備群)
# 説明変数: 21列（生活習慣・健診結果・人口統計など）

np.random.seed(999)
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
# 対応カラム（元データセット）:
#   Sex, Age, Education, Income,
#   Smoker, HvyAlcoholConsump, PhysActivity,
#   Fruits, Veggies, AnyHealthcare, NoDocbcCost
# ---------------------------------------------------------
print("CSV①を作成中...")

ids = [f'P{str(i).zfill(6)}' for i in range(1, NUM_RECORDS + 1)]

# --- 人口統計 ---
# Age: 1～13のカテゴリ (1=18-24歳, 13=80歳以上, 各5歳刻み)
ages_cat = np.random.choice(range(1, 14), NUM_RECORDS,
                            p=[0.04, 0.06, 0.08, 0.09, 0.10,
                               0.10, 0.10, 0.10, 0.09, 0.08,
                               0.07, 0.05, 0.04])
# Sex: 0=女性, 1=男性
sexes = np.random.choice([0, 1], NUM_RECORDS, p=[0.4, 0.6])

# Education: 1(未就学)～6(大学卒業以上)
education = np.random.choice(range(1, 7), NUM_RECORDS,
                              p=[0.02, 0.05, 0.10, 0.25, 0.28, 0.30])

# Income: 1(～$10k)～8($75k以上)
income = np.random.choice(range(1, 9), NUM_RECORDS,
                          p=[0.05, 0.07, 0.09, 0.11, 0.13, 0.15, 0.17, 0.23])

# --- 生活習慣 ---
# Smoker: 生涯100本以上喫煙したか (0=No, 1=Yes)
smokers = np.random.choice([0, 1], NUM_RECORDS, p=[0.56, 0.44])

# HvyAlcoholConsump: 大量飲酒 (男性:週14杯超, 女性:週7杯超) (0=No, 1=Yes)
heavy_alcohol = np.random.choice([0, 1], NUM_RECORDS, p=[0.94, 0.06])

# PhysActivity: 過去30日間の運動有無(仕事除く) (0=No, 1=Yes)
phys_activity = np.random.choice([0, 1], NUM_RECORDS, p=[0.25, 0.75])

# Fruits: 1日1回以上の果物摂取 (0=No, 1=Yes)
fruits = np.random.choice([0, 1], NUM_RECORDS, p=[0.37, 0.63])

# Veggies: 1日1回以上の野菜摂取 (0=No, 1=Yes)
veggies = np.random.choice([0, 1], NUM_RECORDS, p=[0.19, 0.81])

# AnyHealthcare: 何らかの医療保険加入 (0=No, 1=Yes)
any_healthcare = np.random.choice([0, 1], NUM_RECORDS, p=[0.05, 0.95])

# NoDocbcCost: 過去12ヶ月、費用理由で受診断念 (0=No, 1=Yes)
no_doc_cost = np.random.choice([0, 1], NUM_RECORDS, p=[0.84, 0.16])

df_attr = pd.DataFrame({
    '個人ID':           ids,
    '年齢区分':          ages_cat,      # Age (1-13カテゴリ)
    '性別':             sexes,          # Sex (0=女性, 1=男性)
    '教育レベル':        education,     # Education (1-6)
    '収入レベル':        income,        # Income (1-8)
    '喫煙歴':           smokers,        # Smoker (0/1)
    '大量飲酒':          heavy_alcohol, # HvyAlcoholConsump (0/1)
    '運動習慣':          phys_activity, # PhysActivity (0/1)
    '果物摂取':          fruits,        # Fruits (0/1)
    '野菜摂取':          veggies,       # Veggies (0/1)
    '医療保険加入':       any_healthcare,# AnyHealthcare (0/1)
    '費用理由受診断念':   no_doc_cost,   # NoDocbcCost (0/1)
})

df_attr.to_csv('01_基本属性データ.csv', index=False, encoding='utf-8-sig')
print("-> '01_基本属性データ.csv' を出力しました。")


# ---------------------------------------------------------
# CSV②：健診結果・ターゲット（特徴量＋目的変数）
# ---------------------------------------------------------
# 対応カラム（元データセット）:
#   HighBP, HighChol, CholCheck, BMI,
#   Stroke, HeartDiseaseorAttack,
#   GenHlth, MentHlth, PhysHlth, DiffWalk,
#   Diabetes_binary (目的変数)
# ---------------------------------------------------------
print("CSV②を作成中...")

high_bp_list        = []
high_chol_list      = []
chol_check_list     = []
bmi_list            = []
stroke_list         = []
heart_disease_list  = []
gen_hlth_list       = []
ment_hlth_list      = []
phys_hlth_list      = []
diff_walk_list      = []
checkup_dates       = []

onset_probs  = []
target_flags = []  # Diabetes_binary

for idx in range(NUM_RECORDS):
    age_cat      = ages_cat[idx]
    sex          = sexes[idx]
    edu          = education[idx]
    inc          = income[idx]
    smoker       = smokers[idx]
    heavy_alc    = heavy_alcohol[idx]
    phys_act     = phys_activity[idx]
    fruit        = fruits[idx]
    veg          = veggies[idx]
    healthcare   = any_healthcare[idx]
    no_doc       = no_doc_cost[idx]

    # --- 年齢を実年齢（中央値）に変換 ---
    age_midpoints = {1:21,2:27,3:32,4:37,5:42,6:47,
                     7:52,8:57,9:62,10:67,11:72,12:77,13:82}
    age_mid = age_midpoints[age_cat]

    # --- BMI生成（年齢・運動習慣・飲酒と相関）---
    base_bmi = 26.5
    if phys_act == 0:  base_bmi += 2.0
    if heavy_alc == 1: base_bmi += 1.5
    if age_cat >= 7:   base_bmi += 1.0  # 中高年はやや高め
    bmi = round(np.clip(np.random.normal(base_bmi, 4.5), 12, 60), 1)

    # --- 高血圧 (HighBP): 年齢・BMI・喫煙と相関 ---
    bp_prob = sigmoid(-3.5 + (age_mid - 40)*0.04 + (bmi - 25)*0.08 + smoker*0.3)
    high_bp = int(np.random.rand() < bp_prob)

    # --- 高コレステロール (HighChol): 年齢・BMI・運動不足と相関 ---
    chol_prob = sigmoid(-2.5 + (age_mid - 40)*0.03 + (bmi - 25)*0.06 + (1-phys_act)*0.2)
    high_chol = int(np.random.rand() < chol_prob)

    # --- コレステロール検査 (CholCheck): 保険加入・年齢と相関 ---
    cc_prob = sigmoid(1.5 + healthcare*1.0 + (age_cat - 5)*0.1)
    chol_check = int(np.random.rand() < cc_prob)

    # --- 脳卒中歴 (Stroke): 高血圧・加齢と相関 ---
    stroke_prob = sigmoid(-6.0 + high_bp*1.2 + (age_mid - 50)*0.05)
    stroke = int(np.random.rand() < stroke_prob)

    # --- 心臓病・心筋梗塞歴 (HeartDiseaseorAttack): 高血圧・コレステロール・喫煙と相関 ---
    heart_prob = sigmoid(-5.5 + high_bp*0.8 + high_chol*0.7 + smoker*0.5 + (age_mid-50)*0.04)
    heart_disease = int(np.random.rand() < heart_prob)

    # --- 主観的健康感 (GenHlth): 1(非常に良い)～5(非常に悪い) ---
    base_gen = 2.5 + (1-phys_act)*0.5 + high_bp*0.3 + high_chol*0.2 + (age_cat-7)*0.05
    gen_hlth = int(np.clip(np.random.normal(base_gen, 0.8), 1, 5))

    # --- 精神的不健康日数 (MentHlth): 過去30日中の不調日数 ---
    base_ment = 3.0 + (1-phys_act)*1.0 + no_doc*1.5
    ment_hlth = int(np.clip(np.random.normal(base_ment, 5), 0, 30))

    # --- 身体的不健康日数 (PhysHlth): 過去30日中の不調日数 ---
    base_phys = 3.0 + high_bp*1.5 + stroke*3.0 + heart_disease*3.0 + (age_mid-50)*0.05
    phys_hlth = int(np.clip(np.random.normal(base_phys, 6), 0, 30))

    # --- 歩行困難 (DiffWalk): BMI・年齢・心疾患と相関 ---
    walk_prob = sigmoid(-4.0 + (bmi - 25)*0.08 + (age_mid-55)*0.04 + heart_disease*0.8)
    diff_walk = int(np.random.rand() < walk_prob)

    # -------------------------------------------------------
    # 【目的変数】糖尿病発症確率の計算（真のロジック）
    # 元データセットの知見をベースにした交互作用モデル
    # -------------------------------------------------------
    logit = -3.3  # 切片（全体の発症率が約15%になるよう設定）

    # 主要リスク因子（線形効果）
    logit += (bmi - 25) * 0.10          # 肥満：最強のリスク因子
    logit += high_bp * 0.80             # 高血圧
    logit += high_chol * 0.60           # 高コレステロール
    logit += (age_mid - 40) * 0.04      # 加齢リスク

    # 生活習慣（線形効果）
    logit += smoker * 0.25              # 喫煙
    logit += heavy_alc * (-0.20)        # 大量飲酒は逆説的にやや低リスク（元データの傾向）
    logit += (1 - phys_act) * 0.40      # 運動不足
    logit += (1 - fruit) * 0.10         # 果物摂取なし
    logit += (1 - veg) * 0.10           # 野菜摂取なし

    # 既往歴
    logit += heart_disease * 0.50       # 心臓病既往
    logit += stroke * 0.30              # 脳卒中既往

    # 社会経済的要因
    logit += (8 - inc) * 0.08           # 低収入ほどリスク高
    logit += (6 - edu) * 0.06           # 低学歴ほどリスク高

    # 【交互作用効果】GBDTが捉えるべき非線形パターン
    # 「高血圧」かつ「高コレステロール」の複合リスク
    if high_bp == 1 and high_chol == 1:
        logit += 0.50
    # 「BMI30以上」かつ「運動なし」の複合リスク
    if bmi >= 30 and phys_act == 0:
        logit += 0.40
    # 「高齢」（60歳超）かつ「高血圧」の複合リスク
    if age_mid >= 60 and high_bp == 1:
        logit += 0.35
    # 「運動習慣あり」かつ「果物・野菜摂取」の保護効果
    if phys_act == 1 and fruit == 1 and veg == 1:
        logit -= 0.40
    # 「歩行困難」＋「身体不調多い」は健康状態悪化のサイン
    if diff_walk == 1 and phys_hlth >= 15:
        logit += 0.30

    prob = sigmoid(logit)
    onset_flag = 1 if np.random.rand() < prob else 0

    high_bp_list.append(high_bp)
    high_chol_list.append(high_chol)
    chol_check_list.append(chol_check)
    bmi_list.append(bmi)
    stroke_list.append(stroke)
    heart_disease_list.append(heart_disease)
    gen_hlth_list.append(gen_hlth)
    ment_hlth_list.append(ment_hlth)
    phys_hlth_list.append(phys_hlth)
    diff_walk_list.append(diff_walk)
    checkup_dates.append(
        generate_date(datetime(2023, 4, 1), datetime(2024, 3, 31)).strftime('%Y-%m-%d')
    )

    onset_probs.append(prob)
    target_flags.append(onset_flag)

df_checkup = pd.DataFrame({
    '個人ID':           ids,
    '健診日':           checkup_dates,
    'BMI':              bmi_list,               # BMI (整数)
    '高血圧':           high_bp_list,           # HighBP (0/1)
    '高コレステロール':  high_chol_list,         # HighChol (0/1)
    'コレステロール検査': chol_check_list,       # CholCheck (0/1)
    '脳卒中歴':          stroke_list,            # Stroke (0/1)
    '心臓病既往':        heart_disease_list,     # HeartDiseaseorAttack (0/1)
    '主観的健康感':      gen_hlth_list,          # GenHlth (1-5, 1=良い)
    '精神的不健康日数':  ment_hlth_list,         # MentHlth (0-30日)
    '身体的不健康日数':  phys_hlth_list,         # PhysHlth (0-30日)
    '歩行困難':          diff_walk_list,         # DiffWalk (0/1)
    # 目的変数: 糖尿病・予備群の有無 (Diabetes_binary)
    '糖尿病_予備群':     target_flags,
})

df_checkup.to_csv('02_健診結果_ターゲット.csv', index=False, encoding='utf-8-sig')
print("-> '02_健診結果_ターゲット.csv' を出力しました。")
print(f"糖尿病・予備群の割合: {sum(target_flags)/NUM_RECORDS:.2%}")
print("完了。")

# ---------------------------------------------------------
# データセットの概要サマリー出力
# ---------------------------------------------------------
print("\n========== 変数対応表 ==========")
print("【CSV① 基本属性データ】")
print("  個人ID          → ID")
print("  年齢区分         → Age (1-13カテゴリ, 1=18-24歳)")
print("  性別             → Sex (0=女性, 1=男性)")
print("  教育レベル        → Education (1-6)")
print("  収入レベル        → Income (1-8)")
print("  喫煙歴           → Smoker (0/1)")
print("  大量飲酒          → HvyAlcoholConsump (0/1)")
print("  運動習慣          → PhysActivity (0/1)")
print("  果物摂取          → Fruits (0/1)")
print("  野菜摂取          → Veggies (0/1)")
print("  医療保険加入       → AnyHealthcare (0/1)")
print("  費用理由受診断念   → NoDocbcCost (0/1)")
print("\n【CSV② 健診結果_ターゲット】")
print("  BMI              → BMI")
print("  高血圧            → HighBP (0/1)")
print("  高コレステロール   → HighChol (0/1)")
print("  コレステロール検査  → CholCheck (0/1)")
print("  脳卒中歴          → Stroke (0/1)")
print("  心臓病既往         → HeartDiseaseorAttack (0/1)")
print("  主観的健康感       → GenHlth (1-5)")
print("  精神的不健康日数   → MentHlth (0-30)")
print("  身体的不健康日数   → PhysHlth (0-30)")
print("  歩行困難          → DiffWalk (0/1)")
print("  糖尿病_予備群 ★  → Diabetes_binary (目的変数, 0/1)")
print("================================")