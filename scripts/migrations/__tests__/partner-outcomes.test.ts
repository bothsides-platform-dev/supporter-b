import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let pg: PGlite;
let requestId: string;
let rfpId: string;
let providerId: string;
beforeEach(async () => {
  pg = new PGlite();
  requestId = randomUUID(); rfpId = randomUUID(); providerId = randomUUID();
  await pg.exec("CREATE TABLE rfps(id uuid PRIMARY KEY); CREATE TABLE workspaces(id uuid PRIMARY KEY); CREATE TABLE agent_requests(id uuid PRIMARY KEY);");
  await pg.query("INSERT INTO rfps VALUES ($1)", [rfpId]);
  await pg.query("INSERT INTO workspaces VALUES ($1)", [providerId]);
  await pg.query("INSERT INTO agent_requests VALUES ($1)", [requestId]);
  await pg.exec(readFileSync("scripts/migrations/20261109-partner-outcomes.sql", "utf8"));
});
afterEach(async () => { await pg.close(); });

async function insert(overrides: Record<string, unknown> = {}) {
  const values = {
    id: randomUUID(), command_id: randomUUID(), input_hash: "fixture-hash", request_id: requestId,
    request_created_at: "2026-11-01T00:00:00Z", rfp_id: rfpId, provider_workspace_id: providerId,
    environment: "test", kind: "provider_contract_confirmed", source: "operator_evidence",
    reference: randomUUID(), evidence_reference: "internal/evidence-1", occurred_at: "2026-11-02T00:00:00Z", recorded_by: "operator@test.example",
    ...overrides,
  };
  const columns = Object.keys(values);
  await pg.query(`INSERT INTO partner_outcome_entries (${columns.join(",")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(",")})`, Object.values(values));
  return values;
}

describe("partner outcome evidence ledger DDL", () => {
  it("adds the ledger without rewriting canonical records and retains exact decimal amounts", async () => {
    await insert({ kind: "commission_confirmed", amount: "9999999999999999.9999", currency: "KRW", agreement_reference: "agreement-1", calculation_reference: "calc-1" });
    expect((await pg.query("SELECT amount,currency FROM partner_outcome_entries")).rows).toEqual([{ amount: "9999999999999999.9999", currency: "KRW" }]);
    expect((await pg.query("SELECT id FROM rfps")).rows).toEqual([{ id: rfpId }]);
    expect((await pg.query("SELECT id FROM agent_requests")).rows).toEqual([{ id: requestId }]);
  });

  it("rejects incomplete or contradictory financial, integration, period and void records", async () => {
    const confirmed = await insert({ kind: "commission_confirmed", amount: "1.0000", currency: "KRW", agreement_reference: "a", calculation_reference: "c" });
    const invalid = [
      { kind: "commission_confirmed", amount: null, currency: "KRW", agreement_reference: "a", calculation_reference: "c" },
      { kind: "commission_confirmed", amount: "1", currency: null, agreement_reference: "a", calculation_reference: "c" },
      { kind: "commission_confirmed", amount: "-1", currency: "KRW", agreement_reference: "a", calculation_reference: "c" },
      { kind: "commission_confirmed", amount: "1", currency: "krw", agreement_reference: "a", calculation_reference: "c" },
      { kind: "commission_confirmed", amount: "1", currency: "KRW", calculation_reference: "c" },
      { kind: "commission_paid", amount: "0", currency: "KRW", related_entry_id: confirmed.id },
      { kind: "commission_paid", amount: "1", currency: "KRW" },
      { kind: "provider_contract_confirmed", amount: "1", currency: "KRW" },
      { kind: "integration_verified" },
      { kind: "integration_verified", integration_environment: "unspecified" },
      { kind: "provider_contract_confirmed", integration_environment: "sandbox" },
      { kind: "voided", related_entry_id: confirmed.id },
      { kind: "voided", related_entry_id: confirmed.id, reason: "   " },
      { period_start: "2026-11-01" },
      { period_start: "2026-11-02", period_end: "2026-11-01" },
    ];
    for (const row of invalid) await expect(insert(row)).rejects.toThrow(/check constraint/);
    expect((await pg.query("SELECT count(*)::int n FROM partner_outcome_entries")).rows).toEqual([{ n: 1 }]);
  });

  it("enforces unique commands, provider references and a single void per entry", async () => {
    const original = await insert();
    await expect(insert({ command_id: original.command_id })).rejects.toThrow(/unique constraint/);
    await expect(insert({ reference: original.reference })).rejects.toThrow(/unique constraint/);
    await insert({ kind: "voided", related_entry_id: original.id, reason: "Correction" });
    await expect(insert({ kind: "voided", related_entry_id: original.id, reason: "Duplicate correction" })).rejects.toThrow(/unique constraint/);
  });

  it("unlinks a deleted agent request but preserves evidence and restricts canonical deletion", async () => {
    const original = await insert();
    await pg.query("DELETE FROM agent_requests WHERE id=$1", [requestId]);
    expect((await pg.query("SELECT id,request_id,rfp_id FROM partner_outcome_entries")).rows).toEqual([{ id: original.id, request_id: null, rfp_id: rfpId }]);
    await expect(pg.query("DELETE FROM rfps WHERE id=$1", [rfpId])).rejects.toThrow(/foreign key/);
    await expect(pg.query("DELETE FROM workspaces WHERE id=$1", [providerId])).rejects.toThrow(/foreign key/);
    await insert({ kind: "voided", request_id: null, related_entry_id: original.id, reason: "Correction" });
    await expect(pg.query("DELETE FROM partner_outcome_entries WHERE id=$1", [original.id])).rejects.toThrow(/foreign key/);
  });
});
