#!/usr/bin/env python3
"""Tiny adb + uiautomator helper for the Android emulator smoke test."""
import re, subprocess, sys, time, os, xml.etree.ElementTree as ET

def sh(*a, check=False):
    return subprocess.run(["adb", "shell", *a], capture_output=True, text=True, check=check).stdout

def dump():
    for _ in range(3):
        sh("uiautomator", "dump", "/sdcard/ui.xml")
        x = subprocess.run(["adb", "exec-out", "cat", "/sdcard/ui.xml"], capture_output=True, text=True).stdout
        if x.strip().startswith("<?xml"):
            return ET.fromstring(x[x.index("<hierarchy"):])
        time.sleep(1)
    return None

def label(n):
    return " ".join(filter(None, [n.get("text"), n.get("content-desc"), n.get("resource-id"), n.get("hint")]))

def find(rx, cls=None):
    root = dump()
    if root is None: return None
    r = re.compile(rx, re.I)
    for n in root.iter("node"):
        if cls and cls not in (n.get("class") or ""): continue
        if r.search(label(n)):
            b = list(map(int, re.findall(r"\d+", n.get("bounds"))))
            if b[2] > b[0] and b[3] > b[1]:
                return ((b[0]+b[2])//2, (b[1]+b[3])//2)
    return None

def find_button(rx):
    """Prefer a Button node (the page heading can share the button's text); else the last match."""
    root = dump()
    if root is None: return None
    r = re.compile(rx, re.I); hits = []
    for n in root.iter("node"):
        if r.search(label(n)):
            b = list(map(int, re.findall(r"\d+", n.get("bounds"))))
            if b[2] > b[0] and b[3] > b[1]:
                hits.append(("Button" in (n.get("class") or ""), ((b[0]+b[2])//2, (b[1]+b[3])//2)))
    if not hits: return None
    btn = [h for h in hits if h[0]]
    return (btn[0] if btn else hits[-1])[1]

def wait(rx, t=40, cls=None):
    end = time.time() + t
    while time.time() < end:
        p = find(rx, cls)
        if p: return p
        time.sleep(2)
    return None

def tap(rx, t=40, cls=None):
    p = wait(rx, t, cls)
    if not p: return False
    sh("input", "tap", str(p[0]), str(p[1])); time.sleep(1.5); return True

def type_text(s):
    esc = "".join("\\" + c if c in " ()<>|;&*\\~\"'`$!#?[]{}%" else c for c in s).replace("\\ ", "%s")
    sh("input", "text", esc)

def texts():
    root = dump()
    return "" if root is None else "\n".join(label(n) for n in root.iter("node") if label(n))

if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "tap": sys.exit(0 if tap(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 40) else 1)
    if cmd == "tapbutton":
        end = time.time() + (int(sys.argv[3]) if len(sys.argv) > 3 else 10); p = None
        while time.time() < end and not p:
            p = find_button(sys.argv[2]) or time.sleep(2)
        if not p: sys.exit(1)
        sh("input", "tap", str(p[0]), str(p[1])); time.sleep(1.5); sys.exit(0)
    if cmd == "wait": sys.exit(0 if wait(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 40) else 1)
    if cmd == "tapfield":  # tap nth EditText
        root = dump(); n = int(sys.argv[2]); i = 0
        for node in root.iter("node"):
            if "EditText" in (node.get("class") or ""):
                if i == n:
                    b = list(map(int, re.findall(r"\d+", node.get("bounds"))))
                    sh("input", "tap", str((b[0]+b[2])//2), str((b[1]+b[3])//2)); time.sleep(1); sys.exit(0)
                i += 1
        sys.exit(1)
    if cmd == "typeenv":
        # Safety: only type a secret into a focused password field.
        root = dump()
        ok = root is not None and any(n.get("focused") == "true" and n.get("password") == "true" for n in root.iter("node"))
        if not ok:
            print("refusing to type secret: focused field is not a password field"); sys.exit(2)
        type_text(os.environ[sys.argv[2]]); sys.exit(0)
    if cmd == "focuspw":  # tap the first password EditText
        root = dump()
        for node in (root.iter("node") if root is not None else []):
            if node.get("password") == "true":
                b = list(map(int, re.findall(r"\d+", node.get("bounds"))))
                sh("input", "tap", str((b[0]+b[2])//2), str((b[1]+b[3])//2)); time.sleep(1); sys.exit(0)
        sys.exit(1)
    if cmd == "focusemail":
        # WebView inputs often carry no text/hint, so the "Email" label is a sibling node.
        for attempt in range(4):
            root = dump()
            nodes = list(root.iter("node")) if root is not None else []
            def box(n):
                b = list(map(int, re.findall(r"\d+", n.get("bounds") or "")))
                return b if len(b) == 4 and b[2] > b[0] and b[3] > b[1] else None
            edits = [n for n in nodes if "EditText" in (n.get("class") or "") and n.get("password") != "true" and box(n)]
            pick = next((n for n in edits if re.search(r"e-?mail|username|courriel", label(n), re.I)), None)
            if pick is None and edits:
                lbl = next((box(n) for n in nodes if box(n) and re.fullmatch(r"\s*(Email|E-mail|Courriel)\s*", n.get("text") or "")), None)
                if lbl:
                    below = [n for n in edits if box(n)[1] >= lbl[1] - 10]
                    pick = min(below, key=lambda n: box(n)[1]) if below else None
                pw = next((box(n) for n in nodes if n.get("password") == "true" and box(n)), None)
                if pick is None and pw:
                    above = [n for n in edits if box(n)[3] <= pw[1] + 5]
                    pick = max(above, key=lambda n: box(n)[1]) if above else None
            if pick is not None:
                b = box(pick)
                sh("input", "tap", str((b[0]+b[2])//2), str((b[1]+b[3])//2)); time.sleep(1)
                sys.stderr.write("focusemail: tapped field %d of %d\n" % (edits.index(pick), len(edits))); sys.exit(0)
            sys.stderr.write("focusemail: %d edit fields, none matched; scrolling\n" % len(edits))
            sh("input", "swipe", "540", "1500", "540", "900", "300"); time.sleep(1.5)
        sys.exit(1)
    if cmd == "haspw":
        root = dump()
        sys.exit(0 if root is not None and any(n.get("password") == "true" for n in root.iter("node")) else 1)
    if cmd == "type": type_text(sys.argv[2]); sys.exit(0)
    if cmd == "texts": print(texts()); sys.exit(0)
