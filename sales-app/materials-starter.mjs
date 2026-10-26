// Suggestions only. Operations confirms product types and actual site quantities.
export function starterMaterials(work={}){
 const count=Number(work.cameraCount);if(![4,6,8,12].includes(count))return [{}];
 const metres=Number(work.cableMetres)>0?Number(work.cableMetres):count*50;
 return [{id:'quote-cameras',planned:count,unit:'pcs'},{id:'quote-cable',name:'Cat6 cable',planned:metres,unit:'m',source:'Uganda'}];
}
