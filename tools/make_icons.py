"""Generate PNG app icons (stdlib only). Run from the project root: python tools/make_icons.py"""
import struct, zlib, os

BG = (13, 14, 17)
ACCENT = (255, 90, 31)
INK = (244, 241, 234)

def png(size, maskable):
    # Draw: dark bg, orange ring, "75" blocky digits via simple rects.
    px = [[BG] * size for _ in range(size)]
    c = size / 2
    r_out = size * (0.30 if maskable else 0.40)
    r_in = r_out - size * 0.055
    for y in range(size):
        for x in range(size):
            d = ((x - c) ** 2 + (y - c) ** 2) ** 0.5
            if r_in <= d <= r_out:
                px[y][x] = ACCENT

    def rect(x0, y0, x1, y1, col):
        for y in range(int(y0), int(y1)):
            for x in range(int(x0), int(x1)):
                if 0 <= x < size and 0 <= y < size:
                    px[y][x] = col

    u = size * (0.034 if maskable else 0.044)  # stroke unit
    h = u * 9                                    # digit height
    w = u * 5                                    # digit width
    top = c - h / 2
    gap = u * 2
    x7 = c - w - gap / 2
    x5 = c + gap / 2
    # "7": top bar + diagonal-ish right stem
    rect(x7, top, x7 + w, top + u, INK)
    rect(x7 + w - u, top, x7 + w, top + h, INK)
    # "5": top bar, left upper stem, mid bar, right lower stem, bottom bar
    rect(x5, top, x5 + w, top + u, INK)
    rect(x5, top, x5 + u, top + h / 2, INK)
    rect(x5, top + h / 2 - u / 2, x5 + w, top + h / 2 + u / 2, INK)
    rect(x5 + w - u, top + h / 2, x5 + w, top + h, INK)
    rect(x5, top + h - u, x5 + w, top + h, INK)

    raw = b''.join(b'\x00' + b''.join(bytes(p) for p in row) for row in px)
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

os.makedirs('icons', exist_ok=True)
for name, size, mask in [('icon-180.png', 180, False), ('icon-192.png', 192, False),
                         ('icon-512.png', 512, False), ('icon-maskable-512.png', 512, True)]:
    with open(os.path.join('icons', name), 'wb') as f:
        f.write(png(size, mask))
    print('wrote', name)
