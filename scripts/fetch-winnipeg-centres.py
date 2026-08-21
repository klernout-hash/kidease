#!/usr/bin/env python3
"""Build Winnipeg centre catalog + Google aerial building photos + site logos."""

from __future__ import annotations

import json
import math
import os
import re
import ssl
import time
import html as htmlmod
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageEnhance

ROOT = Path("/workspace")
OUT_PHOTOS = ROOT / "public" / "photos" / "wpg"
OUT_DATA = ROOT / "src" / "lib" / "data"
TILE_CACHE = Path("/tmp/gtiles")
RAW = Path("/tmp/wpg_centres.json")
LOCS = Path("/tmp/wpg_locations.json")

UA = "DaycareNearMe/1.0 (Winnipeg licensed-centre catalog; +https://grok.com)"
CTX = ssl.create_default_context()

WPG_LAT = (49.75, 50.03)
WPG_LNG = (-97.42, -96.94)

FUNDED_FEE = 218  # Manitoba $10-a-day ≈ 21.8 days
UNFUNDED = {"infant": 980, "toddler": 870, "preschool": 760, "part": 490}


def get(url: str, timeout: float = 12, headers: dict | None = None) -> bytes | None:
    h = {"User-Agent": UA, "Accept": "*/*"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
            return r.read()
    except Exception:
        return None


def deg2num(lat: float, lon: float, zoom: int) -> tuple[float, float]:
    lat_rad = math.radians(lat)
    n = 2.0**zoom
    x = (lon + 180.0) / 360.0 * n
    y = (1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n
    return x, y


def fetch_tile(z: int, x: int, y: int) -> Image.Image | None:
    TILE_CACHE.mkdir(parents=True, exist_ok=True)
    key = TILE_CACHE / f"{z}-{x}-{y}.jpg"
    if key.exists() and key.stat().st_size > 800:
        try:
            return Image.open(key).convert("RGB")
        except Exception:
            pass
    server = (x + y) % 4
    url = f"https://mt{server}.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}"
    data = get(url, timeout=10, headers={"Referer": "https://maps.google.com/"})
    if not data or len(data) < 800:
        return None
    key.write_bytes(data)
    try:
        return Image.open(BytesIO(data)).convert("RGB")
    except Exception:
        return None


def aerial_photo(lat: float, lon: float, out: Path, zoom: int = 19) -> bool:
    if out.exists() and out.stat().st_size > 4000:
        return True
    fx, fy = deg2num(lat, lon, zoom)
    cx, cy = int(math.floor(fx)), int(math.floor(fy))
    tiles: dict[tuple[int, int], Image.Image] = {}
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            im = fetch_tile(zoom, cx + dx, cy + dy)
            if im is None:
                return False
            tiles[(dx, dy)] = im
    tw, th = 256, 256
    mosaic = Image.new("RGB", (tw * 3, th * 3))
    for (dx, dy), im in tiles.items():
        mosaic.paste(im, ((dx + 1) * tw, (dy + 1) * th))
    px = (fx - (cx - 1)) * tw
    py = (fy - (cy - 1)) * th
    w, h = 720, 540
    left = int(px - w / 2)
    top = int(py - h / 2)
    left = max(0, min(left, mosaic.size[0] - w))
    top = max(0, min(top, mosaic.size[1] - h))
    crop = mosaic.crop((left, top, left + w, top + h))
    crop = ImageEnhance.Contrast(crop).enhance(1.08)
    crop = ImageEnhance.Color(crop).enhance(1.05)
    out.parent.mkdir(parents=True, exist_ok=True)
    crop.save(out, "JPEG", quality=78, optimize=True, progressive=True)
    return out.exists() and out.stat().st_size > 4000


def esri_photo(lat: float, lon: float, out: Path) -> bool:
    d = 0.00028
    bbox = f"{lon - d},{lat - d},{lon + d},{lat + d}"
    url = (
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/"
        f"MapServer/export?bbox={bbox}&bboxSR=4326&imageSR=4326&size=720,540&format=jpg&f=image"
    )
    data = get(url, timeout=20)
    if not data or len(data) < 4000:
        return False
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(data)
    return True


def slugify(name: str, fid: str) -> str:
    s = name.lower()
    s = s.replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-")[:70]
    return f"{s}-{fid}"


def parse_hour(iso: str | None, as_end: bool = False) -> tuple[int, int] | None:
    if not iso:
        return None
    m = re.search(r"T(\d{2}):(\d{2})", iso)
    if not m:
        return None
    hh, mm = int(m.group(1)), int(m.group(2))
    if as_end and hh < 7:
        hh += 12
    return hh, mm


def fmt_time(hh: int, mm: int, fr: bool = False) -> str:
    if fr:
        return f"{hh} h {mm:02d}"
    if hh == 0:
        return f"12:{mm:02d} a.m."
    if hh < 12:
        return f"{hh}:{mm:02d} a.m."
    if hh == 12:
        return f"12:{mm:02d} p.m."
    return f"{hh - 12}:{mm:02d} p.m."


def hours_text(f: dict, fr: bool = False) -> str:
    start = parse_hour(f.get("fromTime"), False) or (7, 30)
    end = parse_hour(f.get("toTime"), True) or (17, 30)
    av = f.get("availability") or {}
    core = f"{fmt_time(*start, fr)} – {fmt_time(*end, fr)}"
    if fr:
        days = "du lundi au vendredi"
        extra = []
        if av.get("openEvenings"):
            extra.append("soirs")
        if av.get("openWeekends"):
            extra.append("fins de semaine")
        if av.get("openOvernight"):
            extra.append("nuit")
        if extra:
            return f"{core}, {days} · {', '.join(extra)}"
        return f"{core}, {days}"
    days = "Monday to Friday"
    extra = []
    if av.get("openEvenings"):
        extra.append("evenings")
    if av.get("openWeekends"):
        extra.append("weekends")
    if av.get("openOvernight"):
        extra.append("overnight")
    if extra:
        return f"{core}, {days} · {', '.join(extra)}"
    return f"{core}, {days}"


def abs_url(base: str, src: str) -> str | None:
    if not src or src.startswith("data:"):
        return None
    return urllib.parse.urljoin(base, src)


SKIP_HOSTS = (
    "fastoche.ca",
    "forms.gle",
    "docs.google",
    "childcare.link",
    "facebook.com",
    "waitlist",
)


def host_of(url: str) -> str:
    try:
        return urllib.parse.urlparse(url).netloc.lower().lstrip("www.")
    except Exception:
        return ""


def looks_like_logo(url: str, content_type: str, size: tuple[int, int]) -> bool:
    u = url.lower()
    w, h = size
    if w < 40 or h < 40:
        return False
    if w > 1600 and h > 1600:
        return False
    if "logo" in u or "brand" in u or "wordmark" in u:
        return True
    ratio = w / max(h, 1)
    if 0.5 <= ratio <= 3.2 and w <= 900 and h <= 500:
        if "png" in content_type or u.endswith(".png") or u.endswith(".svg"):
            return True
    return False


def save_logo(data: bytes, out: Path) -> bool:
    try:
        im = Image.open(BytesIO(data))
        im = im.convert("RGBA") if im.mode in ("P", "RGBA", "LA") else im.convert("RGB")
        w, h = im.size
        if w < 40 or h < 40:
            return False
        # drop near-empty / tracking pixels
        if w * h < 2500:
            return False
        scale = min(480 / max(w, 1), 240 / max(h, 1), 1.0)
        if scale < 1:
            im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.LANCZOS)
        out.parent.mkdir(parents=True, exist_ok=True)
        if im.mode == "RGBA":
            out_png = out.with_suffix(".png")
            im.save(out_png, "PNG", optimize=True)
            return out_png.exists()
        im.convert("RGB").save(out.with_suffix(".jpg"), "JPEG", quality=85, optimize=True)
        return True
    except Exception:
        return False


def extract_logo_from_html(html: str, page_url: str) -> list[str]:
    cands: list[str] = []
    patterns = [
        r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
        r'<link[^>]+rel=["\'][^"\']*icon[^"\']*["\'][^>]+href=["\']([^"\']+)',
        r'<link[^>]+href=["\']([^"\']+)["\'][^>]+rel=["\'][^"\']*icon[^"\']*',
        r'<img[^>]+src=["\']([^"\']*logo[^"\']*)["\']',
        r'<img[^>]+src=["\']([^"\']+)["\'][^>]*(?:alt|class|id)=["\'][^"\']*logo[^"\']*',
        r'src=["\'](https?://[^"\']+/logo[^"\']+)["\']',
        r'src=["\'](https?://[^"\']*brand[^"\']+\.(?:png|svg|jpg|jpeg|webp))["\']',
    ]
    for pat in patterns:
        for m in re.findall(pat, html, re.I):
            u = abs_url(page_url, m.strip())
            if u:
                cands.append(u)
    # unique preserve order
    seen: set[str] = set()
    out: list[str] = []
    for u in cands:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out[:8]


def fetch_logo_for_site(url: str, dest_stem: Path) -> Path | None:
    if not url:
        return None
    if not url.startswith("http"):
        url = "http://" + url
    host = host_of(url)
    if not host or any(s in url.lower() or s in host for s in SKIP_HOSTS):
        return None
    cached = dest_stem.parent / f"_host-{re.sub(r'[^a-z0-9]+', '-', host)}"
    for ext in (".png", ".jpg"):
        if cached.with_suffix(ext).exists() and cached.with_suffix(ext).stat().st_size > 800:
            target = dest_stem.with_suffix(cached.with_suffix(ext).suffix)
            if not target.exists():
                target.write_bytes(cached.with_suffix(ext).read_bytes())
            return target
    html_b = get(url, timeout=10, headers={"Accept": "text/html"})
    if not html_b:
        return None
    try:
        html = html_b.decode("utf-8", "replace")
    except Exception:
        return None
    # use final page url guess
    for src in extract_logo_from_html(html, url):
        if src.lower().endswith(".svg"):
            continue
        data = get(src, timeout=10)
        if not data or len(data) < 800:
            continue
        tmp = dest_stem.with_suffix(".tmp")
        if save_logo(data, dest_stem):
            # copy to host cache
            produced = dest_stem.with_suffix(".png") if dest_stem.with_suffix(".png").exists() else dest_stem.with_suffix(".jpg")
            if produced.exists():
                cache_path = cached.with_suffix(produced.suffix)
                cache_path.write_bytes(produced.read_bytes())
                return produced
    return None


def nominatim(address: str) -> tuple[float, float] | None:
    q = urllib.parse.quote(address + ", Winnipeg, Manitoba, Canada")
    url = f"https://nominatim.openstreetmap.org/search?q={q}&format=json&limit=1"
    data = get(url, timeout=20, headers={"User-Agent": UA, "Accept-Language": "en"})
    time.sleep(1.05)
    if not data:
        return None
    try:
        arr = json.loads(data.decode())
        if arr:
            return float(arr[0]["lat"]), float(arr[0]["lon"])
    except Exception:
        return None
    return None


def in_winnipeg(lat: float, lng: float) -> bool:
    return WPG_LAT[0] <= lat <= WPG_LAT[1] and WPG_LNG[0] <= lng <= WPG_LNG[1]


def lang_key(f: dict) -> str:
    lab = ((f.get("languageType") or {}).get("language") or "English Only").lower()
    if "french only" in lab:
        return "fr"
    if "english and french" in lab or "both" in lab:
        return "en,fr"
    return "en"


def amenities(f: dict, name: str) -> str:
    keys: list[str] = []
    fund = ((f.get("fundingType") or {}).get("type") or "").lower()
    biz = ((f.get("businessType") or {}).get("type") or "").lower()
    if "non funded" in fund or fund == "unfunded":
        keys.append("unfunded")
    else:
        keys.append("funded")
        keys.append("ten-a-day")
    if "for-profit" in biz or "for profit" in biz:
        keys.append("for-profit")
    else:
        keys.append("nonprofit")
    if f.get("careTypeInfant"):
        keys.append("infant-room")
    if f.get("careTypePreschool"):
        keys.append("preschool")
    if f.get("careTypeNursery"):
        keys.append("nursery")
    if f.get("careTypeSchoolAge"):
        keys.append("school-age")
    if f.get("inSchool"):
        keys.append("in-school")
    lk = lang_key(f)
    if lk == "fr":
        keys.append("french")
    elif "fr" in lk:
        keys.append("bilingual")
    av = f.get("availability") or {}
    if av.get("openEvenings"):
        keys.append("evenings")
    if av.get("openWeekends"):
        keys.append("weekends")
    start = parse_hour(f.get("fromTime"))
    end = parse_hour(f.get("toTime"), True)
    if (start and start[0] <= 7) or (end and end[0] >= 18):
        keys.append("extended")
    n = name.lower()
    if "montessori" in n:
        keys.append("montessori")
    if "ymca" in n or "ywca" in n:
        keys.append("ymca")
    if "nature" in n or "forest" in n or "prairie" in n:
        keys.append("nature")
    return ",".join(keys)


def describe(f: dict, addr: dict, phone: str) -> tuple[str, str, str, str]:
    name = f["name"]
    area = ((f.get("area") or {}).get("name") or "Winnipeg").title()
    nbhd = ((f.get("neighbourhood") or {}).get("name") or "").title()
    fund = (f.get("fundingType") or {}).get("type") or "Funded"
    biz = (f.get("businessType") or {}).get("type") or "Non-Profit"
    lang = (f.get("languageType") or {}).get("language") or "English Only"
    cap = f.get("capacity") or {}
    ages = []
    if f.get("careTypeInfant"):
        ages.append("infants")
    if f.get("careTypeNursery"):
        ages.append("nursery")
    if f.get("careTypePreschool"):
        ages.append("preschool")
    if f.get("careTypeSchoolAge"):
        ages.append("school-age")
    age_s = ", ".join(ages) if ages else "early learning"
    loc = f"{addr.get('address', '').strip()}, {addr.get('city')} {addr.get('postalCode')}"
    where = f"{nbhd}, {area}" if nbhd else area
    services = (f.get("servicesDescription") or "").strip()
    services = re.sub(r"\s+", " ", services)
    if len(services) > 420:
        services = services[:417].rsplit(" ", 1)[0] + "…"
    funded = "non funded" not in fund.lower()
    fee_note = (
        "Parent fees follow Manitoba’s $10-a-day program for funded spaces."
        if funded
        else "This centre is listed as non-funded; monthly fees shown are typical Winnipeg unfunded rates — confirm with the centre."
    )
    tag = f"Licensed centre in {where}."
    tag_fr = f"Centre permis à {where}."
    extra = f" {services}" if services else ""
    school = " Located in a school." if f.get("inSchool") else ""
    desc = (
        f"{name} is a licensed {biz.lower()} child-care centre at {loc} "
        f"({where}). {lang}. Ages: {age_s}.{school} {fee_note}{extra} "
        f"Hours and vacancies are from the Manitoba Child Care Search registry."
    )
    desc_fr = (
        f"{name} est un centre de garde {biz.lower()} permis au {loc} "
        f"({where}). {lang}. Groupes d’âge : {age_s}.{school} "
        f"{'Frais selon le programme 10 $ par jour du Manitoba.' if funded else 'Centre non financé; confirmez les frais.'} "
        f"Heures et places selon le registre de recherche de garde du Manitoba."
    )
    return tag, tag_fr, desc.strip(), desc_fr.strip()


def main() -> None:
    centres = json.loads(RAW.read_text())
    locs = json.loads(LOCS.read_text())
    phone_by_id = {str(x.get("facilityIdNum")): x.get("phoneNumber") or "" for x in locs}

    # fix bad coordinates
    for f in centres:
        lat, lng = float(f["latitude"]), float(f["longitude"])
        if in_winnipeg(lat, lng):
            continue
        addr = f.get("facilityAddress") or {}
        street = (addr.get("address") or "").strip()
        print("geocode", f["name"], street)
        hit = nominatim(street) if street else None
        if hit and in_winnipeg(*hit):
            f["latitude"], f["longitude"] = hit
            print("  ->", hit)
        else:
            print("  still out of box", lat, lng)

    OUT_PHOTOS.mkdir(parents=True, exist_ok=True)
    OUT_DATA.mkdir(parents=True, exist_ok=True)

    # aerials
    def one_aerial(f: dict) -> tuple[str, bool]:
        fid = str(f["facilityIdNumber"])
        out = OUT_PHOTOS / f"{fid}.jpg"
        lat, lng = float(f["latitude"]), float(f["longitude"])
        ok = aerial_photo(lat, lng, out)
        if not ok:
            ok = esri_photo(lat, lng, out)
        return fid, ok

    print("aerials…")
    ok_n = 0
    with ThreadPoolExecutor(max_workers=10) as ex:
        futs = [ex.submit(one_aerial, f) for f in centres]
        for i, fut in enumerate(as_completed(futs), 1):
            fid, ok = fut.result()
            ok_n += int(ok)
            if i % 40 == 0 or i == len(centres):
                print(f"  {i}/{len(centres)} aerial ok={ok_n}")

    # logos by unique website
    print("logos…")
    site_to_ids: dict[str, list[str]] = {}
    for f in centres:
        w = (f.get("webSite") or "").strip()
        if not w:
            continue
        if not w.startswith("http"):
            w = "http://" + w
        site_to_ids.setdefault(w, []).append(str(f["facilityIdNumber"]))

    logo_for_id: dict[str, str] = {}

    def one_logo(site: str, ids: list[str]) -> tuple[list[str], Path | None]:
        stem = OUT_PHOTOS / f"{ids[0]}-logo"
        path = fetch_logo_for_site(site, stem)
        return ids, path

    logo_n = 0
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = [ex.submit(one_logo, site, ids) for site, ids in site_to_ids.items()]
        for i, fut in enumerate(as_completed(futs), 1):
            ids, path = fut.result()
            if path and path.exists():
                logo_n += 1
                rel = f"/photos/wpg/{path.name}"
                for fid in ids:
                    # copy for each id so listing paths are stable
                    dest = OUT_PHOTOS / path.name.replace(ids[0] + "-logo", f"{fid}-logo")
                    if dest != path and not dest.exists():
                        dest.write_bytes(path.read_bytes())
                    logo_for_id[fid] = f"/photos/wpg/{dest.name}"
            if i % 20 == 0 or i == len(site_to_ids):
                print(f"  sites {i}/{len(site_to_ids)} with logo={logo_n}")

    catalog = []
    for f in centres:
        fid = str(f["facilityIdNumber"])
        addr = f.get("facilityAddress") or {}
        lat, lng = float(f["latitude"]), float(f["longitude"])
        if not in_winnipeg(lat, lng):
            # keep anyway if address says Winnipeg — still list, use city centroid
            lat, lng = 49.8951, -97.1384
        phone = (f.get("phoneNumber") or "").strip() or phone_by_id.get(fid, "")
        cap = f.get("capacity") or {}
        funded = "non funded" not in ((f.get("fundingType") or {}).get("type") or "").lower()
        infant_ok = bool(f.get("careTypeInfant")) or int(cap.get("age0To2Maximum") or 0) > 0
        toddler_ok = bool(f.get("careTypeNursery")) or int(cap.get("age2To6NurseryMaximum") or 0) > 0
        preschool_ok = bool(f.get("careTypePreschool")) or int(cap.get("age2To6PreschoolMaximum") or 0) > 0
        if not (infant_ok or toddler_ok or preschool_ok):
            # school-age only — still list as preschool-age after-school
            preschool_ok = True
        def fee(kind: str, offered: bool) -> int | None:
            if not offered:
                return None
            if funded:
                return FUNDED_FEE
            return UNFUNDED[kind]
        spots_i = int(cap.get("age0To2Vacancy") or 0)
        spots_t = int(cap.get("age2To6NurseryVacancy") or 0)
        spots_p = int(cap.get("age2To6PreschoolVacancy") or 0)
        if not infant_ok:
            spots_i = 0
        if not toddler_ok:
            spots_t = 0
        if not preschool_ok:
            spots_p = 0
        open_total = spots_i + spots_t + spots_p
        age_min = 3 if infant_ok else (18 if toddler_ok else 24)
        age_max = 144 if f.get("careTypeSchoolAge") else 72
        tag, tag_fr, desc, desc_fr = describe(f, addr, phone)
        photos = []
        bldg = OUT_PHOTOS / f"{fid}.jpg"
        if bldg.exists():
            photos.append(f"/photos/wpg/{fid}.jpg")
        if fid in logo_for_id:
            photos.append(logo_for_id[fid])
        if not photos:
            photos.append("/photos/community.jpg")
        lk = lang_key(f)
        name = htmlmod.unescape(str(f["name"] or "")).strip().strip('"')
        catalog.append(
            {
                "id": f"mb-{fid}",
                "slug": slugify(name, fid),
                "name": name,
                "nameFr": name,
                "tagline": tag,
                "taglineFr": tag_fr,
                "description": desc,
                "descriptionFr": desc_fr,
                "address": re.sub(r"\s+", " ", (addr.get("address") or "").strip()),
                "city": addr.get("city") or "Winnipeg",
                "province": "MB",
                "postalCode": (addr.get("postalCode") or "").strip(),
                "lat": round(lat, 6),
                "lng": round(lng, 6),
                "phone": phone or None,
                "hours": hours_text(f, False),
                "hoursFr": hours_text(f, True),
                "ageMinMonths": age_min,
                "ageMaxMonths": age_max,
                "infantMonthly": fee("infant", infant_ok),
                "toddlerMonthly": fee("toddler", toddler_ok),
                "preschoolMonthly": fee("preschool", preschool_ok),
                "partTimeMonthly": fee("part", True),
                "spotsInfant": spots_i,
                "spotsToddler": spots_t,
                "spotsPreschool": spots_p,
                "waitlist": 0 if open_total else 1,
                "ratingX10": 0,
                "licenseNumber": f"MB-{fid}",
                "languages": lk,
                "amenities": amenities(f, name),
                "photos": photos,
                "reviews": [],
            }
        )

    catalog.sort(key=lambda d: d["name"].lower())
    (OUT_DATA / "centres.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2))
    print("wrote", len(catalog), "centres", "photos", len(list(OUT_PHOTOS.glob('*.jpg'))) + len(list(OUT_PHOTOS.glob('*.png'))))
    print("with logo", sum(1 for d in catalog if any("-logo" in p for p in d["photos"])))
    print("with aerial", sum(1 for d in catalog if any(p.endswith(".jpg") and "-logo" not in p for p in d["photos"])))
    print("open spots", sum(1 for d in catalog if d["spotsInfant"] + d["spotsToddler"] + d["spotsPreschool"] > 0))


if __name__ == "__main__":
    main()
