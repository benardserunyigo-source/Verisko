import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const css=fs.readFileSync(new URL('../app.css',import.meta.url),'utf8');
function luminance(hex){return hex.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('shared secondary text and active navigation meet normal-text contrast on their rendered light surfaces',()=>{
 for(const token of ['muted','faint'])for(const bg of ['#ffffff','#eef0f4','#f5f6f8']){
  const colour=css.match(new RegExp('--'+token+':(#[0-9a-f]{6})','i'))[1];assert.ok(contrast(colour,bg)>=4.5,`${token} on ${bg}`);
 }
 const accent=css.match(/--accent:(#[0-9a-f]{6})/i)[1];assert.ok(contrast(accent,'#e7f2fa')>=4.5,'active navigation on its tinted background');
});
