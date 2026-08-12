"""
Migration: Add notified_at column to alerts table.
Prevents the /api/alerts/pending endpoint from returning the same alert on every poll.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set")
    sys.exit(1)

engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # Check if column already exists
    result = conn.execute(text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name = 'alerts' AND column_name = 'notified_at'"
    ))
    if result.fetchone():
        print("Column 'notified_at' already exists on alerts table. Skipping.")
    else:
        conn.execute(text(
            "ALTER TABLE alerts ADD COLUMN notified_at TIMESTAMP WITH TIME ZONE DEFAULT NULL"
        ))
        conn.commit()
        print("Added 'notified_at' column to alerts table.")

    # Create partial index for fast polling queries (only un-notified alerts)
    try:
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_alerts_notified "
            "ON alerts(notified_at) WHERE notified_at IS NULL"
        ))
        conn.commit()
        print("Created partial index idx_alerts_notified.")
    except Exception as e:
        print(f"Index creation note: {e}")

print("Migration complete.")
