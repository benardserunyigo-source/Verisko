// Microphone access happens only after Record is tapped. No background recording.
export class VoiceRecorder{
 constructor({devices=navigator.mediaDevices,Recorder=globalThis.MediaRecorder,now=()=>Date.now(),onStop=()=>{},onTick=()=>{},onError=()=>{},setTimer=(fn,ms)=>globalThis.setInterval(fn,ms),clearTimer=id=>globalThis.clearInterval(id)}={}){Object.assign(this,{devices,Recorder,now,onStop,onTick,onError,setTimer,clearTimer});this.disposed=false;}
 async start(){
 if(!this.devices?.getUserMedia||!this.Recorder)throw new Error('Use current Chrome on Android to record a voice note.');
 if(this.starting||this.recorder)throw new Error('A recording is already open.');this.starting=true;
 try{const stream=await this.devices.getUserMedia({audio:true});if(this.disposed){stream.getTracks().forEach(t=>t.stop());return;}this.stream=stream;
 const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(m=>this.Recorder.isTypeSupported(m));if(!mime)throw new Error('Audio recording is not supported. Use Chrome on Android.');
 this.chunks=[];this.recorder=new this.Recorder(stream,{mimeType:mime,audioBitsPerSecond:32000});this.started=this.now();
 this.recorder.ondataavailable=e=>{if(e.data?.size)this.chunks.push(e.data);};
 this.recorder.onerror=()=>{this.failed=true;this.cleanup();this.onError(new Error('The recording stopped. Please record it again.'));};
 this.recorder.onstop=()=>{this.cleanup();if(!this.disposed&&!this.failed){const blob=new Blob(this.chunks,{type:this.recorder.mimeType||mime}),duration=Math.max(.1,Math.min(120,((this.stopped??this.now())-this.started)/1000));this.onStop({blob,durationSeconds:duration});}};
 this.recorder.start(1000);this.timer=this.setTimer(()=>{const seconds=Math.floor((this.now()-this.started)/1000);this.onTick(seconds);if(seconds>=120)this.stop();},250);
 }catch(e){this.cleanup();if(!this.disposed)throw new Error(e.name==='NotAllowedError'?'Allow the microphone, then tap Record again.':e.message||'Could not start the microphone.');}finally{this.starting=false;}
 }
 stop(){if(this.recorder?.state==='recording'){this.stopped=this.now();this.recorder.stop();}this.cleanup();}
 cleanup(){if(this.timer){this.clearTimer(this.timer);this.timer=null;}this.stream?.getTracks().forEach(t=>t.stop());}
 dispose(){this.disposed=true;this.stop();this.cleanup();}
}
