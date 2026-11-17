const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const FS=path.join(__dirname,'node_modules/@fontsource');
function css(){let out='';
  for(const [fam,ws] of [['cairo',[600,700,800,900]],['amiri',[700]]])for(const w of ws){
    let c=fs.readFileSync(`${FS}/${fam}/${w}.css`,'utf8');
    c=c.replace(/src: url\(\.\/files\/([^)]+\.woff2)\) format\('woff2'\)[^;]*;/g,(m,f)=>`src: url(data:font/woff2;base64,${fs.readFileSync(`${FS}/${fam}/files/${f}`).toString('base64')}) format('woff2');`);
    out+=c}return out}
const tl=JSON.parse(fs.readFileSync(path.join(__dirname,'timeline.json')));
(async()=>{
  const mode=process.argv[2];const browser=await chromium.launch();
  async function mkPage(){const p=await browser.newPage({viewport:{width:1920,height:1080}});
    await p.goto('file://'+path.join(__dirname,'film.html'));await p.addStyleTag({content:css()});
    p.on('pageerror',e=>console.error('PAGEERR',e.message));
    await p.evaluate(async tl=>{await setup(tl);await Promise.all(['900 40px Cairo','700 40px Cairo','600 40px Cairo','800 40px Cairo'].map(f=>document.fonts.load(f,'0123')))},tl);return p}
  if(mode==='preview'){const p=await mkPage();fs.mkdirSync('prev',{recursive:true});
    for(const t of process.argv.slice(3).map(Number)){const d=await p.evaluate(t=>frame(t,0.85),t);fs.writeFileSync(`prev/f_${t.toFixed(1)}.jpg`,Buffer.from(d.split(',')[1],'base64'))}}
  else{const fps=30,N=Math.ceil(tl.total*fps),W=4;fs.mkdirSync('frames',{recursive:true});
    let done=0;const t0=Date.now();
    await Promise.all([...Array(W)].map(async(_,w)=>{const p=await mkPage();
      for(let i=w;i<N;i+=W){const d=await p.evaluate(t=>frame(t,0.92),i/fps);fs.writeFileSync(`frames/${String(i).padStart(5,'0')}.jpg`,Buffer.from(d.split(',')[1],'base64'));
        if(++done%300===0)console.log(done,'/',N,((Date.now()-t0)/1000).toFixed(0)+'s')}}));}
  await browser.close();})();
