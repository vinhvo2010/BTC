import { readPublic, validateIndex } from "../lib/cloud-read.js";
export default async function handler(req,res) {
  res.setHeader("Cache-Control","no-store, max-age=0");
  if(req.method!=="GET")return res.status(405).json({status:"METHOD_NOT_ALLOWED"});
  try {
    const text=await readPublic("state.json");
    if(text===null)return res.status(200).json({status:"AWAITING_FIRST_CLOUD_RUN",verified:false,
      archivedReadyPlans:[],recentDecisions:[],actualOrdersEnabled:false,executionEnabled:false});
    const raw=JSON.parse(text),now=Date.now(),health=validateIndex(raw,now);
    const schedulerFresh=health.ageMs>=0&&health.ageMs<=8*60000;
    const status=!health.cohortMatches?"CLOUD_COHORT_MISMATCH":
      !schedulerFresh?"CLOUD_SCAN_STALE":raw.sourceHealth==="BLOCKED"?"CLOUD_SCAN_DATA_BLOCKED":
      raw.sourceHealth==="PARTIAL"?"CLOUD_SCAN_PARTIAL":"CLOUD_SCAN_FRESH";
    const legacy=(raw.signals||[]).filter(x=>x&&x.id&&
      ["entry","stop","target","netRR"].every(k=>Number.isFinite(x[k]))&&x.netRR>=2).slice(-25);
    return res.status(200).json({...raw,status,marketState:raw.status,
      verified:schedulerFresh&&health.cohortMatches&&raw.sourceHealth==="VALID",
      schedulerFresh,cohortMatches:health.cohortMatches,ageMs:health.ageMs,
      archivedReadyPlans:legacy,archivedCount:legacy.length,legacyArchiveOnly:true,
      actualOrdersEnabled:false,executionEnabled:false,
      warning:"Scheduler health and data quality are separate. Missed/late records are not retroactive signals."});
  } catch(e) {
    return res.status(200).json({status:"CLOUD_FEED_UNAVAILABLE",verified:false,
      reason:["UNVERIFIED_CLOUD_STATE","INCOMPLETE_FRAME_JOURNAL","PUBLIC_JOURNAL_TOO_LARGE"].includes(e.message)?e.message:"FEED_FETCH_FAILED",
      archivedReadyPlans:[],recentDecisions:[],actualOrdersEnabled:false,executionEnabled:false});
  }
}
