import OAuth2Server from "@node-oauth/oauth2-server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getAgentRepo, getDb } from "@/lib/server/repositories/factory";
import {
  DrizzleAgentRepository,
  type AgentConnection,
} from "@/lib/server/repositories/drizzle/agent";
import type { Tx } from "@/lib/server/repositories/types";
import type { Actor } from "./types";
import {
  ACCESS_TTL_SECONDS,
  CONNECTION_TTL_SECONDS,
  AgentError,
  agentAccountUrls,
  authorizationSchema,
  newSecret,
  parseAgentScopes,
  registrationSchema,
  tokenHash,
  type AgentScope,
} from "@/lib/server/agent/account-contract";

export type AgentPrincipal = {
  connection: AgentConnection;
  scopes: AgentScope[];
  workspaceName: string;
  tokenHash: string;
};
const clientShape = (
  id: string,
  redirectUris: string[] = [],
): OAuth2Server.Client => ({
  id,
  redirectUris,
  grants: ["authorization_code", "refresh_token"],
});
const deadline = (seconds: number) => new Date(Date.now() + seconds * 1000);

export async function activeAgentConnection(
  repo: DrizzleAgentRepository,
  id: string,
  lock = false,
) {
  const connection = await repo.connection(id, lock);
  if (!connection || connection.revokedAt || connection.expiresAt <= new Date())
    throw new AgentError("invalid_token", 401);
  const member = await repo.member(connection.userId, connection.workspaceId);
  if (!member || member.sessionVersion !== connection.sessionVersion)
    throw new AgentError("invalid_token", 401);
  return { connection, member };
}

async function oauthConnection(repo: DrizzleAgentRepository, id: string) {
  try {
    return (await activeAgentConnection(repo, id, true)).connection;
  } catch (error) {
    // OAuth models use false for a denied grant. Throwing our domain error
    // would be wrapped as server_error by the OAuth library instead.
    if (
      error instanceof AgentError &&
      error.code === "invalid_token" &&
      error.status === 401
    )
      return false;
    throw error;
  }
}

function oauthModel(
  repo: DrizzleAgentRepository,
): OAuth2Server.AuthorizationCodeModel & OAuth2Server.RefreshTokenModel {
  return {
    generateAccessToken: async () => newSecret(),
    generateRefreshToken: async () => newSecret(),
    generateAuthorizationCode: async () => newSecret(),
    getClient: async (id, secret) => {
      if (secret != null || !z.string().uuid().safeParse(id).success)
        return false;
      const client = await repo.client(id);
      return client ? clientShape(client.id, client.redirectUris) : false;
    },
    validateRedirectUri: async (uri, client) =>
      Array.isArray(client.redirectUris) && client.redirectUris.includes(uri),
    validateScope: async (_user, _client, scope) => {
      try {
        return parseAgentScopes(scope?.join(" "));
      } catch {
        return false;
      }
    },
    getAccessToken: async () => false, // Resource authentication uses hashed tokens and live membership below.
    saveAuthorizationCode: async (code, client, user) => {
      await repo.addCode({
        hash: tokenHash(code.authorizationCode),
        connectionId: user.connectionId,
        redirectUri: code.redirectUri,
        challenge: code.codeChallenge!,
        expiresAt: code.expiresAt,
      });
      return { ...code, client, user };
    },
    getAuthorizationCode: async (raw) => {
      const code = await repo.code(tokenHash(raw), true);
      if (!code || code.usedAt) return false;
      const connection = await oauthConnection(repo, code.connectionId);
      if (!connection) return false;
      return {
        authorizationCode: raw,
        expiresAt: code.expiresAt,
        redirectUri: code.redirectUri,
        codeChallenge: code.challenge,
        codeChallengeMethod: "S256",
        scope: connection.scopes,
        client: clientShape(connection.clientId),
        user: { connectionId: connection.id },
      };
    },
    revokeAuthorizationCode: async (code) =>
      repo.useCode(tokenHash(code.authorizationCode)),
    getRefreshToken: async (raw) => {
      const token = await repo.token(tokenHash(raw), "refresh", true);
      if (!token || token.revokedAt) return false;
      const connection = await oauthConnection(repo, token.connectionId);
      if (!connection) return false;
      return {
        refreshToken: raw,
        refreshTokenExpiresAt: token.refreshExpiresAt,
        scope: token.scopes,
        client: clientShape(connection.clientId),
        user: { connectionId: connection.id },
      };
    },
    revokeToken: async (token) =>
      repo.useRefresh(tokenHash(token.refreshToken)),
    saveToken: async (token, client, user) => {
      await repo.addToken({
        accessHash: tokenHash(token.accessToken),
        refreshHash: tokenHash(token.refreshToken!),
        connectionId: user.connectionId,
        scopes: parseAgentScopes(token.scope?.join(" ")),
        accessExpiresAt: token.accessTokenExpiresAt!,
        refreshExpiresAt: token.refreshTokenExpiresAt!,
      });
      return { ...token, accessToken: token.accessToken, client, user };
    },
  };
}

