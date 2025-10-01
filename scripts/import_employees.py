#!/usr/bin/env python3
"""
Import employees from a central JSON file into the local SQLite database.

Usage (Windows PowerShell):
  python scripts/import_employees.py --json data-karyawan.json [--dry-run]

Usage (Docker container):
  docker run --rm --gpus all \
    -v "$PWD/db:/app/db" \
    -v "$PWD/data-karyawan.json:/app/data-karyawan.json" \
    gspe-fr:cuda12.8-py3.10 \
    python3 scripts/import_employees.py --json /app/data-karyawan.json

Mapping:
- employee_code: prefer hrId (string), else central id (id)
- name: name
- department: departmentName
- position: jobTitle
- phone_number: phoneHr (prefixed with countryCode if provided)
- is_active: True if terminationTimestamp is null, else False

Upsert key: employee_code; if missing, fallback to (name + department).
"""
import argparse
import json
import os
from typing import Any, Dict, List, Optional, Tuple

from database_models import SessionLocal, Employee, init_db


def _normalize_phone(country_code: Optional[str], phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    phone = str(phone).strip()
    cc = str(country_code).strip() if country_code else ''
    if cc and not phone.startswith('+'):
        # ensure country code without leading zeros
        if cc.startswith('+'):
            return cc + phone.lstrip('0')
        return '+' + cc + phone.lstrip('0')
    return phone


def _extract_record(rec: Dict[str, Any]) -> Dict[str, Any]:
    name = (rec.get('name') or rec.get('username') or '').strip()
    department = (rec.get('departmentName') or '').strip()
    job = (rec.get('jobTitle') or '').strip()
    phone = _normalize_phone(rec.get('countryCode'), rec.get('phoneHr') or rec.get('phone'))
    # choose a stable unique code
    code = rec.get('hrId') or rec.get('employeeSerialNumber') or rec.get('id')
    if code is not None:
        code = str(code)
    active = (rec.get('terminationTimestamp') is None)
    return {
        'employee_code': code,
        'name': name,
        'department': department,
        'position': job,
        'phone_number': phone,
        'is_active': bool(active),
    }


def import_from_json(json_path: str, dry_run: bool = False) -> Tuple[int, int, int]:
    if not os.path.isfile(json_path):
        raise FileNotFoundError(f"JSON not found: {json_path}")
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError('JSON must be a list of employee objects')

    init_db()  # ensure tables exist and migrations run

    created = updated = skipped = 0
    with SessionLocal() as db:
        for rec in data:
            try:
                row = _extract_record(rec)
                # basic validation
                if not row['name']:
                    skipped += 1
                    continue
                # find existing by employee_code first
                emp = None
                if row['employee_code']:
                    emp = db.query(Employee).filter(Employee.employee_code == row['employee_code']).first()
                # fallback by name+department
                if emp is None:
                    emp = db.query(Employee).filter(
                        Employee.name == row['name'],
                        Employee.department == row['department']
                    ).first()
                if emp is None:
                    # create
                    emp = Employee(
                        employee_code=row['employee_code'] or None,
                        name=row['name'],
                        department=row['department'] or None,
                        position=row['position'] or None,
                        phone_number=row['phone_number'] or None,
                        is_active=row['is_active'],
                    )
                    db.add(emp)
                    created += 1
                else:
                    # update selective fields
                    emp.employee_code = emp.employee_code or (row['employee_code'] or None)
                    emp.department = row['department'] or emp.department
                    emp.position = row['position'] or emp.position
                    emp.phone_number = row['phone_number'] or emp.phone_number
                    emp.is_active = row['is_active']
                    updated += 1
            except Exception:
                skipped += 1
        if not dry_run:
            db.commit()
    return created, updated, skipped


def main():
    ap = argparse.ArgumentParser(description='Import employees from JSON into attendance.db')
    ap.add_argument('--json', required=True, help='Path to data-karyawan.json')
    ap.add_argument('--dry-run', action='store_true', help='Do not write to DB, only simulate')
    args = ap.parse_args()

    created, updated, skipped = import_from_json(args.json, dry_run=args.dry_run)
    print(f"Import done. created={created}, updated={updated}, skipped={skipped}")


if __name__ == '__main__':
    main()
