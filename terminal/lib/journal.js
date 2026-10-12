import { FRAMES, SYMBOLS, frameCutoff, frameEnd } from "./multiframe.js";
import { hash } from "./provenance.js";
export const JOURNAL_VERSION = "SCM15_DECISION_JOURNAL_V1";
export const DEADLINE_MS = 5 * 60000;
const SAFE_STATES = new Set(["WAIT","WATCH","DATA_INCOMPLETE","NO_TRADE"]);
const clone = value => JSON.parse(JSON.stringify(value));
const integer = value => Number.isInteger(value) && value > 0;
export function assertShadow(data) {
  if (!data || data.mode !== "SHADOW" || data.executionEnabled !== false ||
      data.actualOrdersEnabled !== false || data.paperOrderCreated !== false ||
      data.tradePermission !== "NO_TRADE" || data.signal != null)
    throw new Error("EXECUTION_LOCK_VIOLATION");
  for (const symbol of SYMBOLS) for (const tf of FRAMES) {
    const a = data.assessments?.[symbol]?.[tf];
    if (a && (a.executionEnabled !== false || a.paperOrderCreated !== false ||
        a.tradePermission !== "NO_TRADE" ||
        ["entry","stop","target","size","netRR","probability"].some(k => a[k] != null)))
      throw new Error("ASSESSMENT_EXECUTION_LOCK_VIOLATION");
  }
}
export function makeScan(data, transport) {
  assertShadow(data);
  const {requestedAt,receivedAt} = transport;
  if (!integer(requestedAt) || !integer(receivedAt) || receivedAt < requestedAt)
    throw new Error("INVALID_SCAN_RECEIPT");
  const targetCutoff = frameCutoff(requestedAt,"15m");
  const codeHash = data.release?.codeHash, configHash = data.release?.configHash;
  if (!/^[a-f0-9]{64}$/.test(codeHash || "") || !/^[a-f0-9]{64}$/.test(configHash || ""))
    throw new Error("SOURCE_PROVENANCE_MISSING");
  const snapshotHash = hash(data),runId = hash({requestedAt,receivedAt,snapshotHash});
  const records = [];
  for (const symbol of SYMBOLS) for (const timeframe of FRAMES) {
    const expectedCutoff = frameCutoff(requestedAt,timeframe);
    const a = data.assessments?.[symbol]?.[timeframe];
    const reasons = [...(a?.reasons || [])], blockers = [...(a?.blockedBy || [])];
    const decisionAt = a?.decisionAt ?? data.runAt ?? null;
    const sourceReceipt = a?.receivedAt ?? null,actualCutoff = a?.barCutoff ?? null;
    if (!a) reasons.push("FRAME_ASSESSMENT_MISSING",data.reason || "SOURCE_UNAVAILABLE");
    if (a && (a.symbol !== symbol || a.timeframe !== timeframe || !SAFE_STATES.has(a.state)))
      reasons.push("INVALID_FRAME_ASSESSMENT");
    if (actualCutoff !== expectedCutoff) reasons.push("SCHEDULE_TARGET_MISMATCH");
    if (!integer(decisionAt) || decisionAt > receivedAt)
      reasons.push("DECISION_AFTER_SCAN_RECEIPT_OR_MISSING");
    if (!integer(sourceReceipt) || sourceReceipt > decisionAt)
      reasons.push("SOURCE_RECEIPT_AFTER_DECISION_OR_MISSING");
    const invalidClock = reasons.some(r => ["INVALID_FRAME_ASSESSMENT","SCHEDULE_TARGET_MISMATCH",
      "DECISION_AFTER_SCAN_RECEIPT_OR_MISSING","SOURCE_RECEIPT_AFTER_DECISION_OR_MISSING"].includes(r));
    const valid = a?.audit?.status === "VALID" && !invalidClock;
    const delayMs = integer(decisionAt) ? decisionAt-expectedCutoff : null;
    const timeliness = delayMs !== null && delayMs >= 0 && delayMs <= DEADLINE_MS ?
      "WITHIN_5M_WINDOW" : "LATE_OBSERVATION";
    if (timeliness === "LATE_OBSERVATION") blockers.push("LATE_OBSERVATION_NOT_HISTORICAL_SIGNAL");
    const barKey = [codeHash,configHash,symbol,timeframe,expectedCutoff].join(":");
    records.push({
      id:runId+":"+symbol+":"+timeframe,barKey,runId,symbol,timeframe,
      expectedCutoff,barCutoff:actualCutoff,closedAt:a?.closedAt??null,
      decisionAt,receivedAt:sourceReceipt,observedAt:receivedAt,
      state:valid?a.state:"DATA_INCOMPLETE",leaning:valid?a.leaning:"UNDETERMINED",
      tradePermission:"NO_TRADE",mode:"SHADOW",executionEnabled:false,paperOrderCreated:false,
      timeliness,delayMs,reasons:[...new Set(reasons)],blockedBy:[...new Set(blockers)],
      assessment:a?clone(a):null,assessment15m:symbol==="ENAUSDT"&&timeframe==="15m"?
        clone(data.assessment15m??null):null,
      context:{btcDominance:clone(data.btcDominance??null),
        btcH4:data.btcH4??null,btcH1:data.btcH1??null,enaH1:data.enaH1??null,
        frameBias:clone(data.frameBiasBySymbol?.[symbol]?.[timeframe]??null),
        moduleCoverage:clone(data.moduleCoverage??null)},
      model:data.model,release:clone(data.release),snapshotHash,
      sourceEvidence:clone(data.sourceEvidence??{}),sourceErrors:clone(data.sourceErrors??{}),
    });
  }
  return {schemaVersion:JOURNAL_VERSION,runId,targetCutoff,transport:clone(transport),
    snapshotHash,codeHash,configHash,mode:"SHADOW",executionEnabled:false,
    records,payload:clone(data)};
}
export function missedRanges(previousCutoff, currentCutoff, cohort) {
  if (!integer(previousCutoff) || currentCutoff <= previousCutoff) return [];
  const ranges=[];
  for (const timeframe of FRAMES) {
    const prior=frameCutoff(previousCutoff,timeframe),current=frameCutoff(currentCutoff,timeframe);
    let cutoff=frameEnd(prior,timeframe),first=null,last=null,count=0;
    while (cutoff<current) { first??=cutoff;last=cutoff;count++;cutoff=frameEnd(cutoff,timeframe); }
    if(count) for(const symbol of SYMBOLS) ranges.push({
      id:cohort+":"+symbol+":"+timeframe+":"+first+":"+last,
      symbol,timeframe,firstMissedCutoff:first,lastMissedCutoff:last,count,
      state:"NOT_OBSERVED",decisionAt:null,receivedAt:null,
      reason:"MISSED_SCHEDULE_NO_POINT_IN_TIME_DECISION",executionEnabled:false});
  }
  return ranges;
}
export function updateIndex(previous, scan) {
  const compatible = previous?.schemaVersion === JOURNAL_VERSION &&
    previous?.codeHash === scan.codeHash && previous?.configHash === scan.configHash;
  if(compatible && previous.lastRunId===scan.runId) return previous;
  const gaps=compatible?missedRanges(previous.targetCutoff,scan.targetCutoff,scan.codeHash):[];
  const prior=compatible?(previous.recentDecisions||[]):[],byBar=new Map(prior.map(x=>[x.barKey,x]));
  for(const record of scan.records) {
    const earlier=byBar.get(record.barKey);
    byBar.set(record.barKey,{...record,
      firstDecisionAt:earlier?.firstDecisionAt??record.decisionAt,
      firstState:earlier?.firstState??record.state,
      firstReasons:earlier?.firstReasons??record.reasons,
      attemptCount:(earlier?.attemptCount||0)+1});
  }
  const recentDecisions=[...byBar.values()].sort((a,b)=>a.observedAt-b.observedAt).slice(-120);
  const latestByFrame=Object.fromEntries(SYMBOLS.map(s=>[s,Object.fromEntries(
    FRAMES.map(tf=>[tf,scan.records.find(x=>x.symbol===s&&x.timeframe===tf)]))]));
  const validCount=scan.records.filter(x=>x.assessment?.audit?.status==="VALID"&&x.state!=="DATA_INCOMPLETE").length;
  return {schemaVersion:JOURNAL_VERSION,model:scan.payload.model,
    release:scan.payload.release,codeHash:scan.codeHash,configHash:scan.configHash,
    mode:"SHADOW",executionEnabled:false,actualOrdersEnabled:false,paperOrderCreated:false,
    tradePermission:"NO_TRADE",signal:null,
    signals:Array.isArray(previous?.signals)?previous.signals:[],legacyArchiveOnly:true,
    polledAt:scan.transport.receivedAt,lastAttemptAt:scan.transport.receivedAt,
    lastCompleteScanAt:validCount===12?scan.transport.receivedAt:
      compatible?previous.lastCompleteScanAt??null:null,
    sourceHealth:validCount===12?"VALID":validCount?"PARTIAL":"BLOCKED",
    validFrameCount:validCount,frameCount:12,
    status:scan.payload.status,reason:scan.payload.reason??null,
    scheduler:"GITHUB_ACTIONS_RESIDENT_5M_V1",lastRunId:scan.runId,targetCutoff:scan.targetCutoff,
    monitoringStartedAt:compatible?previous.monitoringStartedAt:scan.transport.requestedAt,
    cohortChanged:Boolean(previous?.codeHash)&&!compatible,
    preMonitoringHistory:"UNKNOWN_NO_RETROSPECTIVE_DECISIONS",
    journalDate:new Date(scan.transport.receivedAt).toISOString().slice(0,10),
    latestByFrame,recentDecisions,
    gaps:[...(compatible?previous.gaps||[]:[]),...gaps].slice(-120),
    missingBarsDetected:(compatible?previous.missingBarsDetected||0:0)+gaps.reduce((s,g)=>s+g.count,0),
    snapshotPath:scan.snapshotPath??null,
  };
}
