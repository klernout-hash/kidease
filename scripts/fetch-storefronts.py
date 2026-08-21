#!/usr/bin/env python3
"""Replace Google aerial rooftop shots with Street View storefront photos."""

from __future__ import annotations

import json
import ssl
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path("/workspace")
CENTRES = ROOT / "src" / "lib" / "data" / "centres.json"
OUT = ROOT / "public" / "photos" / "wpg"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
CTX = ssl.create_default_context()


def street_url(lat: float, lng: float) -> str:
    return (
        "https://streetviewpixels-pa.googleapis.com/v1/thumbnail"
        f"?cb_client=maps_sv.tactile&w=800&h=600&ll={lat},{lng}"
    )


def download(lat: float, lng: float) -> bytes | None:
    req = urllib.request.Request(
        street_url(lat, lng),
        headers={
            "User-Agent": UA,
            "Accept": "image/jpeg,*/*",
            "Referer": "https://www.google.com/maps",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=18, context=CTX) as r:
            data = r.read()
    except Exception:
        return None
    if not data or len(data) < 8000:
        return None
    try:
        im = Image.open(BytesIO(data))
        if im.mode == "L":
            return None
        w, h = im.size
        if w < 200 or h < 150:
            return None
        im = im.convert("RGB")
        buf = BytesIO()
        im.save(buf, "JPEG", quality=80, optimize=True, progressive=True)
        return buf.getvalue()
    except Exception:
        return None


def job(item: dict) -> tuple[str, bool]:
    fid = str(item["id"]).split("-", 1)[-1]
    out = OUT / f"{fid}.jpg"
    lat, lng = float(item["lat"]), float(item["lng"])
    data = download(lat, lng)
    if not data:
        return fid, False
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(data)
    return fid, True


def main() -> None:
    centres = json.loads(CENTRES.read_text())
    targets = [
        c
        for c in centres
        if c.get("photos")
        and any("/photos/wpg/" in p and "-logo" not in p for p in c["photos"])
        and c.get("lat")
        and c.get("lng")
    ]
    print(f"storefronts to fetch: {len(targets)}")
    ok = fail = 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = [pool.submit(job, c) for c in targets]
        for i, fut in enumerate(as_completed(futs), 1):
            fid, saved = fut.result()
            if saved:
                ok += 1
            else:
                fail += 1
            if i % 40 == 0 or i == len(futs):
                print(f"  {i}/{len(futs)} ok={ok} fail={fail}")
            time.sleep(0.02)
    print(f"done ok={ok} fail={fail}")


if __name__ == "__main__":
    main()
