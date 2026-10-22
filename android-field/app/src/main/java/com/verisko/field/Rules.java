package com.verisko.field;
/** Platform-independent boundaries: no automatic restart of GPS after reboot/force-stop. */
public final class Rules {
 public static final long SHIFT_LIMIT=12*60*60*1000L, SAMPLE_MS=60_000L, QUEUE_TTL=36*60*60*1000L;
 public static final String ORIGIN="https://verisko-sales-2026.netlify.app";
 public static boolean trusted(String url) { try { java.net.URI u=new java.net.URI(url); return "https".equals(u.getScheme())&&"verisko-sales-2026.netlify.app".equals(u.getHost())&&(u.getPort()==-1||u.getPort()==443)&&u.getUserInfo()==null; }catch(Exception e){return false;} }
 public static boolean mayCollect(boolean active,long deadline,long expiresAt,long now){return active&&now<deadline&&now<expiresAt;}
 public static boolean sample(long last,long at){return at-last>=SAMPLE_MS;}
 private Rules(){}
}
