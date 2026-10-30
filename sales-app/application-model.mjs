export const STUDY = ['Year 1', 'Year 2', 'Year 3', 'Year 4 or above', 'Graduated'];
export const STATUSES = ['New', 'Contacted', 'Interview', 'Hired', 'Not selected'];
export const CHUNK_SIZE = 1024 * 1024;
export const MAX_VIDEO = 24 * CHUNK_SIZE;
export const FORM_VERSION = 'pick-v2';
export const OPTIONS = {
 availability: ['Yes, for all three months', 'Yes, alongside my classes for all three months', 'I need to discuss my availability', 'No, I cannot commit to three months'],
 area: ['Nakawa', 'Ntinda', 'Kyambogo', 'Banda', 'Kireka', 'Kira', 'Naalya', 'Bugolobi', 'Kampala Central', 'Makindye', 'Kawempe', 'Rubaga', 'Wakiso', 'Mukono', 'Entebbe', 'Other'],
 university: ['MUBS', 'Kyambogo University', 'Makerere University', 'Uganda Christian University', 'Kampala International University', 'Makerere University Business School regional campus', 'Nkumba University', 'Cavendish University Uganda', 'Ndejje University', 'Uganda Martyrs University', 'Other'],
 course: ['Sales and Marketing', 'Business Administration', 'Commerce', 'Entrepreneurship', 'Accounting and Finance', 'Economics', 'Procurement and Supply Chain', 'Other'],
 startDate: ['As soon as possible', 'Within 1 week', 'Within 2 weeks', 'Within 1 month', 'Pick a date'],
 approach: ['No, this would be my first role', 'Yes, sales or marketing', 'Yes, customer service', 'Yes, both sales and customer service'],
 motivation: ['Yes, I am ready', 'Yes, with some training', 'I need to discuss my timetable', 'No, I cannot do regular fieldwork']
};
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const TIMES = ['Mornings', 'Afternoons', 'Full days', 'Varies with my timetable'];
export const QUESTIONS = [
 ['fullName','What is your full name?','For example: Sarah Namutebi'],
 ['phone','What is your WhatsApp phone number?','For example: 0772 123 456'],
 ['area','Where do you live?','Choose your area. If it is not listed, choose Other.'],
 ['university','Which university do you attend, or did you graduate from?','Choose your university, or Other.'],
 ['course','What bachelor’s degree are you studying, or did you complete?','Choose the closest course, or Other.'],
 ['study','What is your current year of study?','Choose your year, or Graduated.'],
 ['availability','Can you do this job for the full three months?','Think about your classes, exams and other plans over the next three months. Choose one answer.'],
 ['startDate','When could you start this three-month role?','Choose one. You can also pick a date.'],
 ['approach','Have you done sales or customer service before?','Choose the answer that fits you best. Experience is not required.'],
 ['motivation','Can you visit businesses and work towards 3 confirmed site bookings a week?','Choose the answer that fits you best. We can discuss training and your timetable.']
];
export const SIMPLE_VERSION = 'simple-v3';
export const SIMPLE_QUESTIONS = [QUESTIONS[0], QUESTIONS[1], QUESTIONS[2],
 ['study','Are you studying for a bachelor’s degree, or have you graduated?','Choose your year, or Graduated.'], QUESTIONS[6]];
