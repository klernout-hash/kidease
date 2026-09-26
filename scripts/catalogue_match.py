"""Shared catalogue identity keys for the provincial importers.

Mirrors src/lib/catalog-match.ts. Licence keys drop a province prefix,
separators, and leading zeros. Names and streets are HTML-decoded first.
"""

from __future__ import annotations

import html
import re

PROVINCE_PREFIX = re.compile(r"^(?:AB|BC|MB|NB|NL|NS|NT|NU|ON|PEI|PE|QC|SK|YT)[-\s]*")
STREET_WORDS = (
    (re.compile(r"\b(?:street|str)\b"), "st"),
    (re.compile(r"\b(?:avenue|ave)\b"), "ave"),
    (re.compile(r"\b(?:road|rd)\b"), "rd"),
    (re.compile(r"\b(?:boulevard|blvd)\b"), "blvd"),
    (re.compile(r"\b(?:drive|dr)\b"), "dr"),
    (re.compile(r"\b(?:crescent|cres)\b"), "cres"),
    (re.compile(r"\b(?:court|crt)\b"), "ct"),
    (re.compile(r"\b(?:place|pl)\b"), "pl"),
    (re.compile(r"\b(?:lane|ln)\b"), "ln"),
    (re.compile(r"\b(?:terrace|terr)\b"), "ter"),
    (re.compile(r"\b(?:highway|hwy)\b"), "hwy"),
)


def decode_import_text(value: str | None) -> str:
    text = value or ""
    if "&" not in text:
        return re.sub(r"\s+", " ", text).strip()
    for _ in range(2):
        nxt = html.unescape(text)
        if nxt == text:
            break
        text = nxt
    return re.sub(r"\s+", " ", text).strip()


def catalogue_licence_key(value: str | None) -> str:
    raw = re.sub(r"\s+", "", decode_import_text(value).upper())
    if not raw:
        return ""
    raw = PROVINCE_PREFIX.sub("", raw)
    raw = re.sub(r"[^A-Z0-9]", "", raw)
    return raw.lstrip("0") or raw


def _fold_letters(value: str) -> str:
    text = decode_import_text(value).lower()
    text = text.replace("é", "e").replace("è", "e").replace("ê", "e").replace("ë", "e")
    text = text.replace("à", "a").replace("â", "a").replace("î", "i").replace("ï", "i")
    text = text.replace("ô", "o").replace("ù", "u").replace("û", "u").replace("ç", "c")
    return text


def catalogue_name_key(value: str | None) -> str:
    text = _fold_letters(value or "")
    text = re.sub(r"\b(?:saint|sainte|ste|st)\b", "st", text)
    text = text.replace("&", " and ")
    text = re.sub(r"\b(?:inc|ltd|limited|corp|corporation|incorporated)\b", " ", text)
    text = re.sub(r"\bday\s*care\b", "daycare", text)
    text = re.sub(r"\bchild\s*care\b", "childcare", text)
    return re.sub(r"[^a-z0-9]+", "", text)


def catalogue_address_key(value: str | None) -> str:
    text = _fold_letters(value or "").replace(".", " ").replace("&", " and ")
    text = re.sub(r"\b(?:saint|sainte|ste)\b", "st", text)
    for pattern, token in STREET_WORDS:
        text = pattern.sub(token, text)
    return re.sub(r"[^a-z0-9]+", "", text)


def catalogue_postal_key(value: str | None) -> str:
    return re.sub(r"[^A-Z0-9]", "", decode_import_text(value).upper())


def row_match_keys(row: dict) -> list[str]:
    province = str(row.get("province") or "").strip().upper()
    name = catalogue_name_key(row.get("name") or "")
    address = catalogue_address_key(row.get("address") or "")
    postal = catalogue_postal_key(row.get("postalCode") or row.get("postal_code") or "")
    city = re.sub(r"[^a-z0-9]+", "", _fold_letters(str(row.get("city") or "")))
    licence = catalogue_licence_key(row.get("licenseNumber") or row.get("license_no") or "")
    keys: list[str] = []
    if licence:
        keys.append(f"lic|{province}|{licence}")
    if name and address:
        keys.append(f"na|{province}|{name}|{address}")
    if name and postal:
        keys.append(f"np|{postal}|{name}")
    if name and city:
        keys.append(f"nc|{province}|{city}|{name}")
    return keys


def dedupe_rows(rows: list[dict]) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for row in rows:
        keys = row_match_keys(row)
        if keys and any(key in seen for key in keys):
            continue
        try:
            lat = float(row.get("lat"))
            lng = float(row.get("lng"))
        except (TypeError, ValueError):
            continue
        if not (-90 < lat < 90 and -180 < lng < 180):
            continue
        for key in keys:
            seen.add(key)
        out.append(row)
    return out


def self_test() -> None:
    rows = [
        {
            "id": "mb-1276",
            "name": "Casa Montessori &amp; Orff School Fennel",
            "address": "80 Fennel Street",
            "city": "Winnipeg",
            "province": "MB",
            "postalCode": "R3T 3M4",
            "licenseNumber": "MB-1276",
            "lat": 49.8,
            "lng": -97.2,
        },
        {
            "id": "mx-casa",
            "name": "Casa Montessori & Orff School Fennel",
            "address": "80 Fennel Street",
            "city": "Winnipeg",
            "province": "MB",
            "postalCode": "R3P 2L7",
            "licenseNumber": "1276",
            "lat": 49.8,
            "lng": -97.2,
        },
        {
            "id": "on-tor-3712",
            "name": "Allenby Day Care",
            "address": "391 St Clements Ave",
            "city": "Toronto",
            "province": "ON",
            "postalCode": "M5N 1M2",
            "licenseNumber": "3712",
            "lat": 43.7,
            "lng": -79.4,
        },
        {
            "id": "on-08456",
            "name": "Allenby Daycare Inc.",
            "address": "391 St.Clements Avenue",
            "city": "Scarborough",
            "province": "ON",
            "postalCode": "M5N 1M2",
            "licenseNumber": "08456",
            "lat": 43.7,
            "lng": -79.4,
        },
    ]
    kept = [row["id"] for row in dedupe_rows(rows)]
    if kept != ["mb-1276", "on-tor-3712"]:
        raise SystemExit(f"dedupe self-test failed: {kept}")
    if catalogue_licence_key("MB-01276") != "1276":
        raise SystemExit("licence key failed")
    print("ok")


if __name__ == "__main__":
    self_test()
