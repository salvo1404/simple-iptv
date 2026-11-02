"""Generate app/icon.png (512x512): dark rounded tile with a soft accent 'play' mark. No dependencies."""
import struct, zlib, math, sys

S = 512
BG = (12, 14, 18); TILE = (21, 24, 32); ACCENT = (91, 140, 255)

def inside_rounded(x, y, r=110, pad=0):
    x0, y0, x1, y1 = pad, pad, S - pad, S - pad
    cx = min(max(x, x0 + r), x1 - r); cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r

def in_triangle(x, y):
    # rounded-ish play triangle centred slightly right
    ax, ay, bx, by, cx, cy = 200, 150, 200, 362, 372, 256
    d = lambda x1, y1, x2, y2: (x - x2) * (y1 - y2) - (x1 - x2) * (y - y2)
    d1, d2, d3 = d(ax, ay, bx, by), d(bx, by, cx, cy), d(cx, cy, ax, ay)
    neg = d1 < 0 or d2 < 0 or d3 < 0; pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (neg and pos)

rows = []
for y in range(S):
    row = bytearray([0])
    for x in range(S):
        if not inside_rounded(x + .5, y + .5):
            px = (*BG, 0)
        elif in_triangle(x + .5, y + .5):
            px = (*ACCENT, 255)
        else:
            px = (*TILE, 255)
        row += bytes(px)
    rows.append(bytes(row))

def chunk(t, data):
    c = struct.pack('>I', len(data)) + t + data
    return c + struct.pack('>I', zlib.crc32(t + data) & 0xffffffff)

png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', S, S, 8, 6, 0, 0, 0)) \
    + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b'')
open(sys.argv[1] if len(sys.argv) > 1 else 'app/icon.png', 'wb').write(png)
