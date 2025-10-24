"""
Migration script to add entry_type column to attendances table.
Run this once to add the new column.
"""

from database_models import engine
from sqlalchemy import text

def add_entry_type_column():
    """Add entry_type column to attendances table."""
    try:
        with engine.connect() as conn:
            # Check if column already exists
            check_sql = text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name='attendances' AND column_name='entry_type'
            """)
            result = conn.execute(check_sql)
            exists = result.fetchone() is not None

            if exists:
                print("[OK] Column 'entry_type' already exists in 'attendances' table")
                return

            # Add column with default value
            alter_sql = text("""
                ALTER TABLE attendances
                ADD COLUMN entry_type VARCHAR DEFAULT 'AUTO'
            """)
            conn.execute(alter_sql)
            conn.commit()

            print("[SUCCESS] Successfully added 'entry_type' column to 'attendances' table")
            print("   Default value: 'AUTO'")
            print("   Existing records will have entry_type='AUTO'")

    except Exception as e:
        print(f"[ERROR] Error adding column: {e}")
        raise

if __name__ == '__main__':
    print("Starting database migration...")
    add_entry_type_column()
    print("Migration complete!")
