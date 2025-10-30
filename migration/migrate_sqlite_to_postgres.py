#!/usr/bin/env python3
"""
Migration Script: SQLite → PostgreSQL
Migrate Employees and Face Templates from old SQLite database to new PostgreSQL database
"""

import sqlite3
import os
import sys
from datetime import datetime, timezone, timedelta
from sqlalchemy import text

# Import database models
from database_models import (
    SessionLocal,
    Employee,
    FaceTemplate,
    _now_wib
)

# SQLite database path (update this if different)
SQLITE_DB_PATH = "/home/gspe/AutoMonitoring-FR/db/attendance.db"

# WIB timezone
WIB_TZ = timezone(timedelta(hours=7))


def connect_sqlite():
    """Connect to SQLite database"""
    if not os.path.exists(SQLITE_DB_PATH):
        print(f"❌ ERROR: SQLite database not found at: {SQLITE_DB_PATH}")
        print(f"   Please update SQLITE_DB_PATH in this script.")
        sys.exit(1)

    try:
        conn = sqlite3.connect(SQLITE_DB_PATH)
        conn.row_factory = sqlite3.Row  # Access columns by name
        print(f"✅ Connected to SQLite: {SQLITE_DB_PATH}")
        return conn
    except Exception as e:
        print(f"❌ Failed to connect to SQLite: {e}")
        sys.exit(1)


def migrate_employees(sqlite_conn, pg_session):
    """Migrate employees from SQLite to PostgreSQL"""
    print("\n" + "="*60)
    print("📋 MIGRATING EMPLOYEES")
    print("="*60)

    cursor = sqlite_conn.cursor()

    # Get all employees from SQLite
    try:
        cursor.execute("SELECT * FROM employees")
        sqlite_employees = cursor.fetchall()
        print(f"Found {len(sqlite_employees)} employees in SQLite")
    except Exception as e:
        print(f"❌ Error reading employees from SQLite: {e}")
        return 0, 0

    migrated = 0
    skipped = 0
    errors = 0

    for row in sqlite_employees:
        employee_code = row['employee_code']

        # Check if employee already exists in PostgreSQL
        existing = pg_session.query(Employee).filter_by(employee_code=employee_code).first()
        if existing:
            print(f"⏭️  Skip: {employee_code} (already exists)")
            skipped += 1
            continue

        try:
            # Create new employee
            # Use dict() to convert sqlite3.Row to dict for safe access
            row_dict = dict(row)

            new_employee = Employee(
                employee_code=row_dict['employee_code'],
                name=row_dict['name'],
                department=row_dict.get('department'),
                position=row_dict.get('position'),
                phone_number=row_dict.get('phone_number'),
                is_active=bool(row_dict.get('is_active', 1)),
                supervisor_id=row_dict.get('supervisor_id')
            )

            pg_session.add(new_employee)
            pg_session.flush()  # Get the ID without committing

            print(f"✅ Migrated: {employee_code} - {row['name']}")
            migrated += 1

        except Exception as e:
            print(f"❌ Error migrating {employee_code}: {e}")
            errors += 1
            pg_session.rollback()
            continue

    # Commit all employees
    try:
        pg_session.commit()
        print(f"\n✅ Committed {migrated} employees to PostgreSQL")
    except Exception as e:
        print(f"❌ Error committing employees: {e}")
        pg_session.rollback()
        return 0, skipped

    return migrated, skipped


