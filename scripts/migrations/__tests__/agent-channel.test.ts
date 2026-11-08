import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("adds the agent channel without changing existing identities, with unique keys and cascading revocation data", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TABLE users(id uuid PRIMARY KEY); CREATE TABLE workspaces(id uuid PRIMARY KEY);
      INSERT INTO users VALUES ('aaaaaaaa-0000-4000-8000-000000000001');
      INSERT INTO workspaces VALUES ('aaaaaaaa-0000-4000-8000-000000000002');`);
    const before = (await pg.query("SELECT * FROM users")).rows;
    await pg.exec(
      readFileSync("scripts/migrations/20261108-agent-channel.sql", "utf8"),
    );
    expect((await pg.query("SELECT * FROM users")).rows).toEqual(before);
    expect(
      (
        await pg.query(
          "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'agent_%'",
        )
      ).rows,
    ).toEqual([{ n: 6 }]);
    await pg.exec(`INSERT INTO agent_clients(id, name, redirect_uris, expires_at) VALUES ('bbbbbbbb-0000-4000-8000-000000000001', 'Test', '["http://localhost/callback"]', now()+interval '1 day');
      INSERT INTO agent_connections(id,client_id,user_id,workspace_id,session_version,scopes,expires_at) VALUES
      ('cccccccc-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000002',0,'["requests:read"]',now()+interval '1 day');
      INSERT INTO agent_requests(id,connection_id,request_key,content) VALUES
      ('dddddddd-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000001','{}');`);
    await expect(
      pg.exec(`UPDATE agent_requests SET revision=0`),
    ).rejects.toThrow(/check constraint/);
    await expect(
      pg.exec(
        `INSERT INTO agent_requests SELECT 'dddddddd-0000-4000-8000-000000000002', connection_id, request_key, revision, content, rfp_code, submitted_at, created_at, updated_at FROM agent_requests`,
      ),
    ).rejects.toThrow(/unique constraint/);
    await pg.exec(`INSERT INTO agent_events(id,connection_id,request_id,event) VALUES
      ('ffffffff-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000001','dddddddd-0000-4000-8000-000000000001','draft_created');
      DELETE FROM users;`);
    expect(
      (await pg.query("SELECT count(*)::int AS n FROM agent_events")).rows,
    ).toEqual([{ n: 0 }]);
    expect(
      (await pg.query("SELECT count(*)::int AS n FROM agent_requests")).rows,
    ).toEqual([{ n: 0 }]);
  } finally {
    await pg.close();
  }
});
