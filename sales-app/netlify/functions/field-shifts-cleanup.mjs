import {getStore} from '@netlify/blobs';
import {cleanupFieldShifts} from './lib/field-shifts-core.mjs';
export const config={schedule:'0 2 * * *'};
export default async ()=>{
 await cleanupFieldShifts(getStore({name:'verisko-field-shifts',consistency:'strong'}));
 return new Response('Expired field shifts removed.');
};
