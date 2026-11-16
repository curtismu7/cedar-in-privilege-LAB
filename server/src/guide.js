// "Set up Cedar in Privilege" (eight console steps) and the Cedar IS / IS NOT panel, as data, for first-time users.
// Every statement carries a label: "measured" (seen on a real tenant, one run), "console text" (what the console or its documentation
// says, read on the date given, not re-run in this lab) or "UNVERIFIED" (believed, never tested here). Nothing here is produced by a mock run.

export const LABELS = ["measured", "console text", "UNVERIFIED"];

const t = (label, text) => ({ label, text });

// The console path was walked on 2026-11-16 with nothing saved. It is console text, not a recorded run of a policy.
export const GUIDE = {
  title: "Set up Cedar in Privilege",
  lede: "Eight steps in the Privilege console. The console was walked on 2026-11-16 and nothing was saved, so every step below is console text: what the console shows, not a result this lab produced.",
  steps: [
    {
      n: 1, title: "Sign in to the Privilege console",
      what: "Open the console for your tenant and sign in as an administrator.",
      notes: [t("console text", "The console path below is the one walked on 2026-11-16.")]
    },
    {
      n: 2, title: "Open Access Management, then AI Policies",
      what: "In the sidebar open Access Management, then AI Policies (the page address ends /ui/admin/ai-policys).",
      notes: [t("console text", "The page lists each policy with how it was written, its effect, the stage it runs at, whether it is valid, and its state.")]
    },
    {
      n: 3, title: "Click New Policy",
      what: "A form opens with a name, a state, a description and three ways to write the rule.",
      notes: []
    },
    {
      n: 4, title: "Name it and set the state to Candidate",
      what: "Start every new policy as a Candidate. Per the console, a Candidate is stored and checked but not enforced, so you can try a rule without it touching any call, and Active is enforced on every request.",
      notes: [t("console text", "The console says a Candidate is stored and checked (it reports Valid or the reason it would not compile) but not enforced; Active is enforced."),
        t("UNVERIFIED", "Not re-run here: this lab only simulates the Candidate state (scenario 3.3).")]
    },
    {
      n: 5, title: "Pick how to write it",
      what: "Choose From a template, Build a rule or Write Cedar. There are 40 templates, which you can filter by MCP, LLM, A2A and Coding agent. The three cases in this lab use a hold template, a scope template and the claim template.",
      notes: [t("console text", "40 templates, filterable by MCP / LLM / A2A / Coding agent.")]
    },
    {
      n: 6, title: "Fill in the template and read the Cedar it will save",
      what: "Fill in the fields (the door, the tool, the scope or claim and its value). The form shows a \"Cedar this will save\" preview under the fields as you type, so the template is never a black box. Read it before you save.",
      notes: [t("console text", "The preview is shown by the console. The Cedar on this page is a lab-generated copy of that shape with example ids, not a capture.")]
    },
    {
      n: 7, title: "Click Create Policy and read Validation & Stages",
      what: "The console reports Valid, or the reason the policy would not compile, how many statements it holds and the stage it runs at, for example \"MCP, before inspection\".",
      notes: [t("console text", "Valid or the reason, the statement count and the stage are shown by the console.")]
    },
    {
      n: 8, title: "Enforce when you are happy, wait, then test",
      what: "Move the policy from Candidate to Active (the Enforce button). Wait for the change to reach the gateway, then make the call that should be refused or held. A refused call comes back as a JSON-RPC error -32600 and the gateway log names the policy.",
      notes: [
        t("console text", "The documentation says a change can take about 4 minutes to reach the gateway."),
        t("measured", "In one run on 2026-11-16 the first poll, about 7 seconds after the policies were created, already showed the refusal. That is one observation, not a propagation time."),
        t("measured", "The refusal of the act.sub policy was a JSON-RPC error with code -32600 whose message carried the policy's reason (the tool and the required act.sub value; one real agent, one run)."),
        t("console text", "HTTP 400 for a refused call and the gateway log naming the policy are console-walk text, not re-run here; the HTTP status of a policy refusal was not tested by the probe, which decides on the message.")
      ]
    }
  ]
};

export const IS_IS_NOT = {
  title: "What Cedar is, and is not, in Privilege",
  lede: "For first-time users. Each line says where it comes from.",
  is: [
    t("console text", "A rule engine inside the gateway that decides each agent action, one tool call at a time."),
    t("UNVERIFIED", "Narrowing only: a refusal always wins, and a policy never grants access that the agent's own grant does not allow. Not tested here; this lab's mock has no way to grant."),
    t("console text", "Three actions: mcp:Invoke (refuse the call), mcp:InvokeUnattended (hold the call for a human) and llm:Receive (withhold a reply)."),
    t("console text", "Able to read the token's scopes (context.token.scopes)."),
    t("measured", "Able to read a signed claim such as act.sub (context.token.claims), per one run with one real agent on 2026-11-16."),
    t("console text", "Safe to try as a Candidate: per the console it is stored and checked but not enforced until you make it Active.")
  ],
  isNot: [
    t("console text", "Authentication. The gateway checks the token first; a policy only decides what an accepted caller may do."),
    t("UNVERIFIED", "A grant. A policy narrows access; it does not give an agent a tool its own policy does not allow."),
    t("UNVERIFIED", "The RequiredClaims claim gate. That gate sits earlier in the chain, on the identity or grant; the full demo app's notes record it as checked end to end for act.sub, which this lab did not re-run."),
    t("UNVERIFIED", "A regex engine. The act.sub template tests the claim with .contains(); whether the real rule compares exactly, by substring or by set membership was not measured."),
    t("console text", "Instant. The documentation says a change can take about 4 minutes to reach the gateway; one observation on a real tenant showed 7 seconds (one observation, not a propagation time)."),
    t("console text", "Everything. Principal attributes, a raw groups claim and an ID-JAG hook were not found in the console on 2026-10-20 and were not re-checked.")
  ]
};
