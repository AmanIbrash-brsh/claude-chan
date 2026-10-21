"""Cut the white background out of chan-img/*.jpg and write aligned PNG sprites.

Usage: python3 -I scripts/prepare_sprites.py
Output: src/renderer/sprites/<name>.png
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "chan-img"
OUT = ROOT / "src" / "renderer" / "sprites"

# source file stamp -> sprite name(s). The walk sheet holds two frames side by side.
SPRITES = {
    "143359": ["idle"],
    "143442": ["tpose"],
    "143544": ["think"],
    "143657": ["walk1", "walk2"],
    "143926": ["happy"],
    "144042": ["fix_tail"],
    "144156": ["idle_tail"],
    "144203": ["happy_tail"],
    "144220": ["think_tail"],
}

KEY = (255, 0, 255)
THRESH = 22
HOLE_WHITE = 254  # channel value that counts as pure scan-background white
HOLE_CORE = 3  # a pocket must contain a solid white block this wide
HOLE_THRESH = 12  # fill tolerance (sum of channel differences) inside a pocket
SCALE = 0.62  # source sprites are ~700px tall; this gives a desktop-sized character
SHADOW_ALPHA = 0.3
SHADOW_MIN, SHADOW_MAX = (95, 80, 75), (160, 135, 130)


def cut_background(img: Image.Image, blank_below: int | None = None) -> Image.Image:
    img = img.convert("RGB")
    w, h = img.size
    if blank_below is not None:
        ImageDraw.Draw(img).rectangle((0, blank_below, w, h), fill=(255, 255, 255))
    for seed in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1)):
        if img.getpixel(seed) != KEY:
            ImageDraw.floodfill(img, seed, KEY, thresh=THRESH)
    remove_enclosed_holes(img)
    rgba = img.convert("RGBA")
    px = rgba.load()
    for y in range(h):
        for x in range(w):
            if px[x, y][:3] == KEY:
                px[x, y] = (0, 0, 0, 0)
    # Eat the light JPEG halo around the outline.
    alpha = rgba.getchannel("A").filter(ImageFilter.MinFilter(3))
    rgba.putalpha(alpha)
    return rgba


def remove_enclosed_holes(img: Image.Image) -> None:
    """Key out background pockets the edge fill cannot reach (legs, hair curls).

    The scan background is exactly (255, 255, 255) with a faint watermark pattern; clothes and
    stockings stay at 247-252. Seed from solid pure-white blocks, then fill with a tight tolerance
    so the fill stops at the outlines.
    """
    white = None
    for ch in img.split():
        band = ch.point(lambda v: 255 if v >= HOLE_WHITE else 0)
        white = band if white is None else Image.composite(white, Image.new("L", img.size, 0), band)
    core = white.filter(ImageFilter.MinFilter(HOLE_CORE)).load()
    for y in range(img.height):
        for x in range(img.width):
            if core[x, y] and img.getpixel((x, y)) != KEY:
                ImageDraw.floodfill(img, (x, y), KEY, thresh=HOLE_THRESH)


def shadow_box(img: Image.Image):
    """Bounding box of the brown ground-shadow pixels."""
    mask = Image.new("L", img.size, 0)
    src, dst = img.load(), mask.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = src[x, y]
            if a and all(lo <= c <= hi for c, lo, hi in zip((r, g, b), SHADOW_MIN, SHADOW_MAX)):
                dst[x, y] = 255
    return mask.filter(ImageFilter.MinFilter(5)).getbbox()


def soften_shadow(im: Image.Image, box) -> None:
    """Turn the opaque brown ground ellipse into a translucent black one."""
    px = im.load()
    for y in range(max(box[1] - 4, 0), min(box[3] + 4, im.height)):
        for x in range(max(box[0] - 4, 0), min(box[2] + 4, im.width)):
            r, g, b, a = px[x, y]
            warm_grey = 8 <= r - b <= 40 and abs(r - 140) < 28 and abs(g - 122) < 28
            if a and warm_grey:
                px[x, y] = (0, 0, 0, round(a * SHADOW_ALPHA))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    frames = {}
    for stamp, names in SPRITES.items():
        path = next(SRC.glob(f"*_{'2026' + '1021' + stamp}.jpg"))
        sheet = cut_background(Image.open(path), blank_below=700 if len(names) > 1 else None)
        w = sheet.width // len(names)
        for i, name in enumerate(names):
            frames[name] = sheet.crop((i * w, 0, (i + 1) * w, sheet.height))

    # Align every frame so its shadow ellipse lands on the same spot.
    anchors = {}
    for name, im in frames.items():
        box = shadow_box(im)
        anchors[name] = ((box[0] + box[2]) / 2, box[3]) if box else (im.width / 2, im.height)
        if box:
            soften_shadow(im, box)
    ref_x, ref_y = anchors["idle"]
    aligned = {}
    for name, im in frames.items():
        ax, ay = anchors[name]
        canvas = Image.new("RGBA", (1600, 900), (0, 0, 0, 0))
        canvas.paste(im, (int(ref_x - ax + 400), int(ref_y - ay + 80)), im)
        aligned[name] = canvas

    # Union bounding box keeps all frames the same size and aligned.
    union = None
    for im in aligned.values():
        box = im.getbbox()
        union = box if union is None else (
            min(union[0], box[0]), min(union[1], box[1]), max(union[2], box[2]), max(union[3], box[3]))
    pad = 6
    union = (union[0] - pad, union[1] - pad, union[2] + pad, union[3] + pad)

    for name, im in aligned.items():
        out = im.crop(union)
        out = out.resize((round(out.width * SCALE), round(out.height * SCALE)), Image.LANCZOS)
        out.save(OUT / f"{name}.png")
        print(name, out.size)


if __name__ == "__main__":
    main()
