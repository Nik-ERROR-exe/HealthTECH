import os
import sys
from sqlalchemy import text

# Ensure backend root is on Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings
from app.database import engine, Base
import app.models.models  # Load all models for Base.metadata.create_all

def migrate_database():
    db_target = settings.database_url.split('@')[-1] if '@' in settings.database_url else 'Local/Configured'
    print(f"Connecting to Database: {db_target}")
    
    # ENUM ALTER statements in Postgres MUST run with autocommit (cannot run in standard transaction)
    with engine.connect() as conn:
        conn = conn.execution_options(isolation_level="AUTOCOMMIT")
        
        # 1. Update userrole enum for RELATIVE and VOLUNTEER
        for role in ['RELATIVE', 'VOLUNTEER']:
            sql_check_and_add = f"""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_enum e 
                    JOIN pg_type t ON e.enumtypid = t.oid 
                    WHERE t.typname = 'userrole' AND e.enumlabel = '{role}'
                ) THEN
                    ALTER TYPE userrole ADD VALUE '{role}';
                END IF;
            END $$;
            """
            try:
                conn.execute(text(sql_check_and_add))
                print(f"[OK] Verified UserRole enum value: '{role}'")
            except Exception as e:
                print(f"[WARNING] Warning updating userrole for '{role}': {e}")
                
        # 2. Check relationshiptype ENUM
        sql_relationship_enum = """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'relationshiptype') THEN
                CREATE TYPE relationshiptype AS ENUM ('DAUGHTER', 'SON', 'FRIEND', 'OTHER');
            END IF;
        END $$;
        """
        try:
            conn.execute(text(sql_relationship_enum))
            print("[OK] Verified ENUM 'relationshiptype'")
        except Exception as e:
            print(f"[WARNING] Warning creating relationshiptype: {e}")

    # 3. Create any missing tables (e.g. relative_profiles, volunteer_profiles, impact_alerts)
    try:
        Base.metadata.create_all(bind=engine)
        print("[OK] Base.metadata.create_all executed successfully (all missing tables created)")
    except Exception as e:
        print(f"[ERROR] Error creating missing tables: {e}")

    print("\n[SUCCESS] Migration script finished successfully!")

if __name__ == "__main__":
    migrate_database()