export const PICK_V1_QUESTIONS = QUESTIONS.map(q=>q[0]==='availability'?['availability','When can you do fieldwork during the week?','Pick all the days you are free, then choose the best time.']:q);
export const LEGACY_QUESTIONS = [...PICK_V1_QUESTIONS.slice(0,8), ['approach','How would you ask a shop owner to book a camera site check?',''], ['motivation','Why would you like this sales role?','']];
export function questionsFor(answers={}) { return answers.formVersion===SIMPLE_VERSION?SIMPLE_QUESTIONS:answers.formVersion===FORM_VERSION?QUESTIONS:answers.formVersion==='pick-v1'?PICK_V1_QUESTIONS:LEGACY_QUESTIONS; }
function selectedAnswers(input) {
 const out={...input};
 for(const key of ['area','university','course']){
  const choice=input[key+'Choice']||input[key];
  if(!OPTIONS[key].includes(choice))throw Error('Choose your '+(key==='area'?'area':key==='course'?'bachelor’s course':'university')+'.');
  const other=String(input[key+'Other']||(input[key+'Choice']==='Other'?input[key]:'')||'').trim();
  if(choice==='Other'&&(!other||other==='Other'||other.length>160))throw Error('Enter your '+(key==='area'?'area':key==='course'?'bachelor’s course':'university')+' under Other.');
  out[key]=choice==='Other'?other:choice;out[key+'Choice']=choice;
 }
 if(input.formVersion==='pick-v1'){
 const days=input.availabilityDays;
 if(!Array.isArray(days)||!days.length||days.length>7||days.some(day=>!DAYS.includes(day))||!TIMES.includes(input.availabilityTime))throw Error('Pick at least one day and a time for fieldwork.');
 out.availabilityDays=DAYS.filter(day=>days.includes(day));out.availabilityTime=input.availabilityTime;out.availability=out.availabilityDays.join(', ')+' · '+input.availabilityTime;
 }else if(!OPTIONS.availability.includes(input.availability))throw Error('Choose whether you can do this job for the full three months.');
 const start=input.startDateChoice||input.startDate;
 if(!OPTIONS.startDate.includes(start))throw Error('Choose when you could start.');
 out.startDateChoice=start;out.startDate=start==='Pick a date'?(input.startDateOther||input.startDate):start;
 for(const key of ['approach','motivation'])if(!OPTIONS[key].includes(input[key]))throw Error(QUESTIONS.find(q=>q[0]===key)[1]);
 return out;
}
export function validateAnswers(input={}) {
 if(input.formVersion===SIMPLE_VERSION){
  const answers={formVersion:SIMPLE_VERSION};
  for(const [key,label] of SIMPLE_QUESTIONS){const value=String(input[key]||'').trim();if(!value||value.length>160)throw Error(label);answers[key]=value;}
  const digits=answers.phone.replace(/\D/g,'').replace(/^256/,'0');
  if(!/^0[37]\d{8}$/.test(digits))throw Error('Enter a Ugandan mobile number, for example 0772 123 456.');
  answers.phone='+256'+digits.slice(1);
  const choice=input.areaChoice||input.area;
  if(!OPTIONS.area.includes(choice))throw Error('Choose your area.');
  answers.areaChoice=choice;
  answers.area=choice==='Other'?String(input.areaOther||input.area||'').trim():choice;
  if(!answers.area||answers.area==='Other'||answers.area.length>160)throw Error('Enter your area under Other.');
  if(!STUDY.includes(answers.study))throw Error('Choose your year of study or Graduated.');
  if(!OPTIONS.availability.includes(answers.availability))throw Error('Choose whether you can do this job for the full three months.');
  return answers;
 }
 const selected=[FORM_VERSION,'pick-v1'].includes(input.formVersion);
 if(selected)input=selectedAnswers(input);
 const answers={};
 for(const [key,label] of QUESTIONS){const value=String(input[key]||'').trim();if(!value||value.length>(['approach','motivation','availability'].includes(key)?1200:160))throw Error(label);answers[key]=value;}
 const digits=answers.phone.replace(/\D/g,'').replace(/^256/,'0');
 if(!/^0[37]\d{8}$/.test(digits))throw Error('Enter a Ugandan mobile number, for example 0772 123 456.');
 answers.phone='+256'+digits.slice(1);
 if(!STUDY.includes(answers.study))throw Error('Choose your year of study or Graduated.');
 if(!selected||input.startDateChoice==='Pick a date')if(!/^\d{4}-\d{2}-\d{2}$/.test(answers.startDate)||!Number.isFinite(Date.parse(answers.startDate))||new Date(answers.startDate).toISOString().slice(0,10)!==answers.startDate)throw Error('Choose a valid start date.');
 if(selected)for(const key of ['formVersion','areaChoice','universityChoice','courseChoice','startDateChoice',...(input.formVersion==='pick-v1'?['availabilityDays','availabilityTime']:[])])answers[key]=input[key];
 return answers;
}
export function videoInfo(input={}) {
 const {size,duration}=input;const mime=String(input.mime||'').split(';')[0];
 if(!['video/webm','video/mp4'].includes(mime)||!Number.isInteger(size)||size<100||size>MAX_VIDEO||!Number.isFinite(duration)||duration<2||duration>122)throw Error('Use a video up to 2 minutes and 24 MB, in MP4 or WebM format.');
 return {size,mime,duration,chunks:Math.ceil(size/CHUNK_SIZE)};
}
export function validVideoHeader(bytes,mime){return mime==='video/webm'?bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3:String.fromCharCode(...bytes.slice(4,8))==='ftyp';}
