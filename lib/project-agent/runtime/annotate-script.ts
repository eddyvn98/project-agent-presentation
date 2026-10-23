/** annotate.py: draws numbered markers or boxes on a photo, with a legend strip, so an answer can point at the user's own pictures. Pillow only. */
export const ANNOTATE_SCRIPT = String.raw`#!/usr/bin/env python3
# Mark up a photo: numbered markers and boxes placed by percent of width and height, plus a legend strip under the picture.
import argparse, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

COLORS = [(220, 38, 38), (234, 88, 12), (37, 99, 235), (22, 163, 74), (147, 51, 234), (8, 145, 178)]

def font(size):
    for query in ("Noto Sans:bold", "DejaVu Sans:bold", "sans-serif:bold"):
        try:
            path = subprocess.run(["fc-match", "-f", "%{file}", query], capture_output=True, text=True, timeout=5).stdout.strip()
            if path: return ImageFont.truetype(path, size)
        except Exception:
            pass
    return ImageFont.load_default()

def percent(value, total):
    return max(0.0, min(100.0, float(value))) / 100.0 * total

def parse(spec, count):
    head, _, label = spec.partition("|")
    nums = [part.strip() for part in head.split(",")]
    if len(nums) != count: sys.exit("Expected %d numbers before | in: %s" % (count, spec))
    return [float(n) for n in nums], label.strip()

def draw_grid(image):
    draw = ImageDraw.Draw(image, "RGBA")
    small = font(max(12, image.width // 70))
    for step in range(10, 100, 10):
        x, y = percent(step, image.width), percent(step, image.height)
        draw.line([(x, 0), (x, image.height)], fill=(255, 255, 255, 140), width=1)
        draw.line([(0, y), (image.width, y)], fill=(255, 255, 255, 140), width=1)
        draw.text((x + 2, 2), str(step), fill=(255, 255, 0, 255), font=small, stroke_width=2, stroke_fill=(0, 0, 0, 255))
        draw.text((2, y + 2), str(step), fill=(255, 255, 0, 255), font=small, stroke_width=2, stroke_fill=(0, 0, 0, 255))

def wrap(text, face, width, draw):
    lines, line = [], ""
    for word in text.split():
        trial = (line + " " + word).strip()
        if draw.textlength(trial, font=face) <= width or not line: line = trial
        else: lines.append(line); line = word
    return lines + ([line] if line else [])

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source"); parser.add_argument("output")
    parser.add_argument("--mark", action="append", default=[], help="x,y|label (percent of width and height)")
    parser.add_argument("--box", action="append", default=[], help="x1,y1,x2,y2|label (percent)")
    parser.add_argument("--grid", action="store_true", help="draw a 10 percent grid with numbers to read positions")
    parser.add_argument("--max", type=int, default=1600, help="longest side in pixels")
    args = parser.parse_args()
    image = Image.open(args.source).convert("RGB")
    image.thumbnail((args.max, args.max))
    if args.grid:
        draw_grid(image); image.save(args.output, quality=90); print("grid written to " + args.output); return
    draw = ImageDraw.Draw(image, "RGBA")
    radius = max(14, image.width // 45)
    face = font(radius)
    legend = []
    for number, spec in enumerate(args.box, 1):
        (x1, y1, x2, y2), label = parse(spec, 4)
        color = COLORS[(number - 1) % len(COLORS)]
        box = [percent(x1, image.width), percent(y1, image.height), percent(x2, image.width), percent(y2, image.height)]
        draw.rectangle(box, outline=color + (255,), width=max(3, radius // 5), fill=color + (35,))
        draw.ellipse([box[0] - radius, box[1] - radius, box[0] + radius, box[1] + radius], fill=color + (255,), outline=(255, 255, 255, 255), width=2)
        draw.text((box[0], box[1]), str(number), fill=(255, 255, 255, 255), font=face, anchor="mm")
        legend.append((number, color, label))
    for offset, spec in enumerate(args.mark):
        number = len(args.box) + offset + 1
        (x, y), label = parse(spec, 2)
        color = COLORS[(number - 1) % len(COLORS)]
        cx, cy = percent(x, image.width), percent(y, image.height)
        draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=color + (255,), outline=(255, 255, 255, 255), width=3)
        draw.text((cx, cy), str(number), fill=(255, 255, 255, 255), font=face, anchor="mm")
        legend.append((number, color, label))
    if legend:
        text_face = font(max(14, image.width // 55))
        probe = ImageDraw.Draw(image)
        rows = [(number, color, wrap(label or "-", text_face, image.width - 4 * radius, probe)) for number, color, label in legend]
        line_height = int(text_face.size * 1.35)
        height = sum(len(lines) * line_height + 10 for _, _, lines in rows) + 16
        canvas = Image.new("RGB", (image.width, image.height + height), (255, 255, 255))
        canvas.paste(image, (0, 0))
        pen = ImageDraw.Draw(canvas)
        y = image.height + 10
        for number, color, lines in rows:
            pen.ellipse([8, y, 8 + 2 * radius * 0.8, y + 2 * radius * 0.8], fill=color)
            pen.text((8 + radius * 0.8, y + radius * 0.8), str(number), fill=(255, 255, 255), font=text_face, anchor="mm")
            for index, line in enumerate(lines): pen.text((8 + 2 * radius, y + index * line_height), line, fill=(30, 41, 59), font=text_face)
            y += len(lines) * line_height + 10
        image = canvas
    image.save(args.output, quality=90)
    print("wrote %s (%dx%d) with %d marks" % (args.output, image.width, image.height, len(legend)))

main()
`;
