// Refresh the ledger after installer writes without replacing unsent phone work.
export async function refreshCash({current,pending,wait,stamp,load}){
 if(!current())return 'unchanged';
 if(pending())await wait();
 if(!current())return 'unchanged';
 if(pending())return 'pending';
 const before=stamp();
 return load(()=>current()&&!pending()&&stamp()===before);
}
