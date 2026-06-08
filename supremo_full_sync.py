#!/usr/bin/env python3
"""
Full sync: Supremo CRM → Trifold Supabase
Updates stage_id for existing leads only (no inserts).
"""

import re
import time
import json
import requests
from datetime import datetime, timezone

# ─── CONFIG ──────────────────────────────────────────────────────────────────

SUPREMO_BASE = "https://api.supremocrm.com.br/v1"
SUPREMO_TOKEN = (
    "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJhcGktY3JtIiwic3ViIjozNTIwLCJub21lIjoiTHVjYXMiLCJlbWFpbCI6IiIsImRkZCI6bnVsbCwicGhvbmUiOm51bGwsInNpdF9pZCI6NzMyLCJzaXRfbm9tZSI6IlRyaWZvbGQgRW5nZW5oYXJpYSBMdGRhIiwiaWRfY2hhdmUiOjE4MiwiaWF0IjoxNzc5Mjk3NzI2LCJleHAiOjIwOTQ2NTc3MjZ9.qXikcp9Nzv6fEzmJjb3ZIvDaN-5gUgp0LP-vrh_EfZY"
)

SUPABASE_URL = "https://dsopqkqjkmhytudaaolv.supabase.co"
SUPABASE_SERVICE_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzb3Bxa3Fqa21oeXR1ZGFhb2x2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDk4MDkxOSwiZXhwIjoyMDkwNTU2OTE5fQ.FM6JAOfA_SkuidAQhNWU1h2QHFhXr1co4nn9MvSGEdY"
)

RATE_LIMIT_SLEEP = 2.0  # seconds between Supremo API pages

# ─── STAGE MAPPINGS ───────────────────────────────────────────────────────────

SITUACAO_TO_STAGE = {
    11031: "00000000-0000-0000-0001-000000000001",  # AGUARDANDO ATENDIMENTO
    10496: "00000000-0000-0000-0001-000000000002",  # 1º CONTATO
    11493: "00000000-0000-0000-0001-000000000003",  # AGENDAMENTO
    11477: "00000000-0000-0000-0001-000000000009",  # ATENDIMENTO
    10260: "00000000-0000-0000-0001-000000000005",  # VISITA
    10261: "9d3ddf3c-8049-4dd8-9e8b-81bba99ee529",  # PROPOSTA
    10263: "00000000-0000-0000-0001-000000000007",  # FECHAMENTO
    10688: "00000000-0000-0000-0001-000000000010",  # REPRESAMENTO
    10262: "95327bd7-3e88-4038-aa16-250a74ab085c",  # NÃO QUALIFICADO
    13354: "dfc0f7d1-4484-4cc2-917c-4ac15a561e42",  # IMPORTAR CRM
}

FECHOU_ID    = "00000000-0000-0000-0001-000000000007"  # etapa=4
PERDIDO_ID   = "00000000-0000-0000-0001-000000000008"  # etapa=5
IMPORTAR_CRM_ID = "dfc0f7d1-4484-4cc2-917c-4ac15a561e42"
CORRETORES_ANTIGOS_ID = "62075f72-1629-4d8b-a019-0fcb35e3d302"

PROTECTED_STAGES = {
    "dab590c7-ffc5-4086-be9a-4914f94fa3ba",  # Ação Muffato
    "62075f72-1629-4d8b-a019-0fcb35e3d302",  # Corretores Antigos
}

ACTIVE_BROKERS = {
    "ana beatriz bueno ferronatto",
    "corretor demo",
    "fernanda abreu",
    "matheus fernandes",
    "odair ferreira dos santos",
    "roberto",
    "roberto colichio",
    "robson silva",
    "target editado",
    "valeria costa",
    "vitor rodrigues de souza",
}

# ─── HELPERS ──────────────────────────────────────────────────────────────────

def normalize_phone(raw):
    """Normalize to 13-digit format: 55 + DDD(2) + 9 + número(8) — matching Supabase phone_normalized."""
    if not raw:
        return None
    digits = re.sub(r'\D', '', str(raw))
    # Already 13 digits with country code
    if len(digits) == 13 and digits.startswith("55"):
        return digits
    # 11 digits: DDD + 9 + 8 digits
    if len(digits) == 11:
        return "55" + digits
    # 12 digits with country code but missing 9th digit: 55 + DDD + 8 digits
    if len(digits) == 12 and digits.startswith("55"):
        return digits[:4] + "9" + digits[4:]
    # 10 digits: DDD + 8 digits (no 9th digit)
    if len(digits) == 10:
        return "55" + digits[:2] + "9" + digits[2:]
    # 9 digits: 9 + 8 digits (assume DDD 44)
    if len(digits) == 9:
        return "5544" + digits
    # 8 digits: just the number (assume DDD 44, add 9)
    if len(digits) == 8:
        return "55449" + digits
    return None


