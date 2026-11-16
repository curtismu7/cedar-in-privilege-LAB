// Mock PingFederate: mints JWTs (HS256 fixture key) shaped like the measured client-credentials token with act as an OBJECT.
// Everything this issues is mock and labelled; the key is a fixed test fixture and signs nothing real.
import { createHmac } from "node:crypto";

const FIXTURE_SECRET = "cedar-in-privilege-lab-fixture-key";

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

export function decodePayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function sign(payload) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", FIXTURE_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verify(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return { ok: false, reason: "not a three-part token" };
  const expect = createHmac("sha256", FIXTURE_SECRET).update(`${parts[0]}.${parts[1]}`).digest("base64url");
  if (parts[2] !== expect) return { ok: false, reason: "bad signature" };
  const payload = decodePayload(token);
  if (!payload) return { ok: false, reason: "undecodable payload" };
  return { ok: true, payload };
}

// The agent's access token. act is an OBJECT {sub: <agent>} (what the measured PingFederate token carried), or, with
// actIsText, the TEXT "{}" (what a mapping expression that returns a string produces). withAct false leaves act out.
export function mintAgentToken({ agent, clientId, audience, issuer, actIsText = false, withAct = true, scope = null }) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: issuer,
    sub: clientId,
    aud: audience,
    client_id: clientId,
    iat: now,
    exp: now + 300,
    mock: true
  };
  if (scope) payload.scope = scope;
  if (withAct) payload.act = actIsText ? "{}" : { sub: agent };
  return sign(payload);
}
