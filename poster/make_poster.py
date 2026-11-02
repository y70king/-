import sys
from PIL import Image, ImageDraw, ImageFilter, ImageOps
import numpy as np
SRC=sys.argv[1]; OUT=sys.argv[2]
S=int(sys.argv[3]) if len(sys.argv)>3 else 4
orig=Image.open(SRC).convert('RGB')
W,H=orig.size
big=orig.resize((W*S,H*S),Image.LANCZOS)

# --- remove old square frames: fill only their area with quilted marble ---
import random
random.seed(7)
srcs=[orig.crop(b) for b in [(252,612,342,702),(1342,610,1420,700)]]
def quilt(size,ps=36):
    t=Image.new('RGB',size,(10,8,8))
    a=Image.new('L',(ps,ps),0); ImageDraw.Draw(a).rectangle((5,5,ps-6,ps-6),fill=255); a=a.filter(ImageFilter.GaussianBlur(3))
    for y in range(-ps//2,size[1],ps//2-4):
        for x in range(-ps//2,size[0],ps//2-4):
            sp=random.choice(srcs)
            px=random.randint(0,sp.width-ps); py=random.randint(0,sp.height-ps)
            p=sp.crop((px,py,px+ps,py+ps))
            p=p.rotate(random.choice([0,90,180,270]))
            if random.random()<.5: p=ImageOps.mirror(p)
            t.paste(p,(x+random.randint(-3,3),y+random.randint(-3,3)),a)
    return t
T=quilt((W,H)).resize((W*S,H*S),Image.LANCZOS)
mask=Image.new('L',(W,H),0); d=ImageDraw.Draw(mask)
Lc=[(247,335),(349,438),(450,538),(551,637)]; Lr=[(310,396),(413,498),(514,598),(614,701)]
Rc=[(976,1054),(1066,1146),(1158,1239),(1251,1330),(1339,1412)]; Rr=[(309,396),(412,497),(513,597),(613,700)]
for i,(y0,y1) in enumerate(Lr):
    for j,(x0,x1) in enumerate(Lc):
        if i==3 and j not in (1,2): continue
        d.rounded_rectangle((x0-10,y0-10,x1+10,y1+10),radius=14,fill=255)
for i,(y0,y1) in enumerate(Rr):
    for j,(x0,x1) in enumerate(Rc):
        if i==3 and j==4: continue
        d.rounded_rectangle((x0-10,y0-10,x1+10,y1+10),radius=14,fill=255)
mask=mask.resize((W*S,H*S),Image.LANCZOS).filter(ImageFilter.GaussianBlur(5*S/3))
big.paste(T,(0,0),mask)

# --- photo frames: white photo area exactly 10cm x 15cm ---
# scale: 5 px (original) = 1 cm  ->  poster prints at 320 x 192 cm
IW,IH=50,75          # white photo area = 10 x 15 cm
B=5                  # gold border thickness (1 cm)
FW,FH=IW+2*B,IH+2*B  # outer frame 12 x 17 cm
GX,GY=14,18
def gold(w,h):
    yy,xx=np.mgrid[0:h,0:w]
    t=(xx/w*0.4+yy/h*0.6)
    wave=0.5+0.5*np.cos(t*np.pi*4)
    dark=np.array([150,80,10]); light=np.array([255,214,110])
    return Image.fromarray((dark+(light-dark)*wave[...,None]).astype('uint8'))

def frame(cx,cy):
    w,h=FW*S,FH*S
    x0=round(cx*S-w/2); y0=round(cy*S-h/2)
    k=S/3; pad=int(30*k); R=int(30*k)
    sh=Image.new('L',(w+2*pad,h+2*pad),0)
    ImageDraw.Draw(sh).rounded_rectangle((pad,pad+int(6*k),pad+w,pad+h+int(6*k)),radius=R,fill=200)
    big.paste((0,0,0),(x0-pad,y0-pad),sh.filter(ImageFilter.GaussianBlur(10*k)))
    glow=Image.new('L',(w+2*pad,h+2*pad),0)
    ImageDraw.Draw(glow).rounded_rectangle((pad,pad,pad+w,pad+h),radius=R,fill=90)
    big.paste((230,150,40),(x0-pad,y0-pad),glow.filter(ImageFilter.GaussianBlur(8*k)))
    m=Image.new('L',(w,h),0); ImageDraw.Draw(m).rounded_rectangle((0,0,w-1,h-1),radius=R,fill=255)
    big.paste((25,15,5),(x0,y0),m)
    e=int(3*k)
    m=Image.new('L',(w,h),0); ImageDraw.Draw(m).rounded_rectangle((e,e,w-1-e,h-1-e),radius=R-e,fill=255)
    big.paste(gold(w,h),(x0,y0),m)
    b=B*S; e=int(3*k)  # thin dark line just outside the photo area
    m=Image.new('L',(w,h),0); ImageDraw.Draw(m).rounded_rectangle((b-e,b-e,w-1-b+e,h-1-b+e),radius=int(20*k),fill=255)
    big.paste((30,20,15),(x0,y0),m)
    iw,ih=IW*S,IH*S
    yy=np.linspace(0,1,ih)[:,None]*np.ones((1,iw))
    top=np.array([246,240,238]); bot=np.array([236,226,224])
    fill=(top+(bot-top)*yy[...,None]).astype('uint8')
    m=Image.new('L',(iw,ih),0); ImageDraw.Draw(m).rounded_rectangle((0,0,iw-1,ih-1),radius=int(16*k),fill=255)
    big.paste(Image.fromarray(fill),(x0+b,y0+b),m)
    sm=Image.new('L',(iw,ih),0); ImageDraw.Draw(sm).rounded_rectangle((-4,-4,iw+3,int(8*k)),radius=int(16*k),fill=70)
    sm=Image.fromarray(np.minimum(np.array(sm.filter(ImageFilter.GaussianBlur(4*k))),np.array(m)))
    big.paste((120,90,80),(x0+b,y0+b),sm)

def block(cx,top,rows):
    n=0
    for r,cols in enumerate(rows):
        y=top+FH/2+r*(FH+GY)
        tw=cols*FW+(cols-1)*GX
        for c in range(cols):
            frame(cx-tw/2+FW/2+c*(FW+GX),y); n+=1
    return n
top=307
n=block(443,top,[5,5,5,4])+block(1196,top,[5,5,5,4])
print('frames:',n)
DPI=S*5*2.54  # 5 px per cm in source scale
if OUT.endswith(".pdf"):
    big.save(OUT,"PDF",resolution=DPI,quality=95)
else:
    big.save(OUT,quality=95,dpi=(DPI,DPI))
if OUT.endswith(".jpg"): big.resize((W,H),Image.LANCZOS).save(OUT.replace('.jpg','_preview.jpg'),quality=92)
