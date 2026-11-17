import numpy as np, wave
sr=44100;D=21.0;n=int(sr*D);t=np.arange(n)/sr;out=np.zeros((n,2))
def note(f):return 440*2**((f-69)/12)
def add(i0,w,pl,pr):
  i1=min(n,i0+len(w));w=w[:i1-i0];out[i0:i1,0]+=w*pl;out[i0:i1,1]+=w*pr
def env(st,dur,a=.01,r=.5):
  e=np.zeros(n);i0=int(st*sr);i1=min(n,int((st+dur+r)*sr));tt=np.arange(i1-i0)/sr
  e[i0:i1]=np.minimum(1,tt/a)*np.where(tt<dur,1,np.exp(-(tt-dur)/r*4));return e
chords=[[48,55,64,67,71],[45,52,60,64,67],[41,48,57,60,64],[43,50,59,62,67]]
bar=2.625
for b in range(8):
  ch=chords[b%4];st=b*bar
  for m in ch:
    f=note(m);e=env(st,bar-.2,a=.6,r=.9)
    for det,pan in [(-.15,.2),(.15,.8)]:
      w=(np.sin(2*np.pi*(f+det)*t)+.3*np.sin(2*np.pi*2*(f+det)*t))*e*.035
      out[:,0]+=w*(1-pan);out[:,1]+=w*pan
  arp=[ch[1]+12,ch[2]+12,ch[3]+12,ch[4]+12,ch[3]+12,ch[2]+12,ch[4]+12,ch[2]+24]
  for i,m in enumerate(arp):
    tt=np.arange(int(1.2*sr))/sr;f=note(m)
    w=(np.sin(2*np.pi*f*tt)+.25*np.sin(2*np.pi*3*f*tt)*np.exp(-tt*12))*np.exp(-tt*4.5)*.09
    p=.3+.4*(i%2);add(int((st+i*bar/8)*sr),w,1-p,p)
  for q in range(4):
    s0=st+q*bar/4;tt=np.arange(int(.35*sr))/sr
    if b>0: add(int(s0*sr),np.sin(2*np.pi*(50+80*np.exp(-tt*30))*tt)*np.exp(-tt*9)*.22,1,1)
    Ls=int(.08*sr);hn=np.random.RandomState(q+b).randn(Ls)*np.exp(-np.arange(Ls)/sr*60)*.03
    add(int((s0+bar/8)*sr),np.diff(np.concatenate([[0],hn])),1,1)
for st in [3.7,8.35,13.3,17.9]:
  L=int(.9*sr);nz=np.random.RandomState(int(st*10)).randn(L);e=np.sin(np.linspace(0,np.pi,L))**2;y=np.zeros(L);a=0
  for i in range(L):
    a+=(.02+.25*e[i])*(nz[i]-a);y[i]=a
  add(int((st-.45)*sr),y*e*.5,1,1)
for st,base in [(4.0,84),(5.4,88),(15.95,91),(18.6,84)]:
  for k,m in enumerate([base,base+7,base+12]):
    tt=np.arange(int(2.5*sr))/sr;f=note(m)
    w=(np.sin(2*np.pi*f*tt)+.4*np.sin(2*np.pi*f*2.76*tt)*np.exp(-tt*6))*np.exp(-tt*2.2)*.06
    add(int((st+k*.06)*sr),w,.4+k*.1,.6-k*.1)
rev=np.zeros_like(out)
for dly,g in [(.031,.35),(.047,.3),(.071,.25),(.113,.2),(.163,.15),(.241,.1)]:
  d=int(dly*sr);rev[d:,0]+=out[:-d,1]*g;rev[d:,1]+=out[:-d,0]*g
out=out+rev*.6
fade=np.ones(n);fi=int(20.0*sr);fade[fi:]=np.linspace(1,0,n-fi)**1.5;fade[:int(.3*sr)]=np.linspace(0,1,int(.3*sr))
out*=fade[:,None];out/=np.abs(out).max()*1.12
w=wave.open('work/lab_music.wav','wb');w.setnchannels(2);w.setsampwidth(2);w.setframerate(sr);w.writeframes((out*32767).astype(np.int16).tobytes());w.close()
