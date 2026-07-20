import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const printItems = sqliteTable("print_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull().default("未分类"),
  estimatedGrams: real("estimated_grams").notNull().default(0),
  estimatedMinutes: integer("estimated_minutes").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const materialBatches = sqliteTable("material_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  material: text("material").notNull(),
  color: text("color").notNull(),
  brand: text("brand").notNull().default(""),
  initialGrams: real("initial_grams").notNull(),
  remainingGrams: real("remaining_grams").notNull(),
  lowStockGrams: real("low_stock_grams").notNull().default(200),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderNo: text("order_no").notNull().unique(),
  customer: text("customer").notNull(),
  status: text("status").notNull().default("待确认"),
  dueAt: text("due_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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
  materialDeducted: integer("material_deducted", { mode: "boolean" }).notNull().default(false),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const inventoryTransactions = sqliteTable("inventory_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  batchId: integer("batch_id").notNull().references(() => materialBatches.id),
  jobId: integer("job_id").references(() => printJobs.id),
  type: text("type").notNull(),
  grams: real("grams").notNull(),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull().references(() => orders.id),
  itemId: integer("item_id").notNull().references(() => printItems.id),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: real("unit_price").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const itemMaterials = sqliteTable("item_materials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: integer("item_id").notNull().references(() => printItems.id),
  batchId: integer("batch_id").notNull().references(() => materialBatches.id),
  gramsPerItem: real("grams_per_item").notNull(),
  wastePercent: real("waste_percent").notNull().default(5),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const printJobEvents = sqliteTable("print_job_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").notNull().references(() => printJobs.id),
  action: text("action").notNull(),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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
  maintenanceDueAt: text("maintenance_due_at"),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
