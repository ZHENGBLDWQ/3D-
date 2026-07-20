import { desc, eq } from "drizzle-orm";
import { getD1, getDb } from "../../../db";
import { materialBatches, orders, printItems, printJobs } from "../../../db/schema";

type Entity = "item" | "material" | "order" | "job";

async function seedIfEmpty() {
  const db = getDb();
  const existing = await db.select({ id: printItems.id }).from(printItems).limit(1);
  if (existing.length) return;

  const insertedItems = await db.insert(printItems).values([
    { sku: "ITEM-001", name: "机械臂夹爪 v3", category: "机器人零件", estimatedGrams: 86, estimatedMinutes: 220 },
    { sku: "ITEM-002", name: "无人机云台外壳", category: "无人机零件", estimatedGrams: 64, estimatedMinutes: 190 },
    { sku: "ITEM-003", name: "齿轮箱端盖", category: "机械零件", estimatedGrams: 42, estimatedMinutes: 95 },
  ]).returning();
  const insertedOrders = await db.insert(orders).values([
    { orderNo: "ORD-0268", customer: "星河机器人", status: "生产中", dueAt: "2026-07-20 18:00" },
    { orderNo: "ORD-0269", customer: "林工实验室", status: "待打印", dueAt: "2026-07-21" },
    { orderNo: "ORD-0270", customer: "创客空间", status: "待确认", dueAt: "2026-07-23" },
  ]).returning();
  await db.insert(materialBatches).values([
    { material: "PLA", color: "岩石灰", brand: "Bambu Lab", initialGrams: 1000, remainingGrams: 742, lowStockGrams: 200 },
    { material: "PETG", color: "碳黑", brand: "eSUN", initialGrams: 1000, remainingGrams: 186, lowStockGrams: 200 },
    { material: "ABS", color: "深蓝", brand: "Polymaker", initialGrams: 1000, remainingGrams: 524, lowStockGrams: 200 },
    { material: "TPU", color: "橙色", brand: "Overture", initialGrams: 500, remainingGrams: 94, lowStockGrams: 120 },
  ]);
  await db.insert(printJobs).values([
    { jobNo: "JOB-042", itemId: insertedItems[0].id, orderId: insertedOrders[0].id, printerName: "Voron 2.4", status: "打印中", progress: 68 },
    { jobNo: "JOB-043", itemId: insertedItems[1].id, orderId: insertedOrders[1].id, printerName: "Bambu X1C", status: "打印中", progress: 12 },
    { jobNo: "JOB-044", itemId: insertedItems[2].id, orderId: insertedOrders[2].id, printerName: "Prusa MK4", status: "排队", progress: 0 },
  ]);
}

