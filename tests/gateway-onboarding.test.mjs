import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assessGatewayHealth } from "../lib/gateway-health.ts";

const now = Date.parse("2026-07-22T08:00:00.000Z");

test("gateway onboarding reports the next actionable connection step", () => {
  const offline = assessGatewayHealth({ lastSeenAt: null, discoveries: [], bindings: [] }, now);
  assert.equal(offline.state, "waiting");
  assert.match(offline.nextAction, /Local Hub/);

  const undiscovered = assessGatewayHealth({ lastSeenAt: "2026-07-22T07:59:40.000Z", discoveries: [], bindings: [] }, now);
  assert.equal(undiscovered.state, "attention");
  assert.match(undiscovered.nextAction, /局域网|防火墙/);

  const credential = assessGatewayHealth({ lastSeenAt: "2026-07-22T07:59:40.000Z", discoveries: [{ lastSeenAt: "2026-07-22T07:59:30.000Z" }], bindings: [{ status: "pending_local_credential", lastSeenAt: null }] }, now);
  assert.equal(credential.state, "attention");
  assert.match(credential.nextAction, /LAN Access Code/);

  const healthy = assessGatewayHealth({ lastSeenAt: "2026-07-22T07:59:40.000Z", discoveries: [{ lastSeenAt: "2026-07-22T07:59:30.000Z" }], bindings: [{ status: "online", lastSeenAt: "2026-07-22T07:59:30.000Z" }] }, now);
  assert.equal(healthy.state, "healthy");
  assert.equal(healthy.checks.every(check => check.state === "healthy"), true);
});

test("gateway page presents guided setup without exposing printer credentials", async () => {
  const [client, route] = await Promise.all([
    readFile(new URL("../app/gateways/gateway-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/gateways/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(client, /三步完成真实设备接入/);
  assert.match(client, /Developer Mode/);
  assert.match(client, /只保存在本地 Windows 电脑/);
  assert.match(route, /assessGatewayHealth/);
  assert.doesNotMatch(route, /body\.accessCode|accessCode:/);
});
