#!/usr/bin/env python3
"""Pull real storefront photos from Facebook pages and web image search.

Never uses Street View, satellite, or map tiles. If no clear building-front
photo is found, the listing keeps the KidEase placeholder.
"""

from __future__ import annotations

import html as htmlmod
import http.cookiejar
import json
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path("/workspace")
CENTRES = ROOT / "src" / "lib" / "data" / "centres.json"
OUT = ROOT / "public" / "photos" / "storefront"
MANIFEST = ROOT / "src" / "lib" / "data" / "storefronts.json"
MISSING = ROOT / "src" / "lib" / "data" / "storefront-missing.json"

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
CTX = ssl.create_default_context()
CJ = http.cookiejar.CookieJar()
OPENER = urllib.request.build_opener(
    urllib.request.HTTPSHandler(context=CTX),
    urllib.request.HTTPCookieProcessor(CJ),
)

BAD_HOST = (
    "streetview",
    "googleapis.com/maps",
    "maps.google",
    "google.com/maps",
    "gstatic.com/map",
    "openstreetmap",
    "mapbox",
    "arcgisonline",
    "4sqi.net",
    "freepik",
    "shutterstock",
    "dreamstime",
    "istockphoto",
    "depositphotos",
    "alamy",
    "gettyimages",
    "pinterest",
    "pinimg.com",
    "wikimedia",
    "cbc.ca",
    "globalnews",
    "winnipegfreepress",
)
BAD_PATH = ("logo", "wordmark", "favicon", "sprite", "icon-", "/icon")
FB_SKIP = ("/posts/", "/groups/", "/people/", "/watch/", "/photo", "/reel", "/videos/", "/share/")
INDOOR_OR_IRRELEVANT = (
    "playroom",
    "classroom",
    "indoor",
    "gym",
    "kids-at",
    "children-at",
    "child-at-a",
    "news",
    "cbc.ca",
    "globalnews",
    "freepress",
    "stock",
    "illustration",
    "cartoon",
    "logo",
    "wordmark",
    "headshot",
    "portrait",
)
EXTERIOR_HINT = (
    "storefront",
    "entrance",
    "exterior",
    "facade",
    "façade",
    "building-front",
    "front-of",
    "street-front",
    "outside",
    "curb",
)


