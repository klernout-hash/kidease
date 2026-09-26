"""Shared catalogue identity keys for the provincial importers.

Mirrors src/lib/catalog-match.ts. Licence keys drop a province prefix,
separators, and leading zeros. Names and streets are HTML-decoded first.
"""

from __future__ import annotations

import html
import re
from collections import defaultdict

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
        return ""
    # "Room 1 and gym" has a number, but it is a room, not a street.
    if not street_type and ROOM_ADDRESS.search(_fold_letters(value or "")):
        return ""
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


PLACEHOLDER_POSTAL = "R3K0Z8"
ROOM_ADDRESS = re.compile(
    r"\b(?:rooms?|rm|gymnasium|gym|floors?|lower\s+level|kindergarten|nursery|preschool|infant\s+cent(?:re|er))\b"
)
VENUE_ADDRESS = re.compile(
    r"\b(?:school|elementary|elementry|church|community\s+cent(?:re|er)|rec(?:reation)?\s+cent(?:re|er))\b"
)


def _province(row: dict) -> str:
    return str(row.get("province") or "").strip().upper()


def _postal(row: dict) -> str:
    return catalogue_postal_key(row.get("postalCode") or row.get("postal_code") or "")


def _licence(row: dict) -> str:
    return catalogue_licence_key(row.get("licenseNumber") or row.get("license_no") or "")


def catalogue_civic_number(value: str | None) -> str:
    text = _fold_letters(value or "").replace(".", " ").replace("#", " ")
    labeled = re.search(r"\bcivic(?:\s+address)?\s+(\d+[a-z]?)\b", text)
    if not labeled:
        return ""
    return labeled.group(1).lstrip("0") or labeled.group(1)


def catalogue_street_number(value: str | None) -> str:
    key = catalogue_street_key(value)
    return key.split("|", 1)[0] if key else ""


def is_room_description(value: str | None) -> bool:
    text = _fold_letters(value or "")
    return bool(text) and bool(ROOM_ADDRESS.search(text))


def is_named_venue(value: str | None) -> bool:
    text = _fold_letters(value or "")
    if not text or catalogue_street_key(value):
        return False
    if VENUE_ADDRESS.search(text):
        return True
    return bool(re.search(r"\bcent(?:re|er)\b", text)) and not ROOM_ADDRESS.search(text)


def is_placeholder_postal(value: str | None) -> bool:
    return catalogue_postal_key(value) == PLACEHOLDER_POSTAL


def is_city_abbreviation(value: str | None) -> bool:
    return catalogue_place_key(value) == "wpg"


def similar_catalogue_name(left: str | None, right: str | None) -> bool:
    a = catalogue_name_key(left or "")
    b = catalogue_name_key(right or "")
    if not a or not b:
        return False
    if a == b:
        return True
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    return len(shorter) >= 15 and shorter in longer


def _postal_differs(left: dict, right: dict) -> bool:
    a = _postal(left)
    b = _postal(right)
    return bool(a and b and a != b)


def _absorbable(other: dict, street_row: dict) -> bool:
    if catalogue_street_key(other.get("address") or ""):
        return False
    if not similar_catalogue_name(other.get("name"), street_row.get("name")):
        return False
    if (
        is_named_venue(other.get("address"))
        and _postal_differs(other, street_row)
        and not is_placeholder_postal(other.get("postalCode") or other.get("postal_code"))
        and not is_city_abbreviation(other.get("city"))
    ):
        return False
    address = decode_import_text(other.get("address") or "").strip()
    if not address:
        return True
    if is_room_description(address):
        return True
    civic = catalogue_civic_number(address)
    if civic and civic == catalogue_street_number(street_row.get("address") or ""):
        return True
    if is_placeholder_postal(other.get("postalCode") or other.get("postal_code")) or is_city_abbreviation(other.get("city")):
        return True
    if is_named_venue(address) and not _postal_differs(other, street_row):
        return True
    return False


def same_catalogue_centre(left: dict, right: dict) -> bool:
    if not _province(left) or _province(left) != _province(right):
        return False
    street_a = catalogue_street_key(left.get("address") or "")
    street_b = catalogue_street_key(right.get("address") or "")
    if street_a and street_b and street_a == street_b and (
        similar_catalogue_name(left.get("name"), right.get("name")) or (_licence(left) and _licence(left) == _licence(right))
    ):
        return True
    licence_a = _licence(left)
    licence_b = _licence(right)
    if not licence_a or licence_a != licence_b:
        return False
    if not street_a and not street_b and similar_catalogue_name(left.get("name"), right.get("name")):
        return True
    if bool(street_a) == bool(street_b):
        return False
    street_row, other = (left, right) if street_a else (right, left)
    return _absorbable(other, street_row)


def row_match_keys(row: dict) -> list[str]:
    """Street identity only. A licence is not a key."""
    name = catalogue_name_key(row.get("name") or "")
    street = catalogue_street_key(row.get("address") or "")
    if name and street:
        return [f"street|{_province(row)}|{name}|{street}"]
    return []


