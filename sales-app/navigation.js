/* Navigation is a display allowlist. Server permissions still protect every record. */
(function(root){
 'use strict';
 var staff=['admin','operations','teamlead','sales'],office=['admin','operations'];
 var pages=[
  {id:'today',section:'home',label:'Today',roles:staff},
  {id:'dashboard',section:'home',label:'Dashboard',roles:staff},
  {id:'field',section:'home',label:'Field shifts',roles:staff},
  {id:'installerhome',section:'home',label:'Today',roles:['installer']},
  {id:'leads',section:'contacts',label:'Saved leads',roles:staff},
  {id:'ready',section:'contacts',label:'Site visit queue',roles:staff,badge:'readyBadge'},
  {id:'prospects',section:'contacts',label:'Prospects',roles:staff,badge:'prospectBadge'},
  {id:'prices',section:'contacts',label:'Package prices',roles:staff},
  {id:'jobsummary',section:'work',label:'Job summaries',roles:office},
  {id:'visits',section:'work',label:'Site visits',roles:staff},
  {id:'installwork',section:'work',label:'Installations',roles:['admin','operations','teamlead','installer'],badge:'installerBadge'},
  {id:'callbacks',section:'work',label:'Callbacks',roles:staff.concat('installer')},
  {id:'inventory',section:'work',label:'Inventory',roles:office},
  {id:'materials',section:'work',label:'Materials & buying',roles:office},
  {id:'jobs',section:'work',label:'Job records',roles:office},
  {id:'more',section:'more',label:'Tools & help',roles:staff.concat('installer')},
  {id:'salesprices',section:'more',label:'Sales prices',roles:office},
  {id:'draftplans',section:'more',label:'Draft payment options',roles:office},
  {id:'support',section:'more',label:'Support videos',roles:staff},
  {id:'money',section:'tools',label:'Funds & team pay',roles:office},
  {id:'cashflow',section:'more',label:'Payments',roles:office,badge:'cashBadge'},
  {id:'applications',section:'more',label:'Applications',roles:office},
  {id:'settings',section:'more',label:'Team & settings',roles:['admin']},
  {id:'installerhelp',section:'more',label:'Help',roles:['installer']}
 ];
 var sections=[{id:'home',label:'Home'},{id:'contacts',label:'Contacts'},{id:'work',label:'Jobs'},{id:'more',label:'More'}];
 function views(role,section){var list=pages.filter(function(p){return p.roles.includes(role);}).map(function(p){if(role==='teamlead')return Object.assign({},p,{label:({ready:'Visit requests',leads:'Saved contacts',prospects:'Other clients'})[p.id]||p.label});if(office.includes(role))return Object.assign({},p,{section:['inventory','salesprices'].includes(p.id)?'more':['more','draftplans','support','cashflow','applications','settings'].includes(p.id)?'tools':p.section,label:({ready:'Visit requests',leads:'Saved contacts',prospects:'Other clients',jobsummary:'Jobs',inventory:'Stock',cashflow:'Office cash book',jobs:'Quote records'})[p.id]||p.label});if(role!=='sales')return p;var changes={dashboard:{section:'more',label:'My pay'},field:{section:'work',label:'My shift'},ready:{section:'work',label:'Sent contacts'},leads:{label:'My contacts'},more:{label:'Help & prices'}};return Object.assign({},p,changes[p.id]||{});});if(['operations','teamlead'].includes(role)){var ready=list.find(p=>p.id==='ready');list=list.filter(p=>p.id!=='ready');list.splice(list.findIndex(p=>p.id==='leads'),0,ready);}if(role==='sales')list.sort(function(a,b){var order=['today','leads','ready','field','visits','dashboard','more'];return (order.includes(a.id)?order.indexOf(a.id):99)-(order.includes(b.id)?order.indexOf(b.id):99);});if(office.includes(role)){var stock=list.find(p=>p.id==='inventory');list=list.filter(p=>p.id!=='inventory');list.splice(list.findIndex(p=>p.id==='more'),0,stock);}return list.filter(function(p){return !section||p.section===section;});}
 function allowed(role,view){return views(role).some(function(p){return p.id===view;});}
 function group(role,view){var p=views(role).find(function(p){return p.id===view;});return p?p.section:null;}
 root.VeriskoNavigation={views:views,allowed:allowed,group:group,sections:function(role){return sections.filter(function(s){return views(role,s.id).length;}).map(function(s){return office.includes(role)?Object.assign({},s,{label:({home:'Today',more:'Stock'})[s.id]||s.label}):role==='sales'?Object.assign({},s,{label:({work:'My work',more:'My pay'})[s.id]||s.label}):s;});},first:function(role,section){return views(role,section)[0]?.id||null;}};
})(typeof window==='object'?window:globalThis);