def get(url: str, timeout: float = 16, headers: dict | None = None) -> bytes | None:
    h = {"User-Agent": UA, "Accept": "*/*", "Accept-Language": "en-CA,en;q=0.9"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    try:
        with OPENER.open(req, timeout=timeout) as r:
            return r.read()
    except Exception:
        return None


def ddg_vqd(q: str) -> str | None:
    html = get(f"https://duckduckgo.com/?q={urllib.parse.quote(q)}&iax=images&ia=images")
    if not html:
        return None
    m = re.search(r"vqd[\\'\"=:]+([0-9-]+)", html.decode("utf-8", "replace"))
    return m.group(1) if m else None


def ddg_images(q: str) -> list[dict]:
    vqd = ddg_vqd(q)
    if not vqd:
        return []
    params = urllib.parse.urlencode({"l": "ca-en", "o": "json", "q": q, "vqd": vqd, "f": ",,,", "p": "1"})
    data = get(f"https://duckduckgo.com/i.js?{params}", headers={"Referer": "https://duckduckgo.com/"})
    if not data:
        return []
    try:
        return json.loads(data.decode()).get("results") or []
    except Exception:
        return []


def ddg_links(q: str) -> list[str]:
    html = get("https://html.duckduckgo.com/html/?q=" + urllib.parse.quote(q))
    if not html:
        return []
    text = html.decode("utf-8", "replace")
    out: list[str] = []
    for raw in re.findall(r"uddg=([^&\"]+)", text):
        u = urllib.parse.unquote(raw)
        if u.startswith("http") and u not in out:
            out.append(u)
    return out


def host_of(url: str) -> str:
    try:
        return urllib.parse.urlparse(url).netloc.lower().lstrip("www.")
    except Exception:
        return ""


def looks_bad_url(url: str) -> bool:
    u = url.lower()
    if any(b in u for b in BAD_HOST):
        return True
    if any(b in u for b in BAD_PATH):
        return True
    if any(b in u for b in INDOOR_OR_IRRELEVANT):
        return True
    return False


def is_exterior_text(text: str) -> bool:
    t = text.lower()
    if any(b in t for b in INDOOR_OR_IRRELEVANT):
        return False
    return any(k in t for k in EXTERIOR_HINT)


def facebook_pages(name: str, city: str) -> list[str]:
    links = ddg_links(f'"{name}" {city} site:facebook.com')
    pages: list[str] = []
    for u in links:
        if "facebook.com" not in u.lower():
            continue
        if any(s in u.lower() for s in FB_SKIP):
            continue
        pages.append(u.split("?")[0])
    return pages[:3]


def og_image(page: str) -> str | None:
    html = get(page, headers={"Accept": "text/html"})
    if not html:
        return None
    text = html.decode("utf-8", "replace")
    for pat in (
        r'property=["\']og:image["\'][^>]+content=["\']([^"\']+)',
        r'content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
        r'property=["\']og:image:url["\'][^>]+content=["\']([^"\']+)',
    ):
        m = re.search(pat, text, re.I)
        if m:
            return htmlmod.unescape(m.group(1).strip())
    return None


def official_site(name: str, city: str) -> str | None:
    skip = (
        "facebook.com",
        "yelp.",
        "childcaresearch",
        "gov.mb.ca",
        "yellowpages",
        "mapquest",
        "instagram.com",
        "twitter.com",
        "linkedin.com",
        "chamberofcommerce",
        "showmelocal",
        "canpages",
        "wikipedia",
    )
    for u in ddg_links(f'"{name}" {city} daycare OR "child care" OR childcare'):
        h = host_of(u)
        if not h or any(s in u.lower() or s in h for s in skip):
            continue
        return u
    return None


def site_photos(page: str) -> list[str]:
    html = get(page, headers={"Accept": "text/html"})
    if not html:
        return []
    text = html.decode("utf-8", "replace")
    found: list[str] = []
    for pat in (
        r'property=["\']og:image["\'][^>]+content=["\']([^"\']+)',
        r'src=["\']([^"\']+\.(?:jpg|jpeg|png|webp))["\']',
    ):
        for m in re.findall(pat, text, re.I):
            u = urllib.parse.urljoin(page, htmlmod.unescape(m.strip()))
            lu = u.lower()
            if looks_bad_url(u) or not is_exterior_text(lu):
                continue
            found.append(u)
    # unique
    out: list[str] = []
    for u in found:
        if u not in out:
            out.append(u)
    return out[:6]


def crop_storefront(im: Image.Image) -> Image.Image:
    im = im.convert("RGB")
    w, h = im.size
    target = 4 / 3
    ratio = w / max(h, 1)
    if ratio > target:
        nw = int(h * target)
        left = (w - nw) // 2
        im = im.crop((left, 0, left + nw, h))
    elif ratio < target:
        nh = int(w / target)
        top = int((h - nh) * 0.38)
        top = max(0, min(top, h - nh))
        im = im.crop((0, top, w, top + nh))
    return im.resize((800, 600), Image.Resampling.LANCZOS)


def usable_photo(data: bytes, url: str) -> Image.Image | None:
    if not data or len(data) < 12000:
        return None
    try:
        im = Image.open(BytesIO(data))
    except Exception:
        return None
    if im.mode == "L":
        return None
    w, h = im.size
    if w < 420 or h < 280:
        return None
    if w / max(h, 1) > 3.4 or h / max(w, 1) > 1.7:
        return None
    if looks_bad_url(url):
        return None
    return crop_storefront(im)


def save_jpeg(im: Image.Image, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "JPEG", quality=82, optimize=True, progressive=True)
    return dest.exists() and dest.stat().st_size > 8000


def candidates_for(centre: dict) -> list[str]:
    name = centre.get("name") or ""
    city = centre.get("city") or ""
    urls: list[str] = []

    for page in facebook_pages(name, city):
        img = og_image(page)
        if img and is_exterior_text(img + " " + page):
            urls.append(img)

    site = official_site(name, city)
    if site:
        urls.extend(site_photos(site))

    queries = [
        f'"{name}" {city} storefront',
        f'"{name}" {city} entrance',
        f'"{name}" {city} exterior',
    ]
    for q in queries:
        for r in ddg_images(q)[:12]:
            img = r.get("image") or ""
            src = (r.get("url") or "") + " " + (r.get("title") or "")
            blob = f"{img} {src}"
            if looks_bad_url(img) or looks_bad_url(src) or not is_exterior_text(blob):
                continue
            if "facebook" in blob.lower() or "lookaside.fbsbx" in blob.lower() or "scontent" in blob.lower():
                urls.insert(0, img)
            elif name.lower().split()[0] in blob.lower():
                urls.append(img)
        time.sleep(0.12)

    seen: set[str] = set()
    out: list[str] = []
    for u in urls:
        if u and u not in seen:
            seen.add(u)
            out.append(u)
    return out[:10]


def fetch_one(centre: dict) -> str | None:
    cid = centre["id"]
    dest = OUT / f"{cid}.jpg"
    if dest.exists() and dest.stat().st_size > 8000:
        return f"/photos/storefront/{cid}.jpg"
    for url in candidates_for(centre):
        data = get(url, headers={"Referer": "https://duckduckgo.com/"})
        im = usable_photo(data or b"", url)
        if im is None:
            continue
        if save_jpeg(im, dest):
            return f"/photos/storefront/{cid}.jpg"
    return None


def main() -> None:
    centres = json.loads(CENTRES.read_text())
    # Prefer cities parents actually browse first, then the rest of Canada.
    priority_cities = {
        "Winnipeg",
        "Winkler",
        "Brandon",
        "Toronto",
        "Vancouver",
        "Calgary",
        "Ottawa",
        "Montréal",
        "Montreal",
        "Edmonton",
        "Hamilton",
        "Mississauga",
        "Surrey",
        "Halifax",
    }
    ranked = sorted(
        centres,
        key=lambda c: (0 if c.get("city") in priority_cities else 1, c.get("province") != "MB", c.get("city") != "Winnipeg"),
    )
    # Cap this run so we don't hammer image search for 20k centres.
    # Winnipeg + other priority cities first.
    todo = [c for c in ranked if c.get("name") and c.get("city")][:900]
    print(f"fetching storefronts for {len(todo)} centres")
    found: dict[str, str] = {}
    if MANIFEST.exists():
        try:
            found = json.loads(MANIFEST.read_text())
        except Exception:
            found = {}
    missing: list[dict] = []
    ok = fail = 0
    for i, c in enumerate(todo, 1):
        cid = c["id"]
        if cid in found:
            ok += 1
            continue
        try:
            path = fetch_one(c)
        except Exception:
            path = None
        if path:
            found[cid] = path
            ok += 1
        else:
            fail += 1
            missing.append({"id": cid, "name": c.get("name"), "city": c.get("city"), "province": c.get("province")})
        if i % 15 == 0 or i == len(todo):
            print(f"  {i}/{len(todo)} ok={ok} missing={fail}")
            MANIFEST.write_text(json.dumps(found, indent=0))
            MISSING.write_text(json.dumps(missing, indent=0))
        time.sleep(0.2)
    MANIFEST.write_text(json.dumps(found, indent=0))
    # remaining catalogue entries not attempted still need a follow-up note
    attempted = {c["id"] for c in todo}
    for c in centres:
        if c["id"] not in found and c["id"] not in attempted:
            missing.append(
                {
                    "id": c["id"],
                    "name": c.get("name"),
                    "city": c.get("city"),
                    "province": c.get("province"),
                    "note": "not attempted this run — no verified storefront photo yet",
                }
            )
    MISSING.write_text(json.dumps(missing, indent=0))
    print(f"done photos={len(found)} missing={len(missing)}")


if __name__ == "__main__":
    main()