function oauth(repo: DrizzleAgentRepository) {
  return new OAuth2Server({
    model: oauthModel(repo),
    accessTokenLifetime: ACCESS_TTL_SECONDS,
    refreshTokenLifetime: CONNECTION_TTL_SECONDS,
    authorizationCodeLifetime: 120,
    requirePKCE: true,
    alwaysIssueNewRefreshToken: true,
    requireClientAuthentication: {
      authorization_code: false,
      refresh_token: false,
    },
  });
}

export async function registerAgentClient(input: unknown) {
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) throw new AgentError("invalid_client_metadata");
  const data = parsed.data;
  let scopes: AgentScope[];
  try {
    scopes = parseAgentScopes(data.scope);
  } catch {
    throw new AgentError("invalid_scope");
  }
  if (
    !data.grant_types.includes("authorization_code") ||
    !data.response_types.includes("code")
  )
    throw new AgentError("invalid_client_metadata");
  const id = randomUUID();
  await (
    await getAgentRepo()
  ).addClient({
    id,
    name: data.client_name,
    redirectUris: [...new Set(data.redirect_uris)],
    expiresAt: deadline(CONNECTION_TTL_SECONDS * 2),
  });
  return {
    client_id: id,
    client_name: data.client_name,
    redirect_uris: data.redirect_uris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: scopes.join(" "),
  };
}

export async function inspectAgentAuthorization(input: unknown) {
  const parsed = authorizationSchema.safeParse(input);
  if (!parsed.success) throw new AgentError("invalid_request");
  const query = parsed.data;
  if (query.resource !== agentAccountUrls().resource)
    throw new AgentError("invalid_target");
  let scopes: AgentScope[];
  try {
    scopes = parseAgentScopes(query.scope);
  } catch {
    throw new AgentError("invalid_scope");
  }
  const client = await (await getAgentRepo()).client(query.client_id);
  if (!client || !client.redirectUris.includes(query.redirect_uri))
    throw new AgentError("invalid_client");
  return { query, client, scopes };
}

/** Called only by the authenticated browser consent action; never by an MCP tool. */
export async function authorizeAgent(
  input: unknown,
  actor: Actor,
  approved: boolean,
) {
  const { query, client, scopes } = await inspectAgentAuthorization(input);
  const target = new URL(query.redirect_uri);
  target.searchParams.set("state", query.state);
  target.searchParams.set("iss", agentAccountUrls().issuer);
  if (!approved) {
    target.searchParams.set("error", "access_denied");
    return target.href;
  }
  const db = await getDb();
  const code = await db.transaction(async (tx: Tx) => {
    const repo = new DrizzleAgentRepository(tx);
    const member = await repo.member(actor.userId, actor.workspaceId);
    if (!member) throw new AgentError("access_denied", 403);
    const id = randomUUID();
    await repo.addConnection({
      id,
      clientId: client.id,
      ...actor,
      scopes,
      sessionVersion: member.sessionVersion,
      expiresAt: deadline(CONNECTION_TTL_SECONDS),
    });
    const request = new OAuth2Server.Request({
      method: "GET",
      query: { ...query, scope: scopes.join(" ") },
      headers: {},
    });
    const code = await oauth(repo).authorize(
      request,
      new OAuth2Server.Response(),
      {
        authenticateHandler: { handle: async () => ({ connectionId: id }) },
      },
    );
    await repo.event({
      id: randomUUID(),
      connectionId: id,
      event: "connected",
    });
    return code.authorizationCode;
  });
  target.searchParams.set("code", code);
  return target.href;
}

