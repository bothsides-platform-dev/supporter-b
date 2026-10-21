import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
it("전환 DDL 재실행은 기존 계약과 보관본을 보존하고 과거 PG 메일만 중단한다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE signing_contracts(id uuid PRIMARY KEY,provider_ref text);CREATE TABLE contract_archives(id uuid PRIMARY KEY);CREATE TABLE outbox_entries(event text,status text,attempts int,max_attempts int,last_error text);
 INSERT INTO signing_contracts VALUES('aaaaaaaa-0000-4000-8000-000000000001','legacy-ref');
 INSERT INTO contract_archives VALUES('aaaaaaaa-0000-4000-8000-000000000002');
 INSERT INTO outbox_entries VALUES('signing.awaiting_template','pending',0,5,NULL),('rfp.awarded','pending',0,5,NULL);`);
    const sql = readFileSync(
      "scripts/migrations/20261021-platform-buyer-agreements.sql",
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql);
    expect(
      (await db.query("SELECT kind,provider_ref FROM signing_contracts")).rows,
    ).toEqual([{ kind: "pg_buyer", provider_ref: "legacy-ref" }]);
    expect((await db.query("SELECT kind FROM contract_archives")).rows).toEqual(
      [{ kind: "pg_buyer" }],
    );
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM platform_agreement_drafts",
        )
      ).rows,
    ).toEqual([{ n: 0 }]);
    expect(
      (
        await db.query(
          "SELECT status,attempts FROM outbox_entries WHERE event='signing.awaiting_template'",
        )
      ).rows,
    ).toEqual([{ status: "failed", attempts: 5 }]);
    expect(
      (
        await db.query(
          "SELECT status FROM outbox_entries WHERE event='rfp.awarded'",
        )
      ).rows,
    ).toEqual([{ status: "pending" }]);
    await expect(
      db.exec("UPDATE signing_contracts SET kind='unknown'"),
    ).rejects.toThrow();
  } finally {
    await db.close();
  }
});
