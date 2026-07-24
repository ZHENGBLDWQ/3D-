import assert from "node:assert/strict";
import {readdir,readFile} from "node:fs/promises";
const files=(await readdir(new URL("../drizzle/",import.meta.url))).filter(name=>/^\d{4}_.+\.sql$/.test(name)).sort();
assert.ok(files.length,"没有找到数据库迁移");
const ids=files.map(name=>Number(name.slice(0,4))),latest=Math.max(...ids);
assert.equal(new Set(ids).size,ids.length,"存在重复的迁移编号");
for(let id=0;id<=latest;id++)assert.ok(ids.includes(id),`缺少迁移 ${String(id).padStart(4,"0")}`);
const loader=await readFile(new URL("../db/ensure-schema.ts",import.meta.url),"utf8");
for(const file of files){const id=file.slice(0,4);assert.ok(loader.includes(`migration${id}`),`运行时未加载迁移 ${id}`)}
console.log(`Migration chain verified: 0000-${String(latest).padStart(4,"0")} (${files.length} files)`);
