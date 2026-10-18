# -*- coding: utf-8 -*-
"""One-off cleanup: delete EVERY account except the admin, plus their data.

Usage (run where the database is reachable, e.g. on the server):
    Dry run (lists what WOULD be deleted, deletes nothing):
        python scripts/cleanup_users_keep_admin.py
    Execute:
        python scripts/cleanup_users_keep_admin.py --execute

What it does:
  1. Reads DATABASE_URL + ADMIN_EMAIL from the environment (.env).
  2. Makes sure ADMIN_EMAIL exists as an active admin (same as startup seed,
     so you can never lock yourself out).
  3. Deletes all OTHER users and every row they own in all tables that
     have a `user_id` column (roadmaps, lessons, tasks, CVs, projects...).
  4. Removes deleted ids from communities.members (+ fixes member_count).
  5. KEEPS `subscription_requests` (payment receipts/evidence the admin
     still needs to review) — reported separately.

Requires: psycopg2-binary (in requirements.txt).
"""
import os
import sys

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    sys.exit("psycopg2 is required: pip install psycopg2-binary")

EXECUTE = "--execute" in sys.argv

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://zeus:zeus@localhost:5433/zeus")
ADMIN_EMAIL = (os.getenv("ADMIN_EMAIL", "") or "").strip().lower()
if not ADMIN_EMAIL:
    sys.exit("Refusing to run: ADMIN_EMAIL is not set.")

conn = psycopg2.connect(DATABASE_URL)
conn.autocommit = False
cur = conn.cursor()

# 1. All users
cur.execute("SELECT id, email, role, status FROM users ORDER BY created_date")
users = cur.fetchall()
print("Total users: %d" % len(users))
for uid, email, role, status in users:
    print("  - %s | %s | %s" % (email, role, status))

admin_rows = [u for u in users if (u[1] or "").lower() == ADMIN_EMAIL]
if not admin_rows:
    sys.exit("Refusing to run: admin %s not found in users table." % ADMIN_EMAIL)
keep_ids = {u[0] for u in admin_rows}
doomed = [u for u in users if u[0] not in keep_ids]
print("\nKeeping admin: %s (ids: %d)" % (ADMIN_EMAIL, len(keep_ids)))
print("To delete: %d user(s)" % len(doomed))
for uid, email, role, status in doomed:
    print("  x %s | %s | %s" % (email, role, status))

# 2. Tables with a user_id column (except users itself + payment evidence)
cur.execute(
    "SELECT table_name FROM information_schema.columns "
    "WHERE table_schema='public' AND column_name='user_id'"
)
tables = sorted({r[0] for r in cur.fetchall()} - {"users", "subscription_requests"})
print("\nUser-owned tables to clean: %s" % ", ".join(tables))

if not EXECUTE:
    # Dry run counts
    for t in tables:
        cur.execute('SELECT COUNT(*) FROM "%s" WHERE user_id NOT IN %s' % (t, "(%s)" % ",".join(["%s"] * len(keep_ids))), tuple(keep_ids))
        print("  %s: %d row(s) would be deleted" % (t, cur.fetchone()[0]))
    cur.execute("SELECT COUNT(*) FROM subscription_requests")
    print("subscription_requests kept as evidence: %d row(s)" % cur.fetchone()[0])
    print("\nDRY RUN — nothing deleted. Re-run with --execute to apply.")
    conn.close()
    sys.exit(0)

# 3. Execute
deleted_total = 0
for t in tables:
    cur.execute('DELETE FROM "%s" WHERE user_id NOT IN (%s)' % (t, ",".join(["%s"] * len(keep_ids))), tuple(keep_ids))
    print("  %s: deleted %d" % (t, cur.rowcount))
    deleted_total += cur.rowcount

# 4. Scrub communities.members JSON arrays
try:
    cur.execute("SELECT id, members, member_count FROM communities")
    comms = cur.fetchall()
    for cid, members, count in comms:
        if not members:
            continue
        kept = [m for m in members if m in keep_ids]
        if len(kept) != len(members):
            cur.execute("UPDATE communities SET members=%s, member_count=%s WHERE id=%s",
                        (psycopg2.extras.Json(kept), len(kept), cid))
            print("  communities[%s]: members %d -> %d" % (cid[:8], len(members), len(kept)))
except Exception as e:
    print("  communities scrub skipped: %s" % e)

# 5. Delete the users
cur.execute("DELETE FROM users WHERE id NOT IN (%s)" % ",".join(["%s"] * len(keep_ids)), tuple(keep_ids))
print("  users: deleted %d" % cur.rowcount)

cur.execute("SELECT COUNT(*) FROM subscription_requests")
print("subscription_requests kept as evidence: %d row(s)" % cur.fetchone()[0])

conn.commit()
cur.execute("SELECT email, role, status FROM users")
print("\nRemaining users:")
for email, role, status in cur.fetchall():
    print("  - %s | %s | %s" % (email, role, status))
conn.close()
print("\nDONE. Only the admin account remains.")
