"""
register_build_hash.py
======================
Run this ONCE after compiling a new SEED-SEB.exe to register its SHA-256
hash in Supabase. After registration, only this exact binary will pass
the integrity check on student laptops.

Usage:
    python register_build_hash.py

Requirements:
    pip install requests

You will need your Supabase SERVICE ROLE key (not the anon key).
Get it from: https://supabase.com/dashboard/project/iygqntndsgiysvibqjyw/settings/api
             -> Project API keys -> service_role (secret)
"""

import hashlib
import os
import sys
import json

try:
    import requests
except ImportError:
    print("Installing requests...")
    os.system(f"{sys.executable} -m pip install requests")
    import requests

# ── Configuration ─────────────────────────────────────────────────────────────

SUPABASE_URL = "https://iygqntndsgiysvibqjyw.supabase.co"

# PASTE YOUR SERVICE ROLE KEY HERE (keep this script private, never commit the key)
SUPABASE_SERVICE_KEY = ""  # <-- paste here, or set env var SUPABASE_SERVICE_KEY

APP_VERSION = "1.0.4"  # must match CURRENT_VERSION in main.py

# Path to compiled SEED-SEB.exe (relative to this script in SetupBuild/)
EXE_PATH = os.path.join(os.path.dirname(__file__), "SEED-SEB.exe")

# ── Helper functions ───────────────────────────────────────────────────────────

def compute_sha256(filepath):
    """Compute SHA-256 hash of a file."""
    sha256 = hashlib.sha256()
    try:
        with open(filepath, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                sha256.update(chunk)
        return sha256.hexdigest()
    except FileNotFoundError:
        return None

def register_hash(version, sha256_hash, notes, service_key):
    """Insert the hash into Supabase app_build_hashes table."""
    url = f"{SUPABASE_URL}/rest/v1/app_build_hashes"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    payload = {
        "version": version,
        "sha256_hash": sha256_hash.lower(),
        "notes": notes,
        "is_active": True,
    }
    resp = requests.post(url, headers=headers, json=payload, timeout=15)
    return resp

def deactivate_old_hashes(version, current_hash, service_key):
    """Mark all OTHER hashes for this version as inactive (revoke old builds)."""
    url = f"{SUPABASE_URL}/rest/v1/app_build_hashes"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }
    # PATCH: set is_active=false where version matches but hash is different
    params = {
        "version": f"eq.{version}",
        "sha256_hash": f"neq.{current_hash.lower()}",
        "is_active": "eq.true",
    }
    payload = {"is_active": False}
    resp = requests.patch(url, headers=headers, json=payload, params=params, timeout=15)
    return resp

# ── Main ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("  SEED-SEB Build Hash Registration Tool")
    print("=" * 60)

    # Resolve service key from env if not hardcoded
    service_key = SUPABASE_SERVICE_KEY or os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not service_key:
        print("\n❌ ERROR: Supabase service role key not set.")
        print("   Either set SUPABASE_SERVICE_KEY= in this script")
        print("   or set the environment variable: set SUPABASE_SERVICE_KEY=your_key")
        sys.exit(1)

    # Find the EXE
    exe_path = EXE_PATH
    if not os.path.exists(exe_path):
        # Try dist/SEED-SEB/SEED-SEB.exe
        alt = os.path.join(os.path.dirname(__file__), "dist", "SEED-SEB", "SEED-SEB.exe")
        if os.path.exists(alt):
            exe_path = alt
        else:
            print(f"\n❌ ERROR: SEED-SEB.exe not found at:")
            print(f"   {exe_path}")
            print(f"   {alt}")
            sys.exit(1)

    print(f"\n📁 EXE: {exe_path}")
    print(f"   Size: {os.path.getsize(exe_path) / 1024 / 1024:.1f} MB")
    print(f"\n🔐 Computing SHA-256 hash...")
    sha256_hash = compute_sha256(exe_path)
    print(f"   Hash: {sha256_hash}")
    print(f"   Version: {APP_VERSION}")

    notes = input("\n📝 Build notes (e.g. 'v1.0.4 release', press Enter to skip): ").strip()
    if not notes:
        notes = f"SEED-SEB v{APP_VERSION} official build"

    print(f"\n⬆️  Registering hash in Supabase...")
    resp = register_hash(APP_VERSION, sha256_hash, notes, service_key)

    if resp.status_code in (200, 201):
        print(f"   ✅ Hash registered successfully!")
    else:
        print(f"   ❌ Failed to register hash: {resp.status_code}")
        print(f"   Response: {resp.text}")
        sys.exit(1)

    print(f"\n🔄 Revoking all other hashes for version {APP_VERSION}...")
    revoke_resp = deactivate_old_hashes(APP_VERSION, sha256_hash, service_key)
    if revoke_resp.status_code in (200, 204):
        print(f"   ✅ Old hashes revoked (only this build is now valid).")
    else:
        print(f"   ⚠️  Could not revoke old hashes: {revoke_resp.status_code} - {revoke_resp.text}")

    print(f"""
╔══════════════════════════════════════════════════════════════╗
║  Registration Complete!                                      ║
║                                                              ║
║  Only SEED-SEB.exe with this exact hash will now pass        ║
║  the integrity check on student laptops.                     ║
║                                                              ║
║  Hash: {sha256_hash[:32]}...  ║
║  Version: {APP_VERSION:<51} ║
╚══════════════════════════════════════════════════════════════╝
""")
