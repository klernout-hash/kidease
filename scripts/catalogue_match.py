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
    text = re.sub(r"\b(?:inc|ltd|limited|corp|corporation|incorporated|the)\b", " ", text)
    text = re.sub(r"\bday\s*care\b", "daycare", text)
    text = re.sub(r"\bchild\s*care\b", "childcare", text)
    return re.sub(r"[^a-z0-9]+", "", text)


def catalogue_address_key(value: str | None) -> str:
    text = _fold_letters(value or "").replace(".", " ").replace("&", " and ")
    text = re.sub(r"\b(?:saint|sainte|ste)\b", "st", text)
    for pattern, token in STREET_WORDS:
        text = pattern.sub(token, text)
    return re.sub(r"[^a-z0-9]+", "", text)


STREET_TYPE = {
    "street": "st",
    "str": "st",
    "st": "st",
    "avenue": "ave",
    "ave": "ave",
    "road": "rd",
    "rd": "rd",
    "boulevard": "blvd",
    "blvd": "blvd",
    "drive": "dr",
    "dr": "dr",
    "crescent": "cres",
    "cres": "cres",
    "court": "crt",
    "crt": "crt",
    "place": "pl",
    "pl": "pl",
    "lane": "ln",
    "ln": "ln",
    "terrace": "ter",
    "terr": "ter",
    "highway": "hwy",
    "hwy": "hwy",
    "pth": "hwy",
    "rue": "rue",
}
DIRECTION = {
    "north": "n",
    "south": "s",
    "east": "e",
    "west": "w",
    "northeast": "ne",
    "northwest": "nw",
    "southeast": "se",
    "southwest": "sw",
    "ne": "ne",
    "nw": "nw",
    "se": "se",
    "sw": "sw",
    "n": "n",
    "s": "s",
    "e": "e",
    "w": "w",
}


def catalogue_street_key(value: str | None) -> str:
    text = _fold_letters(value or "").replace(".", " ").replace("#", " ").replace("&", " and ")
    text = re.sub(r"\b(?:saint|sainte|ste)\b", "st", text)
    text = re.sub(r"^(?:mailing address|civic address|civic)\b", " ", text)
    tokens = [token for token in re.sub(r"[^a-z0-9]+", " ", text).split() if token]
    if not tokens:
        return ""
    num_index = -1
    fallback = -1
    for index, token in enumerate(tokens):
        nxt = tokens[index + 1] if index + 1 < len(tokens) else ""
        if not re.fullmatch(r"\d+[a-z]?", token) or not nxt:
            continue
        if fallback < 0:
            fallback = index
        if re.match(r"[a-z]", nxt):
            num_index = index
            break
    if num_index < 0:
        num_index = fallback
    if num_index < 0:
        if len(tokens) == 1 and re.fullmatch(r"\d+[a-z]?", tokens[0]):
            only = tokens[0].lstrip("0") or tokens[0]
            return f"civic|{only}"
        return ""
    number = tokens[num_index].lstrip("0") or tokens[num_index]
    after = tokens[num_index + 1 :]
    direction = ""
    if after and after[-1] in DIRECTION:
        direction = DIRECTION[after.pop()]
    street_type = ""
    if after and after[-1] in STREET_TYPE:
        street_type = STREET_TYPE[after.pop()]
    name = "".join(after) + direction
    if not name:
        return f"civic|{number}"
    if street_type:
        return f"{number}|{name}|{street_type}"
    return f"{number}|{name}"


def catalogue_postal_key(value: str | None) -> str:
    return re.sub(r"[^A-Z0-9]", "", decode_import_text(value).upper())


def catalogue_postal_area(value: str | None) -> str:
    postal = catalogue_postal_key(value)
    return postal[:3] if len(postal) >= 3 else ""


def catalogue_place_key(value: str | None) -> str:
    text = _fold_letters(value or "")
    text = re.sub(r"\b(?:saint|sainte|ste|st)\b", "st", text)
    return re.sub(r"[^a-z0-9]+", "", text)


def row_match_keys(row: dict) -> list[str]:
    province = str(row.get("province") or "").strip().upper()
    name = catalogue_name_key(row.get("name") or "")
    street = catalogue_street_key(row.get("address") or "")
    city = catalogue_place_key(row.get("city") or "")
    area = catalogue_postal_area(row.get("postalCode") or row.get("postal_code") or "")
    licence = catalogue_licence_key(row.get("licenseNumber") or row.get("license_no") or "")
    keys: list[str] = []
    if licence:
        keys.append(f"lic|{province}|{licence}")
    if name and street and city:
        keys.append(f"street|{province}|{name}|{street}|{city}")
    if name and street and area:
        keys.append(f"area|{province}|{name}|{street}|{area}")
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

    def shares(left: dict, right: dict) -> bool:
        return bool(set(row_match_keys(left)) & set(row_match_keys(right)))

    kids_bloor = {
        "name": "Kids & Company",
        "address": "160 Bloor St E",
        "city": "Toronto",
        "province": "ON",
        "postalCode": "M4W 1B9",
        "licenseNumber": "9815",
    }
    kids_front = {
        "name": "Kids & Company",
        "address": "320 Front St W",
        "city": "Toronto",
        "province": "ON",
        "postalCode": "M5V 3B6",
        "licenseNumber": "9847",
    }
    if shares(kids_bloor, kids_front):
        raise SystemExit("franchise name matched")
    angel_230 = {
        "name": "Angelgate Daycare Ltd.",
        "address": "230 Jane St",
        "city": "Toronto",
        "province": "ON",
        "postalCode": "M6S 3Z1",
        "licenseNumber": "13180",
    }
    angel_232 = {
        "name": "Angelgate Daycare Ltd.",
        "address": "232 Jane St",
        "city": "Toronto",
        "province": "ON",
        "postalCode": "M6S 3Z1",
        "licenseNumber": "13181",
    }
    if shares(angel_230, angel_232):
        raise SystemExit("adjacent street numbers matched")
    avenue_rd = {
        "name": "Unicorn Day Care Centre",
        "address": "240 Avenue Rd",
        "city": "Toronto",
        "province": "ON",
        "postalCode": "M5R 2J4",
        "licenseNumber": "13257",
    }
    avenue_road = {
        "name": "Unicorn Day Care Centre Inc.",
        "address": "240 Avenue Road",
        "city": "Toronto",
        "province": "ON",
        "postalCode": "M5R 2J6",
        "licenseNumber": "56174",
    }
    if not shares(avenue_rd, avenue_road):
        raise SystemExit("Avenue Rd did not match Avenue Road")
    civic = {
        "name": "Springfield Learning Centres Incorporated",
        "address": "Civic #35117",
        "city": "Anola",
        "province": "MB",
        "postalCode": "R0E 0K0",
        "licenseNumber": "102535",
    }
    highway = {
        "name": "Springfield Learning Centres",
        "address": "35117 PTH 15 Rd 60N",
        "city": "Anola",
        "province": "MB",
        "postalCode": "R0E 0A0",
        "licenseNumber": "MB-102535",
    }
    if not shares(civic, highway):
        raise SystemExit("same licence did not match civic and highway addresses")
    print("ok")


if __name__ == "__main__":
    self_test()
