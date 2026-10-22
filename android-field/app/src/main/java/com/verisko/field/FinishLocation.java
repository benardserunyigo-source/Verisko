package com.verisko.field;
import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.*;
import android.os.*;
import org.json.JSONObject;
/** One bounded GPS fix after an explicit check-out. Never starts a tracking service. */
public final class FinishLocation {
 public interface Done {void accept(JSONObject position,String unavailable);}
 public static void capture(Context ctx,long requestedAt,Done callback){
  if(ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){callback.accept(null,"Location permission was not available at check-out.");return;}
  LocationManager manager=(LocationManager)ctx.getSystemService(Context.LOCATION_SERVICE);
  Handler handler=new Handler(Looper.getMainLooper());
  class Once implements LocationListener {
   boolean done=false;final Runnable timeout=()->finish(null,"A fresh finish location was not available. Check-out was saved.");
   void finish(JSONObject position,String unavailable){if(done)return;done=true;handler.removeCallbacks(timeout);try{manager.removeUpdates(this);}catch(Exception ignored){}callback.accept(position,unavailable);}
   @Override public void onLocationChanged(Location l){
    long now=System.currentTimeMillis();if(!Rules.finishFix(l.getAccuracy(),l.getTime(),requestedAt,now,l.hasAccuracy(),l.isFromMockProvider()))return;
    try{finish(new JSONObject().put("lat",l.getLatitude()).put("lng",l.getLongitude()).put("accuracy",l.getAccuracy()).put("at",java.time.Instant.ofEpochMilli(l.getTime()).toString()),"");}catch(Exception e){finish(null,"The finish location could not be saved.");}
   }
   @Override public void onProviderEnabled(String provider){}
   @Override public void onProviderDisabled(String provider){}
   @Override public void onStatusChanged(String provider,int status,Bundle extras){}
  }
  Once once=new Once();try{
   boolean requested=false;for(String provider:new String[]{LocationManager.GPS_PROVIDER,LocationManager.NETWORK_PROVIDER})if(manager.isProviderEnabled(provider)){manager.requestSingleUpdate(provider,once,Looper.getMainLooper());requested=true;}
   if(!requested){once.finish(null,"Phone location was off at check-out.");return;}handler.postDelayed(once.timeout,8000);
  }catch(Exception e){once.finish(null,"The phone could not get a finish location.");}
 }
 private FinishLocation(){}
}
