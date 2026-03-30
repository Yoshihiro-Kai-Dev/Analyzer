from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.db import models
from app import schemas
from app.core.deps import get_current_user
import sqlalchemy

router = APIRouter()

@router.get("/", response_model=List[schemas.Table])
def read_tables(project_id: int, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """
    登録されているテーブル一覧を取得する（カラム情報含む）
    """
    tables = db.query(models.TableMetadata).filter(models.TableMetadata.project_id == project_id).offset(skip).limit(limit).all()
    return tables

@router.delete("/{table_id}", response_model=schemas.Table)
def delete_table(
    project_id: int,
    table_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    テーブルメタデータと物理テーブルを削除する
    関連するカラム・リレーションはCascade削除、物理テーブルは手動でDROPする
    """
    # 削除対象テーブルの取得（プロジェクト整合性チェック込み）
    table = db.query(models.TableMetadata).filter(
        models.TableMetadata.id == table_id,
        models.TableMetadata.project_id == project_id,
    ).first()
    if not table:
        raise HTTPException(status_code=404, detail="テーブルが見つかりません")

    # 物理テーブルの削除
    # physical_table_nameはシステム生成であり、SQLインジェクションリスクはないとみなす
    if table.physical_table_name:
        try:
            drop_stmt = f'DROP TABLE IF EXISTS "{table.physical_table_name}" CASCADE'
            db.execute(sqlalchemy.text(drop_stmt))
        except Exception as e:
            print(f"Failed to drop table {table.physical_table_name}: {e}")

    # DBからTableMetadataを削除（カラム・リレーション・分析設定はCascadeで自動削除）
    db.delete(table)
    db.commit()
    return table


@router.patch("/{table_id}/columns/{column_id}", response_model=schemas.Column)
def update_column(
    project_id: int,
    table_id: int,
    column_id: int,
    update: schemas.ColumnUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    カラムの推論型・値ラベルを更新する
    どちらも省略可能で、指定されたフィールドのみ更新する
    """
    col = db.query(models.ColumnMetadata).filter(
        models.ColumnMetadata.id == column_id,
        models.ColumnMetadata.table_id == table_id
    ).first()
    if not col:
        raise HTTPException(status_code=404, detail="カラムが見つかりません")
    if update.inferred_type is not None:
        col.inferred_type = update.inferred_type
    if update.value_labels is not None:
        col.value_labels = update.value_labels
    db.commit()
    db.refresh(col)
    return col


@router.get("/{table_id}/columns/{column_id}/stats")
def get_column_stats(
    project_id: int,
    table_id: int,
    column_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    カラムの統計情報・分布データを取得する
    数値型: min/max/mean/stddev + ヒストグラム(10ビン)
    カテゴリ型: 値ごとのカウント（上位15件）
    日時型: 月別カウント
    """
    # カラムとテーブルのメタデータを取得する
    col = db.query(models.ColumnMetadata).filter(
        models.ColumnMetadata.id == column_id,
        models.ColumnMetadata.table_id == table_id,
    ).first()
    if not col:
        raise HTTPException(status_code=404, detail="カラムが見つかりません")

    table = db.query(models.TableMetadata).filter(
        models.TableMetadata.id == table_id,
        models.TableMetadata.project_id == project_id,
    ).first()
    if not table:
        raise HTTPException(status_code=404, detail="テーブルが見つかりません")

    pt = table.physical_table_name  # 物理テーブル名
    pc = col.physical_name          # 物理カラム名

    try:
        if col.inferred_type == "numeric":
            # 基本統計量を取得する
            stats_row = db.execute(sqlalchemy.text(
                f'SELECT MIN(CAST("{pc}" AS FLOAT)), MAX(CAST("{pc}" AS FLOAT)), '
                f'AVG(CAST("{pc}" AS FLOAT)), STDDEV(CAST("{pc}" AS FLOAT)), '
                f'COUNT(*), COUNT("{pc}") FROM "{pt}"'
            )).first()
            col_min, col_max, col_mean, col_std, total_count, non_null_count = stats_row

            histogram = []
            if col_min is not None and col_max is not None and col_min < col_max:
                # 10ビンのヒストグラムを生成する
                bin_rows = db.execute(sqlalchemy.text(
                    f'SELECT width_bucket(CAST("{pc}" AS FLOAT), :mn, :mx, 10) AS bucket, COUNT(*) '
                    f'FROM "{pt}" WHERE "{pc}" IS NOT NULL AND CAST("{pc}" AS FLOAT) >= :mn AND CAST("{pc}" AS FLOAT) <= :mx '
                    f'GROUP BY bucket ORDER BY bucket'
                ), {"mn": float(col_min), "mx": float(col_max) + 1e-10}).fetchall()
                bucket_counts = {r[0]: r[1] for r in bin_rows}
                bin_width = (float(col_max) - float(col_min)) / 10
                for i in range(1, 12):
                    label = f"{float(col_min) + (i-1)*bin_width:.2g}〜"
                    histogram.append({"label": label, "count": bucket_counts.get(i, 0)})

            return {
                "type": "numeric",
                "min": float(col_min) if col_min is not None else None,
                "max": float(col_max) if col_max is not None else None,
                "mean": float(col_mean) if col_mean is not None else None,
                "std": float(col_std) if col_std is not None else None,
                "total_count": total_count,
                "non_null_count": non_null_count,
                "histogram": histogram,
            }

        elif col.inferred_type == "categorical":
            # 値ごとのカウントを取得する（上位15件）
            rows = db.execute(sqlalchemy.text(
                f'SELECT CAST("{pc}" AS TEXT), COUNT(*) AS cnt FROM "{pt}" '
                f'GROUP BY CAST("{pc}" AS TEXT) ORDER BY cnt DESC LIMIT 15'
            )).fetchall()
            total = db.execute(sqlalchemy.text(f'SELECT COUNT(*) FROM "{pt}"')).scalar()
            return {
                "type": "categorical",
                "total_count": total,
                "value_counts": [{"value": r[0] if r[0] is not None else "(null)", "count": r[1]} for r in rows],
            }

        elif col.inferred_type == "datetime":
            # 月別カウントを取得する
            rows = db.execute(sqlalchemy.text(
                f'SELECT TO_CHAR(CAST("{pc}" AS TIMESTAMP), \'YYYY-MM\') AS month, COUNT(*) AS cnt '
                f'FROM "{pt}" WHERE "{pc}" IS NOT NULL '
                f'GROUP BY month ORDER BY month'
            )).fetchall()
            total = db.execute(sqlalchemy.text(f'SELECT COUNT(*) FROM "{pt}"')).scalar()
            return {
                "type": "datetime",
                "total_count": total,
                "monthly_counts": [{"month": r[0], "count": r[1]} for r in rows],
            }

        else:
            # その他の型（text, id など）はカテゴリと同様に扱う
            rows = db.execute(sqlalchemy.text(
                f'SELECT CAST("{pc}" AS TEXT), COUNT(*) AS cnt FROM "{pt}" '
                f'GROUP BY CAST("{pc}" AS TEXT) ORDER BY cnt DESC LIMIT 15'
            )).fetchall()
            total = db.execute(sqlalchemy.text(f'SELECT COUNT(*) FROM "{pt}"')).scalar()
            return {
                "type": "categorical",
                "total_count": total,
                "value_counts": [{"value": r[0] if r[0] is not None else "(null)", "count": r[1]} for r in rows],
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"統計情報の取得に失敗しました: {str(e)}")


@router.post("/{table_id}/copy", response_model=schemas.Table)
def copy_table(
    project_id: int,
    table_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    テーブルをコピーする（同プロジェクト内に新テーブルとして複製）
    """
    src = db.query(models.TableMetadata).filter(
        models.TableMetadata.id == table_id,
        models.TableMetadata.project_id == project_id,
    ).first()
    if not src:
        raise HTTPException(status_code=404, detail="テーブルが見つかりません")

    # 新しい物理テーブル名を生成する
    import time
    ts = int(time.time())
    new_physical = f"copy_{src.physical_table_name[:40]}_{ts}"

    # 物理テーブルをコピーする
    db.execute(sqlalchemy.text(
        f'CREATE TABLE "{new_physical}" AS SELECT * FROM "{src.physical_table_name}"'
    ))

    # メタデータを複製する
    new_table = models.TableMetadata(
        project_id=project_id,
        physical_table_name=new_physical,
        original_filename=f"コピー_{src.original_filename}",
        row_count=src.row_count,
    )
    db.add(new_table)
    db.flush()

    # カラムメタデータを複製する
    for col in src.columns:
        new_col = models.ColumnMetadata(
            table_id=new_table.id,
            physical_name=col.physical_name,
            display_name=col.display_name,
            data_type=col.data_type,
            inferred_type=col.inferred_type,
            value_labels=col.value_labels,  # 追加: 値ラベルも複製する
        )
        db.add(new_col)

    db.commit()
    db.refresh(new_table)
    return new_table


@router.get("/{table_id}/label-suggestions")
def get_label_suggestions(
    project_id: int,
    table_id: int,
    min_overlap_rate: int = Query(default=30, ge=0, le=100),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    新規テーブルのカテゴリ列に対し、同プロジェクト内の既存 value_labels 定義を候補として返す。
    同名カラム（physical_name 一致）かつ値の重複率が min_overlap_rate 以上のものを返す。
    """
    # 対象テーブルを取得する（プロジェクト整合性チェック込み）
    table = db.query(models.TableMetadata).filter(
        models.TableMetadata.id == table_id,
        models.TableMetadata.project_id == project_id,
    ).first()
    if not table:
        raise HTTPException(status_code=404, detail="テーブルが見つかりません")

    # value_labels 未設定のカテゴリ列を取得する
    target_cols = db.query(models.ColumnMetadata).filter(
        models.ColumnMetadata.table_id == table_id,
        models.ColumnMetadata.inferred_type == "categorical",
        models.ColumnMetadata.value_labels == None,  # noqa: E711
    ).all()

    # N+1 クエリと DetachedInstanceError を回避するため、プロジェクト内テーブル名を事前にマップ取得する
    project_tables = db.query(models.TableMetadata).filter(
        models.TableMetadata.project_id == project_id
    ).all()
    table_name_map = {t.id: t.original_filename for t in project_tables}

    result = []
    for col in target_cols:
        # 同プロジェクト内の他テーブルで同名カラムかつ value_labels が設定済みのものを検索する
        matching_cols = (
            db.query(models.ColumnMetadata)
            .join(models.TableMetadata, models.ColumnMetadata.table_id == models.TableMetadata.id)
            .filter(
                models.TableMetadata.project_id == project_id,
                models.TableMetadata.id != table_id,
                models.ColumnMetadata.physical_name == col.physical_name,
                models.ColumnMetadata.value_labels != None,  # noqa: E711
            )
            .all()
        )

        if not matching_cols:
            continue

        # 新テーブルの実データから NULL を除いた DISTINCT 値を取得する
        try:
            rows = db.execute(
                sqlalchemy.text(
                    f'SELECT DISTINCT CAST("{col.physical_name}" AS TEXT) '
                    f'FROM "{table.physical_table_name}" '
                    f'WHERE "{col.physical_name}" IS NOT NULL'
                )
            ).fetchall()
            new_values = {str(r[0]) for r in rows}
        except Exception as e:
            print(f"Failed to get distinct values for column {col.physical_name}: {e}")
            continue

        if not new_values:
            continue

        # 既存 value_labels キーとの重複率を計算し閾値以上の候補を収集する
        n = len(new_values)
        suggestions = []
        for match_col in matching_cols:
            existing_keys = set(match_col.value_labels.keys())
            overlap = new_values & existing_keys
            overlap_rate = int(len(overlap) / n * 100)
            if overlap_rate >= min_overlap_rate:
                suggestions.append({
                    "source_table_id": match_col.table_id,
                    # table_name_map で名前を解決する（lazy load / DetachedInstanceError 回避）
                    "source_table_name": table_name_map.get(match_col.table_id, ""),
                    "source_column_id": match_col.id,
                    "value_labels": match_col.value_labels,
                    "overlap_rate": overlap_rate,
                })

        if not suggestions:
            continue

        # 重複率降順でソートする
        suggestions.sort(key=lambda x: x["overlap_rate"], reverse=True)
        result.append({
            "column_id": col.id,
            "column_name": col.physical_name,
            "suggestions": suggestions,
        })

    return result