const tokenInput = z
  .object({
    grant_type: z.enum(["authorization_code", "refresh_token"]),
    client_id: z.string().uuid(),
    resource: z.string().max(2048),
    code: z.string().max(256).optional(),
    redirect_uri: z.string().max(2048).optional(),
    code_verifier: z.string().max(128).optional(),
    refresh_token: z.string().max(256).optional(),
    scope: z.string().max(100).optional(),
  })
  .strict();

export async function exchangeAgentToken(
  input: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const parsed = tokenInput.safeParse(input);
  if (!parsed.success) throw new AgentError("invalid_request");
  const body = parsed.data;
  if (body.resource !== agentAccountUrls().resource)
    throw new AgentError("invalid_target");
  if (body.scope !== undefined) {
    try {
      parseAgentScopes(body.scope);
    } catch {
      throw new AgentError("invalid_scope");
    }
  }
  const db = await getDb();
  return db.transaction(async (tx: Tx) => {
    const repo = new DrizzleAgentRepository(tx);
    // Rotation replay invalidates the whole grant, including its newest access token.
    if (body.grant_type === "refresh_token" && body.refresh_token) {
      const previous = await repo.token(
        tokenHash(body.refresh_token),
        "refresh",
        true,
      );
      if (previous?.revokedAt) {
        const connection = await repo.connection(previous.connectionId, true);
        if (
          connection?.clientId === body.client_id &&
          (await repo.revokeConnection(connection.id))
        ) {
          await repo.event({
            id: randomUUID(),
            connectionId: connection.id,
            event: "revoked",
          });
        }
        return { status: 400, body: { error: "invalid_grant" } };
      }
    }
    try {
      const response = new OAuth2Server.Response();
      const encoded = new URLSearchParams(
        Object.entries(body).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      ).toString();
      const token = await oauth(repo).token(
        new OAuth2Server.Request({
          method: "POST",
          query: {},
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "content-length": String(Buffer.byteLength(encoded)),
          },
          body,
        }),
        response,
      );
      if (body.grant_type === "refresh_token")
        await repo.event({
          id: randomUUID(),
          connectionId: token.user.connectionId,
          event: "token_refreshed",
        });
      return { status: 200, body: response.body };
    } catch (error) {
      // Commit intentional code consumption on invalid proof. Infrastructure
      // errors roll back token issuance and events together.
      if (error instanceof OAuth2Server.OAuthError && error.code < 500)
        return { status: error.code, body: { error: error.name } };
      throw error;
    }
  });
}

export async function authenticateAgent(
  raw: string,
  required: AgentScope = "requests:read",
  injectedRepo?: DrizzleAgentRepository,
  lock = false,
): Promise<AgentPrincipal> {
  const repo = injectedRepo ?? (await getAgentRepo());
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw))
    throw new AgentError("invalid_token", 401);
  const hash = tokenHash(raw);
  const token = await repo.token(hash, "access");
  if (!token || token.revokedAt || token.accessExpiresAt <= new Date())
    throw new AgentError("invalid_token", 401);
  const { connection, member } = await activeAgentConnection(
    repo,
    token.connectionId,
    lock,
  );
  if (!token.scopes.includes(required) || !connection.scopes.includes(required))
    throw new AgentError("insufficient_scope", 403);
  return {
    connection,
    scopes: token.scopes,
    workspaceName: member.name,
    tokenHash: hash,
  };
}

export async function revokeAgentConnection(id: string, actor: Actor) {
  if (!z.string().uuid().safeParse(id).success)
    throw new AgentError("not_found", 404);
  const db = await getDb();
  await db.transaction(async (tx: Tx) => {
    const repo = new DrizzleAgentRepository(tx);
    const connection = await repo.connection(id, true);
    if (
      !connection ||
      connection.userId !== actor.userId ||
      connection.workspaceId !== actor.workspaceId
    )
      throw new AgentError("not_found", 404);
    if (await repo.revokeConnection(id))
      await repo.event({
        id: randomUUID(),
        connectionId: id,
        event: "revoked",
      });
  });
}

export async function revokeAgentToken(raw: string, clientId: string) {
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(raw) ||
    !z.string().uuid().safeParse(clientId).success
  )
    return;
  const repo = await getAgentRepo();
  const token =
    (await repo.token(tokenHash(raw), "refresh")) ??
    (await repo.token(tokenHash(raw), "access"));
  if (!token) return;
  const connection = await repo.connection(token.connectionId);
  if (connection?.clientId === clientId)
    await revokeAgentConnection(connection.id, {
      userId: connection.userId,
      workspaceId: connection.workspaceId,
    });
}
