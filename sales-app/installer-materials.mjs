// Per-job material custody. Quantities are never inferred from a free-text note.
export const stockManager=u=>['admin','operations'].includes(u?.role);
export const UNITS=['metres','pieces','sets','rolls'];
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const clean=v=>String(v||'').trim().slice(0,200);
const round=n=>Math.round(n*100)/100;
function qty(value,label,unit,positive=false){
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1000000||Math.abs(value-round(value))>1e-7||(unit!=='metres'&&!Number.isInteger(value))||(positive&&value===0))throw error('Enter a valid '+label+'. Use whole numbers except for metres.');return round(value);
}
export function materialBalance(item){
 const used=item.used??0,damaged=item.damaged??0,missing=item.missing??0;
 return {leftGood:round(item.issued-used-damaged-missing-item.returnedGood),leftDamaged:round(damaged-item.returnedDamaged),checked:item.checkedIssued===item.issued};
}
export function materialProblems(j,closing=false){
 const m=j.materials;if(!m?.required)return [];
 const problems=[];
 if(!m.confirmed)problems.push('Operations must check the full site materials list.');
 for(const item of m.items){const b=materialBalance(item);
  if(item.issued>0&&!b.checked)problems.push(item.name+': save how much was used, damaged or missing.');
  if(closing&&b.checked&&(b.leftGood>0||b.leftDamaged>0))problems.push(item.name+': Operations must receive the items left at the site.');
  if(closing&&(item.missing||0)>0&&item.lossAccepted!==item.missing)problems.push(item.name+': Operations must review the missing amount.');
 }
 return problems;
}
export function plannedMaterials(equipment=''){
 return String(equipment).split('\n').flatMap(line=>{const match=/^(\d+(?:\.\d{1,2})?) × (.+)$/.exec(line.trim());if(!match)return [];
  const unit=match[2].endsWith(' (metres)')?'metres':'pieces';return [{name:match[2].replace(/ \(metres\)$/,''),unit,kind:'material',needed:Number(match[1])}];});
}
function add(m,data,id){
 if(m.items.length>=200)throw error('Keep the site list under 200 items.');
 const name=clean(data.name),unit=data.unit,kind=data.kind||'material';if(!name||!UNITS.includes(unit)||!['material','tool'].includes(kind))throw error('Choose an item name, unit and type.');
 if(kind==='tool'&&unit==='metres')throw error('Use pieces or sets for tools.');
 if(m.items.some(x=>x.name.toLowerCase()===name.toLowerCase()&&x.unit===unit))throw error('This item is on the list. Use its Send more button.');
 const item={id,name,unit,kind,needed:qty(data.needed,'amount needed',unit,true),issued:0,used:null,damaged:null,missing:null,returnedGood:0,returnedDamaged:0,checkedIssued:null};m.items.push(item);m.confirmed=null;return item;
}
export function initialMaterials(equipment){
 const m={required:true,items:[],movements:[],confirmed:null};plannedMaterials(equipment).forEach((x,i)=>add(m,x,'material-'+(i+1)));return m;
}
export function applyMaterialCommand(j,cmd,user,now){
 const {action,data={}}=cmd;
 if(action!=='materialReport'&&!stockManager(user))throw error('Only Operations can send or receive site materials.',403);
 if(action==='materialReport'&&(!j.assignees.includes(user.id)||user.role!=='installer'))throw error('Only an assigned installer can record materials used.',403);
 // Old jobs opt in explicitly. Never invent quantities sent or returned.
 j.materials||=initialMaterials(j.equipment);const m=j.materials;
 const item=m.items.find(x=>x.id===data.itemId);let detail={};
 if(action==='materialAdd'){const added=add(m,data,cmd.requestId);detail={itemId:added.id,name:added.name,needed:added.needed,unit:added.unit,kind:added.kind};}
 else if(action==='materialConfirm'){
  if(!m.items.length)throw error('Add all items needed at the site first.');m.confirmed={by:user.id,at:now};
 }else{
  if(!item)throw error('Site item not found.');
  if(action==='materialReturn'){
   const note=clean(data.note);if(!note)throw error('Say which amount needs to be checked.');item.checkedIssued=null;item.correction={note,by:user.id,at:now};j.status='Needs correction';detail={note};
  }else if(action==='materialIssue'){
   const amount=qty(data.quantity,'amount taken to site',item.unit,true);if(item.issued+amount>1000000)throw error('Amount is too large.');item.issued=round(item.issued+amount);detail={quantity:amount};
  }else if(action==='materialReport'){
   if(item.issued===0)throw error('Operations must record the amount sent first.');
   const used=qty(data.used,'amount used',item.unit),damaged=qty(data.damaged,'damaged amount',item.unit),missing=qty(data.missing,'missing amount',item.unit);
   if(item.kind==='tool'&&used!==0)throw error('Tools must come back. Record damaged or missing tools separately.');
   if(round(used+damaged+missing+item.returnedGood)>item.issued||damaged<item.returnedDamaged)throw error('Amounts do not match what was sent and returned.');
   if((damaged>0||missing>0)&&!clean(data.note))throw error('Say what happened to damaged or missing items.');
   Object.assign(item,{used,damaged,missing,correction:null,checkedIssued:item.issued,reportBy:user.id,reportAt:now});detail={used,damaged,missing,leftGood:materialBalance(item).leftGood};
  }else if(action==='materialReceive'){
   const balance=materialBalance(item);if(!balance.checked)throw error('Wait for the installer to save the amounts first.');
   const good=qty(data.good,'good amount received',item.unit),damaged=qty(data.damaged,'damaged amount received',item.unit);
   if(good>balance.leftGood||damaged>balance.leftDamaged)throw error('You cannot receive more than is left to return.');
   const acceptLoss=data.acceptLoss===true&&(item.missing||0)>0;
   if(!good&&!damaged&&!acceptLoss)throw error('Enter what you received.');
   if(acceptLoss&&!clean(data.note))throw error('Add a note about the missing items.');
   item.returnedGood=round(item.returnedGood+good);item.returnedDamaged=round(item.returnedDamaged+damaged);if(acceptLoss)item.lossAccepted=item.missing;
   detail={good,damaged,acceptedMissing:acceptLoss?item.missing:0};
  }else throw error('Unknown materials action.');
  detail={itemId:item.id,name:item.name,unit:item.unit,...detail};
 }
 m.movements.push({id:cmd.requestId,action,by:user.id,name:user.name,at:now,note:clean(data.note),...detail});
}
export function updateMaterialPlan(j,equipment){
 if(!j.materials)return;const m=j.materials;
 plannedMaterials(equipment).forEach((data,index)=>{const old=m.items.find(x=>x.name.toLowerCase()===data.name.toLowerCase()&&x.unit===data.unit);
  if(old){const needed=qty(data.needed,'amount needed',old.unit,true);if(old.needed!==needed){old.needed=needed;m.confirmed=null;}}
  else add(m,data,'planned-'+(j.versions.plan||0)+'-'+index);
 });
}
