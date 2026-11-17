import json, numpy as np, wave
SR=44100; tl=json.load(open('timeline.json')); T=tl['total']; N=int(T*SR)+SR
S=tl['scenes']; st=lambda i:S[i-1]['start']
rng=np.random.default_rng(1)
mus=np.zeros((N,2)); sfx=np.zeros((N,2))
def env(n,a,r):
    e=np.ones(n); a=int(a*SR); r=int(r*SR)
    if a: e[:a]=np.linspace(0,1,a)
    if r: e[-r:]*=np.linspace(1,0,r)
    return e
def add(buf,t0,sig,pan=0.0,g=1.0):
    i=int(t0*SR); sig=sig[:max(0,len(buf)-i)]
    buf[i:i+len(sig),0]+=sig*g*(1-pan)/1; buf[i:i+len(sig),1]+=sig*g*(1+pan)/1
def lp(x,a): # one-pole lowpass
    y=np.empty_like(x); s=0.0
    for i in range(len(x)): s+=a*(x[i]-s); y[i]=s
    return y
def pad(freqs,dur,bright=0.3):
    n=int(dur*SR); t=np.arange(n)/SR; out=np.zeros(n)
    for f in freqs:
        for d in (-0.7,0.0,0.6):
            ff=f*(2**(d/1200*8)); ph=rng.random()*6.28
            out+=np.sin(2*np.pi*ff*t+ph)+bright*0.5*np.sin(4*np.pi*ff*t+ph)+bright*0.25*np.sin(6*np.pi*ff*t)
    out*=env(n,1.5,1.5)*(0.85+0.15*np.sin(2*np.pi*0.15*t))
    return out/len(freqs)/3
n2f=lambda m:440*2**((m-69)/12)
# chord plan per section (midi notes)
plan=[(0,st(1),[45,52,57,60]),(st(1),st(2),[45,52,57,60,64]),(st(2),st(3),[41,48,53,57,60]),(st(3),st(4),[38,45,50,53,57]),
(st(4),st(5),[40,47,52,55,59]),(st(5),st(6),[38,45,50,53,58]),(st(6),st(7),[45,52,57,60]),(st(7),st(8),[44,51,56,59]),
(st(8),st(9),[41,48,53,57,60,64]),(st(9),S[8]['end'],[45,52,57,60,64]),(S[8]['end'],T,[41,48,53,57,64])]
for i,(a,b,ch) in enumerate(plan):
    dur=b-a+2.5; br=0.6 if i in (8,10) else 0.25
    add(mus,max(0,a-1.0),pad([n2f(m) for m in ch],dur,br),g=0.16)
# sub drone heartbeat in tense scenes
def thump(f=55,d=0.5,g=1.0):
    n=int(d*SR); t=np.arange(n)/SR; fr=f*(1+2*np.exp(-t*30)); return np.sin(2*np.pi*np.cumsum(fr)/SR)*np.exp(-t*7)*g
for a,b in [(st(3),st(4)),(st(7),st(8))]:
    x=a+0.5
    while x<b-0.5: add(mus,x,thump(50,0.4,0.5)); add(mus,x+0.28,thump(50,0.4,0.3)); x+=1.4
# plucked music-box motif for title, hope and ending
def pluck(f,d=1.2):
    n=int(d*SR); t=np.arange(n)/SR; return (np.sin(2*np.pi*f*t)+0.3*np.sin(4*np.pi*f*t))*np.exp(-t*4)
motif=[76,72,69,72,74,71,67,71]
for base in (0.2, st(8)+0.5, st(8)+4.5, st(8)+8.5, S[8]['end']+0.2):
    for k,m in enumerate(motif): add(mus,base+k*0.45,pluck(n2f(m)),pan=0.3*np.sin(k),g=0.07)
# ---- sfx
def noise(d): return rng.standard_normal(int(d*SR))
def whoosh(d=0.8,g=0.25):
    x=noise(d); e=np.sin(np.linspace(0,np.pi,len(x)))**2; return lp(x,0.08)*e*g
for i in range(2,10): add(sfx,st(i)-0.45,whoosh(0.9,0.5))
add(sfx,S[8]['end']-0.45,whoosh(0.9,0.5))
# impacts: governments fall
for k in range(3): add(sfx,st(3)+2.4+k*0.35,thump(45,0.9,1.0)+lp(noise(0.9),0.05)*np.exp(-np.arange(int(0.9*SR))/SR*6)*0.8)
# stamp thud (scene4 end-2.3+0.3)
add(sfx,S[3]['end']-2.0,thump(70,0.5,1.0))
# door slam
d=S[4]['start']+8.3+0.5
slam=thump(40,1.5,1.4)+lp(noise(1.5),0.15)*np.exp(-np.arange(int(1.5*SR))/SR*5)*0.9
add(sfx,d,slam)
# metal lock clicks while wheel spins
for k in range(6): add(sfx,d+0.7+k*0.27,lp(noise(0.05),0.6)*np.exp(-np.arange(int(0.05*SR))/SR*80)*0.5,pan=0.2)
# radio static then purr (scene6)
a=st(6); b=S[5]['end']; purr0=75.39+0.2
n=int((purr0-a-2)*SR); add(sfx,a+2,lp(noise(n/SR),0.5)*0.025*env(n,0.5,0.5),pan=0.4)
n=int((b-purr0)*SR); t=np.arange(n)/SR
purr=lp(noise(n/SR),0.02)*(0.5+0.5*np.sign(np.sin(2*np.pi*25*t)))*(0.6+0.4*np.sin(2*np.pi*0.45*t))
add(sfx,purr0,purr*env(n,0.6,0.6)*1.8,pan=0.3)
# scratches (scene7)
def scratch(d=0.4):
    x=noise(d); t=np.arange(len(x))/SR; hp=x-lp(x,0.15)
    return hp*(0.5+0.5*np.sin(2*np.pi*14*t))**2*env(len(x),0.02,0.1)*0.35
for g in range(3):
    for k in range(2): add(sfx,82.58+g*0.9+k*0.18,scratch(0.25),pan=-0.2)
# meow synth
def meow(dur=0.9,f0=520,g=0.25):
    n=int(dur*SR); t=np.arange(n)/SR; x=t/dur
    f=f0*(0.9+0.6*np.sin(np.pi*x**0.8)); ph=2*np.pi*np.cumsum(f)/SR
    s=sum((1/k)*np.sin(k*ph) for k in range(1,9))
    form=np.sin(np.pi*x)**1.5; # vowel opening
    s=lp(s,0.10+0.25*0)*1.0
    return s*form*g
add(sfx,87.43,meow(1.1,480,0.3)*0.7,pan=-0.1)
add(sfx,87.43+0.02,np.zeros(1))
# kitten eye open: small mew
add(sfx,S[8]['start']+8.6,meow(0.55,780,0.22))
# final purr under the end card
e0=S[8]['end']; n=int((T-e0)*SR); t=np.arange(n)/SR
add(sfx,e0,lp(noise(n/SR),0.02)*(0.5+0.5*np.sign(np.sin(2*np.pi*25*t)))*env(n,0.5,1.0)*1.2)
mix=mus+sfx
mix=mix[:int(T*SR)]
mix/=max(1e-9,np.abs(mix).max())/0.7
w=wave.open('bed.wav','wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix*32767).astype('<i2').tobytes()); w.close()
# VO delays
open('vo_delays.txt','w').write(' '.join(f"{s['vo']:.3f}" for s in S))
print('ok',T)
