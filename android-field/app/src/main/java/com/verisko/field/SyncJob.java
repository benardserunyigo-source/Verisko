package com.verisko.field;
import android.app.job.*;import android.content.*;
/** Retries uploads only; this job never starts GPS. */
public final class SyncJob extends JobService {
 public static void schedule(Context ctx){JobScheduler js=(JobScheduler)ctx.getSystemService(JOB_SCHEDULER_SERVICE);js.schedule(new JobInfo.Builder(871,new ComponentName(ctx,SyncJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setBackoffCriteria(30000,JobInfo.BACKOFF_POLICY_EXPONENTIAL).build());}
 @Override public boolean onStartJob(JobParameters p){SyncEngine.WORKER.execute(()->jobFinished(p,!SyncEngine.flush(this)));return true;}
 @Override public boolean onStopJob(JobParameters p){return true;}
}
