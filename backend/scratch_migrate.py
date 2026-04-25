import os
import sys

# Add the app to path so we can import config
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.database import engine

def migrate():
    with engine.begin() as conn:
        try:
            conn.execute(text("ALTER TABLE impact_alerts ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP"))
            print("Successfully added updated_at column to impact_alerts")
        except Exception as e:
            if "already exists" in str(e).lower():
                print("Column updated_at already exists")
            else:
                print(f"Error adding column: {e}")

if __name__ == "__main__":
    migrate()
