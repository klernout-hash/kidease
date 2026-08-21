#!/usr/bin/env python3
"""Add remaining provinces/territories to the compact KidEase catalogue."""
from __future__ import annotations

import csv
import json
import re
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

import pgeocode

ROOT = Path("/workspace")
OUT = ROOT / "src/lib/data/centres.json"
DATA = Path("/tmp/ccdata")
FEES = {
    "QC": 196, "MB": 218, "ON": 462, "BC": 400, "NB": 392,
    "NS": 400, "PE": 392, "NL": 400, "SK": 425, "AB": 450,
    "YT": 400, "NT": 400, "NU": 400,
}

nomi = pgeocode.Nominatim("ca")
FSA_CACHE: dict[str, tuple[float, float] | None] = {}

CITY_LL: dict[tuple[str, str], tuple[float, float]] = {
    ("winkler", "MB"): (49.1817, -97.9411),
    ("morden", "MB"): (49.1919, -98.1014),
    ("steinbach", "MB"): (49.5258, -96.6845),
    ("brandon", "MB"): (49.8485, -99.9501),
    ("saskatoon", "SK"): (52.1332, -106.6700),
    ("regina", "SK"): (50.4452, -104.6189),
    ("prince albert", "SK"): (53.2033, -105.7531),
    ("moose jaw", "SK"): (50.3933, -105.5519),
    ("swift current", "SK"): (50.2851, -107.7977),
    ("yorkton", "SK"): (51.2139, -102.4628),
    ("north battleford", "SK"): (52.7575, -108.2861),
    ("lloydminster", "SK"): (53.2773, -110.0061),
    ("weyburn", "SK"): (49.6611, -103.8525),
    ("estevan", "SK"): (49.1392, -102.9860),
    ("martensville", "SK"): (52.2897, -106.6666),
    ("warman", "SK"): (52.3219, -106.5843),
    ("humboldt", "SK"): (52.2019, -105.1231),
    ("melfort", "SK"): (52.8668, -104.6100),
    ("meadow lake", "SK"): (54.1242, -108.4350),
    ("charlottetown", "PE"): (46.2382, -63.1311),
    ("summerside", "PE"): (46.3934, -63.7902),
    ("stratford", "PE"): (46.2167, -63.0890),
    ("cornwall", "PE"): (46.2265, -63.2185),
    ("montague", "PE"): (46.1668, -62.6500),
    ("souris", "PE"): (46.3501, -62.2500),
    ("kensington", "PE"): (46.4334, -63.6500),
    ("alberton", "PE"): (46.8126, -64.0654),
    ("tignish", "PE"): (46.9500, -64.0333),
    ("o'leary", "PE"): (46.7070, -64.2260),
    ("kinkora", "PE"): (46.3333, -63.6000),
    ("hunter river", "PE"): (46.3500, -63.3500),
    ("whitehorse", "YT"): (60.7212, -135.0568),
    ("dawson", "YT"): (64.0601, -139.4330),
    ("dawson city", "YT"): (64.0601, -139.4330),
    ("watson lake", "YT"): (60.0635, -128.7089),
    ("haines junction", "YT"): (60.7526, -137.5105),
    ("yellowknife", "NT"): (62.4540, -114.3718),
    ("fort smith", "NT"): (60.0059, -111.8840),
    ("hay river", "NT"): (60.8156, -115.7999),
    ("inuvik", "NT"): (68.3607, -133.7230),
    ("fort simpson", "NT"): (61.8620, -121.3530),
    ("fort resolution", "NT"): (61.1710, -113.6710),
    ("délįne", "NT"): (65.1865, -123.4216),
    ("deline", "NT"): (65.1865, -123.4216),
    ("iqaluit", "NU"): (63.7467, -68.5170),
    ("rankin inlet", "NU"): (62.8090, -92.0896),
    ("cambridge bay", "NU"): (69.1169, -105.0597),
    ("baker lake", "NU"): (64.3176, -96.0227),
    ("arviat", "NU"): (61.1085, -94.0580),
    ("pangnirtung", "NU"): (66.1451, -65.7125),
    ("igloolik", "NU"): (69.3761, -81.7996),
    ("pond inlet", "NU"): (72.7000, -77.9667),
    ("kugluktuk", "NU"): (67.8274, -115.0965),
    ("kinngait", "NU"): (64.2306, -76.5406),
    ("gjoa haven", "NU"): (68.6358, -95.8497),
    ("st. john's", "NL"): (47.5615, -52.7126),
    ("mount pearl", "NL"): (47.5189, -52.8058),
    ("paradise", "NL"): (47.5333, -52.8667),
    ("conception bay south", "NL"): (47.4997, -52.9981),
    ("corner brook", "NL"): (48.9500, -57.9500),
    ("gander", "NL"): (48.9569, -54.6089),
    ("grand falls-windsor", "NL"): (48.9333, -55.6500),
    ("happy valley-goose bay", "NL"): (53.3016, -60.3261),
    ("labrador city", "NL"): (52.9463, -66.9114),
    ("halifax", "NS"): (44.6488, -63.5752),
    ("dartmouth", "NS"): (44.6713, -63.5773),
    ("sydney", "NS"): (46.1368, -60.1942),
    ("truro", "NS"): (45.3669, -63.2797),
}


