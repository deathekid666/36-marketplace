"""Import structured public business phone contacts for creative studios from Overture Places.

This job does not scrape people or arbitrary websites. It only reads Overture business/place
records that already expose a public international phone number, and sends contact-only
studio records to the 36 discovery pipeline. No imported record is made bookable.
"""

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

import duckdb

API_URL = "https://36-marketplace.vercel.app/api/internal/discovery/global-contacts"
AUDIENCE = "36-marketplace-global-contacts"
MAX_RECORDS = max(0, int(os.environ.get("MAX_RECORDS", "0") or "0"))
BATCH_SIZE = 12


def latest_release():
    with urllib.request.urlopen("https://stac.overturemaps.org/catalog.json", timeout=30) as response:
        payload = json.load(response)
    value = str(payload.get("latest") or "").strip().strip("/")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}\.\d+", value):
        raise RuntimeError("Unexpected Overture release")
    return value


_oidc = {"token": None, "expires": 0.0}


def oidc_token():
    now = time.time()
    if _oidc["token"] and now < _oidc["expires"]:
        return _oidc["token"]

    base = os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"]
    separator = "&" if "?" in base else "?"
    url = base + separator + urllib.parse.urlencode({"audience": AUDIENCE})
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": "bearer " + os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"],
            "Accept": "application/json; api-version=2.0",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)

    token = payload.get("value")
    if not isinstance(token, str) or not token:
        raise RuntimeError("OIDC token unavailable")

    _oidc["token"] = token
    _oidc["expires"] = now + 240
    return token


def post_batch(release, records):
    body = json.dumps({"release": release, "records": records}, separators=(",", ":")).encode()
    last_error = None

    for attempt in range(5):
        request = urllib.request.Request(
            API_URL,
            method="POST",
            data=body,
            headers={
                "Authorization": "Bearer " + oidc_token(),
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "36-marketplace-business-contact-import/1.0",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=75) as response:
                payload = json.load(response)
            if payload.get("ok"):
                return payload
            raise RuntimeError(str(payload))
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")
            last_error = RuntimeError(f"HTTP {error.code}: {detail}")
            if error.code < 500 and error.code != 429:
                raise last_error
        except Exception as error:
            last_error = error

        time.sleep(min(20, 2 ** (attempt + 1)))

    raise RuntimeError(f"Batch failed: {last_error}")


release = latest_release()
path = f"s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*"

db = duckdb.connect(database=":memory:")
db.execute("INSTALL httpfs")
db.execute("LOAD httpfs")
db.execute("SET s3_region='us-west-2'")

query = f"""
SELECT
  id,
  names.primary AS name,
  taxonomy.primary AS taxonomy_primary,
  taxonomy.hierarchy AS taxonomy_hierarchy,
  taxonomy.alternates AS taxonomy_alternates,
  basic_category,
  confidence,
  phones[1] AS phone,
  websites[1] AS website,
  addresses[1].freeform AS address,
  addresses[1].locality AS city,
  addresses[1].postcode AS postcode,
  addresses[1].region AS region,
  addresses[1].country AS country,
  bbox.xmin AS longitude,
  bbox.ymin AS latitude
FROM read_parquet('{path}', filename=true, hive_partitioning=1)
WHERE
  names.primary IS NOT NULL
  AND phones IS NOT NULL
  AND len(phones) > 0
  AND addresses IS NOT NULL
  AND len(addresses) > 0
  AND addresses[1].country IS NOT NULL
  AND bbox.xmin IS NOT NULL
  AND bbox.ymin IS NOT NULL
  AND (operating_status IS NULL OR CAST(operating_status AS VARCHAR) = 'open')
  AND (
    regexp_matches(
      lower(coalesce(taxonomy.primary, '')),
      'recording|podcast|photograph|music_production|video_production|film_production|media_production|rehearsal|post_production|voice_over'
    )
    OR (
      regexp_matches(
        lower(names.primary),
        'recording studio|music studio|audio studio|sound studio|podcast studio|photo studio|photography studio|video studio|film studio|production studio|rehearsal studio|estudio de grabaci|studio enregistrement|استوديو تسجيل|студия звукозаписи|レコーディングスタジオ|녹음 스튜디오'
      )
    )
  )
"""

cursor = db.execute(query)
columns = [
    "id", "name", "taxonomy_primary", "taxonomy_hierarchy",
    "taxonomy_alternates", "basic_category", "confidence", "phone",
    "website", "address", "city", "postcode", "region", "country",
    "longitude", "latitude",
]

batch = []
selected = 0
totals = {"accepted": 0, "enriched": 0, "review": 0, "matched": 0, "refreshed": 0}


def flush():
    global batch
    if not batch:
        return
    response = post_batch(release, batch)
    stats = response.get("stats") or {}
    for key in totals:
        totals[key] += int(stats.get(key) or 0)
    print(json.dumps({"selected": selected, **totals}))
    batch = []


stop = False
while not stop:
    rows = cursor.fetchmany(250)
    if not rows:
        break

    for row in rows:
        data = dict(zip(columns, row))
        phone = str(data["phone"] or "").strip()
        country = str(data["country"] or "").strip().upper()

        if not phone.startswith("+") or len(country) != 2:
            continue

        hierarchy = [str(x) for x in (data["taxonomy_hierarchy"] or []) if x]
        alternates = [str(x) for x in (data["taxonomy_alternates"] or []) if x]

        batch.append(
            {
                "id": str(data["id"]),
                "name": str(data["name"]),
                "taxonomy": {
                    "primary": data["taxonomy_primary"],
                    "hierarchy": hierarchy,
                    "alternates": alternates,
                },
                "basicCategory": data["basic_category"],
                "confidence": data["confidence"],
                "longitude": data["longitude"],
                "latitude": data["latitude"],
                "address": {
                    "freeform": data["address"],
                    "locality": data["city"],
                    "postcode": data["postcode"],
                    "region": data["region"],
                    "country": country,
                },
                "phones": [phone],
                "websites": [str(data["website"])] if data["website"] else [],
                "socials": [],
                "emails": [],
                "sources": [],
            }
        )
        selected += 1

        if len(batch) >= BATCH_SIZE:
            flush()

        if MAX_RECORDS and selected >= MAX_RECORDS:
            stop = True
            break

flush()
print(json.dumps({"release": release, "selected": selected, "totals": totals}, indent=2))
