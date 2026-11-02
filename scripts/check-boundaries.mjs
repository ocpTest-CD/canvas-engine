import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const allowed = {
 core: [], serialization: ['core'], document: ['core','serialization'], scene:['core'],
 layout:['core'], nodes:['core'], resources:['core'],
 rendering:['core','scene','nodes','resources'], overlays:['core','scene','nodes','resources'],
 interaction:['core','document','scene','nodes'], adapters:['engine'],
};
async function files(dir) {
 const result=[];
 for(const item of await readdir(dir,{withFileTypes:true})) {
  const file=path.join(dir,item.name);
  if(item.isDirectory()) result.push(...await files(file));
  else if(/\.(ts|tsx)$/.test(file)) result.push(file);
 }
 return result;
}
const violations=[];
for(const file of await files(root)) {
 const relative=path.relative(root,file), layer=relative.split(path.sep)[0];
 const source=await readFile(file,'utf8');
 for(const match of source.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)) {
  const dep=match[1];
  if(!dep.startsWith('.')) {
   if(['core','serialization','document','layout'].includes(layer)) violations.push(`${relative}: pure module imports ${dep}`);
   if(/electron|node:|app\/|desktop\//.test(dep)) violations.push(`${relative}: host dependency ${dep}`);
   if(/^(react|react-dom)(\/|$)/.test(dep)&&layer!=='adapters') violations.push(`${relative}: React outside adapter`);
  } else if(allowed[layer]) {
   const target=path.relative(root,path.resolve(path.dirname(file),dep)).split(path.sep)[0].replace(/\.[^.]+$/,'');
   if(target!==layer&&!allowed[layer].includes(target)) violations.push(`${relative}: ${layer} -> ${target}`);
  }
 }
 if(['core','serialization','document','layout'].includes(layer)&&/\b(window|HTMLElement|document\.createElement|HTMLCanvasElement)\b/.test(source)) violations.push(`${relative}: DOM in pure module`);
}
if(violations.length) { console.error(violations.join('\n')); process.exit(1); }
console.log('PASS engine module boundaries, pure core, host isolation and optional React adapter');
