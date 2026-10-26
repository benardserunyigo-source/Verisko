export function assessmentTime(at){
 if(!at||!Number.isFinite(Date.parse(at)))return null;
 const local=new Date(Date.parse(at)+3*3600000).toISOString();return {date:local.slice(0,10),time:local.slice(11,16)};
}
// Only this person's latest finished visit is eligible as a suggested assessment time.
export function latestAssessmentTime(sessions,userId,contactId){
 return assessmentTime(sessions.filter(s=>s.userId===userId&&s.contactId===contactId&&s.finish?.at).sort((a,b)=>Date.parse(b.finish.at)-Date.parse(a.finish.at))[0]?.finish.at);
}
