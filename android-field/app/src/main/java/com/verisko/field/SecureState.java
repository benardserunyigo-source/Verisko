package com.verisko.field;
import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import org.json.JSONObject;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.io.*;
import java.security.KeyStore;
/** Entire state (credentials and queued coordinates) encrypted with a non-exportable device key. */
public final class SecureState {
 private static final Object LOCK=new Object();
 private final AtomicFile file;
 public SecureState(Context context){file=new AtomicFile(new File(context.getNoBackupFilesDir(),"field-state.aes"));}
 private SecretKey key() throws Exception {
  KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
  if(!ks.containsAlias("verisko.field.v1")){KeyGenerator gen=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");gen.init(new KeyGenParameterSpec.Builder("verisko.field.v1",KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());gen.generateKey();}
  return (SecretKey)ks.getKey("verisko.field.v1",null);
 }
 private JSONObject readUnsafe() throws Exception {
  if(!file.getBaseFile().exists())return new JSONObject();
  byte[] all=file.readFully();if(all.length<29)throw new IOException("Saved shift could not be decrypted.");
  Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,java.util.Arrays.copyOfRange(all,0,12)));
  return new JSONObject(new String(c.doFinal(java.util.Arrays.copyOfRange(all,12,all.length)),java.nio.charset.StandardCharsets.UTF_8));
 }
 public JSONObject read() throws Exception {synchronized(LOCK){return readUnsafe();}}
 public interface Change {void apply(JSONObject state) throws Exception;}
 public void update(Change change) throws Exception {synchronized(LOCK){JSONObject state=readUnsafe();change.apply(state);Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key());byte[] enc=c.doFinal(state.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));FileOutputStream out=null;try{out=file.startWrite();out.write(c.getIV());out.write(enc);file.finishWrite(out);}catch(Exception e){file.failWrite(out);throw e;}}}
 public JSONObject status(String person) throws Exception {
  JSONObject s=read(),out=new JSONObject();boolean same=s.optString("userId").equals(person);
  out.put("native",true);out.put("userId",s.optString("userId"));out.put("sameUser",same||s.optString("userId").isEmpty());
  out.put("tracking",same&&s.optBoolean("tracking"));out.put("starting",same&&s.optBoolean("starting"));out.put("shiftId",same?s.optString("shiftId"):"");out.put("segmentId",same?s.optString("segmentId"):"");
  out.put("pending",same?s.optJSONArray("queue")==null?0:s.optJSONArray("queue").length():0);out.put("pendingAction",same?s.optString("pendingAction"):"");out.put("error",same?s.optString("error"):"");
  out.put("serviceRunning",TrackingService.running);return out;
 }
}
