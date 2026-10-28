"""Build the "Biological Sciences" photo banner (400 cm wide x 300 cm high).

Usage: python3 make_banner.py [DPI]   (default 100 DPI -> 15748 x 11811 px)
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
DPI = int(sys.argv[1]) if len(sys.argv) > 1 else 100
CM = DPI / 2.54  # pixels per centimetre

W_CM, H_CM = 400, 300
W, H = round(W_CM * CM), round(H_CM * CM)

TITLE = "Biological Sciences"
GOLD_LIGHT = np.array([250, 228, 160], dtype=np.float32)
GOLD_DARK = np.array([196, 150, 62], dtype=np.float32)

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
SLOT_W_CM = W_CM / PER_ROW
CELL_W_CM = SLOT_W_CM * 1.18  # neighbouring photos overlap so faded edges melt together
CELL_H_CM = 128
ROW_TOP_CM = [50, 167]
FACE_Y_IN_CELL = 0.27


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


def smoothstep(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def fade_mask(cw, ch):
    """Alpha mask: soft sides, a light fade at the top, a long fade to black at the bottom."""
    x = np.linspace(0, 1, cw, dtype=np.float32)
    y = np.linspace(0, 1, ch, dtype=np.float32)
    side = smoothstep(x / 0.16) * smoothstep((1 - x) / 0.16)
    top = smoothstep(y / 0.10)
    bottom = smoothstep((1 - y) / 0.50) ** 1.5
    m = np.outer(top * bottom, side)
    return Image.fromarray((m * 255).astype(np.uint8), "L")


def draw_title(canvas):
    font = ImageFont.truetype(os.path.join(HERE, "fonts", "Cinzel.ttf"), round(15 * CM))
    try:
        font.set_variation_by_name("Bold")
    except Exception:
        pass
    text = TITLE.upper()
    tracking = round(1.2 * CM)
    widths = [font.getlength(ch) for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    asc, desc = font.getmetrics()
    cx, cy = W / 2, 26 * CM

    tw, th = int(total + 4 * CM), int(asc + desc + 4 * CM)
    ox, oy = 2 * CM, 2 * CM
    mask = Image.new("L", (tw, th), 0)
    d = ImageDraw.Draw(mask)
    x = ox
    for ch, cw in zip(text, widths):
        d.text((x, oy), ch, font=font, fill=255)
        x += cw + tracking
    bbox = mask.getbbox()
    mask = mask.crop(bbox)
    mw, mh = mask.size
    px, py = round(cx - mw / 2), round(cy - mh / 2)

    # soft golden glow behind the letters
    glow = Image.new("L", (mw + 2 * round(6 * CM), mh + 2 * round(6 * CM)), 0)
    glow.paste(mask, (round(6 * CM), round(6 * CM)))
    glow = glow.filter(ImageFilter.GaussianBlur(2.5 * CM)).point(lambda v: int(v * 0.55))
    glow_col = Image.new("RGB", glow.size, tuple(int(c) for c in GOLD_DARK))
    canvas.paste(glow_col, (px - round(6 * CM), py - round(6 * CM)), glow)

    # vertical gold gradient fill
    t = np.linspace(0, 1, mh, dtype=np.float32)[:, None]
    band = np.where(t < 0.5, GOLD_LIGHT * (1 - t * 0.6) + GOLD_DARK * t * 0.6,
                    GOLD_LIGHT * 0.7 * (1 - t) + GOLD_DARK * (0.3 + 0.7 * t))
    grad = np.repeat(band[:, None, :], mw, axis=1).clip(0, 255).astype(np.uint8)
    canvas.paste(Image.fromarray(grad, "RGB"), (px, py), mask)

    # thin ornamental rules either side of the title, fading outwards
    line_h = max(2, round(0.35 * CM))
    gap, length = 6 * CM, 70 * CM
    lx = np.linspace(0, 1, round(length), dtype=np.float32)
    for side in (-1, 1):
        a = smoothstep(lx / 0.9) if side == -1 else smoothstep((1 - lx) / 0.9)
        alpha = Image.fromarray((np.repeat(a[None, :], line_h, axis=0) * 255).astype(np.uint8), "L")
        col = Image.new("RGB", alpha.size, tuple(int(c) for c in GOLD_DARK))
        x0 = px - gap - length if side == -1 else px + mw + gap
        canvas.paste(col, (round(x0), round(cy - line_h / 2)), alpha)
        # small diamond at the inner end of each rule
        r = round(1.1 * CM)
        dx = px - gap + 2 * r if side == -1 else px + mw + gap - 2 * r
        ImageDraw.Draw(canvas).polygon(
            [(dx, cy - r), (dx + r, cy), (dx, cy + r), (dx - r, cy)],
            fill=tuple(int(c) for c in GOLD_LIGHT))


def main():
    canvas = Image.new("RGB", (W, H), (0, 0, 0))
    cw, ch = round(CELL_W_CM * CM), round(CELL_H_CM * CM)
    mask = fade_mask(cw, ch)

    for r, row in enumerate(ROWS):
        top = round(ROW_TOP_CM[r] * CM)
        for i, name in enumerate(row):
            focus, zoom, pre = PHOTOS[name]
            img = ImageOps.exif_transpose(Image.open(os.path.join(HERE, "photos", f"{name}.jpg"))).convert("RGB")
            if pre:
                img = img.crop(pre)
            tile = crop_to_cell(img, focus, zoom, cw, ch)
            cx = (i + 0.5) * SLOT_W_CM * CM
            canvas.paste(tile, (round(cx - cw / 2), top), mask)

    draw_title(canvas)

    out = os.path.join(HERE, f"biological_sciences_400x300cm_{DPI}dpi.jpg")
    canvas.save(out, "JPEG", quality=92, dpi=(DPI, DPI), subsampling=0)
    print(out, canvas.size)


if __name__ == "__main__":
    main()
