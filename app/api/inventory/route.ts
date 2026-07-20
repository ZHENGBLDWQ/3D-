import { getD1 } from "../../../db";
import { requireApiAccess } from "../../api-auth";

type InventoryAction =
  | "createMaterial"
  | "movement"
  | "stocktake"
  | "updateMaterial"
  | "transferToPrinter"
  | "returnFromPrinter"
  | "createTransit"
  | "receiveTransit";

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
    d1.prepare(`CREATE TABLE IF NOT EXISTS inventory_printer_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      printer_id INTEGER NOT NULL,
      batch_id INTEGER NOT NULL,
      ams_unit INTEGER,
      tray_index INTEGER,
      allocated_grams REAL NOT NULL,
      remaining_grams REAL NOT NULL,
      status TEXT NOT NULL DEFAULT '使用中',
      operator TEXT NOT NULL DEFAULT '',
      assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (printer_id) REFERENCES printers(id),
      FOREIGN KEY (batch_id) REFERENCES material_batches(id)
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS inventory_in_transit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL,
      grams REAL NOT NULL,
      supplier TEXT NOT NULL DEFAULT '',
      purchase_no TEXT NOT NULL DEFAULT '',
      eta TEXT,
      status TEXT NOT NULL DEFAULT '在途',
      operator TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      received_at TEXT,
      FOREIGN KEY (batch_id) REFERENCES material_batches(id)
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS inventory_transactions_batch_created_idx ON inventory_transactions(batch_id,created_at DESC)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS inventory_stocktakes_batch_created_idx ON inventory_stocktakes(batch_id,created_at DESC)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS inventory_allocations_printer_idx ON inventory_printer_allocations(printer_id,status)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS inventory_allocations_batch_idx ON inventory_printer_allocations(batch_id,status)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS inventory_transit_batch_idx ON inventory_in_transit(batch_id,status)"),
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
    const [materials, transactions, stocktakes, summary, products, printers, transit] = await Promise.all([
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
      d1.prepare(`SELECT b.id,b.material,b.color,b.brand,b.remaining_grams remainingGrams,b.low_stock_grams lowStockGrams,b.cost_per_kg costPerKg,
        COALESCE(m.sku,'MAT-'||printf('%04d',b.id)) sku,COALESCE(m.specification,'') specification,
        COALESCE(m.spool_weight_grams,1000) spoolWeightGrams,COALESCE(m.supplier,'') supplier,
        COALESCE(m.warehouse,'主仓') warehouse,COALESCE(m.location,'') location,
        COALESCE((SELECT SUM(a.remaining_grams) FROM inventory_printer_allocations a WHERE a.batch_id=b.id AND a.status='使用中'),0) printerOccupiedGrams,
        COALESCE((SELECT SUM(im.grams_per_item*j.quantity*(1+im.waste_percent/100.0)) FROM print_jobs j JOIN item_materials im ON im.item_id=j.item_id WHERE im.batch_id=b.id AND j.status IN ('排队','打印中','已暂停') AND j.material_deducted=0),0)
          + COALESCE((SELECT SUM(e.estimated_grams) FROM external_print_jobs e WHERE e.batch_id=b.id AND e.completed_at IS NULL AND e.inventory_deducted=0),0) taskOccupiedGrams,
        COALESCE((SELECT SUM(t.grams) FROM inventory_in_transit t WHERE t.batch_id=b.id AND t.status='在途'),0) inTransitGrams,
        COALESCE((SELECT SUM(ABS(t.grams)) FROM inventory_transactions t WHERE t.batch_id=b.id AND t.grams<0 AND t.type IN ('打印消耗','生产领用') AND datetime(t.created_at)>=datetime('now','-3 days')),0) usage3Days,
        COALESCE((SELECT SUM(ABS(t.grams)) FROM inventory_transactions t WHERE t.batch_id=b.id AND t.grams<0 AND t.type IN ('打印消耗','生产领用') AND datetime(t.created_at)>=datetime('now','-15 days')),0) usage15Days,
        COALESCE((SELECT SUM(ABS(t.grams)) FROM inventory_transactions t WHERE t.batch_id=b.id AND t.grams<0 AND t.type IN ('打印消耗','生产领用') AND datetime(t.created_at)>=datetime('now','-30 days')),0) usage30Days
      FROM material_batches b LEFT JOIN material_inventory_meta m ON m.batch_id=b.id ORDER BY b.material,b.color`).all(),
      d1.prepare(`SELECT p.id,p.name,p.model,p.location,p.status,p.connection_state connectionState,p.current_file currentFile,p.remote_progress remoteProgress,
        p.nozzle_temp nozzleTemp,p.bed_temp bedTemp,p.last_seen_at lastSeenAt,
        COALESCE((SELECT json_group_array(json_object('id',a.id,'batchId',a.batch_id,'sku',COALESCE(m.sku,'MAT-'||printf('%04d',b.id)),'material',b.material,'color',b.color,'brand',b.brand,'amsUnit',a.ams_unit,'trayIndex',a.tray_index,'allocatedGrams',a.allocated_grams,'remainingGrams',a.remaining_grams,'assignedAt',a.assigned_at)) FROM inventory_printer_allocations a JOIN material_batches b ON b.id=a.batch_id LEFT JOIN material_inventory_meta m ON m.batch_id=b.id WHERE a.printer_id=p.id AND a.status='使用中'),'[]') allocations,
        COALESCE((SELECT json_group_array(json_object('amsUnit',s.ams_unit,'trayIndex',s.tray_index,'material',s.material,'colorHex',s.color_hex,'remainingPercent',s.remaining_percent,'active',s.active,'lastSeenAt',s.last_seen_at)) FROM bambu_ams_slots s WHERE s.printer_id=p.id),'[]') amsSlots
      FROM printers p ORDER BY p.name`).all(),
      d1.prepare(`SELECT t.id,t.batch_id batchId,COALESCE(m.sku,'MAT-'||printf('%04d',b.id)) sku,b.material,b.color,t.grams,t.supplier,t.purchase_no purchaseNo,t.eta,t.status,t.operator,t.created_at createdAt
      FROM inventory_in_transit t JOIN material_batches b ON b.id=t.batch_id LEFT JOIN material_inventory_meta m ON m.batch_id=b.id ORDER BY CASE WHEN t.status='在途' THEN 0 ELSE 1 END,t.id DESC`).all(),
    ]);
    const productRows = products.results.map((row) => {
      const item = row as Record<string, unknown>;
      const occupiedGrams = Number(item.printerOccupiedGrams || 0) + Number(item.taskOccupiedGrams || 0);
      return { ...item, occupiedGrams, availableGrams: Math.max(0, Number(item.remainingGrams || 0) - occupiedGrams) };
    });
    const printerRows = printers.results.map((row) => {
      const item = row as Record<string, unknown>;
      const parse = (value: unknown) => { try { return JSON.parse(String(value || "[]")); } catch { return []; } };
      return { ...item, allocations: parse(item.allocations), amsSlots: parse(item.amsSlots) };
    });
    return Response.json({ materials: materials.results, products: productRows, printers: printerRows, transit: transit.results, transactions: transactions.results, stocktakes: stocktakes.results, summary });
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
    if (body.action === "transferToPrinter") {
      const batchId = Number(body.batchId), printerId = Number(body.printerId), grams = positive(body.grams);
      if (!batchId || !printerId || !grams) return Response.json({ error: "耗材、打印机和出库克重必填" }, { status: 400 });
      const batch = await d1.prepare(`SELECT b.remaining_grams remainingGrams,
        COALESCE((SELECT SUM(a.remaining_grams) FROM inventory_printer_allocations a WHERE a.batch_id=b.id AND a.status='使用中'),0) occupiedGrams
        FROM material_batches b WHERE b.id=?`).bind(batchId).first<{remainingGrams:number;occupiedGrams:number}>();
      const printer = await d1.prepare("SELECT name FROM printers WHERE id=?").bind(printerId).first<{name:string}>();
      if (!batch || !printer) return Response.json({ error: "耗材或打印机不存在" }, { status: 404 });
      const available = Number(batch.remainingGrams) - Number(batch.occupiedGrams || 0);
      if (grams > available) return Response.json({ error: `仓库可用量不足，仅剩 ${available.toFixed(1)}g` }, { status: 400 });
      const allocation = await d1.prepare(`INSERT INTO inventory_printer_allocations(printer_id,batch_id,ams_unit,tray_index,allocated_grams,remaining_grams,status,operator)
        VALUES(?,?,?,?,?,?,'使用中',?)`).bind(printerId,batchId,body.amsUnit === "" ? null : Number(body.amsUnit),body.trayIndex === "" ? null : Number(body.trayIndex),grams,grams,text(body.operator)).run();
      const tx = await d1.prepare("INSERT INTO inventory_transactions(batch_id,type,grams,note) VALUES(?,'调拨到打印机',0,?)")
        .bind(batchId,`${grams}g → ${printer.name}${body.amsUnit !== "" ? ` / AMS ${body.amsUnit}-${body.trayIndex}` : ""}`).run();
      await d1.prepare("INSERT INTO inventory_transaction_meta(transaction_id,document_no,operator,warehouse,source) VALUES(?,?,?,?,?)")
        .bind(Number(tx.meta.last_row_id),text(body.documentNo),text(body.operator),"打印机在用库","仓库调拨").run();
      return Response.json({ ok: true, allocationId: allocation.meta.last_row_id }, { status: 201 });
    }
    if (body.action === "returnFromPrinter") {
      const allocationId = Number(body.allocationId), grams = positive(body.grams);
      const allocation = await d1.prepare(`SELECT a.*,p.name printerName FROM inventory_printer_allocations a JOIN printers p ON p.id=a.printer_id WHERE a.id=? AND a.status='使用中'`).bind(allocationId).first<Record<string,unknown>>();
      if (!allocation || !grams || grams > Number(allocation.remaining_grams)) return Response.json({ error: "退回数量无效或超过在机余量" }, { status: 400 });
      const remaining = Number(allocation.remaining_grams) - grams;
      await d1.prepare("UPDATE inventory_printer_allocations SET remaining_grams=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(remaining,remaining <= 0 ? "已退回" : "使用中",allocationId).run();
      const tx = await d1.prepare("INSERT INTO inventory_transactions(batch_id,type,grams,note) VALUES(?,'打印机退回',0,?)").bind(Number(allocation.batch_id),`${allocation.printerName}退回 ${grams}g`).run();
      await d1.prepare("INSERT INTO inventory_transaction_meta(transaction_id,document_no,operator,warehouse,source) VALUES(?,?,?,?,?)").bind(Number(tx.meta.last_row_id),text(body.documentNo),text(body.operator),"主仓","打印机退料").run();
      return Response.json({ ok: true }, { status: 201 });
    }
    if (body.action === "createTransit") {
      const batchId = Number(body.batchId), grams = positive(body.grams);
      if (!batchId || !grams) return Response.json({ error: "耗材和采购在途数量必填" }, { status: 400 });
      const result = await d1.prepare("INSERT INTO inventory_in_transit(batch_id,grams,supplier,purchase_no,eta,status,operator) VALUES(?,?,?,?,?,'在途',?)")
        .bind(batchId,grams,text(body.supplier),text(body.purchaseNo),text(body.eta)||null,text(body.operator)).run();
      return Response.json({ ok: true, transitId: result.meta.last_row_id }, { status: 201 });
    }
    if (body.action === "receiveTransit") {
      const transitId = Number(body.transitId);
      const row = await d1.prepare("SELECT * FROM inventory_in_transit WHERE id=? AND status='在途'").bind(transitId).first<Record<string,unknown>>();
      if (!row) return Response.json({ error: "在途采购不存在或已经收货" }, { status: 404 });
      const tx = await d1.prepare("INSERT INTO inventory_transactions(batch_id,type,grams,note) VALUES(?,'采购入库',?,?)").bind(Number(row.batch_id),Number(row.grams),`在途收货 ${row.purchase_no || ""}`).run();
      await d1.batch([
        d1.prepare("UPDATE material_batches SET remaining_grams=remaining_grams+? WHERE id=?").bind(Number(row.grams),Number(row.batch_id)),
        d1.prepare("UPDATE inventory_in_transit SET status='已入库',received_at=CURRENT_TIMESTAMP WHERE id=?").bind(transitId),
        d1.prepare("INSERT INTO inventory_transaction_meta(transaction_id,document_no,operator,warehouse,source) VALUES(?,?,?,?,?)").bind(Number(tx.meta.last_row_id),String(row.purchase_no||""),text(body.operator)||String(row.operator||""),"主仓","采购收货"),
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
