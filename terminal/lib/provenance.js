import { createHash } from "node:crypto";
import release from "../release.json" with { type: "json" };
export const RELEASE = Object.freeze(release);
export const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function withProvenance(data, reads = {}, errors = {}) {
  const sourceEvidence = Object.fromEntries(Object.entries(reads).map(([id, read]) => [id, {
    source: read.source ?? null, requestedAt: read.requestedAt ?? null,
    receivedAt: read.receivedAt ?? null,
    payloadSha256: read.raw === undefined ? null : hash(read.raw),
    rowCount: Array.isArray(read.raw) ? read.raw.length : null,
    status: read.status ?? "RECEIVED",
  }]));
  return {...data, mode:"SHADOW", release:RELEASE, sourceEvidence,
    sourceErrors:errors, actualOrdersEnabled:false, executionEnabled:false,
    tradePermission:"NO_TRADE", paperOrderCreated:false};
}
