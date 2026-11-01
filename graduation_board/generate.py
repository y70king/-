#!/usr/bin/env python3
"""Graduation board generator (دفعة اكاسيد النخبة).

All coordinates are in millimetres. Photo frames are exactly 100 mm wide x
150 mm tall (10 cm x 15 cm), 35 frames total.

Layout: an 11-column x 4-row grid of frames; the centre 3 columns of the top
3 rows are replaced by the large oval (11*4 - 3*3 = 35 frames).

Usage:  python3 generate.py <fonts_dir>
Outputs: board.svg, board.pdf (true size), board_preview.png
"""
import base64
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent

# ---- dimensions (mm) -------------------------------------------------------
FRAME_W, FRAME_H = 100, 150          # 10 cm wide x 15 cm tall
GAP = 10                             # space between frames
COLS, ROWS = 11, 4
OVAL_COLS = (4, 5, 6)                # centre columns
OVAL_ROWS = (0, 1, 2)                # top rows
MARGIN_X = 60
GRID_Y = 255

GRID_W = COLS * FRAME_W + (COLS - 1) * GAP     # 1200
GRID_H = ROWS * FRAME_H + (ROWS - 1) * GAP     # 630
W = GRID_W + 2 * MARGIN_X                      # 1320
H = 1110

NAVY, NAVY2, BLUE = "#0b1f5c", "#14348f", "#1e4fd0"

TITLE = "دفعة اكاسيد النخبة"
INFO = [  # right-to-left order: first item is right-most
    ("calendar", "تاريخ الحفلة", "2016-11-10"),
    ("clock", "الساعة", "5 مساءً"),
    ("pin", "الموقع", "مسرح البلاج الكبير - الروماني"),
    ("camera", "المصور", "محمد كمال"),
    ("headphones", "الديجي", "احمد ابو العيش"),
]


def font_faces(fonts_dir):
    css = []
    for weight in (700, 800, 900):
        for subset, rng in (("arabic", "U+0600-06FF, U+0750-077F, U+FB50-FDFF, U+FE70-FEFF"),
                            ("latin", "U+0000-00FF")):
            p = pathlib.Path(fonts_dir) / f"cairo-{subset}-{weight}-normal.woff2"
            b64 = base64.b64encode(p.read_bytes()).decode()
            css.append(
                f"@font-face{{font-family:'Cairo';font-weight:{weight};"
                f"src:url(data:font/woff2;base64,{b64}) format('woff2');"
                f"unicode-range:{rng};}}")
    return "\n".join(css)


def defs():
    return f"""
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#fff3b0"/><stop offset=".35" stop-color="#f2c445"/>
  <stop offset=".6" stop-color="#b8860b"/><stop offset=".8" stop-color="#f5d063"/>
  <stop offset="1" stop-color="#8a6209"/>
</linearGradient>
<linearGradient id="goldH" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#8a6209"/><stop offset=".3" stop-color="#ffe98a"/>
  <stop offset=".55" stop-color="#c9971c"/><stop offset=".8" stop-color="#ffe08a"/>
  <stop offset="1" stop-color="#8a6209"/>
</linearGradient>
<linearGradient id="goldText" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#fffbe0"/><stop offset=".45" stop-color="#ffd84a"/>
  <stop offset=".55" stop-color="#e0a412"/><stop offset="1" stop-color="#fff0a0"/>
</linearGradient>
<linearGradient id="navy" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="{NAVY2}"/><stop offset=".5" stop-color="{NAVY}"/>
  <stop offset="1" stop-color="#06123a"/>
</linearGradient>
<linearGradient id="wave" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#06123a"/><stop offset=".5" stop-color="{BLUE}"/>
  <stop offset="1" stop-color="#06123a"/>
</linearGradient>
<radialGradient id="bg" cx=".5" cy=".45" r=".75">
  <stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#fbf6e8"/>
  <stop offset="1" stop-color="#efe3c2"/>
</radialGradient>
<filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
  <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000" flood-opacity=".3"/>
</filter>
<filter id="textShadow" x="-5%" y="-5%" width="110%" height="120%">
  <feDropShadow dx="0" dy="3" stdDeviation="1.5" flood-color="#000" flood-opacity=".6"/>
</filter>
"""


