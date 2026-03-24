/**
 * テーブル一覧からカラム別の値ラベルマップを構築する
 * カラム物理名 → { 値文字列 → ラベル文字列 } の辞書を返す
 *
 * @param tables GET /api/projects/{id}/tables/ のレスポンス配列
 * @returns Record<physical_name, Record<rawValue, label>>
 */
export function buildColLabelsMap(tables: any[]): Record<string, Record<string, string>> {
    const map: Record<string, Record<string, string>> = {}
    tables.forEach(t => {
        t.columns?.forEach((c: any) => {
            if (c.value_labels && Object.keys(c.value_labels).length > 0) {
                // 短縮名（physical_name のみ）でも引けるようにする（メインテーブル列の場合）
                map[c.physical_name] = c.value_labels
                // テーブル名付きフル名でも引けるようにする（結合後の特徴量名: "{table_name}_{col_name}"）
                map[`${t.physical_table_name}_${c.physical_name}`] = c.value_labels
            }
        })
    })
    return map
}

/**
 * テーブルプレフィックス（例: "upload_p5_20260304_01_sex" → "sex"）を除去する
 * 物理テーブル名（upload_p{N}_{TIMESTAMP}_{SEQ}_）パターンを削除して物理カラム名を返す
 *
 * @param colName プレフィックス付きまたはプレフィックスなしのカラム名
 * @returns プレフィックスを除去したカラム名
 */
export function stripTablePrefix(colName: string): string {
    return colName.replace(/upload_p\d+_\d+_\d+_/g, '')
}
