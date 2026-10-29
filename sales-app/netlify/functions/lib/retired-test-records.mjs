// Exact IDs approved for test cleanup. Never classify customers by their name.
const collections=['prospects','appointments','jobs','quotes','installations','transactions'];
export function withoutRetiredTests(data,retired={}){
 const out={...data};
 for(const name of collections){
  const ids=new Set(Array.isArray(retired?.[name])?retired[name].filter(id=>typeof id==='string'):[]);
  if(ids.size&&Array.isArray(data?.[name]))out[name]=data[name].filter(row=>!ids.has(row.id));
 }
 return out;
}
