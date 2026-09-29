"""Checkpoint boards: candidate contact sheet + structural arc chart.  python3 tools/boards.py"""
import json, os
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, 'docs/checkpoint1')
FONT = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
f = lambda s: ImageFont.truetype(FONT, s)

def tokens():
    import re
    src = open(os.path.join(ROOT, 'src/film/tokens.js'), encoding='utf-8').read()
    return {m[0]: m[1] for m in re.findall(r"\['([\w-]+)',\s*'(#[0-9a-f]{6})'", src)}
TK = tokens()

# ---- contact sheet ----
cands = [('A', '裂痕之樹', '裂痕本身長成了樹：秩序由傷口生出。（推薦）'),
         ('B', '金繼之晶', '雪花被修復，每一道裂縫都以金填滿。'),
         ('C', '向光螺旋', '碎片以黃金角重新生長成葉序螺旋。')]
W, H = 1920, 1080
sheet = Image.new('RGB', (W, 3 * (H // 2) + 3 * 70), TK['void'])
d = ImageDraw.Draw(sheet)
for i, (k, name, line) in enumerate(cands):
    y = i * (H // 2 + 70)
    main = Image.open(f'{D}/final_{k}.png').convert('RGB').resize((W // 2, H // 2), Image.LANCZOS)
    det = Image.open(f'{D}/final_{k}_seed.png').convert('RGB').resize((W // 2, H // 2), Image.LANCZOS)
    sheet.paste(main, (0, y + 70)); sheet.paste(det, (W // 2, y + 70))
    d.text((24, y + 16), f'{k}  {name}', font=f(34), fill=TK['gold-0'] if k == 'A' else TK['ice-1'])
    d.text((330, y + 24), line, font=f(24), fill=TK['ash-0'])
    d.rectangle([W // 2, y + 70, W // 2 + 330, y + 108], fill=TK['void'])
    d.text((W // 2 + 16, y + 78), '細部：保留的不完美（種子六角）', font=f(20), fill=TK['ash-0'])
sheet.save(f'{D}/candidates.png')

# ---- arc chart ----
bm = json.load(open(os.path.join(ROOT, 'beatmap.json'), encoding='utf-8'))
T = bm['duration']['time']
W, H = 2400, 900
im = Image.new('RGB', (W, H), '#0b0d10'); d = ImageDraw.Draw(im)
L, R = 150, W - 40
X = lambda t: L + (R - L) * t / T
rows = {'sec': 70, 'frame': 190, 'col': 290, 'sat': 390, 'snd': 560, 'sub': 650, 'hit': 740}
lab = {'sec': '段落', 'frame': '畫幅', 'col': '色彩', 'sat': '飽和度', 'snd': '靜默', 'sub': '字幕', 'hit': '卡點'}
for k, y in rows.items(): d.text((20, y), lab[k], font=f(26), fill='#8a929a')
for s in bm['sections']:
    x0, x1 = X(s['start']['time']), X(s['end']['time'])
    c = {1: TK['ice-3'], 2: '#5a3a33' if s['id'] < 'II-f' else TK['ash-2'], 3: TK['gold-3']}[s['act']]
    d.rectangle([x0, 60, x1 - 2, 150], fill=c)
    d.text((x0 + 6, 66), s['id'], font=f(20), fill='#e8e8e8')
    if x1 - x0 > 70: d.text((x0 + 6, 96), s['name'].split(' ')[0], font=f(20), fill='#e8e8e8')
# aspect row
hits = {h['id']: h['time'] for h in bm['hits']}
def box(t0, t1, hfrac, col):
    y0 = rows['frame'] + 40 - 36 * hfrac; y1 = rows['frame'] + 40 + 36 * hfrac
    d.rectangle([X(t0), y0, X(t1), y1], outline=col, width=2)
box(0, hits['impact'], 1.0, TK['ice-1']); d.text((X(20), rows['frame'] + 20), '1:1（畫內方窗）', font=f(22), fill=TK['ice-1'])
box(hits['impact'], hits['inhale'], 1.0, TK['ash-1']); d.text((X(150), rows['frame'] + 20), '16:9 全幅（畫框碎裂後）', font=f(22), fill=TK['ash-1'])
box(hits['inhale'], hits['climax'], 0.08, TK['azure-1'])
box(hits['climax'], T, 0.744, TK['gold-1']); d.text((X(213), rows['frame'] + 20), '2.39:1', font=f(22), fill=TK['gold-1'])
# colour band
import math
bands = [(0, hits['slip'], TK['ice-2']), (hits['slip'], hits['impact'], TK['ice-2']), (hits['impact'], hits['decay'], TK['ash-1']),
         (hits['decay'], hits['ember'], TK['ash-2']), (hits['ember'], hits['growth'], TK['gold-2']), (hits['growth'], T, TK['gold-1'])]
for t0, t1, c in bands: d.rectangle([X(t0), rows['col'], X(t1), rows['col'] + 50], fill=c)
d.rectangle([X(hits['crack-born']), rows['col'] + 18, X(hits['decay']), rows['col'] + 32], fill=TK['ember'])
d.rectangle([X(hits['growth']), rows['col'] + 36, X(T), rows['col'] + 50], fill=TK['azure-1'])
# saturation curve (from tokens GRADE)
import re
src = open(os.path.join(ROOT, 'src/film/tokens.js'), encoding='utf-8').read()
grade = [(a, float(b)) for a, b in re.findall(r"\['([\w-]+)',\s*([\d.]+)\],", src.split('export const GRADE')[1])]
pts = []
for k, v in grade:
    t = 0 if k == 'start' else T if k == 'end' else hits[k]
    pts.append((X(t), rows['sat'] + 140 - v * 80))
d.line(pts, fill=TK['gold-0'], width=4)
for x, y in pts: d.ellipse([x - 5, y - 5, x + 5, y + 5], fill=TK['gold-0'])
d.line([L, rows['sat'] + 140, R, rows['sat'] + 140], fill='#333a40')
for s in bm['silences']:
    d.rectangle([X(s['start']['time']), rows['snd'], X(s['end']['time']), rows['snd'] + 50], fill='#ffffff')
    d.text((X(s['start']['time']) - 30, rows['snd'] + 56), s['id'], font=f(18), fill='#bbbbbb')
for s in bm['subtitles']:
    d.rectangle([X(s['start']['time']), rows['sub'], X(s['end']['time']), rows['sub'] + 40], fill='#3a4450')
    d.text((X(s['start']['time']) + 4, rows['sub'] + 6), s['text'], font=f(22), fill='#ffffff')
for h in bm['hits']:
    x = X(h['time']); d.line([x, rows['hit'], x, rows['hit'] + 40], fill=TK['gold-1'] if h['bar'] >= 45 else TK['ice-1'], width=2)
for m in range(0, 241, 30):
    d.line([X(m), H - 60, X(m), H - 50], fill='#666'); d.text((X(m) - 20, H - 45), f'{m // 60}:{m % 60:02d}', font=f(20), fill='#999')
im.save(f'{D}/arc.png')
print('ok')
