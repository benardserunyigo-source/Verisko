export const SITE_SHOTS=[
 ['front','Front of the site','Stand back. Show the whole building and its entrance.'],
 ['entrance','Main entrance','Show where people enter and leave.'],
 ['areas','Area to protect','Show the shop, yard or room the client wants to watch.'],
 ['power','Recorder and power','Show a safe place for the recorder and the nearby power socket.']
];
export const CAMERA_SHOTS=[
 ['mount','Camera spot','Stand back. Point to the place where this camera will go.'],
 ['view','What it should see','Face the area this camera should watch. Show the full view.'],
 ['route','Cable route','Show where the cable will run from this camera towards the recorder.']
];
export const latestPhoto=(item,positionId,slot)=>(item.photos||[]).filter(p=>p.positionId===positionId&&p.slot===slot).at(-1);
export const positionReady=(item,p)=>!!p.aim&&CAMERA_SHOTS.every(([slot])=>latestPhoto(item,p.id,slot));
export const sitePlanReady=item=>!!item.positions?.length&&item.positions.every(p=>positionReady(item,p));
