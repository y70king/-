"""Build the "Biological Sciences" graduation poster (400 cm wide x 300 cm high).

Usage: python3 make_banner.py [DPI]   (default 100 DPI -> 15748 x 11811 px)

Outputs a JPEG and a PDF at the exact physical size, plus a small preview.
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

Image.MAX_IMAGE_PIXELS = None

HERE = os.path.dirname(os.path.abspath(__file__))
DPI = int(sys.argv[1]) if len(sys.argv) > 1 else 100
CM = DPI / 2.54  # pixels per centimetre

W_CM, H_CM = 400, 300
W, H = round(W_CM * CM), round(H_CM * CM)
SAFE_CM = 6  # keep title and faces at least this far from the trim edge

TITLE = "Biological Sciences"
TITLE_SIZE_CM = 16
TITLE_Y_CM = 26

GOLD = (212, 175, 95)
GOLD_GLOW = (230, 180, 80)
EMERALD = (60, 170, 120)
EMERALD_GLOW = (30, 160, 105)

# file, face centre (x, y) as fractions of the (pre-cropped) image, zoom, optional pre-crop box
PHOTOS = {
    "01": ((0.50, 0.46), 0.75, None),
    "02": ((0.53, 0.40), 0.85, None),
    "03": ((0.47, 0.38), 1.00, None),
    "04": ((0.50, 0.17), 1.00, None),
    "05": ((0.34, 0.32), 0.90, None),
    "06": ((0.52, 0.32), 0.85, None),
    "07": ((0.44, 0.18), 1.00, (0, 245, 592, 1035)),  # strip black phone bars
    "08": ((0.47, 0.25), 0.90, None),
    "09": ((0.47, 0.13), 0.90, None),
    "10": ((0.57, 0.20), 0.90, None),
    "11": ((0.55, 0.47), 0.85, None),
    "12": ((0.53, 0.18), 0.85, None),
}
ROWS = [
    ["02", "03", "04", "05", "06", "08"],
    ["01", "09", "10", "07", "11", "12"],
]

PER_ROW = 6
SLOT_W_CM = (W_CM - 2 * SAFE_CM) / PER_ROW
CELL_W_CM = SLOT_W_CM * 1.26  # neighbours meet only inside their feathered edges
CELL_H_CM = 127
ROW_TOP_CM = [50, 166]
FACE_Y_IN_CELL = 0.27


def px(v):
    return v * CM


def smoothstep(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- background

def background():
    """Near-black base with soft gold light behind the title and faint emerald corners."""
    s = 8
    w, h = W // s, H // s
    x = np.linspace(0, W_CM, w, dtype=np.float32)[None, :]
    y = np.linspace(0, H_CM, h, dtype=np.float32)[:, None]
    img = np.zeros((h, w, 3), np.float32) + np.array([3, 4, 4], np.float32)

    def glow(cx, cy, rx, ry, color, strength):
        d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
        img[:] += np.exp(-d)[..., None] * np.array(color, np.float32) * strength

    glow(200, 26, 120, 26, (200, 150, 60), 0.16)
    glow(0, 300, 130, 95, (20, 130, 85), 0.20)
    glow(400, 300, 130, 95, (20, 130, 85), 0.20)
    glow(0, 0, 90, 60, (20, 120, 80), 0.10)
    glow(400, 0, 90, 60, (20, 120, 80), 0.10)
    glow(200, 170, 220, 14, (180, 140, 60), 0.05)  # faint light between the rows
    r2 = ((x - 200) / 230) ** 2 + ((y - 150) / 190) ** 2
    img *= (1 - 0.35 * np.clip(r2, 0, 1))[..., None]

    canvas = Image.fromarray(img.clip(0, 255).astype(np.uint8), "RGB").resize((W, H), Image.BICUBIC)

    # light dithering so the dark gradients do not band in print
    rng = np.random.default_rng(7)
    step = 1024
    for y0 in range(0, H, step):
        box = (0, y0, W, min(H, y0 + step))
        a = np.asarray(canvas.crop(box), dtype=np.int16)
        a += rng.integers(-1, 2, a.shape, dtype=np.int16)
        canvas.paste(Image.fromarray(a.clip(0, 255).astype(np.uint8), "RGB"), box[:2])
    return canvas


# ------------------------------------------------------- scientific line art

class Art:
    """Two full-size alpha layers (gold, emerald) that line art is drawn into."""

    def __init__(self):
        self.gold = Image.new("L", (W, H), 0)
        self.green = Image.new("L", (W, H), 0)
        self.d = {"gold": ImageDraw.Draw(self.gold), "green": ImageDraw.Draw(self.green)}

    def line(self, layer, pts, alpha, width_cm, closed=False):
        pts = [(px(a), px(b)) for a, b in pts]
        if closed:
            pts = pts + pts[:1]
        self.d[layer].line(pts, fill=int(alpha), width=max(1, round(px(width_cm))), joint="curve")

    def poly(self, layer, pts, alpha):
        self.d[layer].polygon([(px(a), px(b)) for a, b in pts], fill=int(alpha))

    def dot(self, layer, x, y, r, alpha, outline_cm=None):
        box = (px(x - r), px(y - r), px(x + r), px(y + r))
        if outline_cm:
            self.d[layer].ellipse(box, outline=int(alpha), width=max(1, round(px(outline_cm))))
        else:
            self.d[layer].ellipse(box, fill=int(alpha))


def ellipse_pts(cx, cy, rx, ry, angle=0.0, n=120, wobble=()):
    t = np.linspace(0, 2 * math.pi, n, endpoint=False)
    k = np.ones_like(t)
    for amp, freq, ph in wobble:
        k += amp * np.sin(freq * t + ph)
    ex, ey = rx * k * np.cos(t), ry * k * np.sin(t)
    ca, sa = math.cos(angle), math.sin(angle)
    return list(zip(cx + ex * ca - ey * sa, cy + ex * sa + ey * ca))


def dna(art, layer, x0, x1, yc, amp, period, alpha, fade="both", width=0.22):
    """Horizontal double helix; the strand in front is brighter than the one behind."""
    n = max(200, int((x1 - x0) * 8))
    xs = np.linspace(x0, x1, n)
    u = (xs - x0) / (x1 - x0)
    env = np.ones_like(u)
    if fade in ("left", "both"):
        env *= smoothstep(u / 0.55)
    if fade in ("right", "both"):
        env *= smoothstep((1 - u) / 0.55)
    for phase in (0, math.pi):
        th = 2 * math.pi * (xs - x0) / period + phase
        ys = yc + amp * np.sin(th)
        depth = 0.45 + 0.55 * (0.5 + 0.5 * np.cos(th))
        for i in range(n - 1):
            a = alpha * depth[i] * env[i]
            if a >= 1:
                art.line(layer, [(xs[i], ys[i]), (xs[i + 1], ys[i + 1])], a, width)
    rung = period / 10
    x = x0 + rung / 2
    while x < x1:
        th = 2 * math.pi * (x - x0) / period
        e = float(np.interp(x, xs, env))
        y1, y2 = yc + amp * math.sin(th), yc - amp * math.sin(th)
        if abs(y1 - y2) > amp * 0.25:
            art.line(layer, [(x, y1), (x, y2)], alpha * 0.45 * e, width * 0.6)
            for yy in (y1, y2):
                art.dot(layer, x, yy, width * 1.3, alpha * 0.8 * e)
        x += rung


def animal_cell(art, cx, cy, r, alpha):
    g = "green"
    mem = ellipse_pts(cx, cy, r, r * 0.92, 0.3, 240, [(0.035, 5, 0.4), (0.02, 9, 1.3)])
    art.poly(g, mem, alpha * 0.10)
    art.line(g, mem, alpha, 0.28, closed=True)
    art.line(g, ellipse_pts(cx, cy, r * 0.965, r * 0.885, 0.3, 240, [(0.035, 5, 0.4), (0.02, 9, 1.3)]),
             alpha * 0.45, 0.12, closed=True)
    nx, ny, nr = cx - 0.15 * r, cy - 0.08 * r, 0.30 * r
    art.poly(g, ellipse_pts(nx, ny, nr, nr * 0.9), alpha * 0.22)
    art.line(g, ellipse_pts(nx, ny, nr, nr * 0.9), alpha * 0.9, 0.22, closed=True)
    art.line(g, ellipse_pts(nx, ny, nr * 1.08, nr * 0.98), alpha * 0.5, 0.10, closed=True)
    art.dot(g, nx + nr * 0.25, ny - nr * 0.15, nr * 0.28, alpha * 0.55)
    rng = np.random.default_rng(3)
    for _ in range(14):
        a, d = rng.uniform(0, 2 * math.pi), rng.uniform(0.2, 0.75) * nr
        art.dot(g, nx + d * math.cos(a), ny + d * math.sin(a), nr * 0.04, alpha * 0.7)
    # rough endoplasmic reticulum hugging the nucleus
    for k, rr in enumerate((1.35, 1.6, 1.85)):
        t = np.linspace(math.radians(150), math.radians(290), 60)
        wob = 1 + 0.05 * np.sin(t * 9 + k)
        pts = list(zip(nx + nr * rr * wob * np.cos(t), ny + nr * rr * wob * np.sin(t)))
        art.line(g, pts, alpha * 0.6, 0.12)
        for p in pts[::6]:
            art.dot(g, p[0], p[1], 0.18, alpha * 0.6)
    # golgi stack
    for k in range(4):
        t = np.linspace(math.radians(-35), math.radians(35), 30)
        rr = r * (0.42 + 0.06 * k)
        art.line(g, list(zip(cx + 0.05 * r + rr * np.cos(t), cy + 0.25 * r + rr * np.sin(t))),
                 alpha * 0.7, 0.16)
    # mitochondria with cristae
    for mx, my, ang in ((0.45, -0.35, 0.6), (0.2, 0.6, -0.3), (-0.55, 0.45, 1.2)):
        ex, ey, rx, ry = cx + mx * r, cy + my * r, r * 0.16, r * 0.07
        art.poly(g, ellipse_pts(ex, ey, rx, ry, ang), alpha * 0.18)
        art.line(g, ellipse_pts(ex, ey, rx, ry, ang), alpha * 0.85, 0.14, closed=True)
        zz = []
        for i in range(9):
            u = -0.8 + 1.6 * i / 8
            v = 0.6 if i % 2 else -0.6
            zz.append((ex + rx * u * math.cos(ang) - ry * v * math.sin(ang),
                       ey + rx * u * math.sin(ang) + ry * v * math.cos(ang)))
        art.line(g, zz, alpha * 0.6, 0.08)
    for _ in range(9):
        a, d = rng.uniform(0, 2 * math.pi), rng.uniform(0.55, 0.85) * r
        art.dot(g, cx + d * math.cos(a), cy + d * math.sin(a), r * 0.035, alpha * 0.7, outline_cm=0.08)


def plant_cell(art, cx, cy, w, h, alpha, angle=-0.17):
    g = "green"

    def rrect(cw, ch, rad, n=40):
        hw, hh = cw / 2 - rad, ch / 2 - rad
        pts = []
        for qx, qy, a0 in ((hw, hh, 0), (-hw, hh, 90), (-hw, -hh, 180), (hw, -hh, 270)):
            for t in np.linspace(math.radians(a0), math.radians(a0 + 90), n):
                pts.append((qx + rad * math.cos(t), qy + rad * math.sin(t)))
        ca, sa = math.cos(angle), math.sin(angle)
        return [(cx + x * ca - y * sa, cy + x * sa + y * ca) for x, y in pts]

    def at(u, v):
        ca, sa = math.cos(angle), math.sin(angle)
        return cx + u * ca - v * sa, cy + u * sa + v * ca

    art.poly(g, rrect(w, h, 2.5), alpha * 0.10)
    art.line(g, rrect(w, h, 2.5), alpha, 0.30, closed=True)
    art.line(g, rrect(w - 1.4, h - 1.4, 1.9), alpha * 0.6, 0.14, closed=True)
    vac = rrect(w * 0.52, h * 0.55, 2.2)
    vac = [(x + (at(2.5, 0)[0] - cx), y + (at(2.5, 0)[1] - cy)) for x, y in vac]
    art.poly(g, vac, alpha * 0.12)
    art.line(g, vac, alpha * 0.7, 0.16, closed=True)
    nx, ny = at(-w * 0.33, -h * 0.18)
    art.poly(g, ellipse_pts(nx, ny, 3.0, 2.7), alpha * 0.22)
    art.line(g, ellipse_pts(nx, ny, 3.0, 2.7), alpha * 0.9, 0.20, closed=True)
    art.dot(g, nx + 0.6, ny - 0.4, 0.9, alpha * 0.55)
    for u, v, a in ((-0.36, 0.30, 0.2), (-0.05, -0.38, 0.0), (0.30, -0.38, 0.1),
                    (0.40, 0.05, 1.5), (0.20, 0.38, -0.1), (-0.20, 0.40, 0.3)):
        ex, ey = at(u * w, v * h)
        art.poly(g, ellipse_pts(ex, ey, 2.0, 1.0, angle + a), alpha * 0.25)
        art.line(g, ellipse_pts(ex, ey, 2.0, 1.0, angle + a), alpha * 0.85, 0.12, closed=True)
        for k in (-0.9, 0, 0.9):  # grana stacks
            gx, gy = ex + k * math.cos(angle + a), ey + k * math.sin(angle + a)
            ox, oy = -0.45 * math.sin(angle + a), 0.45 * math.cos(angle + a)
            art.line(g, [(gx - ox, gy - oy), (gx + ox, gy + oy)], alpha * 0.8, 0.12)


def molecule(art, layer, cx, cy, s, alpha, angle=0.0):
    """Two fused six-membered rings with side chains, drawn ball-and-stick."""
    verts, bonds = {}, set()

    def key(p):
        return (round(p[0], 3), round(p[1], 3))

    ca, sa = math.cos(angle), math.sin(angle)
    for ring_cx in (-s * math.sqrt(3) / 2, s * math.sqrt(3) / 2):
        ring = []
        for k in range(6):
            t = math.radians(30 + 60 * k)
            x, y = ring_cx + s * math.cos(t), s * math.sin(t)
            p = (cx + x * ca - y * sa, cy + x * sa + y * ca)
            verts[key(p)] = p
            ring.append(key(p))
        for k in range(6):
            bonds.add(tuple(sorted((ring[k], ring[(k + 1) % 6]))))
    for a, b in bonds:
        art.line(layer, [verts[a], verts[b]], alpha * 0.8, 0.14)
    ends = sorted(verts.values(), key=lambda p: (p[1], p[0]))
    for p in (ends[0], ends[-1], max(verts.values()), min(verts.values())):
        dx, dy = p[0] - cx, p[1] - cy
        n = math.hypot(dx, dy) or 1
        q = (p[0] + dx / n * s, p[1] + dy / n * s)
        art.line(layer, [p, q], alpha * 0.7, 0.12)
        art.dot(layer, q[0], q[1], s * 0.22, alpha * 0.8)
    for p in verts.values():
        art.dot(layer, p[0], p[1], s * 0.16, alpha)


def particles(art, alpha):
    rng = np.random.default_rng(11)
    for _ in range(260):  # microscope-style cells
        x, y, r = rng.uniform(4, 396), rng.uniform(4, 296), rng.uniform(0.4, 1.6)
        a = alpha * rng.uniform(0.35, 1.0)
        art.dot("green", x, y, r, a, outline_cm=0.07)
        if rng.random() < 0.6:
            art.dot("green", x + r * 0.2, y - r * 0.1, r * 0.25, a)
    for _ in range(160):  # tiny gold motes
        x, y = rng.uniform(4, 396), rng.uniform(4, 296)
        art.dot("gold", x, y, rng.uniform(0.08, 0.3), alpha * rng.uniform(0.6, 1.4))


def apply_art(canvas, art):
    for layer, color, glow_color, strength in ((art.gold, GOLD, GOLD_GLOW, 0.9),
                                               (art.green, EMERALD, EMERALD_GLOW, 1.1)):
        small = layer.resize((W // 8, H // 8), Image.BOX).filter(ImageFilter.GaussianBlur(px(1.2) / 8))
        glow = small.point(lambda v: min(255, int(v * 2.2 * strength))).resize((W, H), Image.BICUBIC)
        canvas.paste(glow_color, (0, 0), glow.point(lambda v: v // 2))
        canvas.paste(color, (0, 0), layer.filter(ImageFilter.GaussianBlur(max(0.6, px(0.03)))))


# ------------------------------------------------------------------- photos

def crop_to_cell(img, focus, zoom, cw, ch):
    """Crop img to the cell aspect ratio, placing the face near the top third."""
    iw, ih = img.size
    aspect = cw / ch
    if iw / ih > aspect:
        h = ih
        w = h * aspect
    else:
        w = iw
        h = w / aspect
    w, h = w * zoom, h * zoom
    fx, fy = focus[0] * iw, focus[1] * ih
    x0 = min(max(fx - w / 2, 0), iw - w)
    y0 = min(max(fy - FACE_Y_IN_CELL * h, 0), ih - h)
    return img.resize((cw, ch), Image.LANCZOS, box=(x0, y0, x0 + w, y0 + h))


def feather_mask(cw, ch):
    """Soft gradient mask: feathered sides and top, long fade to black at the bottom."""
    x = np.linspace(0, 1, cw, dtype=np.float32)
    y = np.linspace(0, 1, ch, dtype=np.float32)
    side = smoothstep(x / 0.27) * smoothstep((1 - x) / 0.27)
    top = smoothstep(y / 0.16)
    bottom = smoothstep((1 - y) / 0.52) ** 1.4
    m = np.outer(top * bottom, side)
    return Image.fromarray((m * 255).astype(np.uint8), "L")


def place_photos(canvas):
    cw, ch = round(px(CELL_W_CM)), round(px(CELL_H_CM))
    mask = feather_mask(cw, ch)
    for r, row in enumerate(ROWS):
        top = round(px(ROW_TOP_CM[r]))
        for i, name in enumerate(row):
            focus, zoom, pre = PHOTOS[name]
            img = ImageOps.exif_transpose(Image.open(os.path.join(HERE, "photos", f"{name}.jpg"))).convert("RGB")
            if pre:
                img = img.crop(pre)
            tile = crop_to_cell(img, focus, zoom, cw, ch)
            cx = px(SAFE_CM + (i + 0.5) * SLOT_W_CM)
            canvas.paste(tile, (round(cx - cw / 2), top), mask)


# -------------------------------------------------------------------- title

def title_mask():
    font = ImageFont.truetype(os.path.join(HERE, "fonts", "Cinzel.ttf"), round(px(TITLE_SIZE_CM)))
    try:
        font.set_variation_by_name("Bold")
    except Exception:
        pass
    text = TITLE.upper()
    tracking = round(px(1.1))
    widths = [font.getlength(c) for c in text]
    total = sum(widths) + tracking * (len(text) - 1)
    asc, desc = font.getmetrics()
    m = Image.new("L", (int(total + px(4)), int(asc + desc + px(4))), 0)
    d = ImageDraw.Draw(m)
    x = px(2)
    for c, w in zip(text, widths):
        d.text((x, px(2)), c, font=font, fill=255)
        x += w + tracking
    m = m.crop(m.getbbox())
    pos = (round(W / 2 - m.width / 2), round(px(TITLE_Y_CM) - m.height / 2))
    return m, pos


def metallic_fill(w, h):
    stops = [(0.0, (255, 243, 200)), (0.42, (230, 188, 98)), (0.52, (168, 118, 42)),
             (0.78, (222, 178, 88)), (1.0, (250, 226, 156))]
    t = np.linspace(0, 1, h)
    cols = np.stack([np.interp(t, [s for s, _ in stops], [c[k] for _, c in stops]) for k in range(3)], 1)
    return Image.fromarray(np.repeat(cols[:, None, :], w, 1).astype(np.uint8), "RGB")


def draw_title(canvas, m, pos):
    pad = round(px(8))
    big = Image.new("L", (m.width + 2 * pad, m.height + 2 * pad), 0)
    big.paste(m, (pad, pad))
    bx, by = pos[0] - pad, pos[1] - pad

    # ambient halo
    halo = big.filter(ImageFilter.GaussianBlur(px(2.8))).point(lambda v: int(v * 0.55))
    canvas.paste(GOLD_GLOW, (bx, by), halo)
    # soft drop shadow
    shadow = Image.new("L", big.size, 0)
    shadow.paste(big, (0, round(px(0.9))))
    canvas.paste((0, 0, 0), (bx, by), shadow.filter(ImageFilter.GaussianBlur(px(0.5))).point(lambda v: int(v * 0.85)))
    # extrusion for a light 3D effect
    depth = max(2, round(px(0.55)))
    for k in range(depth, 0, -1):
        f = k / depth
        col = tuple(int(a * (1 - f) + b * f) for a, b in zip((150, 104, 38), (70, 45, 14)))
        canvas.paste(col, (pos[0] + round(k * 0.35), pos[1] + k), m)
    # metallic face
    canvas.paste(metallic_fill(m.width, m.height), pos, m)
    # bevel highlight along the upper edges of each letter
    shifted = Image.new("L", m.size, 0)
    shifted.paste(m, (0, max(1, round(px(0.12)))))
    edge = np.clip(np.asarray(m, np.int16) - np.asarray(shifted, np.int16), 0, 255).astype(np.uint8)
    edge = Image.fromarray(edge, "L").filter(ImageFilter.GaussianBlur(max(0.5, px(0.04))))
    canvas.paste((255, 250, 228), pos, edge.point(lambda v: int(v * 0.8)))


# --------------------------------------------------------------------- main

def main():
    canvas = background()
    m, pos = title_mask()
    tl, tr = pos[0] / CM, (pos[0] + m.width) / CM

    art = Art()
    particles(art, 38)
    animal_cell(art, 26, 26, 15, 80)
    plant_cell(art, 373, 26, 34, 24, 80)
    molecule(art, "gold", 60, 45, 1.6, 70, 0.3)
    molecule(art, "gold", 340, 45, 1.6, 70, -0.3)
    dna(art, "gold", 46, tl - 4, TITLE_Y_CM, 2.0, 13, 150, fade="left")
    dna(art, "gold", tr + 4, 354, TITLE_Y_CM, 2.0, 13, 150, fade="right")
    dna(art, "green", 20, 380, 296, 1.5, 12, 70, fade="both", width=0.16)
    apply_art(canvas, art)
    del art

    place_photos(canvas)
    draw_title(canvas, m, pos)

    base = os.path.join(HERE, f"biological_sciences_400x300cm_{DPI}dpi")
    canvas.save(base + ".jpg", "JPEG", quality=95, dpi=(DPI, DPI), subsampling=0)
    canvas.save(base + ".pdf", "PDF", resolution=DPI, quality=95)
    prev = canvas.copy()
    prev.thumbnail((2400, 1800), Image.LANCZOS)
    prev.save(os.path.join(HERE, "preview.jpg"), quality=88)
    print(base, canvas.size)


if __name__ == "__main__":
    main()
