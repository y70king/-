# Draws the launcher icon (green rounded square, white register sheet with a grid and a check mark).
import sys
from PIL import Image, ImageDraw
def icon(n):
    S=4*n; im=Image.new('RGBA',(S,S),(0,0,0,0)); d=ImageDraw.Draw(im)
    d.rounded_rectangle([0,0,S-1,S-1],radius=S*0.22,fill=(31,122,58,255))
    x0,y0,x1,y1=S*.24,S*.18,S*.76,S*.82
    d.rounded_rectangle([x0,y0,x1,y1],radius=S*.04,fill=(255,255,255,255))
    d.rectangle([x0,y0,x1,y0+S*.1],fill=(189,214,238,255))
    for k in range(1,6):
        y=y0+S*.1+k*(y1-y0-S*.1)/6; d.line([x0+S*.03,y,x1-S*.03,y],fill=(170,180,190,255),width=max(1,S//90))
    for k in range(1,4):
        x=x0+k*(x1-x0)/4; d.line([x,y0+S*.1,x,y1-S*.03],fill=(170,180,190,255),width=max(1,S//90))
    d.line([(S*.52,S*.66),(S*.6,S*.74),(S*.78,S*.52)],fill=(240,140,40,255),width=S//18,joint='curve')
    return im.resize((n,n),Image.LANCZOS)
for name,n in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
    import os; os.makedirs(f'res/mipmap-{name}',exist_ok=True); icon(n).save(f'res/mipmap-{name}/ic_launcher.png')
