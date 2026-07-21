import { getD1 } from ".";
import migration0000 from "../drizzle/0000_neat_the_santerians.sql?raw";
import migration0001 from "../drizzle/0001_mysterious_nomad.sql?raw";
import migration0002 from "../drizzle/0002_violet_excalibur.sql?raw";
import migration0003 from "../drizzle/0003_past_hydra.sql?raw";
import migration0004 from "../drizzle/0004_lame_blackheart.sql?raw";
import migration0005 from "../drizzle/0005_complete_power_pack.sql?raw";
import migration0006 from "../drizzle/0006_thick_cammi.sql?raw";
import migration0007 from "../drizzle/0007_funny_winter_soldier.sql?raw";
import migration0008 from "../drizzle/0008_lying_big_bertha.sql?raw";
import migration0009 from "../drizzle/0009_wet_argent.sql?raw";
import migration0010 from "../drizzle/0010_cold_starbolt.sql?raw";
import migration0011 from "../drizzle/0011_gray_scrambler.sql?raw";
import migration0012 from "../drizzle/0012_handy_mach_iv.sql?raw";
import migration0013 from "../drizzle/0013_thick_patch.sql?raw";
import migration0014 from "../drizzle/0014_classy_thor_girl.sql?raw";
import migration0015 from "../drizzle/0015_mushy_grandmaster.sql?raw";
import migration0016 from "../drizzle/0016_boring_zarda.sql?raw";
import migration0017 from "../drizzle/0017_inventory_control.sql?raw";
import migration0018 from "../drizzle/0018_inventory_printer_stock.sql?raw";
import migration0019 from "../drizzle/0019_link_jobs_to_printers.sql?raw";
import migration0020 from "../drizzle/0020_job_production_links.sql?raw";
import migration0021 from "../drizzle/0021_gateway_foundation.sql?raw";
import migration0022 from "../drizzle/0022_model_asset_library.sql?raw";
import migration0023 from "../drizzle/0023_bambu_realtime_gateway.sql?raw";
import migration0024 from "../drizzle/0024_slicing_center.sql?raw";
import migration0025 from "../drizzle/0025_preflight_center.sql?raw";
import migration0026 from "../drizzle/0026_order_organization_scope.sql?raw";
import migration0027 from "../drizzle/0027_intelligent_scheduling.sql?raw";
import migration0028 from "../drizzle/0028_dispatch_orchestration.sql?raw";
import migration0029 from "../drizzle/0029_execution_sync.sql?raw";
import migration0030 from "../drizzle/0030_quality_material_settlement.sql?raw";
import migration0031 from "../drizzle/0031_profit_analytics.sql?raw";
import migration0032 from "../drizzle/0032_printer_maintenance.sql?raw";
import migration0033 from "../drizzle/0033_persistent_alert_center.sql?raw";
import migration0034 from "../drizzle/0034_reporting_exports.sql?raw";
import migration0035 from "../drizzle/0035_procurement_replenishment.sql?raw";
import migration0036 from "../drizzle/0036_crm_quotes.sql?raw";
import migration0037 from "../drizzle/0037_disaster_recovery.sql?raw";
import migration0038 from "../drizzle/0038_finished_goods_fulfillment.sql?raw";

const baseMigrations = [
  migration0000,migration0001,migration0002,migration0003,migration0004,
  migration0005,migration0006,migration0007,migration0008,migration0009,
  migration0010,migration0011,migration0012,migration0013,migration0014,
  migration0015,migration0016,migration0017,migration0018,migration0019,migration0020,migration0021,migration0022,migration0023,migration0024,migration0025,migration0026,migration0027,migration0028,migration0029,
].map((sql,id)=>({id,sql}));
const migrations = [...baseMigrations,{id:30,sql:migration0030},{id:31,sql:migration0031},{id:32,sql:migration0032},{id:33,sql:migration0033},{id:34,sql:migration0034},{id:35,sql:migration0035},{id:36,sql:migration0036},{id:37,sql:migration0037},{id:38,sql:migration0038}];

let schemaPromise: Promise<void> | null = null;

function isSafeExistingSchemaError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("already exists") || message.includes("duplicate column name");
}

async function applyMigrations() {
  const db = getD1();
  await db.prepare("CREATE TABLE IF NOT EXISTS layertrace_migrations (id INTEGER PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  for (const migration of migrations) {
    const applied = await db.prepare("SELECT id FROM layertrace_migrations WHERE id=?").bind(migration.id).first();
    if (applied) continue;
    const statements = migration.sql.split("--> statement-breakpoint").map((statement:string)=>statement.trim()).filter(Boolean);
    for (const statement of statements) {
      try {
        await db.prepare(statement).run();
      } catch (error) {
        if (!isSafeExistingSchemaError(error)) throw error;
      }
    }
    await db.prepare("INSERT OR IGNORE INTO layertrace_migrations(id) VALUES(?)").bind(migration.id).run();
  }
}

export function ensureDatabaseSchema() {
  schemaPromise ??= applyMigrations().catch(error=>{schemaPromise=null;throw error;});
  return schemaPromise;
}