def waves():
    top = f"""
<path d="M0 0 H{W} V95 C{W-150} 150 {W-300} 210 {W-420} 240 L{W-420} 236 C{W-300} 190 {W-170} 130 {W} 70 Z" fill="url(#wave)" opacity=".0"/>
<path d="M0 205 C120 180 220 210 300 245 C210 230 110 225 0 245 Z" fill="url(#wave)"/>
<path d="M0 198 C120 172 230 205 305 243" fill="none" stroke="url(#goldH)" stroke-width="5"/>
<path d="M{W} 205 C{W-120} 180 {W-220} 210 {W-300} 245 C{W-210} 230 {W-110} 225 {W} 245 Z" fill="url(#wave)"/>
<path d="M{W} 198 C{W-120} 172 {W-230} 205 {W-305} 243" fill="none" stroke="url(#goldH)" stroke-width="5"/>
"""
    by = H - 95
    bottom = f"""
<path d="M0 {by} C{W*0.25} {by-45} {W*0.75} {by-45} {W} {by} V{H} H0 Z" fill="url(#wave)"/>
<path d="M0 {by-8} C{W*0.25} {by-53} {W*0.75} {by-53} {W} {by-8}" fill="none" stroke="url(#goldH)" stroke-width="6"/>
<path d="M0 {by+30} C{W*0.3} {by-5} {W*0.7} {by-5} {W} {by+30}" fill="none" stroke="url(#goldH)" stroke-width="3" opacity=".9"/>
<path d="M0 {GRID_Y+GRID_H+20} C{W*0.2} {GRID_Y+GRID_H+5} {W*0.35} {GRID_Y+GRID_H+30} {W*0.5} {GRID_Y+GRID_H+18}
         C{W*0.65} {GRID_Y+GRID_H+30} {W*0.8} {GRID_Y+GRID_H+5} {W} {GRID_Y+GRID_H+20}"
      fill="none" stroke="url(#goldH)" stroke-width="3"/>
"""
    return top + bottom


def laurel(cx, cy, flip=False, scale=1.0):
    leaves = []
    for i in range(8):
        t = i / 7
        x = -t * 55
        y = -t * 120 + t * t * 20
        ang = -60 + t * 10
        leaves.append(f'<ellipse cx="{x-9:.1f}" cy="{y:.1f}" rx="12" ry="5" transform="rotate({ang} {x-9:.1f} {y:.1f})" fill="url(#gold)" stroke="#8a6209" stroke-width=".6"/>')
        leaves.append(f'<ellipse cx="{x+9:.1f}" cy="{y-4:.1f}" rx="12" ry="5" transform="rotate({-ang-180+60} {x+9:.1f} {y-4:.1f})" fill="url(#gold)" stroke="#8a6209" stroke-width=".6"/>')
    stem = '<path d="M0 0 Q-30 -60 -55 -100" fill="none" stroke="#a87a10" stroke-width="3"/>'
    sx = -scale if flip else scale
    return f'<g transform="translate({cx} {cy}) scale({sx} {scale})">{stem}{"".join(leaves)}</g>'


def grad_cap(cx, cy, s=1.0, flip=False):
    sx = -s if flip else s
    return f"""
<g transform="translate({cx} {cy}) scale({sx} {s})" filter="url(#shadow)">
  <g transform="rotate(25)">
    <rect x="-55" y="-14" width="110" height="28" rx="14" fill="#f8f1dc" stroke="#c7b48a" stroke-width="1.5"/>
    <ellipse cx="55" cy="0" rx="7" ry="14" fill="#efe2bd" stroke="#c7b48a"/>
    <rect x="-8" y="-15" width="16" height="30" fill="#c91f2c"/>
  </g>
  <path d="M-25 -40 L-25 -15 Q20 5 60 -15 L60 -40 Z" fill="#141414"/>
  <polygon points="-80,-55 20,-95 115,-55 20,-20" fill="#202020" stroke="#444" stroke-width="1"/>
  <circle cx="20" cy="-57" r="4" fill="url(#gold)"/>
  <path d="M20 -57 Q-40 -50 -55 -35 L-55 5" fill="none" stroke="url(#gold)" stroke-width="2.5"/>
  <path d="M-61 5 L-49 5 L-46 30 L-64 30 Z" fill="url(#gold)"/>
</g>"""


def crown(cx, cy):
    return f"""
<g transform="translate({cx} {cy})" filter="url(#shadow)">
  <path d="M-70 30 L-80 -25 L-45 5 L-25 -40 L0 0 L25 -40 L45 5 L80 -25 L70 30 Z"
        fill="url(#gold)" stroke="#7a5507" stroke-width="2"/>
  <rect x="-72" y="28" width="144" height="16" rx="4" fill="url(#gold)" stroke="#7a5507" stroke-width="2"/>
  <circle cx="-80" cy="-27" r="7" fill="url(#gold)" stroke="#7a5507"/>
  <circle cx="80" cy="-27" r="7" fill="url(#gold)" stroke="#7a5507"/>
  <circle cx="-25" cy="-42" r="7" fill="url(#gold)" stroke="#7a5507"/>
  <circle cx="25" cy="-42" r="7" fill="url(#gold)" stroke="#7a5507"/>
  <path d="M0 -14 L8 -4 L0 6 L-8 -4 Z" fill="#c91f2c"/>
  <circle cx="-38" cy="18" r="5" fill="{BLUE}"/><circle cx="38" cy="18" r="5" fill="{BLUE}"/>
  <circle cx="0" cy="18" r="6" fill="#c91f2c"/>
</g>"""


