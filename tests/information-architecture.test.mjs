import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
const block=source.match(/PRIMARY_NAV_START([\s\S]*?)PRIMARY_NAV_END/)?.[1]??"";

test("primary navigation exposes exactly the seven monitoring ERP modules",()=>{
  const expected=[
    ["首页",null],
    ["订单中心","/orders"],
    ["实时打印监控","/monitor"],
    ["耗材库存","/inventory"],
    ["成本与定价","/costing"],
    ["经营分析","/analytics"],
    ["系统设置","/settings"],
  ];
  const entries=[...block.matchAll(/label:\s*"([^"]+)"[^\n]+href:\s*(null|"[^"]+")/g)].map(match=>[match[1],match[2]==="null"?null:match[2].slice(1,-1)]);
  assert.deepEqual(entries,expected);
});

test("primary navigation does not expose printer-operation or model preparation routes",()=>{
  for(const forbidden of ["/slicing","/dispatch","/preflight","/scheduling","/models","切片","下发","暂停","停止","排产","预检","模型库"]){
    assert.equal(block.includes(forbidden),false,`primary navigation must not contain ${forbidden}`);
  }
});

test("legacy routes remain implemented for direct URL compatibility",async()=>{
  for(const route of ["slicing","dispatch","preflight","scheduling","models"]){
    const page=await readFile(new URL(`../app/${route}/page.tsx`,import.meta.url),"utf8");
    assert.match(page,/export default/);
  }
});
