// Stories as data (rule 10): each case has one story text with {{cast.<name>}} tokens, and four vertical packs (airline, banking, healthcare, retail)
// fill the cast. A token with no value in a pack is an error (a test and renderStory both refuse it), never a blank on the page.
// The stories are framing only: they add no claim about what was measured. Example names only; the tools stay CountTool, ListIndexTool and
// SearchIndexTool and the ids stay the lab's example ids.

export const CAST_KEYS = ["org", "agent", "approver", "sensitive", "record"];

export const PACKS = {
  airline: {
    label: "Airline",
    cast: { org: "Example Air", agent: "rebooking assistant", approver: "duty manager", sensitive: "a full passenger-manifest search", record: "passenger bookings" }
  },
  banking: {
    label: "Banking",
    cast: { org: "Example Bank", agent: "payments assistant", approver: "treasury officer", sensitive: "a large wire-transfer search", record: "customer accounts" }
  },
  healthcare: {
    label: "Healthcare",
    cast: { org: "Example Health", agent: "scheduling assistant", approver: "clinic manager", sensitive: "a patient-record search", record: "patient records" }
  },
  retail: {
    label: "Retail",
    cast: { org: "Example Retail", agent: "stock assistant", approver: "store manager", sensitive: "a full customer-order search", record: "customer orders" }
  }
};
export const DEFAULT_PACK = "airline";

export const STORIES = {
  hold: "{{cast.org}} runs a {{cast.agent}}. When it tries {{cast.sensitive}} with nobody watching, the policy says a {{cast.approver}} must approve first, so the call waits instead of failing. In this lab SearchIndexTool stands in for that search, and the whole case is simulated.",
  scope: "At {{cast.org}} the {{cast.agent}} may reach {{cast.record}} only when its token carries the matching scope. Without the scope the call is refused and the reason names it. In this lab SearchIndexTool stands in for that tool, and the whole case is simulated.",
  actsub: "{{cast.org}} has two tools, and each tool's policy names which agent may call it. The {{cast.agent}} is let through on the tool that names it and refused on the tool that names a different value. In this lab CountTool and ListIndexTool stand in for those tools; this is the case with one measured run on a real tenant.",
  stepup: "At {{cast.org}} the held call waits for the {{cast.approver}} — and the approval itself is protected: the approver completes a step-up on their own device (a mock PingID push or code) before the approval records. A stolen agent session cannot approve as the human. In this lab the step-up gate is mock; the factor itself was measured on a real tenant (2026-11-18) and the composition with the hold is simulated.",
  claims: "{{cast.org}}'s {{cast.agent}} may list {{cast.record}} only when the token the issuer signed carries a clearance claim. The agent cannot give itself one: a claim it adds to its own token breaks the signature and is refused at sign-in, and a claim it only mentions in words is not in the token at all. In this lab ListIndexTool stands for the protected call and every run is simulated.",
  user: "At {{cast.org}} a policy on the protected call names one person. The {{cast.agent}} acts for whoever holds the token: a token for someone else is refused, a token for the named person is served. In this lab the person is a claim in the token (sub) and every run is simulated.",
  group: "{{cast.org}} lets only a named group reach {{cast.record}}. The token carries a list of groups: the call is served when the list holds the required one, refused when it does not, and a group that only looks similar does not count. In this lab the list is a claim in the token and every run is simulated.",
  block: "Sometimes {{cast.org}} wants one tool off for everyone. A policy with no condition refuses it for every token, even a token that carries every scope and claim, while the {{cast.agent}} keeps working with the other tools. In this lab the blocked tool is ListIndexTool and every run is simulated.",
  layered: "At {{cast.org}} the protected call has three policies: a scope, a claim and a named agent. The {{cast.agent}} is served only when all three are satisfied, and when one is not, that policy names the refusal. Nothing grants access; an unrefused call is simply allowed. In this lab every run is simulated."
};

const TOKEN = /\{\{cast\.([A-Za-z_]+)\}\}/g;
// Every token of a text, so a test (and renderStory) can refuse one the cast does not define.
export const tokensOf = (text) => [...String(text).matchAll(TOKEN)].map((m) => m[1]);

export function renderStory(text, cast) {
  return String(text).replace(TOKEN, (_, key) => {
    if (!Object.hasOwn(cast, key) || typeof cast[key] !== "string" || !cast[key]) throw new Error(`story token {{cast.${key}}} has no value in the pack`);
    return cast[key];
  });
}

// The stories for one pack, with the customer's organisation name (customer.config) in place of the pack's when it gave one.
export function storiesFor(packId, org) {
  if (!Object.hasOwn(PACKS, packId)) throw new Error(`unknown pack "${packId}"`);
  const cast = { ...PACKS[packId].cast, ...(org ? { org } : {}) };
  return Object.fromEntries(Object.entries(STORIES).map(([id, text]) => [id, renderStory(text, cast)]));
}

export const packList = () => Object.entries(PACKS).map(([id, p]) => ({ id, label: p.label }));
