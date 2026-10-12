export const INTERVAL_MS=300000,PHASE_MS=120000;
export function nextScanAt(at) {
 if(!Number.isInteger(at))throw new Error("INVALID_TIMER_CLOCK");
 return (Math.floor((at-PHASE_MS)/INTERVAL_MS)+1)*INTERVAL_MS+PHASE_MS;
}
export async function runResident({durationMs,cycle,now=Date.now,
 wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
 if(!Number.isInteger(durationMs)||durationMs<60000||durationMs>300*60000)
  throw new Error("INVALID_RESIDENT_DURATION");
 const end=now()+durationMs;
 await cycle({scheduledAt:now(),kind:"BOOTSTRAP"});
 while(now()<end){
  const target=nextScanAt(now());
  await wait(Math.max(0,Math.min(target,end)-now()));
  if(now()>=end)break;
  await cycle({scheduledAt:target,kind:"TIMER"});
 }
 return {status:"SESSION_COMPLETE_HANDOFF_REQUIRED",at:now()};
}