def target_stage(lead: dict) -> str:
    """Determine the target stage_id for a Supremo lead."""
    nome_corretor = (lead.get("nome_corretor") or "").strip().lower()

    # Broker not active → Corretores Antigos
    if nome_corretor and nome_corretor not in ACTIVE_BROKERS:
        return CORRETORES_ANTIGOS_ID

    # etapa takes priority over id_situacao
    etapa = lead.get("etapa")
    if etapa == 4:
        return FECHOU_ID
    if etapa == 5:
        return PERDIDO_ID

    id_situacao = lead.get("id_situacao")
    if id_situacao and id_situacao in SITUACAO_TO_STAGE:
        return SITUACAO_TO_STAGE[id_situacao]

    return IMPORTAR_CRM_ID


# ─── SUPABASE LOADER ─────────────────────────────────────────────────────────

def load_supabase_leads():
    """Load all leads from Supabase into two dicts keyed by supremo_id and phone_normalized."""
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "apikey": SUPABASE_SERVICE_KEY,
        "Content-Type": "application/json",
    }
    by_supremo_id = {}
    by_phone = {}

    offset = 0
    page_size = 1000
    total_loaded = 0

    while True:
        url = (
            f"{SUPABASE_URL}/rest/v1/leads"
            f"?select=id,supremo_id,phone_normalized,stage_id"
            f"&offset={offset}&limit={page_size}"
            f"&order=id"
        )
        resp = requests.get(url, headers=headers)
        resp.raise_for_status()
        rows = resp.json()
        if not rows:
            break

        for row in rows:
            sid = row.get("supremo_id")
            phone = row.get("phone_normalized")
            if sid is not None:
                by_supremo_id[int(sid)] = row
            if phone:
                by_phone[phone] = row

        total_loaded += len(rows)
        offset += page_size
        if len(rows) < page_size:
            break

    print(f"[LOAD] Supabase: {total_loaded} leads loaded "
          f"({len(by_supremo_id)} by supremo_id, {len(by_phone)} by phone)")
    return by_supremo_id, by_phone


# ─── SUPREMO FETCHER ─────────────────────────────────────────────────────────

def fetch_supremo_page(page: int) -> dict:
    headers = {"Authorization": f"Bearer {SUPREMO_TOKEN}"}
    url = f"{SUPREMO_BASE}/leads?pagina={page}"
    backoffs = [5, 15, 30, 60]
    for attempt, wait in enumerate(backoffs + [None], start=1):
        resp = requests.get(url, headers=headers, timeout=30)
        if resp.status_code == 429:
            if wait is None:
                resp.raise_for_status()
            print(f"    [429] page {page} attempt {attempt}, sleeping {wait}s…")
            time.sleep(wait)
            continue
        resp.raise_for_status()
        return resp.json()
    raise RuntimeError(f"Exhausted retries for page {page}")


# ─── SUPABASE UPDATER ─────────────────────────────────────────────────────────

def patch_lead(lead_id: str, new_stage_id: str):
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "apikey": SUPABASE_SERVICE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    url = f"{SUPABASE_URL}/rest/v1/leads?id=eq.{lead_id}"
    payload = {
        "stage_id": new_stage_id,
        "supremo_synced_at": datetime.now(timezone.utc).isoformat(),
    }
    resp = requests.patch(url, headers=headers, json=payload, timeout=15)
    resp.raise_for_status()


# ─── MAIN ────────────────────────────────────────────────────────────────────

