# Generates the extension icons (dark tile with a gold coin stack).
import sys
from pathlib import Path
from PIL import Image, ImageDraw

out = Path(sys.argv[1] if len(sys.argv) > 1 else "extension/icons")
out.mkdir(parents=True, exist_ok=True)
S = 512
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([8, 8, S - 8, S - 8], radius=96, fill=(18, 15, 10, 255), outline=(167, 132, 74, 255), width=18)

def stack(cx, base_y, n, rx, ry, h):
    for i in range(n):
        y = base_y - i * h
        d.ellipse([cx - rx, y + h - 2 * ry, cx + rx, y + h], fill=(150, 112, 48, 255), outline=(96, 68, 26, 255), width=6)
        d.rectangle([cx - rx + 3, y - ry, cx + rx - 3, y + h - ry], fill=(150, 112, 48, 255))
        d.line([cx - rx + 3, y - ry, cx - rx + 3, y + h - ry], fill=(96, 68, 26, 255), width=6)
        d.line([cx + rx - 3, y - ry, cx + rx - 3, y + h - ry], fill=(96, 68, 26, 255), width=6)
        d.ellipse([cx - rx, y - 2 * ry, cx + rx, y], fill=(236, 196, 110, 255), outline=(120, 86, 34, 255), width=6)

stack(196, 380, 5, 96, 30, 34)
stack(326, 410, 3, 96, 30, 34)
for size in (16, 32, 48, 128):
    img.resize((size, size), Image.LANCZOS).save(out / f"icon-{size}.png")
print("icons written to", out)