export async function GET() {
  try {
    await seedIfEmpty();
    const db = getDb();
    const [items, materials, orderRows, jobs] = await Promise.all([
      db.select().from(printItems).orderBy(desc(printItems.createdAt)),
      db.select().from(materialBatches).orderBy(desc(materialBatches.createdAt)),
      db.select().from(orders).orderBy(desc(orders.createdAt)),
      db.select({
        id: printJobs.id,
        jobNo: printJobs.jobNo,
        itemId: printJobs.itemId,
        itemName: printItems.name,
        orderId: printJobs.orderId,
        printerName: printJobs.printerName,
        status: printJobs.status,
        progress: printJobs.progress,
        quantity: printJobs.quantity,
        priority: printJobs.priority,
        materialDeducted: printJobs.materialDeducted,
        startedAt: printJobs.startedAt,
        completedAt: printJobs.completedAt,
        createdAt: printJobs.createdAt,
      }).from(printJobs).leftJoin(printItems, eq(printJobs.itemId, printItems.id)).orderBy(desc(printJobs.createdAt)),
    ]);
    return Response.json({ items, materials, orders: orderRows, jobs });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取数据失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown> & { entity?: Entity };
    const db = getDb();
    if (payload.entity === "item") {
      if (!payload.name || !payload.sku) return Response.json({ error: "物品名称和 SKU 必填" }, { status: 400 });
      const [row] = await db.insert(printItems).values({ sku: String(payload.sku), name: String(payload.name), category: String(payload.category || "未分类"), estimatedGrams: Number(payload.estimatedGrams || 0), estimatedMinutes: Number(payload.estimatedMinutes || 0) }).returning();
      return Response.json({ row }, { status: 201 });
    }
    if (payload.entity === "material") {
      if (!payload.material || !payload.color) return Response.json({ error: "材料类型和颜色必填" }, { status: 400 });
      const initial = Number(payload.initialGrams || 1000);
      const [row] = await db.insert(materialBatches).values({ material: String(payload.material), color: String(payload.color), brand: String(payload.brand || ""), initialGrams: initial, remainingGrams: Number(payload.remainingGrams ?? initial), lowStockGrams: Number(payload.lowStockGrams || 200) }).returning();
      return Response.json({ row }, { status: 201 });
    }
    if (payload.entity === "order") {
      if (!payload.orderNo || !payload.customer) return Response.json({ error: "订单编号和客户必填" }, { status: 400 });
      const [row] = await db.insert(orders).values({ orderNo: String(payload.orderNo), customer: String(payload.customer), status: String(payload.status || "待确认"), dueAt: payload.dueAt ? String(payload.dueAt) : null }).returning();
      return Response.json({ row }, { status: 201 });
    }
    if (payload.entity === "job") {
      if (!payload.jobNo || !payload.printerName) return Response.json({ error: "任务编号和打印机必填" }, { status: 400 });
      const [row] = await db.insert(printJobs).values({ jobNo: String(payload.jobNo), itemId: payload.itemId ? Number(payload.itemId) : null, orderId: payload.orderId ? Number(payload.orderId) : null, printerName: String(payload.printerName), status: String(payload.status || "排队"), progress: Number(payload.progress || 0), quantity:Number(payload.quantity||1), priority:Number(payload.priority||3) }).returning();
      return Response.json({ row }, { status: 201 });
    }
    return Response.json({ error: "不支持的数据类型" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    return Response.json({ error: message.includes("UNIQUE") ? "编号已存在，请换一个编号" : message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as { entity?: Entity; id?: number; status?: string; progress?: number; action?:string; note?:string };
    if (!payload.id || !payload.entity) return Response.json({ error: "缺少记录标识" }, { status: 400 });
    const db = getDb();
    if (payload.entity === "job" && payload.action) {
      const d1=getD1();
      const job=await d1.prepare("SELECT id, item_id, order_id, status, progress, quantity, material_deducted FROM print_jobs WHERE id = ?").bind(payload.id).first<{id:number;item_id:number|null;order_id:number|null;status:string;progress:number;quantity:number;material_deducted:number}>();
      if(!job) return Response.json({error:"打印任务不存在"},{status:404});
      const transitions:Record<string,Record<string,string>>={
        "排队":{start:"打印中",cancel:"已取消"},
        "打印中":{pause:"已暂停",complete:"已完成",fail:"失败",cancel:"已取消"},
        "已暂停":{resume:"打印中",complete:"已完成",fail:"失败",cancel:"已取消"},
        "失败":{retry:"排队"},
        "已取消":{retry:"排队"},
      };
      const next=transitions[job.status]?.[payload.action];
      if(!next) return Response.json({error:`任务处于“${job.status}”，不能执行该操作`},{status:400});
      const statements:D1PreparedStatement[]=[];
      let progress=job.progress;
      let startedSql:string|null=null,completedSql:string|null=null;
      if(payload.action==="start"){progress=Math.max(1,progress);startedSql="CURRENT_TIMESTAMP";}
      if(payload.action==="complete"){
        progress=100;completedSql="CURRENT_TIMESTAMP";
        if(!job.material_deducted && job.item_id){
          const specs=await d1.prepare("SELECT im.batch_id, im.grams_per_item, im.waste_percent, mb.remaining_grams, mb.material, mb.color FROM item_materials im JOIN material_batches mb ON mb.id = im.batch_id WHERE im.item_id = ?").bind(job.item_id).all<{batch_id:number;grams_per_item:number;waste_percent:number;remaining_grams:number;material:string;color:string}>();
          for(const spec of specs.results){const required=Number((spec.grams_per_item*job.quantity*(1+spec.waste_percent/100)).toFixed(2));if(spec.remaining_grams<required)return Response.json({error:`${spec.material} ${spec.color} 库存不足：需要 ${required}g，当前 ${spec.remaining_grams}g`},{status:400});}
          for(const spec of specs.results){const required=Number((spec.grams_per_item*job.quantity*(1+spec.waste_percent/100)).toFixed(2));statements.push(d1.prepare("UPDATE material_batches SET remaining_grams = remaining_grams - ? WHERE id = ?").bind(required,spec.batch_id));statements.push(d1.prepare("INSERT INTO inventory_transactions (batch_id, job_id, type, grams, note) VALUES (?, ?, '打印消耗', ?, ?)").bind(spec.batch_id,job.id,-required,`任务完成自动扣料`));}
        }
      }
      if(payload.action==="retry") progress=0;
      const setStarted=startedSql?", started_at = CURRENT_TIMESTAMP":"";const setCompleted=completedSql?", completed_at = CURRENT_TIMESTAMP, material_deducted = 1":"";
      statements.push(d1.prepare(`UPDATE print_jobs SET status = ?, progress = ?${setStarted}${setCompleted} WHERE id = ?`).bind(next,progress,job.id));
      statements.push(d1.prepare("INSERT INTO print_job_events (job_id, action, from_status, to_status, note) VALUES (?, ?, ?, ?, ?)").bind(job.id,payload.action,job.status,next,String(payload.note||"")));
      if(next==="已完成"&&job.order_id) statements.push(d1.prepare("UPDATE orders SET status = '已完成' WHERE id = ?").bind(job.order_id));
      await d1.batch(statements);
      return Response.json({ok:true,status:next,progress});
    }
    if (payload.entity === "job") {
      const [row] = await db.update(printJobs).set({ status: payload.status, progress: payload.progress }).where(eq(printJobs.id, payload.id)).returning();
      return Response.json({ row });
    }
    if (payload.entity === "order") {
      const [row] = await db.update(orders).set({ status: payload.status }).where(eq(orders.id, payload.id)).returning();
      return Response.json({ row });
    }
    return Response.json({ error: "该类型暂不支持状态更新" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "更新失败" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const entity = url.searchParams.get("entity") as Entity | null;
    const id = Number(url.searchParams.get("id"));
    if (!entity || !id) return Response.json({ error: "缺少记录标识" }, { status: 400 });
    const db = getDb();
    if (entity === "item") await db.delete(printItems).where(eq(printItems.id, id));
    else if (entity === "material") await db.delete(materialBatches).where(eq(materialBatches.id, id));
    else if (entity === "order") await db.delete(orders).where(eq(orders.id, id));
    else if (entity === "job") await db.delete(printJobs).where(eq(printJobs.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "删除失败" }, { status: 500 });
  }
}
