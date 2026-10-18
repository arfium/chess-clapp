#!/usr/bin/env python3
"""Derive the clapp's banner from a real picture: supplied, never drawn.

    python3 scripts/banner.py

`assets/source/banner.json` names the picture, says how the 215:32 band is cut out of it, and
whose it is. The banner is derived; that file and the picture are the truth. The bounds are
clappkit's (docs/format.md, docs/icons.md section 3): 3440 x 512, under 2 MiB, and the left 40%
belongs to the launcher, which darkens it and writes the app's name there - so a subject that
would sit under the name is set at the right instead ("fit": "right").

    "fit": "band"   a full-width band, its top at `top` of the picture's height; `left` and
                    `width` (fractions) narrow it when the picture has a border to lose
    "fit": "right"  the whole picture at the band's height, set `margin` from the right edge,
                    the rest filled with the colour of its own left edge

JPEG, because a photograph as PNG at this size is over the 2 MiB ceiling; the launcher reads the
format from the bytes, and `banner` in clatch.json names the .jpg. The same file in every clapp.
"""
import json
import sys
from pathlib import Path

from PIL import Image

LIMIT = 2 << 20  # clappkit docs/format.md: a banner is at most 2 MiB


def root() -> Path:
    for d in Path(__file__).resolve().parents:
        if (d / "clatch.json").is_file():
            return d
    sys.exit("banner: no clatch.json above this script")


def band(pic: Image.Image, spec: dict) -> Image.Image:
    left, frac = spec.get("left", 0.0), spec.get("width", 1.0)
    w = round(pic.width * frac)
    h = round(w * 32 / 215)
    x = round(pic.width * left)
    y = min(round(pic.height * spec.get("top", (1 - h / pic.height) / 2)), pic.height - h)
    return pic.crop((x, y, x + w, y + h)).resize((3440, 512), Image.LANCZOS)


def right(pic: Image.Image, spec: dict) -> Image.Image:
    s = 512 / pic.height
    pic = pic.resize((round(pic.width * s), 512), Image.LANCZOS)
    edge = pic.crop((0, 0, 8, 512)).resize((1, 1), Image.LANCZOS).getpixel((0, 0))
    out = Image.new("RGB", (3440, 512), edge)
    seam = Image.new("L", pic.size, 255)  # the picture's left edge fades into its own ground
    for i in range(160):
        seam.paste(round(255 * i / 160), (i, 0, i + 1, 512))
    out.paste(pic, (3440 - pic.width - round(3440 * spec.get("margin", 0.04)), 0), seam)
    return out


def main() -> None:
    top = root()
    spec = json.loads((top / "assets/source/banner.json").read_text())
    pic = Image.open(top / spec["source"]).convert("RGB")
    out = (right if spec.get("fit") == "right" else band)(pic, spec)
    dest = top / json.loads((top / "clatch.json").read_text())["banner"]
    for quality in (90, 86, 82, 78):
        out.save(dest, "JPEG", quality=quality, optimize=True, progressive=True)
        if dest.stat().st_size <= LIMIT:
            break
    else:
        sys.exit(f"banner: {dest} is over 2 MiB even at quality {quality}")
    print(f"banner: {dest.relative_to(top)} 3440x512, {dest.stat().st_size // 1024} KiB, q{quality}")


if __name__ == "__main__":
    main()
