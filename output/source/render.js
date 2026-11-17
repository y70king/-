const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const [,,out,mode]=process.argv;
 const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1920}});
 p.on('console',m=>console.log('PAGE',m.text()));p.on('pageerror',e=>console.log('ERR',e.message));
if(!process.env.SCENE)process.env.SCENE='scene.html';
 await p.goto('http://127.0.0.1:8765/'+(process.env.SCENE||'scene.html')+'');await p.evaluate(()=>window.ready);
 const times=mode==='test'?(process.env.TIMES||'1').split(',').map(Number):Array.from({length:+(process.env.N||710)},(_,i)=>i/30);
 fs.mkdirSync(out,{recursive:true});
 for(let i=0;i<times.length;i++){
  const d=await p.evaluate(async t=>{await render(t);return document.getElementById('c').toDataURL('image/jpeg',.93)},times[i]);
  fs.writeFileSync(`${out}/f${String(i).padStart(4,'0')}.jpg`,Buffer.from(d.split(',')[1],'base64'));
  if(i%100==0)console.log(i);
 }
 await b.close()})();
