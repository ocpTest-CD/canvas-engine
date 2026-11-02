import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
const browser=await chromium.launch({headless:process.env.CANVAS_HEADED!=='1',executablePath:process.env.CANVAS_BROWSER,args:process.env.CANVAS_METAL==='1'?['--use-angle=metal','--enable-gpu']:[]});
const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});
await page.goto(process.env.CANVAS_URL??'http://127.0.0.1:4317');
await page.getByRole('button',{name:'文字',exact:true}).waitFor();await page.waitForFunction(()=>window.canvasEngine?.document.nodes.size>0);
const gpu=await page.evaluate(()=>{const c=document.createElement('canvas'),g=c.getContext('webgl2');const ext=g?.getExtension('WEBGL_debug_renderer_info');return ext?g.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable';});
const results=[];
for(const count of [100,1000,10000]){
 results.push(await page.evaluate(async count=>{const e=window.canvasEngine;const nodes=Array.from({length:count},(_,i)=>({id:`n${i}`,type:i%4?'text':'tool',title:`节点 ${i}`,text:'性能场景 / 可重复测量',x:i%100*300,y:Math.floor(i/100)*240,width:250,height:190}));const edges=Array.from({length:count===1000?2000:count-1},(_,i)=>({id:`e${i}`,from:`n${i%count}`,to:`n${(i%count+(i<count?1:2))%count}`}));const loadStart=performance.now();e.loadScene({version:1,nodes,edges,camera:{x:0,y:0,zoom:.8}});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const loadMs=performance.now()-loadStart;
 const samples=[],draws=[];let last=performance.now();for(let i=0;i<150;i++){await new Promise(resolve=>requestAnimationFrame(t=>{samples.push(t-last);last=t;e.camera.x+=4;e.requestRender();draws.push(e.metrics.drawMs);resolve();}));}
 const percentile=(a,p)=>a.slice().sort((a,b)=>a-b)[Math.floor((a.length-1)*p)];
 e.fitToContent();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const overviewMs=e.metrics.drawMs,overviewVisible=e.metrics.visible;
 const frames=e.metrics.frames;await new Promise(r=>setTimeout(r,300));const idleFrames=e.metrics.frames-frames;
 return{count,edges:edges.length,loadMs,panFrameMs:{p50:percentile(samples.slice(5),.5),p95:percentile(samples.slice(5),.95),p99:percentile(samples.slice(5),.99)},drawMs:{p50:percentile(draws,.5),p95:percentile(draws,.95)},overviewMs,overviewVisible,idleFrames,textureBytes:e.metrics.textureBytes};},count));
}
const result={timestamp:new Date().toISOString(),platform:os.platform(),arch:os.arch(),osRelease:os.release(),cpu:os.cpus()[0].model,memoryGB:os.totalmem()/1024**3,browser:browser.version(),headless:process.env.CANVAS_HEADED!=='1',gpu,viewport:{width:1440,height:960,dpr:1},note:'Synthetic text/tool scenes; frame intervals include browser scheduling; not mixed-media or physical input latency acceptance.',results};
await writeFile(new URL('./latest.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();