def migrate_face_templates(sqlite_conn, pg_session):
    """Migrate face templates from SQLite to PostgreSQL"""
    print("\n" + "="*60)
    print("👤 MIGRATING FACE TEMPLATES")
    print("="*60)

    cursor = sqlite_conn.cursor()

    # Get all face templates from SQLite
    try:
        cursor.execute("SELECT * FROM face_templates")
        sqlite_templates = cursor.fetchall()
        print(f"Found {len(sqlite_templates)} face templates in SQLite")
    except Exception as e:
        print(f"❌ Error reading face templates from SQLite: {e}")
        return 0, 0

    migrated = 0
    skipped = 0
    errors = 0

    for row in sqlite_templates:
        employee_id_sqlite = row['employee_id']

        # Find corresponding employee in PostgreSQL by employee_code
        # First, get employee_code from SQLite
        cursor.execute("SELECT employee_code FROM employees WHERE id = ?", (employee_id_sqlite,))
        emp_row = cursor.fetchone()
        if not emp_row:
            print(f"⚠️  Warning: Face template has invalid employee_id={employee_id_sqlite}")
            skipped += 1
            continue

        employee_code = emp_row['employee_code']

        # Find employee in PostgreSQL
        pg_employee = pg_session.query(Employee).filter_by(employee_code=employee_code).first()
        if not pg_employee:
            print(f"⚠️  Skip: Face template for {employee_code} (employee not found in PostgreSQL)")
            skipped += 1
            continue

        try:
            # Create new face template
            # Use dict() to convert sqlite3.Row to dict for safe access
            row_dict = dict(row)

            new_template = FaceTemplate(
                employee_id=pg_employee.id,  # Use PostgreSQL employee ID
                embedding=row_dict['embedding'],  # Binary data
                pose_label=row_dict.get('pose_label'),
                quality_score=row_dict.get('quality_score'),
                created_at=_now_wib()  # Use current time in WIB
            )

            pg_session.add(new_template)

            pose = row_dict.get('pose_label', 'unknown')
            print(f"✅ Migrated face template: {employee_code} ({pose})")
            migrated += 1

        except Exception as e:
            print(f"❌ Error migrating face template for {employee_code}: {e}")
            errors += 1
            continue

    # Commit all face templates
    try:
        pg_session.commit()
        print(f"\n✅ Committed {migrated} face templates to PostgreSQL")
    except Exception as e:
        print(f"❌ Error committing face templates: {e}")
        pg_session.rollback()
        return 0, skipped

    return migrated, skipped


def main():
    print("\n" + "="*60)
    print("🚀 SQLite → PostgreSQL MIGRATION")
    print("="*60)
    print(f"Source: {SQLITE_DB_PATH}")
    print(f"Target: PostgreSQL (from environment variables)")
    print("="*60)

    # Check PostgreSQL connection
    try:
        pg_session = SessionLocal()
        # Test connection
        pg_session.execute(text("SELECT 1"))
        print("✅ Connected to PostgreSQL")
    except Exception as e:
        print(f"❌ Failed to connect to PostgreSQL: {e}")
        print("\nMake sure environment variables are set:")
        print("  export POSTGRES_HOST=localhost")
        print("  export POSTGRES_DB=FR")
        print("  export POSTGRES_USER=fr_admin")
        print("  export POSTGRES_PASSWORD=your_password")
        sys.exit(1)

    # Connect to SQLite
    sqlite_conn = connect_sqlite()

    # Migrate employees first (required for foreign keys)
    emp_migrated, emp_skipped = migrate_employees(sqlite_conn, pg_session)

    # Migrate face templates
    face_migrated, face_skipped = migrate_face_templates(sqlite_conn, pg_session)

    # Close connections
    sqlite_conn.close()
    pg_session.close()

    # Print summary
    print("\n" + "="*60)
    print("📊 MIGRATION SUMMARY")
    print("="*60)
    print(f"Employees:")
    print(f"  ✅ Migrated: {emp_migrated}")
    print(f"  ⏭️  Skipped:  {emp_skipped}")
    print(f"\nFace Templates:")
    print(f"  ✅ Migrated: {face_migrated}")
    print(f"  ⏭️  Skipped:  {face_skipped}")
    print("="*60)

    if emp_migrated > 0 or face_migrated > 0:
        print("\n🎉 Migration completed successfully!")
        print("\nNext steps:")
        print("  1. Verify data in PostgreSQL:")
        print("     psql -h localhost -U fr_admin -d FR")
        print("     SELECT * FROM employees;")
        print("     SELECT COUNT(*) FROM face_templates;")
        print("  2. Start the application:")
        print("     python app.py")
    else:
        print("\n⚠️  No new data migrated (all records already exist or errors occurred)")


if __name__ == '__main__':
    main()
