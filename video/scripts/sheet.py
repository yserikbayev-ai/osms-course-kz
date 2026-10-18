"""Лист кадров: python3 -P scripts/sheet.py L1.2 [--video out/L1.2.draft.mp4] [--tag r1] [--times 3.7 3.8] [--from 3 --to 5 --every 0.2]

По умолчанию берёт моменты из node scripts/times.mjs (каждый якорь + 0.3 с).
Пишет out/sheets/<урок>-<tag>-N.png (4×2, 640 px) и out/sheets/<урок>-<tag>-phone.png (плитки 360 px).
"""
import argparse, json, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument('lesson')
ap.add_argument('--video')
ap.add_argument('--tag', default='r')
ap.add_argument('--times', nargs='*', type=float)
ap.add_argument('--from', dest='t_from', type=float)
ap.add_argument('--to', dest='t_to', type=float)
ap.add_argument('--every', type=float, default=0.2)
a = ap.parse_args()

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
video = a.video or f'out/{a.lesson}.draft.mp4'
os.makedirs(os.path.join(root, 'out/sheets'), exist_ok=True)
frames_dir = os.path.join(root, 'out/frames', f'{a.lesson}-{a.tag}')
os.makedirs(frames_dir, exist_ok=True)

if a.times:
    times = [{'t': t, 'label': ''} for t in a.times]
elif a.t_from is not None:
    t, times = a.t_from, []
    while t <= a.t_to + 1e-9:
        times.append({'t': round(t, 2), 'label': ''}); t += a.every
else:
    info = json.loads(subprocess.check_output(['node', os.path.join(root, 'scripts/times.mjs'), a.lesson], cwd=root, stderr=subprocess.DEVNULL))
    times = info['times']

font = ImageFont.truetype('/System/Library/Fonts/HelveticaNeue.ttc', 22)
tiles = []
for i, m in enumerate(times):
    png = os.path.join(frames_dir, f'{i:03d}.png')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(m['t']), '-i', os.path.join(root, video), '-frames:v', '1', png], check=True)
    tiles.append((Image.open(png).convert('RGB'), f"{m['t']:.2f}s  {m['label']}"))

def sheet(tiles, cols, w, path):
    h = round(w * 9 / 16); bar = 30; pad = 8
    rows = (len(tiles) + cols - 1) // cols
    img = Image.new('RGB', (cols * (w + pad) + pad, rows * (h + bar + pad) + pad), (24, 24, 24))
    d = ImageDraw.Draw(img)
    for i, (im, label) in enumerate(tiles):
        x = pad + (i % cols) * (w + pad); y = pad + (i // cols) * (h + bar + pad)
        img.paste(im.resize((w, h), Image.LANCZOS), (x, y))
        d.text((x + 6, y + h + 5), label, fill=(230, 230, 230), font=font)
    img.save(path)
    return path

out = []
per = 8
for n in range(0, len(tiles), per):
    out.append(sheet(tiles[n:n + per], 4, 640, os.path.join(root, f'out/sheets/{a.lesson}-{a.tag}-{n // per + 1}.png')))
out.append(sheet(tiles, 6, 360, os.path.join(root, f'out/sheets/{a.lesson}-{a.tag}-phone.png')))
print('\n'.join(out))
