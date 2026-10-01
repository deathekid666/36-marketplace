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
import phonenumbers

API_URL = "https://36-marketplace.vercel.app/api/internal/discovery/global-contacts"
CONSOLIDATE_URL = "https://36-marketplace.vercel.app/api/internal/discovery/consolidate"
AUDIENCE = "36-marketplace-global-contacts"
MAX_RECORDS = max(0, int(os.environ.get("MAX_RECORDS", "0") or "0"))
BATCH_SIZE = 12

def normalize_public_phone(raw_phone, country_code):
    raw = str(raw_phone or "").strip()
    region = str(country_code or "").strip().upper()

    if not raw or len(region) != 2:
        return None

    try:
        parsed = phonenumbers.parse(raw, region)
    except phonenumbers.NumberParseException:
        return None

    if not phonenumbers.is_possible_number(parsed):
        return None

    # Overture is public business data, but only retain a phone when
    # libphonenumber can map it to a valid international number.
    if not phonenumbers.is_valid_number(parsed):
        return None

    return phonenumbers.format_number(
        parsed,
        phonenumbers.PhoneNumberFormat.E164,
    )



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


def post_json(url, payload, timeout=75):
    body = json.dumps(payload, separators=(",", ":")).encode()
    last_error = None

    for attempt in range(5):
        request = urllib.request.Request(
            url,
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
            with urllib.request.urlopen(request, timeout=timeout) as response:
                result = json.load(response)
            if result.get("ok"):
                return result
            raise RuntimeError(str(result))
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")
            last_error = RuntimeError(f"HTTP {error.code}: {detail}")
            if error.code < 500 and error.code != 429:
                raise last_error
        except Exception as error:
            last_error = error

        time.sleep(min(20, 2 ** (attempt + 1)))

    raise RuntimeError(f"Request failed: {last_error}")


def post_batch(release, records):
    return post_json(API_URL, {"release": release, "records": records})


def consolidate_duplicates():
    total_merged = 0

    for round_index in range(12):
        result = post_json(CONSOLIDATE_URL, {"maxMerges": 20}, timeout=75)
        merged = int(result.get("merged") or 0)
        total_merged += merged
        print(
            json.dumps(
                {
                    "consolidationRound": round_index + 1,
                    "scanned": int(result.get("scanned") or 0),
                    "proposals": int(result.get("proposals") or 0),
                    "merged": merged,
                    "totalMerged": total_merged,
                }
            )
        )
        if merged == 0:
            break

    return total_merged


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
      'recording_studio|podcast_studio|photo_studio|photography_studio|music_studio|audio_studio|sound_studio|video_studio|film_studio|rehearsal_studio|voice_over_studio'
    )
    OR regexp_matches(
      lower(names.primary),
      'studio|studios|estudio|estudios|estúdio|estúdios|recording|rehearsal|podcast|mixing|mastering|voice[ _-]?over|grabaci[oó]n|enregistrement|tonstudio|fotostudio|aufnahmestudio|استوديو|تسجيل|студия|звукозапис|スタジオ|レコーディング|스튜디오|녹음|录音棚|录音室|錄音室|摄影棚|攝影棚'
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
country_selected = {}
phone_rejected = 0


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
        raw_phone = str(data["phone"] or "").strip()
        country = str(data["country"] or "").strip().upper()

        if len(country) != 2:
            continue

        phone = normalize_public_phone(raw_phone, country)
        if not phone:
            phone_rejected += 1
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
        country_selected[country] = country_selected.get(country, 0) + 1

        if len(batch) >= BATCH_SIZE:
            flush()

        if MAX_RECORDS and selected >= MAX_RECORDS:
            stop = True
            break

flush()
print(
    json.dumps(
        {
            "release": release,
            "selected": selected,
            "phoneRejected": phone_rejected,
            "countries": dict(
                sorted(
                    country_selected.items(),
                    key=lambda item: (-item[1], item[0]),
                )
            ),
            "totals": totals,
        },
        indent=2,
    )
)

merged_duplicates = consolidate_duplicates()
print(json.dumps({"duplicateConsolidationMerged": merged_duplicates}))
