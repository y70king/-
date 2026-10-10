const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1800,height:300},deviceScaleFactor:+process.argv[2]||1});
await p.goto('file://'+__dirname+'/'+(process.env.HTML||'banner.html'));await p.evaluate(()=>document.fonts.ready);
await p.screenshot({path:process.argv[3]});
if(process.argv[4]) await p.pdf({path:process.argv[4],width:'90cm',height:'15cm',printBackground:true,pageRanges:'1'});
await b.close();})();
