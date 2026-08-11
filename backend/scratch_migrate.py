import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.database import engine

def run_ddl(sql):
    with engine.connect() as conn:
        conn = conn.execution_options(isolation_level="AUTOCOMMIT")
        try:
            conn.execute(text(sql))
            conn.commit()
            print(f"OK: {sql[:60]}...")
        except Exception as e:
            err = str(e).lower()
            if "already exists" in err or "duplicate" in err:
                print(f"SKIP (already exists): {sql[:60]}...")
            else:
                print(f"ERROR: {e}")
                print(f"  SQL: {sql[:80]}")

if __name__ == "__main__":
    print("Running migrations...\n")

    # 1. Add RELATIVE to userrole enum
    run_ddl("ALTER TYPE userrole ADD VALUE 'RELATIVE'")

    # 2. Create relationshiptype enum
    run_ddl("CREATE TYPE relationshiptype AS ENUM ('DAUGHTER', 'SON', 'FRIEND', 'OTHER')")

    # 3. Create relative_profiles table
    run_ddl("""
        CREATE TABLE relative_profiles (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id          UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            patient_id       UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
            relationship_type relationshiptype NOT NULL,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    # 4. Existing migration: add updated_at to impact_alerts
    run_ddl("ALTER TABLE impact_alerts ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP")

    print("\nMigrations complete.")
