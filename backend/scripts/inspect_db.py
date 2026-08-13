import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.config import settings
from app.database import engine, Base
import app.models.models
from sqlalchemy import inspect, text

print("=== DATABASE INSPECTION ===\n")

# 1. List all tables
with engine.connect() as conn:
    result = conn.execute(text("""
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
    """))
    tables = [row[0] for row in result.fetchall()]
    print(f"Tables in DB: {tables}\n")

# 2. For each model table, compare columns
inspector = inspect(engine)
model_tables = Base.metadata.tables

for table_name in sorted(model_tables.keys()):
    model_cols = sorted([col.name for col in model_tables[table_name].columns])
    if table_name in tables:
        db_cols = sorted([col['name'] for col in inspector.get_columns(table_name)])
        missing_in_db = [c for c in model_cols if c not in db_cols]
        extra_in_db = [c for c in db_cols if c not in model_cols]
        if missing_in_db or extra_in_db:
            print(f"TABLE: {table_name}")
            if missing_in_db:
                print(f"  MISSING in DB: {missing_in_db}")
            if extra_in_db:
                print(f"  EXTRA in DB (not in model): {extra_in_db}")
        else:
            print(f"TABLE: {table_name} — OK")
    else:
        print(f"TABLE: {table_name} — MISSING ENTIRELY FROM DB")

print("\n=== IMPACT_ALERTS DETAIL ===")
with engine.connect() as conn:
    result = conn.execute(text("""
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'impact_alerts'
        ORDER BY ordinal_position
    """))
    for row in result.fetchall():
        print(f"  {row[0]} | {row[1]} | nullable={row[2]}")