def main():
    print(f"[START] Supremo → Trifold full sync — {datetime.now().isoformat()}")

    # 1. Load all Supabase leads into memory
    by_supremo_id, by_phone = load_supabase_leads()

    # 2. Discover total pages from Supremo
    print("[SUPREMO] Fetching page 1 to detect total pages…")
    first = fetch_supremo_page(1)
    time.sleep(RATE_LIMIT_SLEEP)

    total_pages = first.get("total_paginas") or first.get("paginas") or first.get("last_page") or 177
    leads_key = None
    for k in ("leads", "data", "items", "registros"):
        if k in first:
            leads_key = k
            break

    if leads_key is None:
        # Try to find it by looking for the list value
        for k, v in first.items():
            if isinstance(v, list):
                leads_key = k
                break

    print(f"[SUPREMO] total_pages={total_pages}, leads_key='{leads_key}'")
    print(f"[SUPREMO] Page 1 keys: {list(first.keys())}")

    # Stats
    stats = {
        "updated": 0,
        "skipped_unchanged": 0,
        "skipped_protected": 0,
        "not_found": 0,
        "errors": 0,
        "stage_counts": {},
    }

    def process_leads_list(leads_list):
        for lead in leads_list:
            sup_id = lead.get("id") or lead.get("id_lead")
            phone_raw = lead.get("telefone") or lead.get("celular") or lead.get("phone")
            phone_norm = normalize_phone(phone_raw)

            # Find matching Trifold lead
            trifold = None
            if sup_id and int(sup_id) in by_supremo_id:
                trifold = by_supremo_id[int(sup_id)]
            elif phone_norm and phone_norm in by_phone:
                trifold = by_phone[phone_norm]

            if trifold is None:
                stats["not_found"] += 1
                return

            current_stage = trifold.get("stage_id")

            # Skip protected stages
            if current_stage in PROTECTED_STAGES:
                stats["skipped_protected"] += 1
                return

            new_stage = target_stage(lead)

            # Skip if unchanged
            if current_stage == new_stage:
                stats["skipped_unchanged"] += 1
                return

            try:
                patch_lead(trifold["id"], new_stage)
                stats["updated"] += 1
                stats["stage_counts"][new_stage] = stats["stage_counts"].get(new_stage, 0) + 1
                # Update in-memory cache
                trifold["stage_id"] = new_stage
            except Exception as e:
                stats["errors"] += 1
                print(f"  [ERROR] lead {trifold['id']}: {e}")

    # Process page 1
    if leads_key:
        process_leads_list(first.get(leads_key, []))
    else:
        print(f"[WARN] Could not find leads list in response. Full response: {json.dumps(first)[:500]}")

    # 3. Process remaining pages
    for page in range(2, total_pages + 1):
        try:
            data = fetch_supremo_page(page)
            leads_list = data.get(leads_key, []) if leads_key else []
            process_leads_list(leads_list)
        except Exception as e:
            print(f"  [ERROR] Page {page}: {e}")
            stats["errors"] += 1

        if page % 20 == 0:
            print(
                f"  [PROGRESS] page {page}/{total_pages} | "
                f"updated={stats['updated']} "
                f"unchanged={stats['skipped_unchanged']} "
                f"protected={stats['skipped_protected']} "
                f"not_found={stats['not_found']} "
                f"errors={stats['errors']}"
            )

        time.sleep(RATE_LIMIT_SLEEP)

    # ─── FINAL REPORT ────────────────────────────────────────────────────────
    STAGE_NAMES = {
        "00000000-0000-0000-0001-000000000001": "AGUARDANDO ATENDIMENTO",
        "00000000-0000-0000-0001-000000000002": "1º CONTATO",
        "00000000-0000-0000-0001-000000000003": "AGENDAMENTO",
        "00000000-0000-0000-0001-000000000009": "ATENDIMENTO",
        "00000000-0000-0000-0001-000000000005": "VISITA",
        "9d3ddf3c-8049-4dd8-9e8b-81bba99ee529": "PROPOSTA",
        "00000000-0000-0000-0001-000000000007": "FECHAMENTO",
        "00000000-0000-0000-0001-000000000008": "PERDIDO",
        "00000000-0000-0000-0001-000000000010": "REPRESAMENTO",
        "95327bd7-3e88-4038-aa16-250a74ab085c": "NÃO QUALIFICADO",
        "dfc0f7d1-4484-4cc2-917c-4ac15a561e42": "IMPORTAR CRM",
        "62075f72-1629-4d8b-a019-0fcb35e3d302": "CORRETORES ANTIGOS",
        "dab590c7-ffc5-4086-be9a-4914f94fa3ba": "AÇÃO MUFFATO",
    }

    print("\n" + "=" * 60)
    print("SYNC COMPLETE")
    print("=" * 60)
    print(f"  Total pages fetched : {total_pages}")
    print(f"  Updated             : {stats['updated']}")
    print(f"  Skipped (unchanged) : {stats['skipped_unchanged']}")
    print(f"  Skipped (protected) : {stats['skipped_protected']}")
    print(f"  Not found           : {stats['not_found']}")
    print(f"  Errors              : {stats['errors']}")
    print()
    print("  Updates by stage:")
    for stage_id, count in sorted(stats["stage_counts"].items(), key=lambda x: -x[1]):
        name = STAGE_NAMES.get(stage_id, stage_id)
        print(f"    {name:<30} {count:>5}")
    print("=" * 60)


if __name__ == "__main__":
    main()
