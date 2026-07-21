import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("binding wizard ranks RFID, material and color but never auto-confirms a spool",async()=>{const client=await read("app/feed-bindings/feed-binding-client.tsx");assert.match(client,/RFID完全一致/);assert.match(client,/材质一致/);assert.match(client,/颜色值一致/);assert.match(client,/score>=100/);assert.match(client,/请先扫码或明确选择实体卷/);assert.doesNotMatch(client,/useState<Record<number,string>>\(\{[^}]+\}\)/)});

test("wizard supports AMS, external and auxiliary feeds with precise alert focus",async()=>{const [client,alerts,home]=await Promise.all([read("app/feed-bindings/feed-binding-client.tsx"),read("app/alerts/alert-center.tsx"),read("app/page.tsx")]);assert.match(client,/辅助工具头外置料盘/);assert.match(client,/feedKind\.toUpperCase/);assert.match(client,/URLSearchParams\(window\.location\.search\)/);assert.match(client,/scrollIntoView/);assert.match(alerts,/feed-bindings\?feedId=/);assert.match(home,/href:"\/feed-bindings"/)});

test("confirmed binding reuses guarded inventory issue flow without deducting assets",async()=>{const [client,api,inventory]=await Promise.all([read("app/feed-bindings/feed-binding-client.tsx"),read("app/api/inventory-v2/route.ts"),read("app/inventory/inventory-v2-client.tsx")]);assert.match(client,/action:"issue"/);assert.match(client,/feedPositionId:slot\.id/);assert.match(api,/spool_bindings\(organization_id,spool_id,feed_position_id/);assert.match(api,/movement_type.*'issue'/s);assert.match(api,/net_grams_delta.*0/s);assert.doesNotMatch(api.slice(api.indexOf('if(action==="issue")'),api.indexOf('if(action==="return")')),/remaining_net_grams=remaining_net_grams-/);assert.match(inventory,/实体卷绑定向导/)});

test("binding wizard exposes data-quality boundaries and inventory facts",async()=>{const client=await read("app/feed-bindings/feed-binding-client.tsx");for(const text of ["实时检测","RFID 高置信候选","材质未知","无可靠候选","不按槽位自动猜实体卷","实际克重在打印结算时扣减"])assert.match(client,new RegExp(text));assert.match(client,/remainingNetGrams/);assert.match(client,/locationName/)});
