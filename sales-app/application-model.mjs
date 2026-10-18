export const STUDY = ['Year 1', 'Year 2', 'Year 3', 'Year 4 or above', 'Graduated'];
export const STATUSES = ['New', 'Contacted', 'Interview', 'Hired', 'Not selected'];
export const CHUNK_SIZE = 1024 * 1024;
export const MAX_VIDEO = 24 * CHUNK_SIZE;
export const QUESTIONS = [
 ['fullName','What is your full name?','For example: Sarah Namutebi'],
 ['phone','What is your WhatsApp phone number?','For example: 0772 123 456'],
 ['area','Where do you live?','Town or area only. For example: Nakawa, Kampala'],
 ['university','Which university do you attend, or did you graduate from?','For example: MUBS or Kyambogo University'],
 ['course','What bachelor’s degree are you studying, or did you complete?','For example: Bachelor of Business Administration'],
 ['study','What is your current year of study?','Choose your year, or Graduated.'],
 ['availability','When can you do fieldwork during the week?','Tell us the days and times you are free. For example: Monday and Wednesday afternoons.'],
 ['startDate','When could you start this three-month role?','Choose the first day you could start.'],
 ['approach','How would you ask a shop owner to book a camera site check?','Write 2–4 sentences. We want to hear your approach.'],
 ['motivation','Why would you like this sales role?','Write 2–4 sentences about your interest or experience.']
];
export function validateAnswers(input={}) {
 const answers={};
 for(const [key,label] of QUESTIONS){const value=String(input[key]||'').trim();if(!value||value.length>(['approach','motivation','availability'].includes(key)?1200:160))throw Error(label);answers[key]=value;}
 const digits=answers.phone.replace(/\D/g,'').replace(/^256/,'0');
 if(!/^0[37]\d{8}$/.test(digits))throw Error('Enter a Ugandan mobile number, for example 0772 123 456.');
 answers.phone='+256'+digits.slice(1);
 if(!STUDY.includes(answers.study))throw Error('Choose your year of study or Graduated.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(answers.startDate)||!Number.isFinite(Date.parse(answers.startDate))||new Date(answers.startDate).toISOString().slice(0,10)!==answers.startDate)throw Error('Choose a valid start date.');
 return answers;
}
export function videoInfo(input={}) {
 const {size,duration}=input;const mime=String(input.mime||'').split(';')[0];
 if(!['video/webm','video/mp4'].includes(mime)||!Number.isInteger(size)||size<100||size>MAX_VIDEO||!Number.isFinite(duration)||duration<2||duration>122)throw Error('Use a video up to 2 minutes and 24 MB, in MP4 or WebM format.');
 return {size,mime,duration,chunks:Math.ceil(size/CHUNK_SIZE)};
}
export function validVideoHeader(bytes,mime){return mime==='video/webm'?bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3:String.fromCharCode(...bytes.slice(4,8))==='ftyp';}
