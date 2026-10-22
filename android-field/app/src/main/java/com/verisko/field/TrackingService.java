package com.verisko.field;
import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.*;
import android.os.*;
import org.json.*;
import java.util.*;
public final class TrackingService extends Service implements LocationListener {
 public static volatile boolean running=false;
 private static final int NOTIFICATION=8801;
 private static volatile boolean beginInFlight=false;
 private final Handler handler=new Handler(Looper.getMainLooper());
 private SecureState store;private LocationManager locations;private JSONObject command;private boolean starting=false,uploading=false,collecting=false;
 private long lastSample=0,startedRequest=0;
 private final Runnable tick=new Runnable(){public void run(){try{
  JSONObject s=store.read();
  if(starting&&System.currentTimeMillis()-startedRequest>30000){finishCommand("Could not obtain a precise location. Move outdoors, check location permission and try again.");return;}
  if(!starting&&!Rules.mayCollect(s.optBoolean("tracking"),s.optLong("deadline"),s.optLong("expiresAt"),System.currentTimeMillis())){if(s.optBoolean("tracking"))SyncEngine.queueControl(TrackingService.this,"end");stopCollection();stopSelf();return;}
  if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){SyncEngine.queueControl(TrackingService.this,"pause");stopCollection();stopSelf();return;}
  NotificationManager notifications=getSystemService(NotificationManager.class);if(!notifications.areNotificationsEnabled()||notifications.getNotificationChannel("field-shift").getImportance()==NotificationManager.IMPORTANCE_NONE){SyncEngine.queueControl(TrackingService.this,"pause");stopCollection();stopSelf();return;}
  if(!starting&&!uploading){uploading=true;SyncEngine.WORKER.execute(()->{SyncEngine.flush(TrackingService.this);handler.post(()->{uploading=false;try{JSONObject latest=store.read();if(!starting&&!latest.optBoolean("tracking")){stopCollection();stopSelf();}else notifyStatus(latest.optString("error").isEmpty()?"Shift tracking is on":"Tracking on · updates waiting to sync");}catch(Exception e){stopCollection();stopSelf();}});});}
 }catch(Exception e){stopCollection();stopSelf();}handler.postDelayed(this,30000);}};
 @Override public void onCreate(){super.onCreate();store=new SecureState(this);locations=(LocationManager)getSystemService(LOCATION_SERVICE);NotificationManager nm=getSystemService(NotificationManager.class);nm.createNotificationChannel(new NotificationChannel("field-shift","Field shift tracking",NotificationManager.IMPORTANCE_LOW));}
 @Override public int onStartCommand(Intent intent,int flags,int startId){
  if(intent==null){stopSelf();return START_NOT_STICKY;}
  String action=intent.getAction();
  if("local-stop".equals(action)){stopCollection();try{store.update(s->{s.put("tracking",false);s.put("starting",false);s.put("error","Shift sharing ended or moved to another device.");});}catch(Exception ignored){}SyncJob.schedule(this);stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();return START_NOT_STICKY;}
  if("end".equals(action)){
   long requestedAt=System.currentTimeMillis();stopCollection();try{store.update(s->{s.put("tracking",false);s.put("starting",false);});}catch(Exception ignored){}
   notifyStatus("Checking out · saving your finish location");
   FinishLocation.capture(this,requestedAt,(position,unavailable)->{
    try{SyncEngine.queueControl(this,"end",position,requestedAt,unavailable);}catch(Exception ignored){}
    SyncEngine.WORKER.execute(()->SyncEngine.flush(this));stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();
   });return START_NOT_STICKY;
  }
  if("pause".equals(action)){
   stopCollection();try{SyncEngine.queueControl(this,action);}catch(Exception ignored){}SyncEngine.WORKER.execute(()->SyncEngine.flush(this));stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();return START_NOT_STICKY;
  }
  if(!"begin".equals(action)){stopSelf();return START_NOT_STICKY;}
  try{
   if(running||beginInFlight){JSONObject refused=new JSONObject(intent.getStringExtra("command"));store.update(s->{s.put("commandId",refused.getString("id"));s.put("commandDone",true);s.put("commandError","A shift is already starting or tracking. Refresh before trying again.");});if(!running)stopSelf();return START_NOT_STICKY;}
   command=new JSONObject(intent.getStringExtra("command"));
   store.pruneExpired();JSONObject old=store.read();String person=command.getString("userId");
   if(!old.optString("userId").isEmpty()&&!person.equals(old.optString("userId"))&&(old.optBoolean("tracking")||old.optJSONArray("queue")!=null&&old.optJSONArray("queue").length()>0)){finishCommand("Finish and sync the previous staff member’s shift first.");return START_NOT_STICKY;}
   store.update(s->{s.put("userId",person);s.put("token",command.getString("token"));s.put("expiresAt",command.getLong("expiresAt"));s.put("starting",true);s.put("tracking",false);s.put("commandId",command.getString("id"));s.put("commandDone",false);s.put("commandError","");s.put("error","");});
   Notification n=notification("Starting shift · getting your location");
   if(Build.VERSION.SDK_INT>=29)startForeground(NOTIFICATION,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);else startForeground(NOTIFICATION,n);
   running=true;starting=true;startedRequest=System.currentTimeMillis();collecting=true;
   if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED)throw new SecurityException("Precise location is required.");
   if(locations.isProviderEnabled(LocationManager.GPS_PROVIDER))locations.requestLocationUpdates(LocationManager.GPS_PROVIDER,30000,0,this,Looper.getMainLooper());
   if(locations.isProviderEnabled(LocationManager.NETWORK_PROVIDER))locations.requestLocationUpdates(LocationManager.NETWORK_PROVIDER,30000,0,this,Looper.getMainLooper());
   handler.removeCallbacks(tick);handler.post(tick);
  }catch(Exception e){finishCommand("Could not start tracking. Allow precise location and notifications, then try again.");}
  return START_NOT_STICKY;
 }
 @Override public void onLocationChanged(Location location){
  if(!collecting||!location.hasAccuracy()||location.isFromMockProvider())return;
  long at=location.getTime(),now=System.currentTimeMillis();if(now-at>120000||at>now+15000)return;
  if(starting){
   if(location.getAccuracy()>150||uploading)return;
   uploading=true;beginInFlight=true;final JSONObject capturedCommand;try{capturedCommand=new JSONObject(command.toString());}catch(Exception e){beginInFlight=false;finishCommand("Invalid check-in request.");return;}JSONObject body=new JSONObject();
   try{body.put("action",capturedCommand.getString("action")).put("consent",true).put("position",position(location)).put("requestId",capturedCommand.getString("id")).put("area",capturedCommand.optString("area")).put("shiftId",capturedCommand.optString("shiftId"));}
   catch(Exception e){beginInFlight=false;finishCommand("Could not prepare check-in.");return;}
   SyncEngine.WORKER.execute(()->{
    try{
     if(!SyncEngine.flush(this))throw new Exception("Reconnect to sync your previous pause or check-out before starting.");
     JSONObject response=SyncEngine.api(capturedCommand.getString("token"),"POST",body,null),shift=response.getJSONObject("shift");JSONArray segments=shift.getJSONArray("segments");
     final boolean[] cancelled={false};
     store.update(s->{cancelled[0]=!s.optBoolean("starting")||!s.optString("commandId").equals(capturedCommand.getString("id"));s.put("shiftId",shift.getString("id"));s.put("startedAt",shift.getString("startedAt"));s.put("status",cancelled[0]?"ended":"active");s.put("segmentId",segments.getJSONObject(segments.length()-1).getString("id"));s.put("deadline",java.time.Instant.parse(shift.getString("startedAt")).toEpochMilli()+Rules.SHIFT_LIMIT);s.put("tracking",!cancelled[0]);s.put("starting",false);s.put("pendingAction","");s.put("commandDone",true);s.put("commandError","");});
     if(cancelled[0]){SyncEngine.queueControl(this,"end");SyncEngine.flush(this);handler.post(()->finishCommand("Check-in was cancelled; tracking is off."));}
     else handler.post(()->{starting=false;uploading=false;lastSample=at;notifyStatus("Shift tracking is on");});
    }catch(Exception e){handler.post(()->finishCommand(e.getMessage()==null?"Check-in failed. Reconnect and try again.":e.getMessage()));}finally{beginInFlight=false;}
   });return;
  }
  try{
   JSONObject s=store.read();if(!Rules.mayCollect(s.optBoolean("tracking"),s.optLong("deadline"),s.optLong("expiresAt"),now)||!Rules.sample(lastSample,at))return;
   JSONObject point=position(location);lastSample=at;
   store.update(data->{if(!data.optBoolean("tracking"))return;JSONArray queue=data.optJSONArray("queue");if(queue==null)queue=new JSONArray();if(queue.length()>=1500)throw new Exception("Saved location limit reached. Reconnect and check out.");queue.put(new JSONObject().put("kind","point").put("id",UUID.randomUUID().toString()).put("shiftId",data.getString("shiftId")).put("segmentId",data.getString("segmentId")).put("position",point));data.put("queue",queue);});
   if(!uploading){uploading=true;SyncEngine.WORKER.execute(()->{SyncEngine.flush(this);handler.post(()->uploading=false);});}
  }catch(Exception e){try{SyncEngine.queueControl(this,"pause");}catch(Exception ignored){}stopCollection();stopSelf();}
 }
 private JSONObject position(Location l)throws JSONException{return new JSONObject().put("lat",l.getLatitude()).put("lng",l.getLongitude()).put("accuracy",l.getAccuracy()).put("at",java.time.Instant.ofEpochMilli(l.getTime()).toString());}
 private void finishCommand(String error){try{store.update(s->{s.put("starting",false);s.put("tracking",false);s.put("commandDone",true);s.put("commandError",error);s.put("error",error);});}catch(Exception ignored){}starting=false;stopCollection();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
 private Notification notification(String text){
  PendingIntent open=PendingIntent.getActivity(this,1,new Intent(this,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  Notification.Builder b=new Notification.Builder(this,"field-shift").setSmallIcon(R.drawable.ic_verisko).setContentTitle("Verisko Field").setContentText(text).setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true).setCategory(Notification.CATEGORY_SERVICE);
  for(String action:new String[]{"pause","end"}){PendingIntent stop=PendingIntent.getService(this,action.equals("pause")?2:3,new Intent(this,TrackingService.class).setAction(action),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);b.addAction(new Notification.Action.Builder(null,action.equals("pause")?"Pause shift":"Check out",stop).build());}
  return b.build();
 }
 private void notifyStatus(String text){if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;getSystemService(NotificationManager.class).notify(NOTIFICATION,notification(text));}
 private void stopCollection(){collecting=false;handler.removeCallbacks(tick);if(locations!=null)try{locations.removeUpdates(this);}catch(SecurityException ignored){}}
 @Override public void onDestroy(){stopCollection();running=false;super.onDestroy();}
 @Override public IBinder onBind(Intent intent){return null;}
 @Override public void onProviderEnabled(String provider){}
 @Override public void onProviderDisabled(String provider){}
 @Override public void onStatusChanged(String provider,int status,Bundle extras){}
}
