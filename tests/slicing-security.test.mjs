import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("slicing center queues organization-scoped work for a local gateway", async () => {
  const [api, migration, adapter, contract] = await Promise.all([read("app/api/slicing/route.ts"), read("drizzle/0024_slicing_center.sql"), read("local-hub/slicing/bambu-studio.mjs"), read("shared/contracts/slicing.ts")]);
  assert.match(api, /model_files WHERE id=\? AND organization_id=\?/);
  assert.match(api, /local_gateways WHERE id=\? AND organization_id=\?/);
  assert.match(api, /getFilesBucket\(\)\.head/);
  assert.match(api, /status: "queued"/);
  assert.match(migration, /CREATE TABLE `slicing_jobs`/);
  assert.match(migration, /request_json/);
  assert.match(contract, /SlicerProfileSnapshot/);
  assert.match(contract, /SlicingOutputMetadata/);
  assert.match(adapter, /spawn\(executable, args, \{ shell: false/);
  assert.doesNotMatch(api, /child_process|spawn\(|exec\(/);
});
