import json, re, subprocess
TITLE=3.5; LEAD=0.4; TAIL=0.4; END=4.0
scenes=[]; t=TITLE; subs=[]
for i in range(1,10):
    d=float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f"vo/s{i}.mp3"]))
    vo=t+LEAD
    scenes.append({"id":i,"start":t,"end":t+d+LEAD+TAIL,"vo":vo,"dur":d})
    for (a,b,txt) in json.load(open(f"vo/s{i}.mp3.json")):
        parts=[p.strip() for p in re.split(r'(?<=[،\.])\s+|(?<=\.\.\.)\s*',txt) if p.strip()]
        # merge tiny parts
        merged=[]
        for p in parts:
            if merged and (len(p)<14 or len(merged[-1])<14) and len(merged[-1])+len(p)<60: merged[-1]+=" "+p
            else: merged.append(p)
        tot=sum(len(p) for p in merged); s=a
        for p in merged:
            e=s+(b-a)*len(p)/tot
            subs.append({"s":vo+s,"e":vo+e-0.05,"t":p}); s=e
    t+=d+LEAD+TAIL
total=t+END
json.dump({"title":TITLE,"scenes":scenes,"subs":subs,"total":total},open("timeline.json","w"),ensure_ascii=False,indent=1)
print(total); [print(round(s['s'],2),round(s['e'],2),s['t']) for s in subs]
