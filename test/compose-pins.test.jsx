// Rule 18 + rule 21 pins: loopback-only publish, restart policy, hardening.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const compose = readFileSync(join(root, "docker-compose.yml"), "utf8");
const dockerfile = readFileSync(join(root, "Dockerfile"), "utf8");
const serverSrc = readFileSync(join(root, "server", "src", "index.js"), "utf8");

describe("compose hardening (rule 18 + 21)", () => {
  it("publishes loopback-only, parameterized by HOST_PORT", () => {
    expect(compose).toMatch(/"127\.0\.0\.1:\$\{HOST_PORT:-7820\}:7820"/);
    expect(compose).not.toMatch(/- "7820:7820"/);
    expect(compose).not.toMatch(/"7820:7820"/);
  });

  it("long-running service restarts unless stopped (rule 21)", () => {
    expect(compose).toMatch(/restart: unless-stopped/);
  });

  it("container hardening: read-only, cap-drop, no-new-privileges", () => {
    expect(compose).toMatch(/read_only: true/);
    expect(compose).toMatch(/cap_drop:\s*\n\s*- ALL/);
    expect(compose).toMatch(/no-new-privileges:true/);
  });
});

describe("server bind discipline", () => {
  it("binds 0.0.0.0 only when BIND_ALL=1; host publish stays loopback", () => {
    expect(serverSrc).toMatch(/process\.env\.BIND_ALL === "1" \? "0\.0\.0\.0" : "127\.0\.0\.1"/);
  });

  it("Dockerfile builds the UI and copies dist", () => {
    expect(dockerfile).toMatch(/RUN npm run build/);
    expect(dockerfile).not.toMatch(/COPY data /);
    expect(dockerfile).toMatch(/USER node/);
  });
});

describe("placeholder port and identity", () => {
  it("compose, Dockerfile and server default agree on the placeholder port and this lab's own names", () => {
    expect(compose).toMatch(/PORT=7820/);
    expect(compose).toMatch(/name: cedar-in-privilege-lab/);
    expect(dockerfile).toMatch(/EXPOSE 7820/);
    expect(dockerfile).toMatch(/127\.0\.0\.1:7820\/api\/health/);
    expect(serverSrc).toMatch(/PORT_DEFAULT = 7820/);
  });

  it("the container never hardcodes credentials: no PF_*/DOOR_*/proxy values inline (Real settings come only from the owner's optional .env file)", () => {
    expect(compose).not.toMatch(/PF_CLIENT_SECRET|PF_ISSUER|DOOR_URL/);
    // An optional, owner-supplied env_file is allowed (pf-privilege-obo-LAB pattern): compose refuses to start without it,
    // and Mock mode works with no .env at all.
    expect(compose).toMatch(/env_file:\s*\n\s*- path: \.env\s*\n\s*required: false/);
  });
});
