import { getD1 } from "../../../db";
import { requireApiAccess } from "../../api-auth";

type InventoryAction =
  | "createMaterial"
  | "movement"
  | "stocktake"
  | "updateMaterial";

async function ensureInventorySchema() {
  const d1 = getD1();
  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS material_inventory_meta (
      batch_id INTEGER PRIMARY KEY,
      sku TEXT NOT NULL UNIQUE,
      specification TEXT NOT NULL DEFAULT '',
      spool_weight_grams REAL NOT NULL DEFAULT 1000,
      spool_count REAL NOT NULL DEFAULT 1,
      supplier TEXT NOT NULL DEFAULT '',
      warehouse TEXT NOT NULL DEFAULT '主仓',
      location TEXT NOT NULL DEFAULT '',
      lot_no TEXT NOT NULL DEFAULT '',
      received_at TEXT,
      expiry_at TEXT,
      status TEXT NOT NULL DEFAULT '在库',
      notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (batch_id) REFERENCES material_batches(id)
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS inventory_transaction_meta (
      transaction_id INTEGER PRIMARY KEY,
      document_no TEXT NOT NULL DEFAULT '',
      operator TEXT NOT NULL DEFAULT '',
      warehouse TEXT NOT NULL DEFAULT '主仓',
      source TEXT NOT NULL DEFAULT '人工',
      FOREIGN KEY (transaction_id) REFERENCES inventory_transactions(id)
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS inventory_stocktakes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL,
      book_grams REAL NOT NULL,
      counted_grams REAL NOT NULL,
      variance_grams REAL NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      operator TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (batch_id) REFERENCES material_batches(id)
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS inventory_transactions_batch_created_idx ON inventory_transactions(batch_id,created_at DESC)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS inventory_stocktakes_batch_created_idx ON inventory_stocktakes(batch_id,created_at DESC)"),
  ]);
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function positive(value: unknown, fallback = 0) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export async function GET() {
  const denied = await requireApiAccess();
  if (denied) return denied;
  try {
    await ensureInventorySchema();
    const d1 = getD1();
    const [materials, transactions, stocktakes, summary] = await Promise.all([
      d1.prepare(`SELECT
        b.id,b.material,b.color,b.brand,b.initial_grams initialGrams,
        b.remaining_grams remainingGrams,b.low_stock_grams lowStockGrams,
        b.cost_per_kg costPerKg,b.created_at createdAt,
        COALESCE(m.sku,'MAT-'||printf('%04d',b.id)) sku,
        COALESCE(m.specification,'') specification,
        COALESCE(m.spool_weight_grams,b.initial_grams,1000) spoolWeightGrams,
        COALESCE(m.spool_count,CASE WHEN b.initial_grams>0 THEN b.initial_grams/1000.0 ELSE 0 END) spoolCount,
        COALESCE(m.supplier,'') supplier,COALESCE(m.warehouse,'主仓') warehouse,
        COALESCE(m.location,'') location,COALESCE(m.lot_no,'') lotNo,
        m.received_at receivedAt,m.expiry_at expiryAt,
        COALESCE(m.status,'在库') status,COALESCE(m.notes,'') notes,
        COALESCE((SELECT SUM(im.grams_per_item*j.quantity*(1+im.waste_percent/100.0)) FROM print_jobs j JOIN item_materials im ON im.item_id=j.item_id WHERE im.batch_id=b.id AND j.status IN ('排队','打印中','已暂停') AND j.material_deducted=0),0)
        + COALESCE((SELECT SUM(e.estimated_grams) FROM external_print_jobs e WHERE e.batch_id=b.id AND e.completed_at IS NULL AND e.inventory_deducted=0),0) reservedGrams
      FROM material_batches b LEFT JOIN material_inventory_meta m ON m.batch_id=b.id
      ORDER BY CASE WHEN b.remaining_grams<=b.low_stock_grams THEN 0 ELSE 1 END,b.created_at DESC`).all(),
      d1.prepare(`SELECT t.id,t.batch_id batchId,b.material,b.color,t.type,t.grams,t.note,t.created_at createdAt,
        COALESCE(m.document_no,'') documentNo,COALESCE(m.operator,'') operator,
        COALESCE(m.warehouse,'主仓') warehouse,COALESCE(m.source,'人工') source
      FROM inventory_transactions t JOIN material_batches b ON b.id=t.batch_id
      LEFT JOIN inventory_transaction_meta m ON m.transaction_id=t.id
      ORDER BY t.id DESC LIMIT 300`).all(),
      d1.prepare(`SELECT s.id,s.batch_id batchId,b.material,b.color,s.book_grams bookGrams,
        s.counted_grams countedGrams,s.variance_grams varianceGrams,s.reason,s.operator,s.created_at createdAt
      FROM inventory_stocktakes s JOIN material_batches b ON b.id=s.batch_id
      ORDER BY s.id DESC LIMIT 100`).all(),
      d1.prepare(`SELECT COUNT(*) skuCount,COALESCE(SUM(remaining_grams),0) totalGrams,
        COALESCE(SUM(remaining_grams*cost_per_kg/1000.0),0) stockValue,
        COALESCE(SUM(CASE WHEN remaining_grams<=low_stock_grams THEN 1 ELSE 0 END),0) lowStockCount,
        COALESCE((SELECT SUM(ABS(grams)) FROM inventory_transactions WHERE type IN ('打印消耗','生产领用') AND datetime(created_at)>=datetime('now','start of month')),0) monthlyUsageGrams,
        COALESCE((SELECT SUM(ABS(grams)) FROM inventory_transactions WHERE type IN ('损耗','盘亏') AND datetime(created_at)>=datetime('now','start of month')),0) monthlyWasteGrams
      FROM material_batches`).first(),
    ]);
    return Response.json({ materials: materials.results, transactions: transactions.results, stocktakes: stocktakes.results, summary });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取库存失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await requireApiAccess(true);
  if (denied) return denied;
  try {
    await ensureInventorySchema();
    const body = (await request.json()) as Record<string, unknown> & { action?: InventoryAction };
    const d1 = getD1();
    if (body.action === "createMaterial") {
      const material = text(body.material), color = text(body.color), sku = text(body.sku);
      const spoolWeight = positive(body.spoolWeightGrams, 1000), spoolCount = positive(body.spoolCount, 1);
      const totalGrams = Number((spoolWeight * spoolCount).toFixed(2));
      if (!material || !color || !sku) return Response.json({ error: "物料编码、材料和颜色必填" }, { status: 400 });
      const result = await d1.prepare(`INSERT INTO material_batches(material,color,brand,initial_grams,remaining_grams,low_stock_grams,cost_per_kg)
        VALUES(?,?,?,?,?,?,?)`).bind(material,color,text(body.brand),totalGrams,totalGrams,positive(body.lowStockGrams,spoolWeight),Math.max(0,Number(body.costPerKg||0))).run();
      const batchId = Number(result.meta.last_row_id);
      const receiptNo = text(body.documentNo) || `OPEN-${Date.now()}`;
      const tx = await d1.prepare("INSERT INTO inventory_transactions(batch_id,type,grams,note) VALUES(?,'期初入库',?,?)")
        .bind(batchId,totalGrams,text(body.notes)).run();
      await d1.batch([
        d1.prepare(`INSERT INTO material_inventory_meta(batch_id,sku,specification,spool_weight_grams,spool_count,supplier,warehouse,location,lot_no,received_at,expiry_at,status,notes)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(batchId,sku,text(body.specification),spoolWeight,spoolCount,text(body.supplier),text(body.warehouse)||"主仓",text(body.location),text(body.lotNo),text(body.receivedAt)||null,text(body.expiryAt)||null,"在库",text(body.notes)),
        d1.prepare("INSERT INTO inventory_transaction_meta(transaction_id,document_no,operator,warehouse,source) VALUES(?,?,?,?,?)")
          .bind(Number(tx.meta.last_row_id),receiptNo,text(body.operator),text(body.warehouse)||"主仓","期初建账"),
      ]);
      return Response.json({ ok: true, batchId }, { status: 201 });
    }
    if (body.action === "movement") {
      const batchId = Number(body.batchId), movementType = text(body.type), grams = positive(body.grams);
      const inbound = ["采购入库","退料","盘盈"].includes(movementType);
      const outbound = ["生产领用","打印消耗","损耗","报废","盘亏"].includes(movementType);
      if (!batchId || !grams || (!inbound && !outbound)) return Response.json({ error: "耗材、有效克重和正规出入库类型必填" }, { status: 400 });
      const batch = await d1.prepare("SELECT remaining_grams remainingGrams FROM material_batches WHERE id=?").bind(batchId).first<{remainingGrams:number}>();
      if (!batch) return Response.json({ error: "耗材批次不存在" }, { status: 404 });
      const delta = inbound ? grams : -grams;
      if (Number(batch.remainingGrams) + delta < 0) return Response.json({ error: `库存不足，账面仅剩 ${Number(batch.remainingGrams).toFixed(1)}g` }, { status: 400 });
      const tx = await d1.prepare("INSERT INTO inventory_transactions(batch_id,type,grams,note) VALUES(?,?,?,?)").bind(batchId,movementType,delta,text(body.note)).run();
      await d1.batch([
        d1.prepare("UPDATE material_batches SET remaining_grams=remaining_grams+? WHERE id=?").bind(delta,batchId),
        d1.prepare("INSERT INTO inventory_transaction_meta(transaction_id,document_no,operator,warehouse,source) VALUES(?,?,?,?,?)")
          .bind(Number(tx.meta.last_row_id),text(body.documentNo),text(body.operator),text(body.warehouse)||"主仓",text(body.source)||"人工"),
      ]);
      return Response.json({ ok: true }, { status: 201 });
    }
    if (body.action === "stocktake") {
      const batchId = Number(body.batchId), counted = Math.max(0, Number(body.countedGrams));
      if (!batchId || !Number.isFinite(counted)) return Response.json({ error: "耗材和实盘克重必填" }, { status: 400 });
      const batch = await d1.prepare("SELECT remaining_grams remainingGrams FROM material_batches WHERE id=?").bind(batchId).first<{remainingGrams:number}>();
      if (!batch) return Response.json({ error: "耗材批次不存在" }, { status: 404 });
      const book = Number(batch.remainingGrams), variance = Number((counted-book).toFixed(2));
      const statements = [
        d1.prepare("INSERT INTO inventory_stocktakes(batch_id,book_grams,counted_grams,variance_grams,reason,operator) VALUES(?,?,?,?,?,?)").bind(batchId,book,counted,variance,text(body.reason),text(body.operator)),
        d1.prepare("UPDATE material_batches SET remaining_grams=? WHERE id=?").bind(counted,batchId),
      ];
      if (variance !== 0) statements.push(d1.prepare("INSERT INTO inventory_transactions(batch_id,type,grams,note) VALUES(?,?,?,?)").bind(batchId,variance>0?"盘盈":"盘亏",variance,`盘点调整：${text(body.reason)}`));
      await d1.batch(statements);
      return Response.json({ ok: true, variance }, { status: 201 });
    }
    if (body.action === "updateMaterial") {
      const batchId = Number(body.batchId);
      if (!batchId) return Response.json({ error: "缺少耗材标识" }, { status: 400 });
      await d1.batch([
        d1.prepare("UPDATE material_batches SET low_stock_grams=?,cost_per_kg=? WHERE id=?").bind(Math.max(0,Number(body.lowStockGrams||0)),Math.max(0,Number(body.costPerKg||0)),batchId),
        d1.prepare(`INSERT INTO material_inventory_meta(batch_id,sku,specification,spool_weight_grams,spool_count,supplier,warehouse,location,lot_no,status,notes,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
          ON CONFLICT(batch_id) DO UPDATE SET sku=excluded.sku,specification=excluded.specification,spool_weight_grams=excluded.spool_weight_grams,spool_count=excluded.spool_count,supplier=excluded.supplier,warehouse=excluded.warehouse,location=excluded.location,lot_no=excluded.lot_no,status=excluded.status,notes=excluded.notes,updated_at=CURRENT_TIMESTAMP`)
          .bind(batchId,text(body.sku),text(body.specification),positive(body.spoolWeightGrams,1000),positive(body.spoolCount,1),text(body.supplier),text(body.warehouse)||"主仓",text(body.location),text(body.lotNo),text(body.status)||"在库",text(body.notes)),
      ]);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "不支持的库存操作" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "库存操作失败";
    return Response.json({ error: message.includes("UNIQUE") ? "物料编码已存在" : message }, { status: 500 });
  }
}
