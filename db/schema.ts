import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const organizations = sqliteTable("organizations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const organizationMembers = sqliteTable("organization_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull().default(""),
  role: text("role").notNull().default("operator"),
  status: text("status").notNull().default("invited"),
  printerScope: text("printer_scope").notNull().default("[]"),
  invitedBy: text("invited_by").notNull().default(""),
  passwordHash: text("password_hash"),
  lastLoginAt: text("last_login_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  resource: text("resource").notNull().default("system"),
  resourceId: text("resource_id").notNull().default(""),
  detail: text("detail").notNull().default("{}"),
  ipAddress: text("ip_address").notNull().default(""),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const costSettings = sqliteTable("cost_settings", {
  id: integer("id").primaryKey(),
  electricityRate: real("electricity_rate").notNull().default(0.8),
  laborRate: real("labor_rate").notNull().default(0),
  laborMinutesPerJob: real("labor_minutes_per_job").notNull().default(0),
  overheadPercent: real("overhead_percent").notNull().default(0),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const profitSettings = sqliteTable("profit_settings", {
  organizationId: integer("organization_id").primaryKey().references(() => organizations.id, { onDelete: "cascade" }),
  electricityRateCentsPerKwh: integer("electricity_rate_cents_per_kwh").notNull().default(80),
  laborRateCentsPerHour: integer("labor_rate_cents_per_hour").notNull().default(0),
  laborMinutesPerJob: integer("labor_minutes_per_job").notNull().default(0),
  packagingCentsPerOrder: integer("packaging_cents_per_order").notNull().default(0),
  overheadBasisPoints: integer("overhead_basis_points").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const printItems = sqliteTable("print_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull().default("未分类"),
  estimatedGrams: real("estimated_grams").notNull().default(0),
  estimatedMinutes: integer("estimated_minutes").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const materialBatches = sqliteTable("material_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  material: text("material").notNull(),
  color: text("color").notNull(),
  brand: text("brand").notNull().default(""),
  initialGrams: real("initial_grams").notNull(),
  remainingGrams: real("remaining_grams").notNull(),
  lowStockGrams: real("low_stock_grams").notNull().default(200),
  costPerKg: real("cost_per_kg").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").references(() => organizations.id),
  orderNo: text("order_no").notNull().unique(),
  customer: text("customer").notNull(),
  status: text("status").notNull().default("待确认"),
  dueAt: text("due_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const printJobs = sqliteTable("print_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").references(() => organizations.id),
  jobNo: text("job_no").notNull().unique(),
  itemId: integer("item_id").references(() => printItems.id),
  orderId: integer("order_id").references(() => orders.id),
  // The D1 migration owns the foreign key because `printers` is declared later in this module.
  printerId: integer("printer_id"),
  fileId: integer("file_id"),
  printerName: text("printer_name").notNull(),
  status: text("status").notNull().default("排队"),
  progress: integer("progress").notNull().default(0),
  quantity: integer("quantity").notNull().default(1),
  priority: integer("priority").notNull().default(3),
  materialDeducted: integer("material_deducted", { mode: "boolean" })
    .notNull()
    .default(false),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  plannedStartAt: text("planned_start_at"),
  expectedCompleteAt: text("expected_complete_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const profitCostEntries = sqliteTable("profit_cost_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  orderId: integer("order_id").references(() => orders.id),
  jobId: integer("job_id").references(() => printJobs.id),
  category: text("category").notNull(),
  basis: text("basis").notNull(),
  amountCents: integer("amount_cents").notNull(),
  occurredAt: text("occurred_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  note: text("note").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const inventoryTransactions = sqliteTable("inventory_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  batchId: integer("batch_id")
    .notNull()
    .references(() => materialBatches.id),
  jobId: integer("job_id").references(() => printJobs.id),
  type: text("type").notNull(),
  grams: real("grams").notNull(),
  note: text("note").notNull().default(""),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const materialInventoryMeta = sqliteTable("material_inventory_meta", {
  batchId: integer("batch_id")
    .primaryKey()
    .references(() => materialBatches.id),
  sku: text("sku").notNull().unique(),
  specification: text("specification").notNull().default(""),
  spoolWeightGrams: real("spool_weight_grams").notNull().default(1000),
  spoolCount: real("spool_count").notNull().default(1),
  supplier: text("supplier").notNull().default(""),
  warehouse: text("warehouse").notNull().default("主仓"),
  location: text("location").notNull().default(""),
  lotNo: text("lot_no").notNull().default(""),
  receivedAt: text("received_at"),
  expiryAt: text("expiry_at"),
  status: text("status").notNull().default("在库"),
  notes: text("notes").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const inventoryTransactionMeta = sqliteTable("inventory_transaction_meta", {
  transactionId: integer("transaction_id")
    .primaryKey()
    .references(() => inventoryTransactions.id),
  documentNo: text("document_no").notNull().default(""),
  operator: text("operator").notNull().default(""),
  warehouse: text("warehouse").notNull().default("主仓"),
  source: text("source").notNull().default("人工"),
});

export const inventoryStocktakes = sqliteTable("inventory_stocktakes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  batchId: integer("batch_id").notNull().references(() => materialBatches.id),
  bookGrams: real("book_grams").notNull(),
  countedGrams: real("counted_grams").notNull(),
  varianceGrams: real("variance_grams").notNull(),
  reason: text("reason").notNull().default(""),
  operator: text("operator").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const inventoryPrinterAllocations = sqliteTable("inventory_printer_allocations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  printerId: integer("printer_id").notNull(),
  batchId: integer("batch_id").notNull().references(() => materialBatches.id),
  amsUnit: integer("ams_unit"),
  trayIndex: integer("tray_index"),
  allocatedGrams: real("allocated_grams").notNull(),
  remainingGrams: real("remaining_grams").notNull(),
  status: text("status").notNull().default("使用中"),
  operator: text("operator").notNull().default(""),
  assignedAt: text("assigned_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const inventoryInTransit = sqliteTable("inventory_in_transit", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  batchId: integer("batch_id").notNull().references(() => materialBatches.id),
  grams: real("grams").notNull(),
  supplier: text("supplier").notNull().default(""),
  purchaseNo: text("purchase_no").notNull().default(""),
  eta: text("eta"),
  status: text("status").notNull().default("在途"),
  operator: text("operator").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  receivedAt: text("received_at"),
});

export const orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id),
  itemId: integer("item_id")
    .notNull()
    .references(() => printItems.id),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: real("unit_price").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const itemMaterials = sqliteTable("item_materials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: integer("item_id")
    .notNull()
    .references(() => printItems.id),
  batchId: integer("batch_id")
    .notNull()
    .references(() => materialBatches.id),
  gramsPerItem: real("grams_per_item").notNull(),
  wastePercent: real("waste_percent").notNull().default(5),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const printJobEvents = sqliteTable("print_job_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id")
    .notNull()
    .references(() => printJobs.id),
  action: text("action").notNull(),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  note: text("note").notNull().default(""),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const printFiles = sqliteTable("print_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: integer("item_id").references(() => printItems.id),
  filename: text("filename").notNull(),
  objectKey: text("object_key").notNull().unique(),
  kind: text("kind").notNull(),
  version: text("version").notNull().default("v1"),
  sizeBytes: integer("size_bytes").notNull(),
  contentType: text("content_type").notNull(),
  printerProfile: text("printer_profile").notNull().default(""),
  layerHeight: real("layer_height"),
  infillPercent: real("infill_percent"),
  estimatedMinutes: integer("estimated_minutes"),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const printers = sqliteTable("printers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  model: text("model").notNull().default(""),
  technology: text("technology").notNull().default("FDM"),
  location: text("location").notNull().default(""),
  nozzleDiameter: real("nozzle_diameter").notNull().default(0.4),
  buildVolume: text("build_volume").notNull().default(""),
  status: text("status").notNull().default("空闲"),
  totalHours: real("total_hours").notNull().default(0),
  hourlyRate: real("hourly_rate").notNull().default(0),
  powerWatts: real("power_watts").notNull().default(1000),
  maintenanceDueAt: text("maintenance_due_at"),
  notes: text("notes").notNull().default(""),
  connectorType: text("connector_type").notNull().default("manual"),
  connectorTokenHash: text("connector_token_hash"),
  connectionState: text("connection_state").notNull().default("未连接"),
  lastSeenAt: text("last_seen_at"),
  nozzleTemp: real("nozzle_temp"),
  bedTemp: real("bed_temp"),
  currentFile: text("current_file"),
  remoteProgress: real("remote_progress"),
  activeSpoolExternalId: integer("active_spool_external_id"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const bambuAmsSlots = sqliteTable("bambu_ams_slots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  printerId: integer("printer_id")
    .notNull()
    .references(() => printers.id),
  amsUnit: integer("ams_unit").notNull().default(0),
  trayIndex: integer("tray_index").notNull(),
  material: text("material").notNull().default(""),
  colorHex: text("color_hex").notNull().default(""),
  remainingPercent: real("remaining_percent"),
  tagUid: text("tag_uid").notNull().default(""),
  mappedSpoolExternalId: integer("mapped_spool_external_id"),
  active: integer("active", { mode: "boolean" }).notNull().default(false),
  lastSeenAt: text("last_seen_at").notNull(),
});

export const bambuMaterialUsage = sqliteTable("bambu_material_usage", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  printerId: integer("printer_id")
    .notNull()
    .references(() => printers.id),
  filename: text("filename").notNull().default(""),
  material: text("material").notNull().default(""),
  amsUnit: integer("ams_unit"),
  trayIndex: integer("tray_index"),
  estimatedGrams: real("estimated_grams").notNull().default(0),
  consumedGrams: real("consumed_grams").notNull().default(0),
  result: text("result").notNull().default("完成"),
  startedAt: text("started_at"),
  completedAt: text("completed_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const externalPrintJobs = sqliteTable("external_print_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  printerId: integer("printer_id")
    .notNull()
    .references(() => printers.id),
  filename: text("filename").notNull().default(""),
  itemId: integer("item_id").references(() => printItems.id),
  orderId: integer("order_id").references(() => orders.id),
  batchId: integer("batch_id").references(() => materialBatches.id),
  quantity: integer("quantity").notNull().default(1),
  material: text("material").notNull().default(""),
  amsUnit: integer("ams_unit"),
  trayIndex: integer("tray_index"),
  estimatedGrams: real("estimated_grams").notNull().default(0),
  consumedGrams: real("consumed_grams").notNull().default(0),
  status: text("status").notNull().default("待认领"),
  result: text("result").notNull().default(""),
  inventoryDeducted: integer("inventory_deducted", { mode: "boolean" })
    .notNull()
    .default(false),
  startedAt: text("started_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
  claimedAt: text("claimed_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const printerCommands = sqliteTable("printer_commands", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  printerId: integer("printer_id")
    .notNull()
    .references(() => printers.id),
  bindingId: integer("binding_id").references(() => printerBindings.id),
  idempotencyKey: text("idempotency_key").unique(),
  command: text("command").notNull(),
  payload: text("payload").notNull().default("{}"),
  status: text("status").notNull().default("待执行"),
  result: text("result").notNull().default(""),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
  acknowledgedAt: text("acknowledged_at"),
  retryable: integer("retryable", { mode: "boolean" }).notNull().default(false),
});

export const spoolmanSpools = sqliteTable("spoolman_spools", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  externalId: integer("external_id").notNull().unique(),
  filamentName: text("filament_name").notNull().default(""),
  vendor: text("vendor").notNull().default(""),
  material: text("material").notNull().default(""),
  colorHex: text("color_hex").notNull().default(""),
  initialWeight: real("initial_weight"),
  remainingWeight: real("remaining_weight"),
  usedWeight: real("used_weight"),
  location: text("location").notNull().default(""),
  lotNr: text("lot_nr").notNull().default(""),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  lastUsed: text("last_used"),
  syncedByPrinterId: integer("synced_by_printer_id").references(
    () => printers.id,
  ),
  lastSeenAt: text("last_seen_at").notNull(),
});

export const localGateways = sqliteTable("local_gateways", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  gatewayId: text("gateway_id").notNull().unique(),
  name: text("name").notNull(),
  status: text("status").notNull().default("registering"),
  version: text("version").notNull().default(""),
  platform: text("platform").notNull().default(""),
  metadata: text("metadata").notNull().default("{}"),
  lastSeenAt: text("last_seen_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const gatewayDiscoveries = sqliteTable("gateway_discoveries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gatewayId: integer("gateway_id").notNull().references(() => localGateways.id, { onDelete: "cascade" }),
  deviceId: text("device_id").notNull(),
  deviceSerial: text("device_serial").notNull(),
  deviceName: text("device_name").notNull().default("Bambu Lab"),
  deviceModel: text("device_model").notNull().default(""),
  host: text("host").notNull().default(""),
  source: text("source").notNull().default("bambu_ssdp"),
  lastSeenAt: text("last_seen_at").notNull(),
});

export const gatewayTokens = sqliteTable("gateway_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gatewayId: integer("gateway_id").notNull().references(() => localGateways.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  label: text("label").notNull().default(""),
  expiresAt: text("expires_at"),
  revokedAt: text("revoked_at"),
  lastUsedAt: text("last_used_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const printerBindings = sqliteTable("printer_bindings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  gatewayId: integer("gateway_id").notNull().references(() => localGateways.id, { onDelete: "cascade" }),
  printerId: integer("printer_id").notNull().references(() => printers.id, { onDelete: "cascade" }).unique(),
  deviceSerial: text("device_serial").notNull().unique(),
  deviceModel: text("device_model").notNull().default(""),
  status: text("status").notNull().default("pending"),
  capabilities: text("capabilities").notNull().default("{}"),
  boundAt: text("bound_at"),
  lastSeenAt: text("last_seen_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const printerEvents = sqliteTable("printer_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bindingId: integer("binding_id").notNull().references(() => printerBindings.id, { onDelete: "cascade" }),
  printerId: integer("printer_id").notNull().references(() => printers.id, { onDelete: "cascade" }),
  eventId: text("event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  payload: text("payload").notNull().default("{}"),
  occurredAt: text("occurred_at").notNull(),
  receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const backgroundJobs = sqliteTable("background_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  jobKey: text("job_key").notNull().unique(),
  jobType: text("job_type").notNull(),
  status: text("status").notNull().default("queued"),
  payload: text("payload").notNull().default("{}"),
  result: text("result"),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  runAfter: text("run_after"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const slicerProfiles = sqliteTable("slicer_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  profileType: text("profile_type").notNull(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  configJson: text("config_json").notNull().default("{}"),
  sha256: text("sha256").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const slicingJobs = sqliteTable("slicing_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  jobKey: text("job_key").notNull().unique(),
  inputFileId: integer("input_file_id").notNull(),
  gatewayId: integer("gateway_id").references(() => localGateways.id, { onDelete: "set null" }),
  status: text("status").notNull().default("queued"),
  requestJson: text("request_json").notNull(),
  resultJson: text("result_json"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  timeoutSeconds: integer("timeout_seconds").notNull().default(1800),
  cancelRequestedAt: text("cancel_requested_at"),
  claimedAt: text("claimed_at"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const preflightRuns = sqliteTable("preflight_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }), organizationId: integer("organization_id").notNull().references(() => organizations.id),
  runId: text("run_id").notNull().unique(), printerId: integer("printer_id").notNull().references(() => printers.id), level: text("level").notNull(),
  dispatchAllowed: integer("dispatch_allowed",{mode:"boolean"}).notNull().default(false), overrideAllowed: integer("override_allowed",{mode:"boolean"}).notNull().default(false),
  input: text("input").notNull(), evaluatedAt: text("evaluated_at").notNull(), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const preflightChecks = sqliteTable("preflight_checks", {id:integer("id").primaryKey({autoIncrement:true}),runId:integer("run_id").notNull().references(()=>preflightRuns.id,{onDelete:"cascade"}),code:text("code").notNull(),category:text("category").notNull(),level:text("level").notNull(),message:text("message").notNull(),details:text("details").notNull().default("{}"),resolutionActions:text("resolution_actions").notNull().default("[]")});
export const preflightOverrides = sqliteTable("preflight_overrides", {id:integer("id").primaryKey({autoIncrement:true}),runId:integer("run_id").notNull().references(()=>preflightRuns.id,{onDelete:"cascade"}),actorEmail:text("actor_email").notNull(),reason:text("reason").notNull(),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const productionPlans = sqliteTable("production_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }), organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  planNo: text("plan_no").notNull().unique(), status: text("status").notNull().default("draft"), mode: text("mode").notNull().default("recommend_only"),
  createdBy: text("created_by").notNull(), confirmedBy: text("confirmed_by"), confirmedAt: text("confirmed_at"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const productionPlanItems = sqliteTable("production_plan_items", {
  id: integer("id").primaryKey({ autoIncrement: true }), planId: integer("plan_id").notNull().references(() => productionPlans.id, { onDelete: "cascade" }),
  printJobId: integer("print_job_id").notNull().references(() => printJobs.id, { onDelete: "cascade" }), printerId: integer("printer_id").notNull().references(() => printers.id), score: real("score").notNull(),
  recommendationReasons: text("recommendation_reasons").notNull().default("[]"), conflicts: text("conflicts").notNull().default("[]"), plannedStartAt: text("planned_start_at").notNull(), plannedEndAt: text("planned_end_at").notNull(), status: text("status").notNull().default("recommended"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const printerSchedules = sqliteTable("printer_schedules", {
  id: integer("id").primaryKey({ autoIncrement: true }), organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), planItemId: integer("plan_item_id").notNull().references(() => productionPlanItems.id, { onDelete: "cascade" }), printerId: integer("printer_id").notNull().references(() => printers.id), startsAt: text("starts_at").notNull(), endsAt: text("ends_at").notNull(), status: text("status").notNull().default("reserved"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const scheduleConflicts = sqliteTable("schedule_conflicts", {
  id: integer("id").primaryKey({ autoIncrement: true }), planItemId: integer("plan_item_id").notNull().references(() => productionPlanItems.id, { onDelete: "cascade" }), code: text("code").notNull(), level: text("level").notNull(), message: text("message").notNull(), details: text("details").notNull().default("{}"), resolvedAt: text("resolved_at"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const scheduleRevisions = sqliteTable("schedule_revisions", {
  id: integer("id").primaryKey({ autoIncrement: true }), planId: integer("plan_id").notNull().references(() => productionPlans.id, { onDelete: "cascade" }), revisionNo: integer("revision_no").notNull(), snapshot: text("snapshot").notNull(), reason: text("reason").notNull().default(""), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const dispatchAttempts = sqliteTable("dispatch_attempts", {id:integer("id").primaryKey({autoIncrement:true}),runId:integer("run_id").notNull().references(()=>preflightRuns.id,{onDelete:"cascade"}),printerId:integer("printer_id").notNull().references(()=>printers.id),allowed:integer("allowed",{mode:"boolean"}).notNull().default(false),reason:text("reason").notNull().default(""),actorEmail:text("actor_email").notNull(),workflowId:integer("workflow_id"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)});

export const dispatchWorkflows = sqliteTable("dispatch_workflows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  workflowKey: text("workflow_key").notNull().unique(),
  preflightRunId: integer("preflight_run_id").notNull().references(() => preflightRuns.id),
  jobId: integer("job_id").notNull().references(() => printJobs.id),
  printerId: integer("printer_id").notNull().references(() => printers.id),
  commandId: integer("command_id").references(() => printerCommands.id).unique(),
  status: text("status").notNull().default("reserved"),
  preflightLevel: text("preflight_level").notNull(),
  overrideId: integer("override_id").references(() => preflightOverrides.id),
  actorEmail: text("actor_email").notNull(),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  startedAt: text("started_at"), completedAt: text("completed_at"), cancelledAt: text("cancelled_at"),
  lastEventAt: text("last_event_at"), settledAt: text("settled_at"), settlementEventId: text("settlement_event_id").unique(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const executionEvents = sqliteTable("execution_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  workflowId: integer("workflow_id").references(() => dispatchWorkflows.id, { onDelete: "set null" }),
  printerEventId: integer("printer_event_id").notNull().references(() => printerEvents.id, { onDelete: "cascade" }).unique(),
  eventId: text("event_id").notNull().unique(), printerId: integer("printer_id").notNull().references(() => printers.id, { onDelete: "cascade" }),
  bindingId: integer("binding_id").notNull().references(() => printerBindings.id, { onDelete: "cascade" }), deviceStatus: text("device_status").notNull(),
  occurredAt: text("occurred_at").notNull(), outcome: text("outcome").notNull(), details: text("details").notNull().default("{}"),
  processedAt: text("processed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const materialReservations = sqliteTable("material_reservations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  workflowId: integer("workflow_id").notNull().references(() => dispatchWorkflows.id, { onDelete: "cascade" }),
  jobId: integer("job_id").notNull().references(() => printJobs.id),
  printerId: integer("printer_id").notNull().references(() => printers.id),
  batchId: integer("batch_id").notNull().references(() => materialBatches.id),
  slot: text("slot").notNull(), material: text("material").notNull(), grams: real("grams").notNull(),
  status: text("status").notNull().default("reserved"), releasedReason: text("released_reason").notNull().default(""),
  allocatedAt: text("allocated_at"), issuedAt: text("issued_at"), releasedAt: text("released_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const productionOutcomes = sqliteTable("production_outcomes", {
  id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id),workflowId:integer("workflow_id").notNull().references(()=>dispatchWorkflows.id).unique(),jobId:integer("job_id").notNull().references(()=>printJobs.id),successfulQuantity:integer("successful_quantity").notNull().default(0),failedQuantity:integer("failed_quantity").notNull().default(0),failureReason:text("failure_reason").notNull().default(""),notes:text("notes").notNull().default(""),photoMetadata:text("photo_metadata").notNull().default("[]"),reportedBy:text("reported_by").notNull(),reportedAt:text("reported_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const qualityInspections = sqliteTable("quality_inspections", {id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id),outcomeId:integer("outcome_id").notNull().references(()=>productionOutcomes.id,{onDelete:"cascade"}),result:text("result").notNull(),checklist:text("checklist").notNull().default("[]"),notes:text("notes").notNull().default(""),photoMetadata:text("photo_metadata").notNull().default("[]"),inspectedBy:text("inspected_by").notNull(),inspectedAt:text("inspected_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const scrapRecords = sqliteTable("scrap_records", {id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id),outcomeId:integer("outcome_id").notNull().references(()=>productionOutcomes.id,{onDelete:"cascade"}),batchId:integer("batch_id").references(()=>materialBatches.id),quantity:integer("quantity").notNull().default(0),grams:real("grams").notNull().default(0),reason:text("reason").notNull(),photoMetadata:text("photo_metadata").notNull().default("[]"),recordedBy:text("recorded_by").notNull(),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const materialSettlements = sqliteTable("material_settlements", {id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id),outcomeId:integer("outcome_id").notNull().references(()=>productionOutcomes.id,{onDelete:"cascade"}),workflowId:integer("workflow_id").notNull().references(()=>dispatchWorkflows.id),jobId:integer("job_id").notNull().references(()=>printJobs.id),reservationId:integer("reservation_id").notNull().references(()=>materialReservations.id),batchId:integer("batch_id").notNull().references(()=>materialBatches.id),reservedGrams:real("reserved_grams").notNull(),actualGrams:real("actual_grams").notNull(),varianceGrams:real("variance_grams").notNull(),inventoryTransactionId:integer("inventory_transaction_id").references(()=>inventoryTransactions.id),settledBy:text("settled_by").notNull(),settledAt:text("settled_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const alerts = sqliteTable("alerts", {id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),fingerprint:text("fingerprint").notNull(),type:text("type").notNull(),severity:text("severity").notNull(),status:text("status").notNull().default("open"),title:text("title").notNull(),detail:text("detail").notNull().default(""),resourceType:text("resource_type").notNull(),resourceId:text("resource_id").notNull(),assignedTo:text("assigned_to"),signalActive:integer("signal_active",{mode:"boolean"}).notNull().default(true),occurrenceCount:integer("occurrence_count").notNull().default(1),firstDetectedAt:text("first_detected_at").notNull(),lastDetectedAt:text("last_detected_at").notNull(),clearedAt:text("cleared_at"),acknowledgedAt:text("acknowledged_at"),acknowledgedBy:text("acknowledged_by"),resolvedAt:text("resolved_at"),resolvedBy:text("resolved_by"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const alertActions = sqliteTable("alert_actions", {id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),alertId:integer("alert_id").notNull().references(()=>alerts.id,{onDelete:"cascade"}),actorEmail:text("actor_email").notNull(),action:text("action").notNull(),fromStatus:text("from_status").notNull().default(""),toStatus:text("to_status").notNull().default(""),assignedTo:text("assigned_to"),note:text("note").notNull().default(""),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const reportExports = sqliteTable("report_exports", {id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),actorEmail:text("actor_email").notNull(),dateFrom:text("date_from").notNull(),dateTo:text("date_to").notNull(),format:text("format").notNull().default("csv"),rowCount:integer("row_count").notNull().default(0),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)});

export const maintenancePlans = sqliteTable("maintenance_plans", {id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),printerId:integer("printer_id").notNull().references(()=>printers.id,{onDelete:"cascade"}),title:text("title").notNull(),status:text("status").notNull().default("scheduled"),dueAt:text("due_at"),dueHours:real("due_hours"),items:text("items").notNull().default("[]"),notes:text("notes").notNull().default(""),createdBy:text("created_by").notNull(),startedAt:text("started_at"),completedAt:text("completed_at"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const maintenanceRecords = sqliteTable("maintenance_records", {id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),planId:integer("plan_id").notNull().references(()=>maintenancePlans.id).unique(),printerId:integer("printer_id").notNull().references(()=>printers.id,{onDelete:"cascade"}),items:text("items").notNull().default("[]"),costCents:integer("cost_cents").notNull().default(0),downtimeMinutes:integer("downtime_minutes").notNull().default(0),operatorEmail:text("operator_email").notNull(),meterHours:real("meter_hours").notNull().default(0),notes:text("notes").notNull().default(""),completedAt:text("completed_at").notNull(),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)});

export const materialBatchOrganizations=sqliteTable("material_batch_organizations",{organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),batchId:integer("batch_id").notNull().references(()=>materialBatches.id,{onDelete:"cascade"}),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const suppliers=sqliteTable("suppliers",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),code:text("code").notNull(),name:text("name").notNull(),contact:text("contact").notNull().default(""),phone:text("phone").notNull().default(""),email:text("email").notNull().default(""),status:text("status").notNull().default("active"),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const procurementRequests=sqliteTable("procurement_requests",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),requestNo:text("request_no").notNull(),status:text("status").notNull().default("draft"),reason:text("reason").notNull().default(""),requestedBy:text("requested_by").notNull(),approvedBy:text("approved_by"),approvedAt:text("approved_at"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const procurementRequestItems=sqliteTable("procurement_request_items",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),requestId:integer("request_id").notNull().references(()=>procurementRequests.id,{onDelete:"cascade"}),batchId:integer("batch_id").notNull().references(()=>materialBatches.id),catalogItemId:integer("catalog_item_id").references(()=>materialCatalogItems.id),requestedGrams:real("requested_grams").notNull(),suggestedGrams:real("suggested_grams").notNull().default(0),requestedSpools:integer("requested_spools").notNull().default(0),perSpoolNetGrams:real("per_spool_net_grams").notNull().default(0),note:text("note").notNull().default("")});
export const purchaseOrders=sqliteTable("purchase_orders",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),requestId:integer("request_id").notNull().references(()=>procurementRequests.id),supplierId:integer("supplier_id").notNull().references(()=>suppliers.id),purchaseNo:text("purchase_no").notNull(),status:text("status").notNull().default("approved"),orderedAt:text("ordered_at"),cancelledAt:text("cancelled_at"),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const purchaseOrderItems=sqliteTable("purchase_order_items",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),purchaseOrderId:integer("purchase_order_id").notNull().references(()=>purchaseOrders.id,{onDelete:"cascade"}),requestItemId:integer("request_item_id").notNull().references(()=>procurementRequestItems.id),batchId:integer("batch_id").notNull().references(()=>materialBatches.id),catalogItemId:integer("catalog_item_id").references(()=>materialCatalogItems.id),orderedGrams:real("ordered_grams").notNull(),receivedGrams:real("received_grams").notNull().default(0),orderedSpools:integer("ordered_spools").notNull().default(0),receivedSpools:integer("received_spools").notNull().default(0),perSpoolNetGrams:real("per_spool_net_grams").notNull().default(0),unitCostPerKg:real("unit_cost_per_kg").notNull().default(0)});
export const goodsReceipts=sqliteTable("goods_receipts",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),purchaseOrderId:integer("purchase_order_id").notNull().references(()=>purchaseOrders.id),idempotencyKey:text("idempotency_key").notNull(),receiptNo:text("receipt_no").notNull(),receivedBy:text("received_by").notNull(),receivedAt:text("received_at").notNull(),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const goodsReceiptItems=sqliteTable("goods_receipt_items",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),receiptId:integer("receipt_id").notNull().references(()=>goodsReceipts.id,{onDelete:"cascade"}),purchaseOrderItemId:integer("purchase_order_item_id").notNull().references(()=>purchaseOrderItems.id),batchId:integer("batch_id").notNull().references(()=>materialBatches.id),receivedGrams:real("received_grams").notNull(),inventoryTransactionId:integer("inventory_transaction_id").notNull().references(()=>inventoryTransactions.id).unique(),purchaseLotId:integer("purchase_lot_id"),spoolCount:integer("spool_count").notNull().default(0),perSpoolNetGrams:real("per_spool_net_grams").notNull().default(0)});

// Material domain v2 keeps serialized spools and their immutable sub-ledger separate
// from the legacy aggregate material_batches balance during the compatibility window.
export const materialCatalogItems=sqliteTable("material_catalog_items",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),catalogCode:text("catalog_code").notNull(),brand:text("brand").notNull().default(""),series:text("series").notNull().default(""),material:text("material").notNull(),colorName:text("color_name").notNull().default(""),colorNameEn:text("color_name_en").notNull().default(""),colorCode:text("color_code").notNull().default(""),colorHex:text("color_hex").notNull().default(""),densityGcm3:real("density_g_cm3").notNull().default(1.24),defaultNetGrams:real("default_net_grams").notNull().default(1000),defaultTareGrams:real("default_tare_grams").notNull().default(0),reorderPointSpools:integer("reorder_point_spools").notNull().default(2),targetStockSpools:integer("target_stock_spools").notNull().default(5),amsCompatibility:text("ams_compatibility").notNull().default("unknown"),tags:text("tags").notNull().default("[]"),sourceType:text("source_type").notNull().default("manual"),sourceUrl:text("source_url").notNull().default(""),sourceCheckedAt:text("source_checked_at"),officialVerified:integer("official_verified",{mode:"boolean"}).notNull().default(false),legacyBatchId:integer("legacy_batch_id").references(()=>materialBatches.id,{onDelete:"set null"}),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const materialCatalogAliases=sqliteTable("material_catalog_aliases",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),catalogItemId:integer("catalog_item_id").notNull().references(()=>materialCatalogItems.id,{onDelete:"cascade"}),aliasType:text("alias_type").notNull(),aliasValue:text("alias_value").notNull(),source:text("source").notNull().default("manual"),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const materialCatalogImportBatches=sqliteTable("material_catalog_import_batches",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),batchKey:text("batch_key").notNull(),fileName:text("file_name").notNull(),status:text("status").notNull().default("pending"),rowsJson:text("rows_json").notNull(),summaryJson:text("summary_json").notNull(),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),appliedBy:text("applied_by"),appliedAt:text("applied_at")});
export const materialPurchaseLots=sqliteTable("material_purchase_lots",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),catalogItemId:integer("catalog_item_id").notNull().references(()=>materialCatalogItems.id),lotNo:text("lot_no").notNull(),supplierId:integer("supplier_id").references(()=>suppliers.id),purchaseOrderItemId:integer("purchase_order_item_id").references(()=>purchaseOrderItems.id),goodsReceiptId:integer("goods_receipt_id"),unitCostCentsPerKg:integer("unit_cost_cents_per_kg").notNull().default(0),receivedAt:text("received_at"),expiresAt:text("expires_at"),legacyBatchId:integer("legacy_batch_id").references(()=>materialBatches.id,{onDelete:"set null"}),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const inventoryLocationsV2=sqliteTable("inventory_locations_v2",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),code:text("code").notNull(),name:text("name").notNull(),kind:text("kind").notNull(),printerId:integer("printer_id").references(()=>printers.id,{onDelete:"cascade"}),active:integer("active",{mode:"boolean"}).notNull().default(true),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const materialSpools=sqliteTable("material_spools",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),spoolCode:text("spool_code").notNull(),catalogItemId:integer("catalog_item_id").notNull().references(()=>materialCatalogItems.id),purchaseLotId:integer("purchase_lot_id").references(()=>materialPurchaseLots.id),currentLocationId:integer("current_location_id").notNull().references(()=>inventoryLocationsV2.id),state:text("state").notNull().default("sealed"),initialNetGrams:real("initial_net_grams").notNull(),remainingNetGrams:real("remaining_net_grams").notNull(),tareGrams:real("tare_grams").notNull().default(0),lastGrossGrams:real("last_gross_grams"),rfidUid:text("rfid_uid").notNull().default(""),qrToken:text("qr_token").notNull().unique(),legacyBatchId:integer("legacy_batch_id").references(()=>materialBatches.id,{onDelete:"set null"}),openedAt:text("opened_at"),lastWeighedAt:text("last_weighed_at"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const printerFeedPositions=sqliteTable("printer_feed_positions",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),printerId:integer("printer_id").notNull().references(()=>printers.id,{onDelete:"cascade"}),feedKind:text("feed_kind").notNull(),amsUnit:integer("ams_unit"),slotIndex:integer("slot_index"),toolhead:text("toolhead").notNull().default("main"),label:text("label").notNull().default(""),active:integer("active",{mode:"boolean"}).notNull().default(true),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const spoolBindings=sqliteTable("spool_bindings",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),spoolId:integer("spool_id").notNull().references(()=>materialSpools.id),feedPositionId:integer("feed_position_id").notNull().references(()=>printerFeedPositions.id),bindingSource:text("binding_source").notNull(),status:text("status").notNull().default("active"),detectedSnapshot:text("detected_snapshot").notNull().default("{}"),boundBy:text("bound_by").notNull().default(""),boundAt:text("bound_at").notNull().default(sql`CURRENT_TIMESTAMP`),unboundAt:text("unbound_at")});
export const printSessions=sqliteTable("print_sessions",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),printerId:integer("printer_id").notNull().references(()=>printers.id),jobId:integer("job_id").references(()=>printJobs.id,{onDelete:"set null"}),externalPrintJobId:integer("external_print_job_id").references(()=>externalPrintJobs.id,{onDelete:"set null"}),source:text("source").notNull().default("bambu_studio"),externalSessionKey:text("external_session_key").notNull(),filename:text("filename").notNull().default(""),status:text("status").notNull().default("observed"),startedAt:text("started_at"),completedAt:text("completed_at"),lastObservedAt:text("last_observed_at").notNull(),telemetrySnapshot:text("telemetry_snapshot").notNull().default("{}"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const printMaterialUsageLines=sqliteTable("print_material_usage_lines",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),printSessionId:integer("print_session_id").notNull().references(()=>printSessions.id,{onDelete:"cascade"}),spoolId:integer("spool_id").references(()=>materialSpools.id),feedPositionId:integer("feed_position_id").references(()=>printerFeedPositions.id),toolhead:text("toolhead").notNull().default("unknown"),purpose:text("purpose").notNull(),estimateSource:text("estimate_source").notNull().default("unknown"),estimatedGrams:real("estimated_grams").notNull().default(0),settledGrams:real("settled_grams"),measuredGrams:real("measured_grams"),costCents:integer("cost_cents").notNull().default(0),settledAt:text("settled_at"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const materialSpoolMovements=sqliteTable("material_spool_movements",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),spoolId:integer("spool_id").notNull().references(()=>materialSpools.id),movementType:text("movement_type").notNull(),fromLocationId:integer("from_location_id").references(()=>inventoryLocationsV2.id),toLocationId:integer("to_location_id").references(()=>inventoryLocationsV2.id),usageLineId:integer("usage_line_id").references(()=>printMaterialUsageLines.id),netGramsDelta:real("net_grams_delta").notNull().default(0),idempotencyKey:text("idempotency_key").notNull(),operatorEmail:text("operator_email").notNull().default(""),note:text("note").notNull().default(""),occurredAt:text("occurred_at").notNull().default(sql`CURRENT_TIMESTAMP`),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const spoolWeightChecks=sqliteTable("spool_weight_checks",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),spoolId:integer("spool_id").notNull().references(()=>materialSpools.id),grossGrams:real("gross_grams").notNull(),tareGrams:real("tare_grams").notNull(),measuredNetGrams:real("measured_net_grams").notNull(),bookNetGrams:real("book_net_grams").notNull(),varianceGrams:real("variance_grams").notNull(),adjustmentMovementId:integer("adjustment_movement_id").references(()=>materialSpoolMovements.id),measuredBy:text("measured_by").notNull(),measuredAt:text("measured_at").notNull().default(sql`CURRENT_TIMESTAMP`),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const materialCalibrationTasks=sqliteTable("material_calibration_tasks",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),printSessionId:integer("print_session_id").notNull().references(()=>printSessions.id),printerId:integer("printer_id").notNull().references(()=>printers.id),spoolId:integer("spool_id").notNull().references(()=>materialSpools.id),status:text("status").notNull().default("planned"),beforeGrossGrams:real("before_gross_grams"),afterGrossGrams:real("after_gross_grams"),actualConsumedGrams:real("actual_consumed_grams"),notes:text("notes").notNull().default(""),createdBy:text("created_by").notNull(),startedAt:text("started_at"),completedAt:text("completed_at"),cancelledAt:text("cancelled_at"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const materialVarianceCases=sqliteTable("material_variance_cases",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),spoolId:integer("spool_id").notNull().references(()=>materialSpools.id),weightCheckId:integer("weight_check_id").notNull().references(()=>spoolWeightChecks.id),bookNetGrams:real("book_net_grams").notNull(),measuredNetGrams:real("measured_net_grams").notNull(),varianceGrams:real("variance_grams").notNull(),status:text("status").notNull().default("open"),reason:text("reason"),resolutionNote:text("resolution_note").notNull().default(""),adjustmentMovementId:integer("adjustment_movement_id").references(()=>materialSpoolMovements.id),createdBy:text("created_by").notNull(),resolvedBy:text("resolved_by"),resolvedAt:text("resolved_at"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const customers=sqliteTable("customers",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),customerNo:text("customer_no").notNull(),name:text("name").notNull(),status:text("status").notNull().default("active"),taxId:text("tax_id").notNull().default(""),billingAddress:text("billing_address").notNull().default(""),notes:text("notes").notNull().default(""),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const customerContacts=sqliteTable("customer_contacts",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),customerId:integer("customer_id").notNull().references(()=>customers.id,{onDelete:"cascade"}),name:text("name").notNull(),email:text("email").notNull().default(""),phone:text("phone").notNull().default(""),title:text("title").notNull().default(""),isPrimary:integer("is_primary",{mode:"boolean"}).notNull().default(false),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const quotes=sqliteTable("quotes",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),quoteNo:text("quote_no").notNull(),customerId:integer("customer_id").notNull().references(()=>customers.id),contactId:integer("contact_id").references(()=>customerContacts.id),status:text("status").notNull().default("draft"),currentVersion:integer("current_version").notNull().default(1),validUntil:text("valid_until").notNull(),currency:text("currency").notNull().default("MYR"),acceptedOrderId:integer("accepted_order_id").references(()=>orders.id),acceptedAt:text("accepted_at"),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const quoteVersions=sqliteTable("quote_versions",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),quoteId:integer("quote_id").notNull().references(()=>quotes.id,{onDelete:"cascade"}),versionNo:integer("version_no").notNull(),targetMarginBasisPoints:integer("target_margin_basis_points").notNull().default(3000),subtotalCents:integer("subtotal_cents").notNull().default(0),costCents:integer("cost_cents").notNull().default(0),notes:text("notes").notNull().default(""),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const quoteItems=sqliteTable("quote_items",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),quoteVersionId:integer("quote_version_id").notNull().references(()=>quoteVersions.id,{onDelete:"cascade"}),itemId:integer("item_id").notNull().references(()=>printItems.id),description:text("description").notNull().default(""),quantity:integer("quantity").notNull(),unitCostCents:integer("unit_cost_cents").notNull(),suggestedUnitPriceCents:integer("suggested_unit_price_cents").notNull(),unitPriceCents:integer("unit_price_cents").notNull(),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const quoteOrderConversions=sqliteTable("quote_order_conversions",{quoteId:integer("quote_id").primaryKey().references(()=>quotes.id,{onDelete:"cascade"}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),claimToken:text("claim_token").notNull().unique(),orderId:integer("order_id").references(()=>orders.id),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const customerCases=sqliteTable("customer_cases",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),caseNo:text("case_no").notNull(),customerId:integer("customer_id").notNull().references(()=>customers.id),orderId:integer("order_id").references(()=>orders.id),shipmentId:integer("shipment_id"),itemId:integer("item_id").references(()=>printItems.id),status:text("status").notNull().default("opened"),priority:text("priority").notNull().default("normal"),subject:text("subject").notNull(),description:text("description").notNull().default(""),responsibility:text("responsibility").notNull().default(""),rootCause:text("root_cause").notNull().default(""),disposition:text("disposition").notNull().default(""),refundCents:integer("refund_cents").notNull().default(0),slaDueAt:text("sla_due_at").notNull(),resolvedAt:text("resolved_at"),closedAt:text("closed_at"),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const caseEvents=sqliteTable("case_events",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),caseId:integer("case_id").notNull().references(()=>customerCases.id,{onDelete:"cascade"}),eventType:text("event_type").notNull(),fromStatus:text("from_status").notNull().default(""),toStatus:text("to_status").notNull().default(""),note:text("note").notNull().default(""),detail:text("detail").notNull().default("{}"),actorEmail:text("actor_email").notNull(),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const reworkOrders=sqliteTable("rework_orders",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),caseId:integer("case_id").notNull().references(()=>customerCases.id),orderId:integer("order_id").references(()=>orders.id),itemId:integer("item_id").notNull().references(()=>printItems.id),quantity:integer("quantity").notNull(),reason:text("reason").notNull(),idempotencyKey:text("idempotency_key").notNull(),claimToken:text("claim_token").notNull(),jobId:integer("job_id").references(()=>printJobs.id),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const invoices=sqliteTable("invoices",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),invoiceNo:text("invoice_no").notNull(),orderId:integer("order_id").notNull().references(()=>orders.id),customerName:text("customer_name").notNull(),currency:text("currency").notNull().default("MYR"),amountCents:integer("amount_cents").notNull(),paidCents:integer("paid_cents").notNull().default(0),status:text("status").notNull().default("draft"),issuedAt:text("issued_at"),dueDate:text("due_date").notNull(),voidedAt:text("voided_at"),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const invoicePayments=sqliteTable("invoice_payments",{id:integer("id").primaryKey({autoIncrement:true}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),invoiceId:integer("invoice_id").notNull().references(()=>invoices.id),paymentReference:text("payment_reference").notNull(),amountCents:integer("amount_cents").notNull(),method:text("method").notNull().default("bank_transfer"),paidAt:text("paid_at").notNull(),note:text("note").notNull().default(""),recordedBy:text("recorded_by").notNull(),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)});
export const receivableAlertSignals=sqliteTable("receivable_alert_signals",{invoiceId:integer("invoice_id").primaryKey().references(()=>invoices.id,{onDelete:"cascade"}),organizationId:integer("organization_id").notNull().references(()=>organizations.id,{onDelete:"cascade"}),signalActive:integer("signal_active",{mode:"boolean"}).notNull().default(true),firstDetectedAt:text("first_detected_at").notNull(),lastDetectedAt:text("last_detected_at").notNull(),clearedAt:text("cleared_at")});
