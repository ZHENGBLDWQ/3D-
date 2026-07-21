import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("material v2 migration is registered and owns the complete serialized spool domain",async()=>{
  const [ensure,migration,schema]=await Promise.all([read("db/ensure-schema.ts"),read("drizzle/0041_material_domain_v2.sql"),read("db/schema.ts")]);
  assert.match(ensure,/migration0041/);
  for(const table of ["material_catalog_items","material_purchase_lots","inventory_locations_v2","material_spools","printer_feed_positions","spool_bindings","print_sessions","print_material_usage_lines","material_spool_movements","spool_weight_checks"]){
    assert.match(migration,new RegExp(`CREATE TABLE .${table}.`),table);
    assert.match(schema,new RegExp(`sqliteTable\\("${table}"`),table);
  }
});

test("material v2 enforces organization isolation, one active binding and immutable settled facts",async()=>{
  const migration=await read("drizzle/0041_material_domain_v2.sql");
  assert.match(migration,/MATERIAL_SPOOL_ORGANIZATION_MISMATCH/);
  assert.match(migration,/SPOOL_BINDING_ORGANIZATION_MISMATCH/);
  assert.match(migration,/PRINT_MATERIAL_USAGE_ORGANIZATION_MISMATCH/);
  assert.match(migration,/MATERIAL_SPOOL_MOVEMENT_IMMUTABLE/);
  assert.match(migration,/SPOOL_WEIGHT_CHECK_IMMUTABLE/);
  assert.match(migration,/PRINT_MATERIAL_USAGE_SETTLED_IMMUTABLE/);
  assert.match(migration,/spool_bindings_active_spool_unique/);
  assert.match(migration,/spool_bindings_active_position_unique/);
  assert.match(migration,/UNIQUE \(`organization_id`,`external_session_key`\)/);
});

test("material v2 represents sealed, open, in-use and classified multi-toolhead consumption",async()=>{
  const migration=await read("drizzle/0041_material_domain_v2.sql");
  for(const state of ["sealed","open_storage","in_use","empty","scrapped","needs_count"])assert.match(migration,new RegExp(`'${state}'`));
  for(const purpose of ["model","support","support_interface","purge","wipe_tower","brim","calibration","unknown"])assert.match(migration,new RegExp(`'${purpose}'`));
  for(const toolhead of ["main","auxiliary","left","right"])assert.match(migration,new RegExp(`'${toolhead}'`));
  for(const feed of ["ams","ams_lite","ams_ht","external"])assert.match(migration,new RegExp(`'${feed}'`));
});

test("legacy aggregate inventory is migrated conservatively and remains queryable through a compatibility view",async()=>{
  const migration=await read("drizzle/0041_material_domain_v2.sql");
  assert.match(migration,/legacy_batch_id/);
  assert.match(migration,/state`,`initial_net_grams`/);
  assert.match(migration,/'needs_count'/);
  assert.match(migration,/CREATE VIEW `material_inventory_v2_compat`/);
  assert.doesNotMatch(migration,/DROP TABLE|DELETE FROM `material_batches`/);
});
