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
  jobNo: text("job_no").notNull().unique(),
  itemId: integer("item_id").references(() => printItems.id),
  orderId: integer("order_id").references(() => orders.id),
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
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
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
  command: text("command").notNull(),
  payload: text("payload").notNull().default("{}"),
  status: text("status").notNull().default("待执行"),
  result: text("result").notNull().default(""),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
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
