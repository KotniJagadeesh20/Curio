import { chromium } from 'playwright-core';
const b=await chromium.launch({channel:'chrome',headless:true});const p=await b.newPage();
await p.route('https://videos.example.org/**',async r=>{await new Promise(x=>setTimeout(x,3000));await r.fulfill({status:404,body:''})});
await p.setContent('<body></body>');
console.log(await p.evaluate(async()=>{const out=[];const v=document.createElement('video');v.src='https://videos.example.org/x.webm';out.push(['created',v.networkState]);document.body.append(v);out.push(['inserted sync',v.networkState]);await Promise.resolve();out.push(['after microtask',v.networkState]);await new Promise(r=>setTimeout(r,0));out.push(['after task',v.networkState]);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));out.push(['after 2 frames',v.networkState]);
const w=document.createElement('video');const s=document.createElement('source');s.src='https://videos.example.org/y.webm';w.append(s);document.body.append(w);out.push(['sources sync',w.networkState]);await new Promise(r=>setTimeout(r,0));out.push(['sources after task',w.networkState]);return JSON.stringify(out)}));
await b.close();
