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
    if cmd == "typeenv": type_text(os.environ[sys.argv[2]]); sys.exit(0)
    if cmd == "type": type_text(sys.argv[2]); sys.exit(0)
    if cmd == "texts": print(texts()); sys.exit(0)
