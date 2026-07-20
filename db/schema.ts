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
