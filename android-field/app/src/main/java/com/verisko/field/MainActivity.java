package com.verisko.field;
import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import androidx.webkit.*;
import org.json.*;
import java.util.*;
/** Native capabilities are exposed only to the exact production HTTPS origin and top frame. */
public final class MainActivity extends Activity {
 private WebView web;private final Handler handler=new Handler(Looper.getMainLooper());private SecureState store;
 private JSONObject pendingBegin;private JavaScriptReplyProxy pendingReply;private GeolocationPermissions.Callback geoReply;private String geoOrigin;private ValueCallback<Uri[]> fileReply;private boolean resumed=false;
 @Override public void onCreate(Bundle state){
  super.onCreate(state);store=new SecureState(this);web=new WebView(this);setContentView(web);
  web.setOnApplyWindowInsetsListener((v,insets)->{if(Build.VERSION.SDK_INT>=30){android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars());v.setPadding(bars.left,bars.top,bars.right,bars.bottom);}else{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());}return insets;});
  WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setGeolocationEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(true);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setJavaScriptCanOpenWindowsAutomatically(false);
  CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
  if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){new AlertDialog.Builder(this).setTitle("Update Android System WebView").setMessage("Update Android System WebView in Google Play, then reopen Verisko Field. Tracking has not started.").setPositiveButton("Close",(d,w)->finish()).show();return;}
  WebViewCompat.addWebMessageListener(web,"VeriskoNative",Collections.singleton(Rules.ORIGIN),(view,message,origin,isMainFrame,reply)->{
   if(!isMainFrame||!Rules.trusted(origin.toString())||!Rules.trusted(view.getUrl()))return;
   try{JSONObject request=new JSONObject(message.getData());String action=request.optString("action");
    if("status".equals(action)){reply(reply,request,store.status(request.optString("userId")),null);return;}
    if("begin".equals(action)){
     if(!resumed||pendingBegin!=null)throw new Exception("Open the app to check in or resume.");
     if(!request.optBoolean("consent")||request.optString("token").isEmpty()||request.optString("userId").isEmpty()||request.optLong("expiresAt")<=System.currentTimeMillis())throw new Exception("Sign in with your phone and PIN, then confirm location sharing.");
     if(!Arrays.asList("start","resume","reconnect").contains(request.optString("shiftAction")))throw new Exception("Invalid shift action.");
     pendingBegin=request;pendingReply=reply;
     ArrayList<String> permissions=new ArrayList<>();if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){permissions.add(Manifest.permission.ACCESS_COARSE_LOCATION);permissions.add(Manifest.permission.ACCESS_FINE_LOCATION);}
     if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)permissions.add(Manifest.permission.POST_NOTIFICATIONS);
     if(!permissions.isEmpty())requestPermissions(permissions.toArray(new String[0]),42);else launchBegin();return;
    }
    if("pause".equals(action)||"end".equals(action)||"local-stop".equals(action)){
     JSONObject nativeStatus=store.status(request.optString("userId"));if(!nativeStatus.optBoolean("sameUser"))throw new Exception("Sign in as the staff member who owns this shift.");
     // Stop GPS on the main thread before attempting any network operation.
     Intent stop=new Intent(this,TrackingService.class).setAction(action);
     if(TrackingService.running)startService(stop);else if("local-stop".equals(action)){store.update(s->{s.put("tracking",false);s.put("starting",false);});}else {SyncEngine.queueControl(this,action);SyncEngine.WORKER.execute(()->SyncEngine.flush(this));}
     handler.postDelayed(()->{try{reply(reply,request,store.status(request.optString("userId")),null);}catch(Exception e){reply(reply,request,null,"Could not read shift status.");}},100);return;
    }
    if("sync".equals(action)){
     if(!store.status(request.optString("userId")).optBoolean("sameUser"))throw new Exception("This shift belongs to another account.");
     SyncEngine.WORKER.execute(()->{SyncEngine.flush(this);handler.post(()->{try{reply(reply,request,store.status(request.optString("userId")),null);}catch(Exception e){reply(reply,request,null,"Could not read shift status.");}});});return;
    }
    throw new Exception("Unsupported native request.");
   }catch(Exception e){JSONObject request;try{request=new JSONObject(message.getData());}catch(Exception ignored){return;}reply(reply,request,null,e.getMessage());}
  });
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){String url=req.getUrl().toString();if(Rules.trusted(url))return false;if(req.isForMainFrame()&&(url.startsWith("https://")||url.startsWith("tel:")||url.startsWith("mailto:"))){try{startActivity(new Intent(Intent.ACTION_VIEW,req.getUrl()));}catch(Exception ignored){}}return true;}
   @Override public void onReceivedSslError(WebView view,android.webkit.SslErrorHandler h,android.net.http.SslError e){h.cancel();}
  });
  web.setWebChromeClient(new WebChromeClient(){
   @Override public void onGeolocationPermissionsShowPrompt(String origin,GeolocationPermissions.Callback callback){if(!Rules.trusted(origin)){callback.invoke(origin,false,false);return;}if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED){callback.invoke(origin,true,false);return;}geoReply=callback;geoOrigin=origin;requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.ACCESS_FINE_LOCATION},41);}
   @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){if(fileReply!=null)fileReply.onReceiveValue(null);fileReply=callback;try{startActivityForResult(params.createIntent(),43);}catch(Exception e){fileReply.onReceiveValue(null);fileReply=null;}return true;}
  });
  web.loadUrl(Rules.ORIGIN+"/");
 }
 private void launchBegin(){
  JSONObject request=pendingBegin;JavaScriptReplyProxy reply=pendingReply;if(request==null)return;
  if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED||(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)){reply(reply,request,null,"Allow precise location and notifications to start a visible field shift.");pendingBegin=null;pendingReply=null;return;}
  NotificationManager nm=getSystemService(NotificationManager.class);
  if(!nm.areNotificationsEnabled()||(nm.getNotificationChannel("field-shift")!=null&&nm.getNotificationChannel("field-shift").getImportance()==NotificationManager.IMPORTANCE_NONE)){reply(reply,request,null,"Enable Verisko Field notifications in Android Settings before starting a shift.");pendingBegin=null;pendingReply=null;return;}
  try{
   JSONObject command=new JSONObject(request.toString());command.put("action",request.getString("shiftAction"));
   store.update(s->{s.put("commandId",request.getString("id"));s.put("commandDone",false);s.put("commandError","");});
   startForegroundService(new Intent(this,TrackingService.class).setAction("begin").putExtra("command",command.toString()));
   long until=System.currentTimeMillis()+60000;
   handler.post(new Runnable(){public void run(){try{JSONObject state=store.read();if(state.optString("commandId").equals(request.getString("id"))&&state.optBoolean("commandDone")){String err=state.optString("commandError");reply(reply,request,err.isEmpty()?store.status(request.getString("userId")):null,err.isEmpty()?null:err);pendingBegin=null;pendingReply=null;return;}
    if(System.currentTimeMillis()>until){reply(reply,request,null,"Still waiting for check-in. Refresh the shift before trying again.");pendingBegin=null;pendingReply=null;return;}handler.postDelayed(this,300);
   }catch(Exception e){reply(reply,request,null,"Could not read the saved shift.");pendingBegin=null;pendingReply=null;}}});
  }catch(Exception e){reply(reply,request,null,"Could not start the Android tracking service.");pendingBegin=null;pendingReply=null;}
 }
 private void reply(JavaScriptReplyProxy proxy,JSONObject request,JSONObject result,String error){try{JSONObject out=new JSONObject().put("id",request.optString("id")).put("ok",error==null);if(error!=null)out.put("error",error);if(result!=null)out.put("status",result);proxy.postMessage(out.toString());}catch(Exception ignored){}}
 @Override public void onRequestPermissionsResult(int code,String[] p,int[] r){super.onRequestPermissionsResult(code,p,r);if(code==42)launchBegin();if(code==41&&geoReply!=null){geoReply.invoke(geoOrigin,checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED,false);geoReply=null;}}
 @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==43&&fileReply!=null){fileReply.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));fileReply=null;}}
 @Override protected void onResume(){super.onResume();resumed=true;if(web!=null)web.onResume();}
 @Override protected void onPause(){resumed=false;if(web!=null)web.onPause();super.onPause();}
 @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
 @Override protected void onDestroy(){if(fileReply!=null)fileReply.onReceiveValue(null);if(web!=null)web.destroy();handler.removeCallbacksAndMessages(null);super.onDestroy();}
}
