#!/usr/bin/env python3
"""
OneClean Multi – mehrere Android-Geräte gleichzeitig aufräumen und aktualisieren.
OneMultimedia · MB Verlag & Media Sounds

Voraussetzungen:
  * Python 3.8+
  * Android Platform-Tools (adb) im PATH  ->  https://developer.android.com/tools/releases/platform-tools
  * Auf jedem Gerät: Entwickleroptionen -> USB-Debugging (oder Wireless-Debugging) aktivieren

Benutzung:
  python oneclean_multi.py              # Menü
  python oneclean_multi.py geraete      # verbundene Geräte anzeigen
  python oneclean_multi.py cache        # App-Caches auf allen Geräten leeren
  python oneclean_multi.py junk         # Junk-Dateien suchen und (nach Rückfrage) löschen
  python oneclean_multi.py apps         # installierte Apps aller Geräte auflisten
  python oneclean_multi.py deinstallieren <paket>   # App auf allen Geräten entfernen
  python oneclean_multi.py update       # neueste OneClean-APK von GitHub auf alle Geräte installieren
  python oneclean_multi.py update --apk Datei.apk   # eigene APK auf alle Geräte installieren
  python oneclean_multi.py wlan <ip:port>           # Gerät per WLAN-ADB verbinden
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request

UPDATE_REPO = "mbverlagberlin-afk/oneclean"
JUNK_PATTERNS = ["*.apk", "*.tmp", "*.temp", "*.log", "*.bak", "*.crdownload", "*.part"]


def adb(*args, serial=None, check=False):
    cmd = ["adb"] + (["-s", serial] if serial else []) + list(args)
    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if check and res.returncode != 0:
        raise RuntimeError(res.stderr.strip() or res.stdout.strip())
    return res.stdout.strip()


def shell(serial, command):
    return adb("shell", command, serial=serial)


def devices():
    out = adb("devices", "-l")
    result = []
    for line in out.splitlines()[1:]:
        parts = line.split()
        if len(parts) >= 2 and parts[1] == "device":
            result.append(parts[0])
        elif len(parts) >= 2 and parts[1] in ("unauthorized", "offline"):
            print(f"  ! {parts[0]}: {parts[1]} – bitte USB-Debugging auf dem Gerät bestätigen")
    return result


def device_name(serial):
    brand = shell(serial, "getprop ro.product.brand")
    model = shell(serial, "getprop ro.product.model")
    android = shell(serial, "getprop ro.build.version.release")
    return f"{brand} {model} (Android {android})"


def free_space(serial):
    out = shell(serial, "df -h /data | tail -1")
    parts = out.split()
    return f"{parts[3]} frei von {parts[1]}" if len(parts) >= 4 else "unbekannt"


def require_devices():
    if shutil.which("adb") is None:
        sys.exit("adb wurde nicht gefunden. Bitte Android Platform-Tools installieren und zum PATH hinzufügen.")
    devs = devices()
    if not devs:
        sys.exit("Kein Gerät verbunden. USB-Kabel anschließen und USB-Debugging erlauben.")
    return devs


def cmd_devices():
    for s in require_devices():
        print(f"• {s}: {device_name(s)} – {free_space(s)}")


def cmd_cache():
    for s in require_devices():
        before = free_space(s)
        # Fordert Android auf, die Caches ALLER Apps zu leeren
        shell(s, "pm trim-caches 999G")
        shell(s, "rm -rf /sdcard/DCIM/.thumbnails/* /sdcard/Pictures/.thumbnails/* 2>/dev/null")
        print(f"• {device_name(s)}: vorher {before} -> jetzt {free_space(s)}")


def cmd_junk():
    for s in require_devices():
        name_expr = " -o ".join(f"-iname '{p}'" for p in JUNK_PATTERNS)
        out = shell(
            s,
            f"find /sdcard/ -path /sdcard/Android -prune -o -type f \\( {name_expr} \\) -print 2>/dev/null",
        )
        files = [f for f in out.splitlines() if f.strip()]
        print(f"\n{device_name(s)}: {len(files)} Junk-Dateien")
        for f in files[:50]:
            print("   ", f)
        if len(files) > 50:
            print(f"    … und {len(files) - 50} weitere")
        if files and input("  Diese Dateien löschen? (j/n) ").strip().lower() == "j":
            for f in files:
                shell(s, f"rm -f \"{f}\"")
            shell(s, "find /sdcard/ -path /sdcard/Android -prune -o -type d -empty -delete 2>/dev/null")
            print(f"  Gelöscht. {free_space(s)}")


def cmd_apps():
    for s in require_devices():
        pkgs = sorted(p.replace("package:", "") for p in shell(s, "pm list packages -3").splitlines() if p)
        print(f"\n{device_name(s)}: {len(pkgs)} installierte Apps")
        for p in pkgs:
            print("   ", p)


def cmd_uninstall(package):
    for s in require_devices():
        print(f"• {device_name(s)}: {adb('uninstall', package, serial=s) or 'nicht installiert'}")


def latest_apk():
    url = f"https://api.github.com/repos/{UPDATE_REPO}/releases/latest"
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "OneCleanMulti"})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.load(r)
    asset = next((a for a in data.get("assets", []) if a["name"].lower().endswith(".apk")), None)
    if not asset:
        sys.exit("Im neuesten Release ist keine APK vorhanden.")
    target = os.path.join(tempfile.gettempdir(), asset["name"])
    print(f"Lade {asset['name']} ({data.get('tag_name')}) herunter …")
    urllib.request.urlretrieve(asset["browser_download_url"], target)
    return target


def cmd_update(apk=None):
    devs = require_devices()
    apk = apk or latest_apk()
    for s in devs:
        res = adb("install", "-r", apk, serial=s)
        print(f"• {device_name(s)}: {'installiert' if 'Success' in res else res}")
    print("\nSystem-Updates: Auf jedem Gerät Einstellungen -> System -> Softwareupdate öffnen.")
    print("App-Updates:    Play Store -> Profil -> Apps und Gerät verwalten -> Alle aktualisieren.")


def cmd_wlan(address):
    print(adb("connect", address))


def menu():
    actions = [
        ("Verbundene Geräte anzeigen", cmd_devices),
        ("App-Caches auf allen Geräten leeren", cmd_cache),
        ("Junk-Dateien suchen und löschen", cmd_junk),
        ("Installierte Apps auflisten", cmd_apps),
        ("App auf allen Geräten deinstallieren", lambda: cmd_uninstall(input("Paketname: ").strip())),
        ("OneClean auf allen Geräten installieren/aktualisieren", cmd_update),
        ("Gerät per WLAN verbinden", lambda: cmd_wlan(input("IP:Port (aus Wireless-Debugging): ").strip())),
    ]
    while True:
        print("\n=== OneClean Multi ===")
        for i, (label, _) in enumerate(actions, 1):
            print(f" {i}) {label}")
        print(" 0) Beenden")
        choice = input("> ").strip()
        if choice == "0":
            return
        if choice.isdigit() and 1 <= int(choice) <= len(actions):
            try:
                actions[int(choice) - 1][1]()
            except SystemExit as e:
                print(e)
            except Exception as e:  # noqa: BLE001
                print("Fehler:", e)


def main():
    args = sys.argv[1:]
    if not args:
        return menu()
    cmd = args[0].lower()
    if cmd in ("geraete", "geräte", "devices"):
        cmd_devices()
    elif cmd == "cache":
        cmd_cache()
    elif cmd == "junk":
        cmd_junk()
    elif cmd == "apps":
        cmd_apps()
    elif cmd in ("deinstallieren", "uninstall") and len(args) > 1:
        cmd_uninstall(args[1])
    elif cmd == "update":
        cmd_update(args[2] if len(args) > 2 and args[1] == "--apk" else None)
    elif cmd == "wlan" and len(args) > 1:
        cmd_wlan(args[1])
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
