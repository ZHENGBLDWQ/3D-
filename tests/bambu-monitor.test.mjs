import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
test("gateway is monitor-only and projects idempotent sessions",async()=>{const [route,projection,events]=await Promise.all([read("app/api/gateway-agent/route.ts"),read("app/api/gateway-agent/monitor-projection.ts"),read("shared/contracts/events.ts")]);assert.match(route,/mode:\s*"monitor_only",commands:\s*\[\]/);assert.doesNotMatch(route,/type:command\.command/);assert.match(route,/isNew\)await projectMonitorEvent/);assert.match(projection,/ON CONFLICT\(organization_id,external_session_key\)/);assert.match(events,/"print\.session"/)});
test("monitor hub exposes feed binding gaps without controls",async()=>{const [page,client,api]=await Promise.all([read("app/monitor/page.tsx"),read("app/monitor/monitor-client.tsx"),read("app/api/monitor/route.ts")]);assert.match(page,/MonitorClient/);assert.match(client,/待绑定实体卷/);assert.doesNotMatch(client,/暂停|停止|发送打印/);assert.match(api,/spool_bindings/)});
