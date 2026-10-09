"""Build dotindot brand assets (SVG + PNG) from the traced wordmark and the geometric D mark."""
import json
import re
import cairosvg
from PIL import Image

ORANGE_MARK = "#FF831F"      # sampled from the supplied logo (flat)
WM_FROM, WM_TO = "#FE7A18", "#FFAD42"   # wordmark gradient, left → right
WM_DOT = "#FE7B1B"


def path_of(svg_file):
    s = open(svg_file).read()
    return " ".join(re.findall(r'<path d="([^"]+)"', s, re.S)).replace("\n", " ")


S = 8
LETTERS = path_of("wm_letters.svg")
DOT = path_of("wm_dot.svg")
# potrace units → crop pixels; then shift so the tight bbox starts at 0,0 (crop bbox x 4..400, y 5..81)
BX, BY, BW, BH = 4, 5, 396, 76
WM_TRANSFORM = f"matrix({0.1 / S},0,0,{-0.1 / S},{-BX},{86 - BY})"

MARK_W, MARK_H = 140.5, 179
MARK_PATH = "M0 0H50.5A89.5 89.5 0 0 1 50.5 179H0Z M88.5 89.5A36 36 0 1 0 16.5 89.5A36 36 0 1 0 88.5 89.5Z"


def wordmark_svg(white=False, uid="wm"):
    fill_l = "#FFFFFF" if white else f"url(#{uid}-g)"
    fill_d = "#FFFFFF" if white else WM_DOT
    defs = "" if white else (f'<defs><linearGradient id="{uid}-g" x1="0" y1="0" x2="1" y2="0">'
                             f'<stop offset="0" stop-color="{WM_FROM}"/><stop offset="1" stop-color="{WM_TO}"/></linearGradient></defs>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {BW} {BH}" width="{BW}" height="{BH}">{defs}'
            f'<g transform="{WM_TRANSFORM}"><path fill="{fill_l}" d="{LETTERS}"/><path fill="{fill_d}" d="{DOT}"/></g></svg>')


def mark_svg(white=False, pad=0, bg=None, size=None):
    w, h = MARK_W + 2 * pad, MARK_H + 2 * pad
    rect = f'<rect width="{w}" height="{h}" rx="{w * 0.22}" fill="{bg}"/>' if bg else ""
    wh = f' width="{size}" height="{size * h / w}"' if size else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}"{wh}>{rect}'
            f'<path transform="translate({pad},{pad})" fill-rule="evenodd" fill="{"#FFFFFF" if white else ORANGE_MARK}" d="{MARK_PATH}"/></svg>')


def square_icon_svg(bg="#FFFFFF", white=False, scale=0.62):
    """Square app icon: mark centred on a background (for favicons / home-screen icons)."""
    side = 512
    mh = side * scale
    mw = mh * MARK_W / MARK_H
    x, y = (side - mw) / 2, (side - mh) / 2
    k = mh / MARK_H
    fill = "#FFFFFF" if white else ORANGE_MARK
    bgel = f'<rect width="{side}" height="{side}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {side} {side}">{bgel}'
            f'<path transform="translate({x:.2f},{y:.2f}) scale({k:.4f})" fill-rule="evenodd" fill="{fill}" d="{MARK_PATH}"/></svg>')


def stacked_svg(white=False, uid="st"):
    # supplied lockup: mark centred above the wordmark, 24px gap at wordmark width 396
    gap = 24
    w = BW
    mx = (w - MARK_W) / 2
    h = MARK_H + gap + BH
    wm = wordmark_svg(white, uid).split(">", 1)[1].rsplit("</svg>", 1)[0]
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">'
            f'<path transform="translate({mx},0)" fill-rule="evenodd" fill="{"#FFFFFF" if white else ORANGE_MARK}" d="{MARK_PATH}"/>'
            f'<g transform="translate(0,{MARK_H + gap})">{wm}</g></svg>')


if __name__ == "__main__":
    out = {
        "wordmark-color.svg": wordmark_svg(False, "wmc"), "wordmark-white.svg": wordmark_svg(True, "wmw"),
        "mark-color.svg": mark_svg(False), "mark-white.svg": mark_svg(True),
        "stacked-color.svg": stacked_svg(False, "stc"), "stacked-white.svg": stacked_svg(True, "stw"),
        "favicon.svg": square_icon_svg(bg=None, scale=0.92),
        "app-icon.svg": square_icon_svg(bg="#FFFFFF", scale=0.6),
    }
    for name, svg in out.items():
        open(name, "w").write(svg)
    # PNG renders (transparent backgrounds) for PDFs / Excel / home-screen icons
    cairosvg.svg2png(bytestring=out["wordmark-color.svg"].encode(), write_to="wordmark-color.png", output_width=1600)
    cairosvg.svg2png(bytestring=out["wordmark-white.svg"].encode(), write_to="wordmark-white.png", output_width=1600)
    cairosvg.svg2png(bytestring=out["mark-color.svg"].encode(), write_to="mark-color.png", output_width=600)
    cairosvg.svg2png(bytestring=out["mark-white.svg"].encode(), write_to="mark-white.png", output_width=600)
    cairosvg.svg2png(bytestring=out["stacked-color.svg"].encode(), write_to="stacked-color.png", output_width=1200)
    for px in (180, 192, 512):
        cairosvg.svg2png(bytestring=out["app-icon.svg"].encode(), write_to=f"icon-{px}.png", output_width=px, output_height=px)
    cairosvg.svg2png(bytestring=out["favicon.svg"].encode(), write_to="favicon-32.png", output_width=32, output_height=32)
    Image.open("favicon-32.png").save("favicon.ico", sizes=[(16, 16), (32, 32)])
    json.dump({"letters": LETTERS, "dot": DOT, "wm_transform": WM_TRANSFORM, "wm_w": BW, "wm_h": BH,
               "mark": MARK_PATH, "mark_w": MARK_W, "mark_h": MARK_H}, open("brand.json", "w"))
    print("ok")