def title():
    cx, y0, y1 = W / 2, 85, 225
    hw = 450
    plaque = (f'M{cx-hw} {y0+25} Q{cx-hw-30} {(y0+y1)/2} {cx-hw} {y1-15} '
              f'Q{cx-hw/2} {y1+5} {cx} {y1-5} Q{cx+hw/2} {y1+5} {cx+hw} {y1-15} '
              f'Q{cx+hw+30} {(y0+y1)/2} {cx+hw} {y0+25} '
              f'Q{cx+hw/2} {y0+5} {cx} {y0-5} Q{cx-hw/2} {y0+5} {cx-hw} {y0+25} Z')
    return f"""
<path d="{plaque}" fill="url(#navy)" stroke="url(#goldH)" stroke-width="9" filter="url(#shadow)"/>
<path d="{plaque}" fill="none" stroke="#ffe9a0" stroke-width="1.5" transform="translate({cx} {(y0+y1)/2}) scale(.97 .9) translate({-cx} {-(y0+y1)/2})"/>
<text x="{cx}" y="{(y0+y1)/2 + 30}" text-anchor="middle" direction="rtl" font-family="Cairo" font-weight="900"
      font-size="86" fill="url(#goldText)" stroke="#6b4a05" stroke-width="1.6" paint-order="stroke"
      filter="url(#textShadow)">{TITLE}</text>
{crown(cx, 45)}"""


def frames():
    out = []
    for r in range(ROWS):
        for c in range(COLS):
            if c in OVAL_COLS and r in OVAL_ROWS:
                continue
            x = MARGIN_X + c * (FRAME_W + GAP)
            y = GRID_Y + r * (FRAME_H + GAP)
            out.append(
                f'<g class="frame"><rect x="{x}" y="{y}" width="{FRAME_W}" height="{FRAME_H}" rx="4" '
                f'fill="url(#goldH)" filter="url(#shadow)"/>'
                f'<rect x="{x+3.5}" y="{y+3.5}" width="{FRAME_W-7}" height="{FRAME_H-7}" rx="2.5" fill="{NAVY}"/>'
                f'<rect x="{x+6}" y="{y+6}" width="{FRAME_W-12}" height="{FRAME_H-12}" rx="1.5" fill="#fff"/></g>')
    return "\n".join(out), len(out)


def oval():
    x0 = MARGIN_X + OVAL_COLS[0] * (FRAME_W + GAP)
    x1 = MARGIN_X + OVAL_COLS[-1] * (FRAME_W + GAP) + FRAME_W
    y0 = GRID_Y
    y1 = GRID_Y + OVAL_ROWS[-1] * (FRAME_H + GAP) + FRAME_H
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2 - 8
    rx, ry = (x1 - x0) / 2 - 22, (y1 - y0) / 2 - 30
    scroll = f"""
<g transform="translate({cx} {cy+ry+8})">
  <path d="M0 -8 C-20 10 -60 0 -90 -25 C-70 -5 -40 8 -20 12 C-60 20 -100 5 -125 -15 C-95 25 -40 30 0 18
           C40 30 95 25 125 -15 C100 5 60 20 20 12 C40 8 70 -5 90 -25 C60 0 20 10 0 -8 Z"
        fill="url(#gold)" stroke="#7a5507" stroke-width="1.2"/>
  <path d="M0 -14 L10 6 L0 30 L-10 6 Z" fill="url(#gold)" stroke="#7a5507" stroke-width="1.2"/>
</g>"""
    return f"""
<ellipse cx="{cx}" cy="{cy}" rx="{rx+12}" ry="{ry+12}" fill="url(#goldH)" filter="url(#shadow)"/>
<ellipse cx="{cx}" cy="{cy}" rx="{rx+5}" ry="{ry+5}" fill="#fff6d0"/>
<ellipse cx="{cx}" cy="{cy}" rx="{rx+3}" ry="{ry+3}" fill="url(#gold)"/>
<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#fff"/>
{scroll}"""


