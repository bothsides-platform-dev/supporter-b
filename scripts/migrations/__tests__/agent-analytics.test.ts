import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("adds analytics without rewriting existing events and enforces ownership and duration bounds", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TABLE users(id uuid PRIMARY KEY); CREATE TABLE workspaces(id uuid PRIMARY KEY);
      INSERT INTO users VALUES ('aaaaaaaa-0000-4000-8000-000000000001');
      INSERT INTO workspaces VALUES ('aaaaaaaa-0000-4000-8000-000000000002');`);
    await pg.exec(readFileSync("scripts/migrations/20261108-agent-channel.sql", "utf8"));
    await pg.exec(`INSERT INTO agent_clients(id,name,redirect_uris,expires_at) VALUES
      ('bbbbbbbb-0000-4000-8000-000000000001','Test','[]',now()+interval '1 day');
      INSERT INTO agent_connections(id,client_id,user_id,workspace_id,session_version,scopes,expires_at) VALUES
      ('cccccccc-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000002',0,'[]',now()+interval '1 day');
      INSERT INTO agent_events(id,connection_id,event) VALUES
      ('dddddddd-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000001','connected');`);
    await pg.exec(readFileSync("scripts/migrations/20261108-agent-analytics.sql", "utf8"));
    expect((await pg.query("SELECT event,environment FROM agent_events")).rows).toEqual([{ event: "connected", environment: "unknown" }]);
    const insert = (id: number, connection: string, request: string, duration: number) => pg.exec(`INSERT INTO agent_observations(id,environment,connection_id,request_id,surface,operation,outcome,duration_ms) VALUES
      ('eeeeeeee-0000-4000-8000-${String(id).padStart(12, "0")}','test',${connection},${request},'account_mcp','get_connection','ok',${duration})`);
    await expect(insert(1, "NULL", "NULL", -1)).rejects.toThrow(/check constraint/);
    await expect(insert(1, "NULL", "NULL", 3_600_001)).rejects.toThrow(/check constraint/);
    await expect(insert(1, "NULL", "'ffffffff-0000-4000-8000-000000000001'", 1)).rejects.toThrow();
    await expect(insert(1, "'cccccccc-0000-4000-8000-000000000099'", "NULL", 1)).rejects.toThrow(/foreign key/);
    await insert(1, "'cccccccc-0000-4000-8000-000000000001'", "NULL", 1);
    await insert(2, "NULL", "NULL", 1);
    await pg.exec("DELETE FROM users");
    expect((await pg.query("SELECT connection_id FROM agent_observations")).rows).toEqual([{ connection_id: null }]);
    expect((await pg.query("SELECT event FROM agent_events")).rows).toEqual([]);
  } finally { await pg.close(); }
});
