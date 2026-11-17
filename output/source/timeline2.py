import json
dur=json.load(open('vo2/dur.json'))
K=[(0.0,0.0)];place=[];st={'vend':0.0};out={}
def addk(o,minnew,ratio=.8):
  last=K[-1];n=max(minnew,last[1]+(o-last[0])*ratio);K.append((o,round(n,3)));return n
def say(cid,t):
  place.append((cid,round(t,3)));st['vend']=t+dur[cid]
def scene(anchors,o_end,hold):
  for cid,o in anchors:
    n=addk(o,st['vend']+.3);say(cid,n+.08)
  addk(o_end,st['vend']+hold)
scene([('c1',1.7),('c2',2.6)],3.7,.5)
scene([('c3b',5.4),('c4b',6.8)],8.4,.45)
# montage
MT0=K[-1][1];t=MT0;shots=[]
for i in range(6):
  d=max(1.55,dur[f'm{i}']+.45);say(f'm{i}',t+.12);shots.append([round(t,3),round(t+d,3)]);t+=d
MT1=round(t,3);K.append((8.4,MT1));st['vend']=MT1
# offers
OT0=MT1-.2;say('oh',OT0+.4);cards=[]
for i in range(5):
  s0=st['vend']+.22;say(f'k{i}',s0);cards.append([round(s0-.2,3),None,round(s0+.35,3)])
  st['vend']=max(st['vend'],s0+1.3)
for i in range(5): cards[i][1]=cards[i+1][0] if i<4 else round(st['vend']+.5,3)
OT1=round(st['vend']+.6,3)
# home service + phone
HT0=OT1-.2;say('h1',HT0+.7);PT=st['vend']+.35;say('p1',PT+.55);P2=st['vend']+.2;say('p2',P2)
HT1=round(st['vend']+.9,3)
K.append((8.4,round(HT1-.5,3)));K.append((13.66,round(HT1-.49,3)));st['vend']=HT1-.3
scene([('c15',13.75),('c16',14.6),('c17b',15.0),('c17c',16.55)],17.9,1.0)
n=addk(18.6,st['vend']+.3);say('c18b',n+.08);n=addk(19.5,st['vend']+.3);say('c19',n+.08)
addk(19.85,st['vend']+.2);addk(20.2,st['vend']+1.6);addk(21,0)
KO=[k[0] for k in K];KN=[k[1] for k in K]
tl={'KO':KO,'KN':KN,'MT0':MT0,'MT1':MT1,'shots':shots,'OT0':OT0,'OT1':OT1,'cards':cards,'HT0':HT0,'HT1':HT1,'PT':round(PT,3),'P2':round(P2,3),'P2d':dur['p2'],
 'h1':[p[1] for p in place if p[0]=='h1'][0],'p1':[p[1] for p in place if p[0]=='p1'][0],'oh':[p[1] for p in place if p[0]=='oh'][0],'place':place,'total':KN[-1]}
json.dump(tl,open('render/timeline2.json','w'));print(json.dumps({k:tl[k] for k in ['KN','KO','OT0','OT1','HT0','HT1','total']}))
