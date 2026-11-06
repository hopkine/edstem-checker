#!/usr/bin/env python3
"""Draw the BetterEd toolbar icons. No third-party image library required."""

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "icons"


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def inside_round_rect(nx: float, ny: float, radius: float = 0.22) -> bool:
    left, right, top, bottom = 0.08, 0.92, 0.08, 0.92
    if not (left <= nx <= right and top <= ny <= bottom):
        return False
    cx = min(max(nx, left + radius), right - radius)
    cy = min(max(ny, top + radius), bottom - radius)
    return (nx - cx) ** 2 + (ny - cy) ** 2 <= radius ** 2


def glyph(nx: float, ny: float) -> bool:
    # Archive box lid, body, and a downward arrow.
    if 0.30 <= nx <= 0.70 and 0.30 <= ny <= 0.38:
        return True
    if 0.34 <= nx <= 0.66 and 0.38 <= ny <= 0.72 and not (0.42 <= nx <= 0.58 and 0.46 <= ny <= 0.64):
        return True
    if 0.46 <= nx <= 0.54 and 0.42 <= ny <= 0.58:
        return True
    if 0.40 <= nx <= 0.60 and 0.56 <= ny <= 0.62 and abs(nx - 0.50) <= (0.62 - ny) * 1.6:
        return True
    return False


def pixel(x: int, y: int, size: int):
    nx = (x + 0.5) / size
    ny = (y + 0.5) / size
    if not inside_round_rect(nx, ny):
        return (0, 0, 0, 0)
    if glyph(nx, ny):
        return (255, 255, 255, 255)
    return (80, 40, 140, 255)


def write_png(path: Path, size: int) -> None:
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            raw.extend(pixel(x, y, size))
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for size in (16, 32, 48, 128):
        write_png(OUT / f"icon{size}.png", size)


if __name__ == "__main__":
    main()
