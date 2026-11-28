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
// `claims` adds issuer-signed claims to the token (a clearance, the user in `sub`, a `groups` list): whatever the scenario sets here the ISSUER put
// there. The token's own envelope (iss, aud, exp, iat, client_id, mock, scope, act) cannot be set through it.
const RESERVED = ["iss", "aud", "exp", "iat", "client_id", "mock", "scope", "act"];
export function mintAgentToken({ agent, clientId, audience, issuer, actIsText = false, withAct = true, scope = null, claims = null }) {
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
  for (const [k, v] of Object.entries(claims || {})) {
    if (RESERVED.includes(k) || k === "__proto__") throw new Error(`the claim ${k} is part of the token's own envelope`);
    payload[k] = v;
  }
  return sign(payload);
}

// A token whose payload was edited AFTER the issuer signed it: the extra claims are in the payload, the signature is the old one, so verify()
// says "bad signature". This is what an agent gets when it adds a claim to its own token.
export function tamper(token, extra) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return token;
  const payload = { ...decodePayload(token), ...extra };
  return `${parts[0]}.${b64url(JSON.stringify(payload))}.${parts[2]}`;
}
