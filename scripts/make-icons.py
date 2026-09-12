#!/usr/bin/env python3
"""Erzeugt die App-Icons als PNG -- ohne Bildbibliothek, direkt kodiert.

Gezeichnet wird ein Keimling: gebogener Stängel mit zwei Blättern auf
dunkelgrünem Grund. Jede Form wird als Flächentest beschrieben und mit
3x3-Überabtastung geglättet.
"""
import math
import struct
import zlib
from pathlib import Path

HINTERGRUND_OBEN = (26, 58, 38)
HINTERGRUND_UNTEN = (12, 30, 20)
GRUEN = (90, 195, 125)
GRUEN_HELL = (130, 220, 160)


def rounded_square(x, y, size, radius):
    """Innerhalb eines abgerundeten Quadrats, das die Fläche ausfüllt?"""
    dx = max(radius - x, 0, x - (size - radius))
    dy = max(radius - y, 0, y - (size - radius))
    return dx * dx + dy * dy <= radius * radius


def ellipse(x, y, cx, cy, rx, ry, winkel):
    """Innerhalb einer um `winkel` (Grad) gedrehten Ellipse?"""
    a = math.radians(winkel)
    dx, dy = x - cx, y - cy
    u = dx * math.cos(a) + dy * math.sin(a)
    v = -dx * math.sin(a) + dy * math.cos(a)
    return (u / rx) ** 2 + (v / ry) ** 2 <= 1


def stem(x, y, size):
    """Der leicht gebogene Stängel."""
    unten, oben = size * 0.80, size * 0.42
    if not (oben <= y <= unten):
        return False
    t = (unten - y) / (unten - oben)          # 0 unten .. 1 oben
    mitte = size * 0.5 + math.sin(t * 1.4) * size * 0.045
    dicke = size * (0.034 - 0.013 * t)        # nach oben hin dünner
    return abs(x - mitte) <= dicke


def probe(x, y, size):
    """Farbe eines Punktes -- None heißt durchsichtig."""
    if not rounded_square(x, y, size, size * 0.23):
        return None

    if stem(x, y, size):
        return GRUEN
    # linkes Blatt -- sitzt am Stängel an, nicht daneben
    if ellipse(x, y, size * 0.388, size * 0.545, size * 0.160, size * 0.088, -30):
        return GRUEN
    # rechtes Blatt, etwas höher und heller
    if ellipse(x, y, size * 0.648, size * 0.452, size * 0.168, size * 0.092, 26):
        return GRUEN_HELL

    t = y / size
    return tuple(round(a + (b - a) * t) for a, b in zip(HINTERGRUND_OBEN, HINTERGRUND_UNTEN))


def render(size, padding=0.0):
    """RGBA-Zeilen erzeugen, mit 3x3-Überabtastung gegen harte Kanten."""
    rows = []
    inner = size * (1 - 2 * padding)
    offset = size * padding
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = a = 0
            for sy in range(3):
                for sx in range(3):
                    x = (px + (sx + 0.5) / 3 - offset) / inner * size
                    y = (py + (sy + 0.5) / 3 - offset) / inner * size
                    farbe = probe(x, y, size)
                    if farbe:
                        r += farbe[0]; g += farbe[1]; b += farbe[2]; a += 255
            if a == 0:
                row += b"\x00\x00\x00\x00"
            else:
                treffer = a // 255
                row += bytes((r // treffer, g // treffer, b // treffer, a // 9))
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(typ, data):
        c = typ + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    Path(path).write_bytes(png)
    return len(png)


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "public" / "icons"
    out.mkdir(parents=True, exist_ok=True)
    for size, name, pad in [(192, "icon-192.png", 0.0),
                            (512, "icon-512.png", 0.0),
                            (512, "icon-maskable.png", 0.12)]:
        n = write_png(out / name, size, render(size, pad))
        print(f"{name}: {n/1024:.1f} kB")