def icon(kind, cx, cy):
    s = f'transform="translate({cx} {cy})"'
    if kind == "calendar":
        cells = "".join(f'<rect x="{-17+i*12}" y="{-4+j*10}" width="8" height="7" fill="#555"/>'
                        for i in range(3) for j in range(2))
        return (f'<g {s}><rect x="-24" y="-22" width="48" height="46" rx="5" fill="#fff" stroke="#999"/>'
                f'<rect x="-24" y="-22" width="48" height="13" rx="5" fill="#d42a2a"/>'
                f'<rect x="-14" y="-28" width="5" height="12" rx="2" fill="#666"/><rect x="9" y="-28" width="5" height="12" rx="2" fill="#666"/>'
                f'{cells}</g>')
    if kind == "clock":
        ticks = "".join(f'<line x1="0" y1="-20" x2="0" y2="-16" stroke="#333" stroke-width="2" transform="rotate({a})"/>'
                        for a in range(0, 360, 30))
        return (f'<g {s}><circle r="26" fill="url(#gold)"/><circle r="22" fill="#fff"/>{ticks}'
                f'<line x1="0" y1="0" x2="0" y2="-15" stroke="#111" stroke-width="2.5"/>'
                f'<line x1="0" y1="0" x2="9" y2="10" stroke="#111" stroke-width="2.5"/><circle r="2.5" fill="#111"/></g>')
    if kind == "pin":
        return (f'<g {s}><path d="M-26 8 L-8 0 L8 8 L26 0 V24 L8 32 L-8 24 L-26 32 Z" fill="#7fc4e8" stroke="#3a7ca5"/>'
                f'<path d="M-8 0 V24 M8 8 V32" stroke="#3a7ca5"/>'
                f'<path d="M0 18 C-6 6 -16 -2 -16 -12 A16 16 0 0 1 16 -12 C16 -2 6 6 0 18 Z" fill="#e23b3b" stroke="#8c1b1b"/>'
                f'<circle cx="0" cy="-12" r="6" fill="#fff"/></g>')
    if kind == "camera":
        return (f'<g {s}><rect x="-30" y="-14" width="60" height="38" rx="6" fill="#222"/>'
                f'<rect x="-12" y="-22" width="24" height="10" rx="3" fill="#333"/>'
                f'<circle cy="6" r="15" fill="#444" stroke="#888" stroke-width="2"/><circle cy="6" r="8" fill="#123"/>'
                f'<circle cx="-3" cy="3" r="2.5" fill="#9cf"/><rect x="18" y="-9" width="7" height="4" fill="#e33"/></g>')
    if kind == "headphones":
        return (f'<g {s}><path d="M-22 10 V0 A22 22 0 0 1 22 0 V10" fill="none" stroke="#333" stroke-width="6"/>'
                f'<rect x="-28" y="2" width="14" height="26" rx="6" fill="#222" stroke="#888"/>'
                f'<rect x="14" y="2" width="14" height="26" rx="6" fill="#222" stroke="#888"/></g>')
    return ""


def info_bar():
    n = len(INFO)
    gap = 15
    y0 = GRID_Y + GRID_H + 40
    h = 95
    widths = [205, 170, 360, 225, 265]
    total = sum(widths) + gap * (n - 1)
    x = W - (W - total) / 2  # start at right edge (RTL)
    out = []
    for (kind, label, value), w in zip(INFO, widths):
        x0 = x - w
        out.append(
            f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" rx="{h/2}" fill="url(#navy)" '
            f'stroke="url(#goldH)" stroke-width="6" filter="url(#shadow)"/>'
            f'{icon(kind, x0 + w - 48, y0 + h/2)}'
            f'<text x="{x0 + 18 + (w-98)/2}" y="{y0 + 38}" text-anchor="middle" direction="rtl" font-family="Cairo" '
            f'font-weight="800" font-size="22" fill="#fff">{label}</text>'
            f'<text x="{x0 + 18 + (w-98)/2}" y="{y0 + 75}" text-anchor="middle" direction="rtl" font-family="Cairo" '
            f'font-weight="800" font-size="{18 if len(value) > 20 else 22}" fill="#ffd84a">{value}</text>')
        x = x0 - gap
    return "\n".join(out)


def build(fonts_dir):
    frames_svg, count = frames()
    assert count == 35, count
    svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{W}mm" height="{H}mm" viewBox="0 0 {W} {H}">
<style>{font_faces(fonts_dir)}</style>
<defs>{defs()}</defs>
<rect width="{W}" height="{H}" fill="url(#bg)"/>
{waves()}
{laurel(95, 215)}{laurel(W-95, 215, flip=True)}
{grad_cap(175, 135, 1.1)}{grad_cap(W-175, 135, 1.1, flip=True)}
{title()}
{oval()}
{frames_svg}
{info_bar()}
</svg>"""
    (HERE / "board.svg").write_text(svg, encoding="utf-8")
    print(f"board: {W/10:.0f} x {H/10:.0f} cm, frames: {count} @ {FRAME_W/10:.0f}x{FRAME_H/10:.0f} cm")


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else HERE / "fonts")
