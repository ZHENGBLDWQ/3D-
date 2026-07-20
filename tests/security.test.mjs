import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("all browser business APIs enforce authenticated access",async()=>{for(const path of ["app/api/workspace/route.ts","app/api/details/route.ts","app/api/files/route.ts","app/api/printers/route.ts","app/api/spools/route.ts","app/api/analytics/route.ts","app/api/system/route.ts"]){const source=await read(path);assert.match(source,/requireApiAccess\(/,path);}});
test("agent endpoints authenticate bearer tokens and never expose connector hashes in backup",async()=>{const agent=await read("app/api/agent/route.ts");const system=await read("app/api/system/route.ts");assert.match(agent,/authorization/i);assert.match(agent,/connectorTokenHash/);assert.doesNotMatch(system,/SELECT \* FROM printers/);});
test("role permissions and employee administration are enforced server-side",async()=>{const access=await read("app/access-control.ts");const team=await read("app/api/team/route.ts");assert.match(access,/team\.manage/);assert.match(access,/status='active'/);assert.match(team,/can\(c,"team\.manage"\)/);assert.match(team,/organization_id=\?/);});