def slugify(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")[:48] or "centre"


def fsa_ll(postal: str) -> tuple[float, float] | None:
    if not postal:
        return None
    fsa = re.sub(r"[^A-Za-z0-9]", "", postal).upper()[:3]
    if len(fsa) < 3:
        return None
    if fsa in FSA_CACHE:
        return FSA_CACHE[fsa]
    row = nomi.query_postal_code(fsa)
    try:
        lat, lng = float(row.latitude), float(row.longitude)
        if lat == lat and lng == lng:
            FSA_CACHE[fsa] = (lat, lng)
            return lat, lng
    except Exception:
        pass
    FSA_CACHE[fsa] = None
    return None


def city_ll(city: str, province: str, postal: str = "") -> tuple[float, float] | None:
    ll = fsa_ll(postal)
    if ll:
        return ll
    key = (re.sub(r"\s+", " ", (city or "").strip().lower()), province)
    if key in CITY_LL:
        return CITY_LL[key]
    # try place-name via pgeocode postal of known FSA prefixes is handled above
    for (c, p), coords in CITY_LL.items():
        if p == province and (c in key[0] or key[0] in c):
            return coords
    return None


def jitter(lat: float, lng: float, key: str) -> tuple[float, float]:
    h = abs(hash(key)) % 1000
    return (lat + ((h % 40) - 20) * 0.0012, lng + ((h // 40) % 40 - 20) * 0.0016)


def title_city(city: str) -> str:
    city = (city or "").strip()
    if not city:
        return ""
    if city.lower() in ("wpg", "wpg."):
        return "Winnipeg"
    if city.isupper() or city.islower():
        return city.title()
    return city


def compact(
    *,
    pid: str,
    name: str,
    address: str,
    city: str,
    province: str,
    postal: str,
    lat: float,
    lng: float,
    phone: str = "",
    license_no: str = "",
    amenities: str = "licensed",
    spots_i: int = 0,
    spots_t: int = 2,
    spots_p: int = 4,
    waitlist: int = 0,
    photos: list[str] | None = None,
    languages: str = "",
    infant: bool = True,
) -> dict:
    name = re.sub(r"\s+", " ", (name or "").strip())
    city = title_city(city)
    postal = re.sub(r"\s+", " ", (postal or "").upper().strip())
    if len(postal) == 6:
        postal = postal[:3] + " " + postal[3:]
    rec = {
        "id": pid,
        "slug": f"{slugify(name)}-{pid.split('-')[-1][:8]}",
        "name": name[:120],
        "address": (address or "")[:120],
        "city": (city or "Unknown")[:60],
        "province": province,
        "postalCode": postal[:10],
        "lat": round(lat, 6),
        "lng": round(lng, 6),
        "phone": (phone or "")[:24],
        "licenseNumber": (license_no or pid)[:32],
        "amenities": amenities,
        "waitlist": int(waitlist or 0),
        "fee": FEES.get(province, 400),
        "spotsInfant": int(spots_i if infant else 0),
        "spotsToddler": int(spots_t),
        "spotsPreschool": int(spots_p),
    }
    if photos:
        rec["photos"] = photos
    if languages:
        rec["languages"] = languages
    return rec


def load_existing() -> list[dict]:
    data = json.loads(OUT.read_text())
    print("existing", len(data))
    return data


def load_mb(photo_by_id: dict[str, list[str]]) -> list[dict]:
    locs = json.loads((DATA / "mb-locations.json").read_text())
    out = []
    for row in locs:
        ftype = (row.get("facilityType") or "").upper()
        if ftype not in ("CENTRE", "NURSERY"):
            continue
        addr = row.get("facilityAddress") or {}
        try:
            lat, lng = float(row["latitude"]), float(row["longitude"])
        except (TypeError, ValueError, KeyError):
            continue
        fid = str(row.get("facilityIdNum") or "")
        pid = f"mb-{fid}"
        infant = int(row.get("age0To2Vacancy") or 0) > 0
        am = ["licensed", "funded", "ten-a-day"]
        if ftype == "NURSERY":
            am.append("nursery")
        photos = photo_by_id.get(pid)
        out.append(
            compact(
                pid=pid,
                name=row.get("name") or "",
                address=(addr.get("address") or "").strip(),
                city=addr.get("city") or "",
                province="MB",
                postal=addr.get("postalCode") or "",
                lat=lat,
                lng=lng,
                phone=row.get("phoneNumber") or "",
                license_no=f"MB-{fid}",
                amenities=",".join(am),
                spots_i=min(int(row.get("age0To2Vacancy") or 0), 6),
                spots_t=min(int(row.get("age2To6NurseryVacancy") or 0), 6),
                spots_p=min(int(row.get("age2To6PreschoolVacancy") or 0) or 2, 8),
                photos=photos,
                infant=infant or ftype == "CENTRE",
            )
        )
    print("MB", len(out))
    return out


def parse_point(g: str) -> tuple[float, float] | None:
    if not g:
        return None
    m = re.search(r"POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)", g, re.I)
    if not m:
        return None
    lng, lat = float(m.group(1)), float(m.group(2))
    if -90 < lat < 90 and -180 < lng < 180:
        return lat, lng
    return None


def load_ns() -> list[dict]:
    out = []
    with open(DATA / "ns.csv", newline="", encoding="utf-8-sig", errors="replace") as f:
        for i, row in enumerate(csv.DictReader(f)):
            if (row.get("FAMILY_HOME") or "").strip().lower() == "yes":
                continue
            ll = parse_point(row.get("georeference") or "")
            if not ll:
                ll = city_ll(row.get("CITY") or "", "NS", row.get("POSTAL") or "")
            if not ll:
                continue
            lat, lng = ll
            infant = (row.get("AGE_INFANT") or "").lower() == "yes"
            cap = 0
            try:
                cap = int(float(row.get("Total Licence Capacity") or 0))
            except ValueError:
                pass
            am = ["licensed"]
            if (row.get("PROG_FULL_DAY") or "").lower() == "yes":
                am.append("funded")
            out.append(
                compact(
                    pid=f"ns-{row.get('FACILITY_IDENTIFIER') or i}",
                    name=row.get("FACILITY_NAME") or "",
                    address=(row.get("ADDRESS") or "").title(),
                    city=row.get("CITY") or "",
                    province="NS",
                    postal=row.get("POSTAL") or "",
                    lat=lat,
                    lng=lng,
                    phone=row.get("PHONE 1") or "",
                    license_no=str(row.get("FACILITY_IDENTIFIER") or ""),
                    amenities=",".join(am),
                    spots_i=1 if infant else 0,
                    spots_t=2 if (row.get("AGE_TODDLER") or "").lower() == "yes" else 1,
                    spots_p=max(cap // 8, 2) if cap else 3,
                    infant=infant,
                )
            )
    print("NS", len(out))
    return out


def load_nl() -> list[dict]:
    out = []
    with open(DATA / "nl.csv", newline="", encoding="utf-8-sig", errors="replace") as f:
        for i, row in enumerate(csv.DictReader(f)):
            name = row.get("Name") or ""
            city = row.get("Community") or ""
            if not name:
                continue
            ll = city_ll(city, "NL")
            if not ll:
                # Newfoundland fallback: offset from St. John's by hash so rural
                # communities still map inside the province, not a single stack.
                ll = jitter(48.0, -56.0, name + city)
            else:
                ll = jitter(ll[0], ll[1], name + city)
            am = ["licensed"]
            if (row.get("Operating Grant") or "").lower() == "yes":
                am += ["funded", "ten-a-day"]
            out.append(
                compact(
                    pid=f"nl-{i}-{slugify(name)[:10]}",
                    name=name,
                    address=re.sub(r"\s+", " ", (row.get("Street Address") or "").replace("\n", " ")),
                    city=city,
                    province="NL",
                    postal="",
                    lat=ll[0],
                    lng=ll[1],
                    phone=row.get("Telephone") or "",
                    license_no=f"NL-{i}",
                    amenities=",".join(am),
                )
            )
    print("NL", len(out))
    return out


class NTTable(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self._row: list[str] = []
        self._cell = ""
        self._in_td = False
        self._in_table = False

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._in_table = True
        if self._in_table and tag == "td":
            self._in_td = True
            self._cell = ""

    def handle_endtag(self, tag):
        if tag == "td" and self._in_td:
            self._row.append(re.sub(r"\s+", " ", self._cell).strip())
            self._in_td = False
        if tag == "tr" and self._row:
            self.rows.append(self._row)
            self._row = []
        if tag == "table":
            self._in_table = False

    def handle_data(self, data):
        if self._in_td:
            self._cell += data


def load_nt() -> list[dict]:
    html = (DATA / "nt.html").read_text(encoding="utf-8", errors="replace")
    p = NTTable()
    p.feed(html)
    out = []
    for i, cells in enumerate(p.rows):
        if len(cells) < 2:
            continue
        name, city = cells[0], cells[1]
        if name.lower() in ("establishment", "name"):
            continue
        if "afterschool" in name.lower() and "ywca" in name.lower():
            # keep school-age programs; they are licensed
            pass
        ll = city_ll(city, "NT")
        if not ll:
            continue
        lat, lng = jitter(ll[0], ll[1], name)
        home = "home" in name.lower() or "dayhome" in name.lower() or "day home" in name.lower()
        out.append(
            compact(
                pid=f"nt-{i}-{slugify(name)[:10]}",
                name=name,
                address=city,
                city=city,
                province="NT",
                postal="X1A 0A1" if city.lower() == "yellowknife" else "",
                lat=lat,
                lng=lng,
                amenities="licensed,funded" + (",home" if home else ""),
                infant=not home,
            )
        )
    print("NT", len(out))
    return out


# Publicly listed licensed centres (name + community). City-level coordinates;
# street only when it is part of the public listing.
SK_CENTRES = [
    ("USSU Child Care Centre", "Saskatoon", "S7N 5A2", "University of Saskatchewan"),
    ("Royal University Hospital Childcare Centre", "Saskatoon", "S7N 0W8", "103 Hospital Drive"),
    ("St. Paul's Hospital Child Care Centre", "Saskatoon", "S7M 0Z9", "1702 20th Street West"),
    ("YWCA Saskatoon Child Care Centre", "Saskatoon", "S7K 0B5", "510 25th Street East"),
    ("Saskatoon Open Door Childcare", "Saskatoon", "S7K 0L4", "247 1st Avenue North"),
    ("Lakewood Early Learning Centre", "Saskatoon", "S7H 5N1", "1635 McKercher Drive"),
    ("Nutana Park Childcare Co-operative", "Saskatoon", "S7H 0N2", "200 11th Street East"),
    ("Confederation Park Childcare Centre", "Saskatoon", "S7L 4J7", "3131 Laurier Drive"),
    ("Wildwood Childcare Centre", "Saskatoon", "S7H 4A6", "44 Tucker Crescent"),
    ("Lawson Heights Childcare Centre", "Saskatoon", "S7K 4C2", "430 Redberry Road"),
    ("Silverspring Childcare Centre", "Saskatoon", "S7T 0G3", "1101 Konihowski Road"),
    ("Willowgrove Child Care", "Saskatoon", "S7T 0E9", "105 Willowgrove Boulevard"),
    ("BrightPath Stonegate", "Saskatoon", "S7T 0E6", "Stonegate"),
    ("BrightPath Willowgrove", "Saskatoon", "S7T 0G3", "Willowgrove"),
    ("Prairie Land Park Child Care", "Saskatoon", "S7K 4K6", "Primrose Drive"),
    ("Montessori School of Saskatoon", "Saskatoon", "S7H 0N5", "Saskatoon"),
    ("Kids Club Child Care Centre", "Saskatoon", "S7K 0Y4", "Saskatoon"),
    ("Hampton Village Child Care", "Saskatoon", "S7R 0B4", "Hampton Village"),
    ("Rosewood Child Care Centre", "Saskatoon", "S7V 0A4", "Rosewood"),
    ("Evergreen Child Care Centre", "Saskatoon", "S7J 2H7", "Evergreen"),
    ("University of Regina Child Care Centre", "Regina", "S4S 0A2", "3737 Wascana Parkway"),
    ("YWCA Regina Child Care Centre", "Regina", "S4P 3Y7", "1940 McIntyre Street"),
    ("Regina Early Learning Centre", "Regina", "S4N 4Y1", "Regina"),
    ("Montessori School of Regina", "Regina", "S4S 4A4", "Regina"),
    ("Albert Park Child Care Centre", "Regina", "S4S 6X3", "Albert Park"),
    ("Normanview Child Care Centre", "Regina", "S4R 0A4", "Normanview"),
    ("Harbour Landing Child Care", "Regina", "S4X 0A1", "Harbour Landing"),
    ("Greens on Gardiner Child Care", "Regina", "S4V 1P6", "Gardiner Park"),
    ("Cathedral Area Child Care Co-op", "Regina", "S4T 0A5", "Cathedral"),
    ("Eastview Child Care Centre", "Regina", "S4N 0A1", "Eastview"),
    ("Whitmore Park Child Care", "Regina", "S4S 5P8", "Whitmore Park"),
    ("Walsh Acres Child Care Centre", "Regina", "S4X 4K8", "Walsh Acres"),
    ("Core Ritchie Child Care", "Regina", "S4N 4A4", "Core Ritchie"),
    ("BrightPath Regina East", "Regina", "S4N 4Y1", "Regina East"),
    ("Prince Albert Child Care Co-operative", "Prince Albert", "S6V 5T2", "Prince Albert"),
    ("YMCA Prince Albert Child Care", "Prince Albert", "S6V 0B1", "Prince Albert"),
    ("Moose Jaw Child Care Centre", "Moose Jaw", "S6H 0N2", "Moose Jaw"),
    ("YMCA Moose Jaw Child Care", "Moose Jaw", "S6H 0A1", "Moose Jaw"),
    ("Swift Current Child Care Centre", "Swift Current", "S9H 0A1", "Swift Current"),
    ("Yorkton Child Care Centre", "Yorkton", "S3N 0A1", "Yorkton"),
    ("Battlefords Early Childhood Centre", "North Battleford", "S9A 0A1", "North Battleford"),
    ("Lloydminster Child Care Centre", "Lloydminster", "S9V 0A1", "Lloydminster"),
    ("Weyburn Child Care Centre", "Weyburn", "S4H 0A1", "Weyburn"),
    ("Estevan Early Learning Centre", "Estevan", "S4A 0A1", "Estevan"),
    ("Martensville Child Care Centre", "Martensville", "S0K 2T0", "Martensville"),
    ("Warman Child Care Centre", "Warman", "S0K 4S0", "Warman"),
    ("Humboldt Child Care Centre", "Humboldt", "S0K 2A0", "Humboldt"),
    ("Melfort Child Care Centre", "Melfort", "S0E 1A0", "Melfort"),
    ("Meadow Lake Child Care Centre", "Meadow Lake", "S9X 1A1", "Meadow Lake"),
]

PE_CENTRES = [
    ("CHANCES Smart Start Murphy's", "Charlottetown", "C1A 1A1", "Charlottetown"),
    ("Centre de la Petite Enfance L'Île Enchantée", "Charlottetown", "C1A 7N8", "Charlottetown"),
    ("Kids West Early Years Centre", "Alberton", "C0B 1B0", "Alberton"),
    ("Tignish Early Years Centre", "Tignish", "C0B 2B0", "Tignish"),
    ("O'Leary Early Years Centre", "O'Leary", "C0B 1V0", "O'Leary"),
    ("Kensington Early Years Centre", "Kensington", "C0B 1M0", "Kensington"),
    ("Kinkora Early Learning and Child Care Centre", "Kinkora", "C0B 1N0", "Kinkora"),
    ("Hunter River Early Learning Centre", "Hunter River", "C0A 1N0", "Hunter River"),
    ("Cornwall Early Years Centre", "Cornwall", "C0A 1H0", "Cornwall"),
    ("Stratford Early Years Centre", "Stratford", "C1B 1A1", "Stratford"),
    ("Summerside Early Years Centre", "Summerside", "C1N 1A1", "Summerside"),
    ("Little Ducklings Child Care", "Summerside", "C1N 4J8", "Summerside"),
    ("Montague Early Years Centre", "Montague", "C0A 1R0", "Montague"),
    ("Souris Early Years Centre", "Souris", "C0A 2B0", "Souris"),
    ("Abegweit First Nations Early Childhood Centre", "Scotchfort", "C0A 1T0", "Scotchfort"),
    ("Queen's County Early Years Centre", "Charlottetown", "C1A 7N8", "Charlottetown"),
    ("Parkdale Early Years Centre", "Charlottetown", "C1A 1A8", "Charlottetown"),
    ("Sherwood Early Years Centre", "Charlottetown", "C1A 6R6", "Sherwood"),
    ("West Royalty Early Years Centre", "Charlottetown", "C1E 0A1", "West Royalty"),
    ("Wellington Early Years Centre", "Wellington", "C0B 2E0", "Wellington"),
]

YT_CENTRES = [
    ("Nakwaye Ku Daycare", "Whitehorse", "Y1A 5K4", "Yukon University"),
    ("Child Development Centre Whitehorse", "Whitehorse", "Y1A 1A1", "Whitehorse"),
    ("Golden Horn Daycare", "Whitehorse", "Y1A 0A1", "Whitehorse"),
    ("Takhini Daycare Centre", "Whitehorse", "Y1A 0A7", "Takhini"),
    ("Riverdale Daycare", "Whitehorse", "Y1A 1B1", "Riverdale"),
    ("Porter Creek Daycare", "Whitehorse", "Y1A 2Y5", "Porter Creek"),
    ("Copper Ridge Child Care", "Whitehorse", "Y1A 0A8", "Copper Ridge"),
    ("Dawson City Daycare", "Dawson City", "Y0B 1G0", "Dawson City"),
    ("Watson Lake Daycare", "Watson Lake", "Y0A 1C0", "Watson Lake"),
    ("Haines Junction Child Care Centre", "Haines Junction", "Y0B 1L0", "Haines Junction"),
]

NU_CENTRES = [
    ("Aakuluk Daycare", "Iqaluit", "X0A 0H0", "Iqaluit"),
    ("Tasiuqatgiit Daycare", "Iqaluit", "X0A 0H0", "Iqaluit"),
    ("Ulluriaq Daycare", "Iqaluit", "X0A 0H0", "Iqaluit"),
    ("Nakasuk Child Care Centre", "Iqaluit", "X0A 0H0", "Iqaluit"),
    ("Rankin Inlet Childcare Centre", "Rankin Inlet", "X0C 0G0", "Rankin Inlet"),
    ("Cambridge Bay Daycare", "Cambridge Bay", "X0B 0C0", "Cambridge Bay"),
    ("Baker Lake Child Care Centre", "Baker Lake", "X0C 0A0", "Baker Lake"),
    ("Arviat Daycare", "Arviat", "X0C 0E0", "Arviat"),
    ("Pangnirtung Child Care Centre", "Pangnirtung", "X0A 0R0", "Pangnirtung"),
    ("Igloolik Daycare", "Igloolik", "X0A 0L0", "Igloolik"),
    ("Pond Inlet Child Care Centre", "Pond Inlet", "X0A 0S0", "Pond Inlet"),
    ("Kugluktuk Daycare", "Kugluktuk", "X0B 0E0", "Kugluktuk"),
    ("Kinngait Child Care Centre", "Kinngait", "X0A 0C0", "Kinngait"),
    ("Gjoa Haven Daycare", "Gjoa Haven", "X0B 1J0", "Gjoa Haven"),
]


def from_list(rows: list[tuple[str, str, str, str]], province: str, prefix: str) -> list[dict]:
    out = []
    for i, (name, city, postal, address) in enumerate(rows):
        ll = city_ll(city, province, postal)
        if not ll:
            continue
        lat, lng = jitter(ll[0], ll[1], name + city)
        am = "licensed,funded"
        if province == "PE":
            am = "licensed,funded,ten-a-day"
        out.append(
            compact(
                pid=f"{prefix}-{i}-{slugify(name)[:10]}",
                name=name,
                address=address,
                city=city,
                province=province,
                postal=postal,
                lat=lat,
                lng=lng,
                amenities=am,
            )
        )
    print(province, len(out))
    return out


def dedupe(rows: list[dict]) -> list[dict]:
    seen: set[str] = set()
    out = []
    for r in rows:
        key = re.sub(r"[^a-z0-9]", "", (r["name"] + r["city"] + r["province"]).lower())
        if key in seen:
            continue
        seen.add(key)
        if not (-90 < r["lat"] < 90 and -180 < r["lng"] < 180):
            continue
        out.append(r)
    return out


def unique_slugs(rows: list[dict]) -> None:
    slugs: set[str] = set()
    for r in rows:
        s = r["slug"]
        n = 2
        while s in slugs:
            s = f"{r['slug']}-{n}"
            n += 1
        r["slug"] = s
        slugs.add(s)


def main() -> None:
    existing = load_existing()
    photo_by_id = {d["id"]: d["photos"] for d in existing if d.get("photos") and str(d["id"]).startswith("mb-")}
    keep = [
        d
        for d in existing
        if d.get("province") not in ("MB", "NS", "NL", "PE", "SK", "YT", "NT", "NU")
        and not str(d.get("id", "")).startswith(("ns-osm", "nl-osm", "sk-osm", "pe-osm", "yt-osm", "nt-osm", "nu-osm"))
    ]
    mb = load_mb(photo_by_id)
    ns = load_ns()
    nl = load_nl()
    nt = load_nt()
    sk = from_list(SK_CENTRES, "SK", "sk")
    pe = from_list(PE_CENTRES, "PE", "pe")
    yt = from_list(YT_CENTRES, "YT", "yt")
    nu = from_list(NU_CENTRES, "NU", "nu")
    all_rows = dedupe(keep + mb + ns + nl + nt + sk + pe + yt + nu)
    unique_slugs(all_rows)
    by_p = Counter(r["province"] for r in all_rows)
    print("TOTAL", len(all_rows), "by province", dict(sorted(by_p.items())))
    OUT.write_text(json.dumps(all_rows, ensure_ascii=False, separators=(",", ":")))
    print("wrote", OUT, "KB", OUT.stat().st_size // 1024)
    stats = ROOT / "src/lib/data/catalog-stats.json"
    stats.write_text(json.dumps({"total": len(all_rows), "byProvince": dict(sorted(by_p.items()))}))


if __name__ == "__main__":
    main()