def catalogue_candidate_keys(row: dict) -> list[str]:
    province = _province(row)
    keys: list[str] = []
    street = catalogue_street_key(row.get("address") or "")
    if street:
        keys.append(f"street|{province}|{street}")
    licence = _licence(row)
    if licence:
        keys.append(f"pool|{province}|{licence}")
    return keys


def dedupe_rows(rows: list[dict]) -> list[dict]:
    buckets: dict[str, list[dict]] = defaultdict(list)
    out: list[dict] = []
    for row in rows:
        seen: set[int] = set()
        matched = False
        for key in catalogue_candidate_keys(row):
            for prev in buckets[key]:
                marker = id(prev)
                if marker in seen:
                    continue
                seen.add(marker)
                if same_catalogue_centre(row, prev):
                    matched = True
                    break
            if matched:
                break
        if matched:
            continue
        try:
            lat = float(row.get("lat"))
            lng = float(row.get("lng"))
        except (TypeError, ValueError):
            continue
        if not (-90 < lat < 90 and -180 < lng < 180):
            continue
        out.append(row)
        for key in catalogue_candidate_keys(row):
            buckets[key].append(row)
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
        return same_catalogue_centre(left, right)

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
        raise SystemExit("civic number did not match the highway address")
    if shares(civic, {**highway, "licenseNumber": "9999"}):
        raise SystemExit("civic number matched a different licence")
    prairie_hoka = {
        "name": "Prairie Nature Children's Centre",
        "address": "600 Hoka Street",
        "city": "Winnipeg",
        "province": "MB",
        "postalCode": "R2C 2V1",
        "licenseNumber": "MB-7858",
    }
    prairie_sanford = {
        "name": "Prairie Nature Children's Centre Inc.",
        "address": "115 Sanford Fleming Road",
        "city": "Winnipeg",
        "province": "MB",
        "postalCode": "R2C 2V1",
        "licenseNumber": "7858",
    }
    if shares(prairie_hoka, prairie_sanford):
        raise SystemExit("two real streets matched on licence")
    adolphe_seine = {
        "name": "St. Adolphe Child Care Centre Inc.",
        "address": "444 La Seine Street",
        "city": "St. Adolphe",
        "province": "MB",
        "postalCode": "R5A 1C2",
        "licenseNumber": "MB-100758",
    }
    adolphe_main = {
        "name": "St. Adolphe Child Care Centre",
        "address": "372 Main Street",
        "city": "St. Adolphe",
        "province": "MB",
        "postalCode": "R5A 1A9",
        "licenseNumber": "100758",
    }
    if shares(adolphe_seine, adolphe_main):
        raise SystemExit("St. Adolphe streets matched")
    kidfit_street = {
        "name": "KidFit 60",
        "address": "1295 Salter Street",
        "city": "Winnipeg",
        "province": "MB",
        "postalCode": "R2V 3T2",
        "licenseNumber": "MB-102743",
    }
    kidfit_venue = {
        "name": "KidFit 60 Inc.",
        "address": "Vince Leah Community Centre",
        "city": "Winnipeg",
        "province": "MB",
        "postalCode": "R2V 0R4",
        "licenseNumber": "102743",
    }
    if shares(kidfit_street, kidfit_venue):
        raise SystemExit("KidFit venue matched")
    frontenac_street = {
        "name": "Frontenac Before and After School Program",
        "address": "866 Autumnwood Drive",
        "city": "Winnipeg",
        "province": "MB",
        "postalCode": "R2J 1C1",
        "licenseNumber": "MB-100238",
    }
    frontenac_room = {
        "name": "Frontenac Before and After School Program",
        "address": "Room 1 and gym",
        "city": "Wpg.",
        "province": "MB",
        "postalCode": "R3K 0Z8",
        "licenseNumber": "100238",
    }
    if not shares(frontenac_street, frontenac_room):
        raise SystemExit("Frontenac room did not match the street")
    rainbow_units = {
        "name": "Rainbow Day Nursery Inc. (Phase 1)",
        "address": "10/11/12 20 Island Shore Blvd.",
        "city": "Wpg",
        "province": "MB",
        "postalCode": "R2J 3Z7",
        "licenseNumber": "1140",
    }
    rainbow_street = {
        "name": "Rainbow Day Nursery Inc. (Phase 1)",
        "address": "20 Island Shore Blvd.",
        "city": "Winnipeg",
        "province": "MB",
        "postalCode": "R3X 1N6",
        "licenseNumber": "MB-1140",
    }
    if catalogue_street_key(rainbow_units["address"]) != catalogue_street_key(rainbow_street["address"]):
        raise SystemExit("unit prefix was not stripped")
    if not shares(rainbow_units, rainbow_street):
        raise SystemExit("Rainbow Day Nursery did not match")
    print("ok")


if __name__ == "__main__":
    self_test()
