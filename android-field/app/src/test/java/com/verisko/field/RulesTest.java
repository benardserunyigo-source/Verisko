package com.verisko.field;
import org.junit.Test;import static org.junit.Assert.*;
public class RulesTest {
 @Test public void bridgeOnlyTrustsExactHttpsOrigin(){assertTrue(Rules.trusted(Rules.ORIGIN+"/"));assertFalse(Rules.trusted("https://verisko-sales-2026.netlify.app.evil.test/"));assertFalse(Rules.trusted("http://verisko-sales-2026.netlify.app/"));assertFalse(Rules.trusted("https://verisko-sales-2026.netlify.app:444/"));assertFalse(Rules.trusted("file:///index.html"));assertFalse(Rules.trusted("https://user@verisko-sales-2026.netlify.app/"));}
 @Test public void pausedExpiredAndSignedOutNeverCollect(){assertTrue(Rules.mayCollect(true,200,200,100));assertFalse(Rules.mayCollect(false,200,200,100));assertFalse(Rules.mayCollect(true,100,200,100));assertFalse(Rules.mayCollect(true,200,100,100));}
 @Test public void locationSamplingCapsBatteryAndQueueUsage(){assertFalse(Rules.sample(1000,59000));assertTrue(Rules.sample(1000,61000));}
 @Test public void checkoutFixMustBeFreshAccurateAndNotMocked(){assertTrue(Rules.finishFix(10,100000,100000,101000,true,false));assertFalse(Rules.finishFix(151,100000,100000,101000,true,false));assertFalse(Rules.finishFix(10,100000,100000,101000,true,true));assertFalse(Rules.finishFix(10,1000,100000,101000,true,false));assertFalse(Rules.finishFix(Float.NaN,100000,100000,101000,true,false));assertFalse(Rules.finishFix(10,100000,100000,101000,false,false));}
}
