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
            if "already exists" in err or "duplicate" in err or "already" in err:
                print(f"SKIP (already exists): {sql[:60]}...")
            else:
                print(f"ERROR: {e}")
                print(f"  SQL: {sql[:80]}")

if __name__ == "__main__":
    print("Running migrations...\n")

    # 1. Add AMBULANCE to userrole enum
    run_ddl("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'AMBULANCE'")

    # 2. Add EN_ROUTE to impact_alert_status enum
    run_ddl("ALTER TYPE impact_alert_status ADD VALUE IF NOT EXISTS 'EN_ROUTE'")

    # 3. Rename volunteer_profiles to ambulances
    run_ddl("ALTER TABLE IF EXISTS volunteer_profiles RENAME TO ambulances")
    
    # 4. Add new ambulance-specific columns
    run_ddl("ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS ambulance_name VARCHAR(255)")
    run_ddl("ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS driver_name VARCHAR(255)")
    run_ddl("ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS hospital_name VARCHAR(255)")
    run_ddl("ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS area_description VARCHAR(255)")
    run_ddl("ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS current_status VARCHAR(50) DEFAULT 'available'")

    # 5. Update impact_alerts: rename volunteer columns to ambulance
    run_ddl("ALTER TABLE impact_alerts RENAME COLUMN IF EXISTS responder_volunteer_id TO responder_ambulance_id")
    run_ddl("ALTER TABLE impact_alerts RENAME COLUMN IF EXISTS volunteers_notified TO ambulances_notified")

    # 6. Add GPS tracking columns to impact_alerts
    run_ddl("ALTER TABLE impact_alerts ADD COLUMN IF NOT EXISTS responder_latitude DOUBLE PRECISION")
    run_ddl("ALTER TABLE impact_alerts ADD COLUMN IF NOT EXISTS responder_longitude DOUBLE PRECISION")

    # 7. Update foreign key constraint for ambulances
    run_ddl("ALTER TABLE impact_alerts DROP CONSTRAINT IF EXISTS impact_alerts_responder_volunteer_id_fkey")
    run_ddl("ALTER TABLE impact_alerts ADD CONSTRAINT IF NOT EXISTS impact_alerts_responder_ambulance_id_fkey FOREIGN KEY (responder_ambulance_id) REFERENCES ambulances(id) ON DELETE SET NULL")

    # 8. Update sequence/index names if they reference volunteer
    run_ddl("ALTER INDEX IF EXISTS ix_volunteer_profiles_id RENAME TO ix_ambulances_id")
    run_ddl("ALTER INDEX IF EXISTS ix_volunteer_profiles_user_id RENAME TO ix_ambulances_user_id")

    # 9. Add custom location columns to patient_profiles for testing
    run_ddl("ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS custom_latitude DOUBLE PRECISION")
    run_ddl("ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS custom_longitude DOUBLE PRECISION")

    print("\nMigrations complete.")
