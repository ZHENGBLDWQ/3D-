import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("all browser business APIs enforce authenticated access",async()=>{for(const path of ["app/api/workspace/route.ts","app/api/details/route.ts","app/api/files/route.ts","app/api/printers/route.ts","app/api/spools/route.ts","app/api/analytics/route.ts","app/api/system/route.ts"]){const source=await read(path);assert.match(source,/requireApiAccess\(/,path);}});
test("agent endpoints authenticate bearer tokens and never expose connector hashes in backup",async()=>{const agent=await read("app/api/agent/route.ts");const system=await read("app/api/system/route.ts");assert.match(agent,/authorization/i);assert.match(agent,/connectorTokenHash/);assert.doesNotMatch(system,/SELECT \* FROM printers/);});
test("admin allowlist fails closed when ADMIN_EMAILS is empty",async()=>{const auth=await read("app/api-auth.ts");assert.match(auth,/allowed\.includes\(user\.email\.toLowerCase\(\)\)/);assert.doesNotMatch(auth,/allowed\.length\s*===\s*0/);});
