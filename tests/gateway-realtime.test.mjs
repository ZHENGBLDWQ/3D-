import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("Bambu realtime gateway deduplicates discovery and keeps LAN credentials local",async()=>{
  const migration=await read("drizzle/0023_bambu_realtime_gateway.sql");
  const agentRoute=await read("app/api/gateway-agent/route.ts");
  const adminRoute=await read("app/api/gateways/route.ts");
  const mqtt=await read("agent/layertrace_gateway/mqtt.py");
  assert.match(migration,/gateway_discoveries_gateway_device_unique/);
  assert.match(migration,/printer_commands_idempotency_unique/);
  assert.match(agentRoute,/authorization/);
  assert.match(agentRoute,/printer\.materials/);
  assert.match(agentRoute,/bindings:bindings\.map/);
  assert.match(agentRoute,/deviceId:`bambu:/);
  assert.match(adminRoute,/pending_local_credential/);
  assert.doesNotMatch(agentRoute,/access.?code/i);
  assert.doesNotMatch(adminRoute,/body\.accessCode|accessCode:/);
  assert.match(mqtt,/get_access_code/);
});
