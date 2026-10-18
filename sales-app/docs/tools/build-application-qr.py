"""Create a deterministic QR recruitment card; no applicant information included."""
from pathlib import Path
import qrcode
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets' / 'recruitment'
OUT.mkdir(parents=True, exist_ok=True)
URL = 'https://verisko-sales-2026.netlify.app/apply.html'
qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=12, border=4)
qr.add_data(URL)
qr.make(fit=True)
code = qr.make_image(fill_color='#012169', back_color='white').convert('RGB')
code.save(OUT / 'verisko-application-qr.png')

navy, cyan, grey = '#012169', '#60c7e6', '#52627b'
card = Image.new('RGB', (1000, 1420), 'white')
draw = ImageDraw.Draw(card)
font_dir = Path('/System/Library/Fonts/Supplemental')
def font(size, bold=False):
    return ImageFont.truetype(str(font_dir / ('Arial Bold.ttf' if bold else 'Arial.ttf')), size)
def line(text, y, size, bold=False, color=navy):
    draw.text((500, y), text, font=font(size, bold), fill=color, anchor='mt')

line('VERISKO', 65, 34, True)
line('WE’RE HIRING', 155, 25, True, grey)
line('Field Sales', 207, 70, True)
line('Representative', 287, 70, True)
line('Kampala & nearby areas', 389, 30)
draw.line((350, 454, 650, 454), fill=cyan, width=5)
line('3-month paid contract', 490, 32, True)
line('Current bachelor’s students and graduates', 545, 28, color=grey)
line('Sales, Marketing or business courses preferred', 586, 25, color=grey)
size = min(560, code.width)
card.paste(code.resize((size, size), Image.Resampling.NEAREST), ((1000-size)//2, 653))
line('Scan to apply', 1220, 40, True)
line('10 short questions + a 2-minute video', 1280, 27)
line('No CV. No sign-in.', 1327, 25, color=grey)
card.save(OUT / 'verisko-field-sales-scan-to-apply.png')
print(OUT / 'verisko-field-sales-scan-to-apply.png')
