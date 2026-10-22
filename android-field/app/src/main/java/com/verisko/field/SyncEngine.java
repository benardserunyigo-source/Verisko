package com.verisko.field;
import android.content.Context;
import org.json.*;
import javax.net.ssl.HttpsURLConnection;
import java.net.URL;
import java.io.*;
import java.util.*;
/** One process-wide uploader, fixed HTTPS destination, no coordinates or credentials in logs. */
public final class SyncEngine {
 public static final java.util.concurrent.ExecutorService WORKER=java.util.concurrent.Executors.newSingleThreadExecutor();
 public static final class ApiError extends IOException {public final int status;ApiError(int code,String message){super(message);status=code;}}
 public static JSONObject api(String token,String method,JSONObject body,String query) throws Exception {
  HttpsURLConnection c=(HttpsURLConnection)new URL(Rules.ORIGIN+"/api/field-shifts"+(query==null?"":query)).openConnection();
  c.setRequestMethod(method);c.setInstanceFollowRedirects(false);c.setConnectTimeout(15000);c.setReadTimeout(15000);c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Content-Type","application/json");
  try{if(body!=null){c.setDoOutput(true);try(OutputStream out=c.getOutputStream()){out.write(body.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}}
   int code=c.getResponseCode();InputStream in=code>=400?c.getErrorStream():c.getInputStream();String text="";if(in!=null)try(in){ByteArrayOutputStream buffer=new ByteArrayOutputStream();byte[] chunk=new byte[8192];int count;while((count=in.read(chunk))!=-1)buffer.write(chunk,0,count);text=buffer.toString("UTF-8");}
   JSONObject result;try{result=new JSONObject(text);}catch(Exception e){throw new ApiError(code,"Shift server did not return a valid response.");}
   if(code<200||code>=300||!result.optBoolean("ok"))throw new ApiError(code,result.optString("error","Shift update failed."));return result;
  }finally{c.disconnect();}
 }
 public static void queueControl(Context ctx,String action) throws Exception {
  SecureState store=new SecureState(ctx);store.update(s->{
   s.put("tracking",false);s.put("starting",false);s.put("status","end".equals(action)?"ended":"paused");
   if(s.optString("shiftId").isEmpty())return;
   JSONArray q=s.optJSONArray("queue");if(q==null)q=new JSONArray();
   // Preserve an earlier offline pause, so checkout cannot count the break as work.
   JSONObject body=new JSONObject().put("action",action).put("shiftId",s.optString("shiftId")).put("requestedAt",java.time.Instant.now().toString()).put("requestId",UUID.randomUUID().toString());
   q.put(new JSONObject().put("id",body.getString("requestId")).put("kind","control").put("body",body));
   s.put("queue",q);s.put("pendingAction",action);s.put("error","Sharing stopped. Waiting to sync.");
  });SyncJob.schedule(ctx);
 }
 public static boolean flush(Context ctx){
  android.os.PowerManager.WakeLock lock=((android.os.PowerManager)ctx.getSystemService(Context.POWER_SERVICE)).newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK,"Verisko:shift-upload");
  lock.acquire(120000);
  try{return flushHeld(ctx);}finally{if(lock.isHeld())lock.release();}
 }
 private static boolean flushHeld(Context ctx){
  SecureState store=new SecureState(ctx);
  try{
   store.pruneExpired();
   for(int cycle=0;cycle<80;cycle++){
    JSONObject state=store.read();JSONArray queue=state.optJSONArray("queue");
    if(queue==null||queue.length()==0)return true;
    if(System.currentTimeMillis()>=state.optLong("expiresAt")){store.update(s->{s.put("tracking",false);s.put("error","Sign in again to upload the saved shift.");});return false;}
    String token=state.optString("token");JSONObject head=queue.getJSONObject(0),body;List<String> sent=new ArrayList<>();
    if("point".equals(head.optString("kind"))){
     JSONArray points=new JSONArray();String segment=head.getString("segmentId"),shift=head.getString("shiftId");
     // Fetch the authoritative interval before delayed uploads. No location is in this status response.
     JSONObject current=api(token,"GET",null,"?status=1").optJSONObject("current");
     if(current==null||!shift.equals(current.optString("id")))throw new ApiError(409,"Shift changed. Open the app to review saved updates.");
     if(!"active".equals(current.optString("status"))||!segment.equals(current.optString("segmentId")))store.update(s->{s.put("tracking",false);s.put("error","Sharing stopped on another device or this shift ended.");});
     JSONObject interval=null;JSONArray segments=current.getJSONArray("segments");for(int i=0;i<segments.length();i++){JSONObject x=segments.getJSONObject(i);if(segment.equals(x.optString("id")))interval=x;}
     final JSONObject allowed=interval;
     for(int i=0;i<Math.min(25,queue.length());i++){
      JSONObject e=queue.getJSONObject(i);if(!"point".equals(e.optString("kind"))||!segment.equals(e.optString("segmentId")))break;
      sent.add(e.getString("id"));JSONObject p=e.getJSONObject("position");long at=java.time.Instant.parse(p.getString("at")).toEpochMilli();
      long start=allowed==null?Long.MAX_VALUE:java.time.Instant.parse(allowed.getString("startedAt")).toEpochMilli();
      long end=allowed==null?0:allowed.optString("endedAt").isEmpty()?current.getLong("deadline"):java.time.Instant.parse(allowed.getString("endedAt")).toEpochMilli();
      if(at>=start&&at<=end&&System.currentTimeMillis()-at<=Rules.QUEUE_TTL)points.put(p);
     }
     if(points.length()==0){remove(store,sent);continue;}
     body=new JSONObject().put("action","batch").put("shiftId",shift).put("segmentId",segment).put("points",points).put("requestId","batch-"+sent.get(0)+"-"+sent.get(sent.size()-1));
    }else{body=head.getJSONObject("body");sent.add(head.getString("id"));}
    try{api(token,"POST",body,null);}
    catch(ApiError error){
     if(error.status==409&&"control".equals(head.optString("kind"))){
      JSONObject cur=api(token,"GET",null,"?status=1").optJSONObject("current");
      if(cur==null||!head.getJSONObject("body").optString("shiftId").equals(cur.optString("id"))||"ended".equals(cur.optString("status"))||("pause".equals(body.optString("action"))&&"paused".equals(cur.optString("status")))){remove(store,sent);continue;}
     }
     throw error;
    }
    remove(store,sent);
   }
   return false;
  }catch(Exception e){
   try{store.update(s->{s.put("error",e instanceof ApiError?e.getMessage():"No connection. Locations are saved securely on this phone.");if(e instanceof ApiError&&(((ApiError)e).status==401||((ApiError)e).status==403||((ApiError)e).status==409))s.put("tracking",false);});}catch(Exception ignored){}
   return false;
  }
 }
 private static void remove(SecureState store,List<String> ids) throws Exception {
  store.update(s->{JSONArray q=s.optJSONArray("queue"),remaining=new JSONArray();if(q!=null)for(int i=0;i<q.length();i++){JSONObject x=q.getJSONObject(i);if(!ids.contains(x.getString("id")))remaining.put(x);}s.put("queue",remaining);
   if(remaining.length()==0){s.put("pendingAction","");s.put("error","");if(!s.optBoolean("tracking")&&!s.optBoolean("starting"))s.remove("token");}
  });
 }
 private SyncEngine(){}
}
