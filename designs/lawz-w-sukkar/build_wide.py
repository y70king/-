"""Re-lay the original 1600x533 design onto a 6:1 (900x150 cm) canvas.

Every visible element is cut from the original image (upscaled x4 with
Real-ESRGAN) and repositioned; nothing is redrawn. Units below are pixels
of the original image; the canvas is 3198x533 of those (exactly 6:1).
"""
import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else "img/ref-x4.png"
SW, SH = 1600, 533          # original image size
CW = 3198                   # canvas width in original-pixel units
K = 300 / SH                # CSS px per original pixel (canvas is 1800x300 CSS)

# (name, src x, y, w, h, dst x, y, scale, feather l r t b in %, z)
PIECES = [
    ("left-col",   0,   0, 300, 533,    0,   0, 1.00, (0, 22, 0, 0), 3),
    ("right-col", 1300,  0, 300, 533, 2898,  0, 1.00, (22, 0, 0, 0), 3),
    ("pizza",     170, 352, 375, 128,  262, 214, 2.05, (12, 10, 16, 6), 2),
    ("manakish",  548, 352, 242,  95,  330,  28, 2.10, (14, 14, 18, 16), 2),
    ("olives",    788, 352, 304,  66, 2185,  66, 2.05, (10, 10, 20, 18), 2),
    ("fries",    1092, 352, 238, 138, 2400, 214, 2.10, (12, 12, 16, 6), 2),
    ("title",     292,   0, 1058, 252, 990,   0, 1.15, (5, 5, 0, 8), 4),
    ("chips",     318, 258, 985, 104, 1033, 280, 1.15, (2, 2, 6, 6), 4),
    ("phone",     512, 440, 596,  74, 1223, 404, 1.28, (3, 3, 6, 6), 5),
]


def piece(name, sx, sy, sw, sh, dx, dy, s, f, z):
    l, r, t, b = f
    w, h = sw * s * K, sh * s * K
    bw, bh = SW * s * K, SH * s * K
    return (
        f'<div class="p" data-n="{name}" style="left:{dx*K:.2f}px;top:{dy*K:.2f}px;width:{w:.2f}px;height:{h:.2f}px;'
        f"z-index:{z};background-size:{bw:.2f}px {bh:.2f}px;background-position:{-sx*s*K:.2f}px {-sy*s*K:.2f}px;"
        f'--l:{l}%;--r:{r}%;--t:{t}%;--b:{b}%"></div>'
    )


html = f"""<!doctype html>
<html><head><meta charset="utf-8"><style>
@page{{size:90cm 15cm;margin:0}}
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:1800px;height:300px;overflow:hidden;background:#0a0b0e}}
.c{{position:relative;width:1800px;height:300px;overflow:hidden;
  background:radial-gradient(ellipse 520px 200px at 50% 40%,#2b2c31,#15161a 60%,#0a0b0e)}}
.tex{{position:absolute;inset:0;opacity:.5;mix-blend-mode:screen}}
.p{{position:absolute;background-image:url({SRC});background-repeat:no-repeat;
  -webkit-mask:linear-gradient(90deg,transparent,#000 var(--l),#000 calc(100% - var(--r)),transparent),
               linear-gradient(180deg,transparent,#000 var(--t),#000 calc(100% - var(--b)),transparent);
  -webkit-mask-composite:source-in}}
svg.deco{{position:absolute;inset:0;z-index:1}}
</style></head><body><div class="c">
<svg class="tex" width="1800" height="300"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="3" seed="7"/>
<feColorMatrix values="0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .55 0 0 0 1.1 -.55"/></filter><rect width="1800" height="300" filter="url(#n)"/></svg>
<svg class="deco" viewBox="0 0 1800 300" preserveAspectRatio="none">
  <!-- yellow swooshes like the ones framing the original title -->
  <path d="M250 14 Q420 -10 560 40" stroke="#ffd400" stroke-width="7" fill="none" stroke-linecap="round"/>
  <path d="M1550 14 Q1380 -10 1240 40" stroke="#ffd400" stroke-width="7" fill="none" stroke-linecap="round"/>
  <!-- bottom band: same yellow line / red / dark red as the original edges -->
  <path d="M0 242 Q900 300 1800 238 V300 H0Z" fill="#ffd400"/>
  <path d="M0 252 Q900 310 1800 248 V300 H0Z" fill="#f50000"/>
  <path d="M0 261 Q900 318 1800 257 V300 H0Z" fill="#6b0101"/>
</svg>
{''.join(piece(*p) for p in PIECES)}
</div></body></html>"""
open("banner-wide.html", "w").write(html)
print("ok")
