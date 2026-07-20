import { desc, eq } from "drizzle-orm";
import { getD1, getDb } from "../../../db";
import {
  materialBatches,
  orders,
  printItems,
  printJobs,
} from "../../../db/schema";
import { requireApiAccess } from "../../api-auth";

type Entity = "item" | "material" | "order" | "job";

async function seedIfEmpty() {
  const db = getDb();
  const existing = await db
    .select({ id: printItems.id })
    .from(printItems)
    .limit(1);
  if (existing.length) return;

  const insertedItems = await db
    .insert(printItems)
    .values([
      {
        sku: "ITEM-001",
        name: "机械臂夹爪 v3",
        category: "机器人零件",
        estimatedGrams: 86,
        estimatedMinutes: 220,
      },
      {
        sku: "ITEM-002",
        name: "无人机云台外壳",
        category: "无人机零件",
        estimatedGrams: 64,
        estimatedMinutes: 190,
      },
      {
        sku: "ITEM-003",
        name: "齿轮箱端盖",
        category: "机械零件",
        estimatedGrams: 42,
        estimatedMinutes: 95,
      },
    ])
    .returning();
  const insertedOrders = await db
    .insert(orders)
    .values([
      {
        orderNo: "ORD-0268",
        customer: "星河机器人",
        status: "生产中",
        dueAt: "2026-07-20 18:00",
      },
      {
        orderNo: "ORD-0269",
        customer: "林工实验室",
        status: "待打印",
        dueAt: "2026-07-21",
      },
      {
        orderNo: "ORD-0270",
        customer: "创客空间",
        status: "待确认",
        dueAt: "2026-07-23",
      },
    ])
    .returning();
  await db.insert(materialBatches).values([
    {
      material: "PLA",
      color: "岩石灰",
      brand: "Bambu Lab",
      initialGrams: 1000,
      remainingGrams: 742,
      lowStockGrams: 200,
      costPerKg: 120,
    },
    {
      material: "PETG",
      color: "碳黑",
      brand: "eSUN",
      initialGrams: 1000,
      remainingGrams: 186,
      lowStockGrams: 200,
      costPerKg: 95,
    },
    {
      material: "ABS",
      color: "深蓝",
      brand: "Polymaker",
      initialGrams: 1000,
      remainingGrams: 524,
      lowStockGrams: 200,
      costPerKg: 110,
    },
    {
      material: "TPU",
      color: "橙色",
      brand: "Overture",
      initialGrams: 500,
      remainingGrams: 94,
      lowStockGrams: 120,
      costPerKg: 180,
    },
  ]);
  await db.insert(printJobs).values([
    {
      jobNo: "JOB-042",
      itemId: insertedItems[0].id,
      orderId: insertedOrders[0].id,
      printerName: "Voron 2.4",
      status: "打印中",
      progress: 68,
    },
    {
      jobNo: "JOB-043",
      itemId: insertedItems[1].id,
      orderId: insertedOrders[1].id,
      printerName: "Bambu X1C",
      status: "打印中",
      progress: 12,
    },
    {
      jobNo: "JOB-044",
      itemId: insertedItems[2].id,
      orderId: insertedOrders[2].id,
      printerName: "Prusa MK4",
      status: "排队",
      progress: 0,
    },
  ]);
}

export async function GET() {
  const denied = await requireApiAccess();
  if (denied) return denied;
  try {
    await seedIfEmpty();
    const db = getDb();
    const [items, materials, orderRows, jobs] = await Promise.all([
      db.select().from(printItems).orderBy(desc(printItems.createdAt)),
      db
        .select()
        .from(materialBatches)
        .orderBy(desc(materialBatches.createdAt)),
      db.select().from(orders).orderBy(desc(orders.createdAt)),
      db
        .select({
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
        })
        .from(printJobs)
        .leftJoin(printItems, eq(printJobs.itemId, printItems.id))
        .orderBy(desc(printJobs.createdAt)),
    ]);
    const d1 = getD1();
    const [
      settings,
      printerAverage,
      bomCosts,
      reservations,
      actualProduction,
      actualMaterials,
    ] = await Promise.all([
      d1
        .prepare(
          "SELECT electricity_rate electricityRate,labor_rate laborRate,labor_minutes_per_job laborMinutesPerJob,overhead_percent overheadPercent FROM cost_settings WHERE id=1",
        )
        .first<Record<string, number>>(),
      d1
        .prepare(
          "SELECT COALESCE(AVG(hourly_rate),0) hourlyRate,COALESCE(AVG(power_watts),1000) powerWatts FROM printers WHERE status!='停用'",
        )
        .first<Record<string, number>>(),
      d1
        .prepare(
          `SELECT im.item_id itemId,SUM(im.grams_per_item*(1+im.waste_percent/100.0)) plannedGrams,SUM(im.grams_per_item*(1+im.waste_percent/100.0)*mb.cost_per_kg/1000.0) materialCost FROM item_materials im JOIN material_batches mb ON mb.id=im.batch_id GROUP BY im.item_id`,
        )
        .all<Record<string, number>>(),
      d1
        .prepare(
          `SELECT batchId,SUM(reservedGrams) reservedGrams FROM (SELECT im.batch_id batchId,SUM(im.grams_per_item*j.quantity*(1+im.waste_percent/100.0)) reservedGrams FROM print_jobs j JOIN item_materials im ON im.item_id=j.item_id WHERE j.status IN ('排队','打印中','已暂停') AND j.material_deducted=0 GROUP BY im.batch_id UNION ALL SELECT e.batch_id batchId,SUM(e.estimated_grams) reservedGrams FROM external_print_jobs e WHERE e.batch_id IS NOT NULL AND e.completed_at IS NULL AND e.inventory_deducted=0 GROUP BY e.batch_id) GROUP BY batchId`,
        )
        .all<Record<string, number>>(),
      d1
        .prepare(
          `SELECT itemId,SUM(units) units,SUM(jobs) jobs,SUM(machineCost) machineCost,SUM(energyKwh) energyKwh FROM (SELECT j.item_id itemId,SUM(j.quantity) units,COUNT(*) jobs,SUM(MAX(0,(julianday(j.completed_at)-julianday(j.started_at))*24)*COALESCE(p.hourly_rate,0)) machineCost,SUM(MAX(0,(julianday(j.completed_at)-julianday(j.started_at))*24)*COALESCE(p.power_watts,1000)/1000.0) energyKwh FROM print_jobs j LEFT JOIN printers p ON p.name=j.printer_name WHERE j.status='已完成' AND j.item_id IS NOT NULL AND j.completed_at IS NOT NULL GROUP BY j.item_id UNION ALL SELECT e.item_id itemId,SUM(e.quantity) units,COUNT(*) jobs,SUM(MAX(0,(julianday(e.completed_at)-julianday(e.started_at))*24)*COALESCE(p.hourly_rate,0)) machineCost,SUM(MAX(0,(julianday(e.completed_at)-julianday(e.started_at))*24)*COALESCE(p.power_watts,1000)/1000.0) energyKwh FROM external_print_jobs e JOIN printers p ON p.id=e.printer_id WHERE e.item_id IS NOT NULL AND e.completed_at IS NOT NULL AND e.result='完成' GROUP BY e.item_id) GROUP BY itemId`,
        )
        .all<Record<string, number>>(),
      d1
        .prepare(
          `SELECT itemId,SUM(materialCost) materialCost FROM (SELECT j.item_id itemId,SUM(ABS(t.grams)*mb.cost_per_kg/1000.0) materialCost FROM inventory_transactions t JOIN print_jobs j ON j.id=t.job_id JOIN material_batches mb ON mb.id=t.batch_id WHERE t.type='打印消耗' AND j.item_id IS NOT NULL GROUP BY j.item_id UNION ALL SELECT e.item_id itemId,SUM(e.consumed_grams*mb.cost_per_kg/1000.0) materialCost FROM external_print_jobs e JOIN material_batches mb ON mb.id=e.batch_id WHERE e.item_id IS NOT NULL AND e.inventory_deducted=1 GROUP BY e.item_id) GROUP BY itemId`,
        )
        .all<Record<string, number>>(),
    ]);
    const c = settings || {};
    const avg = printerAverage || {};
    const averageMaterialRate = materials.length
      ? materials.reduce(
          (sum, material) => sum + Number(material.costPerKg || 0),
          0,
        ) / materials.length
      : 0;
    const itemCosts = items.map((item) => {
      const bom = bomCosts.results.find(
        (row) => Number(row.itemId) === item.id,
      );
      const materialCost = bom
        ? Number(bom.materialCost || 0)
        : (Number(item.estimatedGrams || 0) * averageMaterialRate) / 1000;
      const hours = Number(item.estimatedMinutes || 0) / 60;
      const machineCost = hours * Number(avg.hourlyRate || 0);
      const energyCost =
        ((hours * Number(avg.powerWatts || 1000)) / 1000) *
        Number(c.electricityRate || 0);
      const laborCost =
        (Number(c.laborMinutesPerJob || 0) / 60) * Number(c.laborRate || 0);
      const baseCost = materialCost + machineCost + energyCost + laborCost;
      const overheadCost = (baseCost * Number(c.overheadPercent || 0)) / 100;
      const estimatedUnitCost = baseCost + overheadCost;
      const production = actualProduction.results.find(
        (row) => Number(row.itemId) === item.id,
      );
      const actualMaterial = actualMaterials.results.find(
        (row) => Number(row.itemId) === item.id,
      );
      const units = Number(production?.units || 0);
      const actualBase =
        Number(actualMaterial?.materialCost || 0) +
        Number(production?.machineCost || 0) +
        Number(production?.energyKwh || 0) * Number(c.electricityRate || 0) +
        ((Number(production?.jobs || 0) * Number(c.laborMinutesPerJob || 0)) /
          60) *
          Number(c.laborRate || 0);
      const actualTotal =
        actualBase * (1 + Number(c.overheadPercent || 0) / 100);
      return {
        itemId: item.id,
        plannedGrams: Number(bom?.plannedGrams || item.estimatedGrams || 0),
        materialCost,
        machineCost,
        energyCost,
        laborCost,
        overheadCost,
        estimatedUnitCost,
        suggestedPrice: estimatedUnitCost / 0.5,
        actualUnitCost: units > 0 ? actualTotal / units : null,
        completedUnits: units,
      };
    });
    const enrichedMaterials = materials.map((material) => {
      const reservedGrams = Number(
        reservations.results.find((row) => Number(row.batchId) === material.id)
          ?.reservedGrams || 0,
      );
      const availableGrams = Math.max(
        0,
        Number(material.remainingGrams) - reservedGrams,
      );
      return {
        ...material,
        reservedGrams,
        availableGrams,
        stockValue: (availableGrams * Number(material.costPerKg || 0)) / 1000,
        usedPercent:
          material.initialGrams > 0
            ? ((material.initialGrams - material.remainingGrams) /
                material.initialGrams) *
              100
            : 0,
      };
    });
    return Response.json({
      items,
      materials: enrichedMaterials,
      orders: orderRows,
      jobs,
      itemCosts,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "读取数据失败" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const denied = await requireApiAccess(true);
  if (denied) return denied;
  try {
    const payload = (await request.json()) as Record<string, unknown> & {
      entity?: Entity;
    };
    const db = getDb();
    if (payload.entity === "item") {
      if (!payload.name || !payload.sku)
        return Response.json({ error: "物品名称和 SKU 必填" }, { status: 400 });
      const [row] = await db
        .insert(printItems)
        .values({
          sku: String(payload.sku),
          name: String(payload.name),
          category: String(payload.category || "未分类"),
          estimatedGrams: Number(payload.estimatedGrams || 0),
          estimatedMinutes: Number(payload.estimatedMinutes || 0),
        })
        .returning();
      return Response.json({ row }, { status: 201 });
    }
    if (payload.entity === "material") {
      if (!payload.material || !payload.color)
        return Response.json({ error: "材料类型和颜色必填" }, { status: 400 });
      const initial = Number(payload.initialGrams || 1000);
      const [row] = await db
        .insert(materialBatches)
        .values({
          material: String(payload.material),
          color: String(payload.color),
          brand: String(payload.brand || ""),
          initialGrams: initial,
          remainingGrams: Number(payload.remainingGrams ?? initial),
          lowStockGrams: Number(payload.lowStockGrams || 200),
          costPerKg: Number(payload.costPerKg || 0),
        })
        .returning();
      return Response.json({ row }, { status: 201 });
    }
    if (payload.entity === "order") {
      if (!payload.orderNo || !payload.customer)
        return Response.json({ error: "订单编号和客户必填" }, { status: 400 });
      const [row] = await db
        .insert(orders)
        .values({
          orderNo: String(payload.orderNo),
          customer: String(payload.customer),
          status: String(payload.status || "待确认"),
          dueAt: payload.dueAt ? String(payload.dueAt) : null,
        })
        .returning();
      return Response.json({ row }, { status: 201 });
    }
    if (payload.entity === "job") {
      if (!payload.jobNo || !payload.printerName)
        return Response.json(
          { error: "任务编号和打印机必填" },
          { status: 400 },
        );
      const itemId = payload.itemId ? Number(payload.itemId) : null;
      const quantity = Math.max(1, Number(payload.quantity || 1));
      if (itemId) {
        const d1 = getD1();
        const checks = await d1
          .prepare(
            `SELECT mb.material,mb.color,mb.remaining_grams remainingGrams,im.grams_per_item gramsPerItem,im.waste_percent wastePercent,COALESCE((SELECT SUM(im2.grams_per_item*j.quantity*(1+im2.waste_percent/100.0)) FROM print_jobs j JOIN item_materials im2 ON im2.item_id=j.item_id WHERE im2.batch_id=im.batch_id AND j.status IN ('排队','打印中','已暂停') AND j.material_deducted=0),0) reservedGrams FROM item_materials im JOIN material_batches mb ON mb.id=im.batch_id WHERE im.item_id=?`,
          )
          .bind(itemId)
          .all<Record<string, number | string>>();
        for (const material of checks.results) {
          const needed =
            Number(material.gramsPerItem) *
            quantity *
            (1 + Number(material.wastePercent) / 100);
          const available =
            Number(material.remainingGrams) - Number(material.reservedGrams);
          if (needed > available)
            return Response.json(
              {
                error: `${material.material} ${material.color} 可用量不足：新任务需要 ${needed.toFixed(1)}g，目前可用 ${Math.max(0, available).toFixed(1)}g`,
              },
              { status: 400 },
            );
        }
      }
      const [row] = await db
        .insert(printJobs)
        .values({
          jobNo: String(payload.jobNo),
          itemId,
          orderId: payload.orderId ? Number(payload.orderId) : null,
          printerName: String(payload.printerName),
          status: String(payload.status || "排队"),
          progress: Number(payload.progress || 0),
          quantity,
          priority: Number(payload.priority || 3),
        })
        .returning();
      return Response.json({ row }, { status: 201 });
    }
    if (payload.entity === "material") {
      const [row] = await db
        .update(materialBatches)
        .set({ costPerKg: Number(payload.costPerKg || 0) })
        .where(eq(materialBatches.id, payload.id))
        .returning();
      return Response.json({ row });
    }
    return Response.json({ error: "不支持的数据类型" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    return Response.json(
      {
        error: message.includes("UNIQUE")
          ? "编号已存在，请换一个编号"
          : message,
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const denied = await requireApiAccess(true);
  if (denied) return denied;
  try {
    const payload = (await request.json()) as {
      entity?: Entity;
      id?: number;
      status?: string;
      progress?: number;
      action?: string;
      note?: string;
    };
    if (!payload.id || !payload.entity)
      return Response.json({ error: "缺少记录标识" }, { status: 400 });
    const db = getDb();
    if (payload.entity === "job" && payload.action) {
      const d1 = getD1();
      const job = await d1
        .prepare(
          "SELECT id, item_id, order_id, status, progress, quantity, material_deducted FROM print_jobs WHERE id = ?",
        )
        .bind(payload.id)
        .first<{
          id: number;
          item_id: number | null;
          order_id: number | null;
          status: string;
          progress: number;
          quantity: number;
          material_deducted: number;
        }>();
      if (!job)
        return Response.json({ error: "打印任务不存在" }, { status: 404 });
      const transitions: Record<string, Record<string, string>> = {
        排队: { start: "打印中", cancel: "已取消" },
        打印中: {
          pause: "已暂停",
          complete: "已完成",
          fail: "失败",
          cancel: "已取消",
        },
        已暂停: {
          resume: "打印中",
          complete: "已完成",
          fail: "失败",
          cancel: "已取消",
        },
        失败: { retry: "排队" },
        已取消: { retry: "排队" },
      };
      const next = transitions[job.status]?.[payload.action];
      if (!next)
        return Response.json(
          { error: `任务处于“${job.status}”，不能执行该操作` },
          { status: 400 },
        );
      if (payload.action === "fail" && !String(payload.note || "").trim())
        return Response.json({ error: "请填写失败原因" }, { status: 400 });
      const statements: D1PreparedStatement[] = [];
      let progress = job.progress;
      let startedSql: string | null = null,
        completedSql: string | null = null;
      if (payload.action === "start") {
        progress = Math.max(1, progress);
        startedSql = "CURRENT_TIMESTAMP";
      }
      if (payload.action === "complete") {
        progress = 100;
        completedSql = "CURRENT_TIMESTAMP";
        if (!job.material_deducted && job.item_id) {
          const specs = await d1
            .prepare(
              "SELECT im.batch_id, im.grams_per_item, im.waste_percent, mb.remaining_grams, mb.material, mb.color FROM item_materials im JOIN material_batches mb ON mb.id = im.batch_id WHERE im.item_id = ?",
            )
            .bind(job.item_id)
            .all<{
              batch_id: number;
              grams_per_item: number;
              waste_percent: number;
              remaining_grams: number;
              material: string;
              color: string;
            }>();
          for (const spec of specs.results) {
            const required = Number(
              (
                spec.grams_per_item *
                job.quantity *
                (1 + spec.waste_percent / 100)
              ).toFixed(2),
            );
            if (spec.remaining_grams < required)
              return Response.json(
                {
                  error: `${spec.material} ${spec.color} 库存不足：需要 ${required}g，当前 ${spec.remaining_grams}g`,
                },
                { status: 400 },
              );
          }
          for (const spec of specs.results) {
            const required = Number(
              (
                spec.grams_per_item *
                job.quantity *
                (1 + spec.waste_percent / 100)
              ).toFixed(2),
            );
            statements.push(
              d1
                .prepare(
                  "UPDATE material_batches SET remaining_grams = remaining_grams - ? WHERE id = ?",
                )
                .bind(required, spec.batch_id),
            );
            statements.push(
              d1
                .prepare(
                  "INSERT INTO inventory_transactions (batch_id, job_id, type, grams, note) VALUES (?, ?, '打印消耗', ?, ?)",
                )
                .bind(spec.batch_id, job.id, -required, `任务完成自动扣料`),
            );
          }
        }
      }
      if (payload.action === "retry") progress = 0;
      const setStarted = startedSql ? ", started_at = CURRENT_TIMESTAMP" : "";
      const setCompleted = completedSql
        ? ", completed_at = CURRENT_TIMESTAMP, material_deducted = 1"
        : "";
      statements.push(
        d1
          .prepare(
            `UPDATE print_jobs SET status = ?, progress = ?${setStarted}${setCompleted} WHERE id = ?`,
          )
          .bind(next, progress, job.id),
      );
      statements.push(
        d1
          .prepare(
            "INSERT INTO print_job_events (job_id, action, from_status, to_status, note) VALUES (?, ?, ?, ?, ?)",
          )
          .bind(
            job.id,
            payload.action,
            job.status,
            next,
            String(payload.note || ""),
          ),
      );
      if (next === "已完成" && job.order_id)
        statements.push(
          d1
            .prepare("UPDATE orders SET status = '已完成' WHERE id = ?")
            .bind(job.order_id),
        );
      await d1.batch(statements);
      return Response.json({ ok: true, status: next, progress });
    }
    if (payload.entity === "job") {
      const [row] = await db
        .update(printJobs)
        .set({ status: payload.status, progress: payload.progress })
        .where(eq(printJobs.id, payload.id))
        .returning();
      return Response.json({ row });
    }
    if (payload.entity === "order") {
      const [row] = await db
        .update(orders)
        .set({ status: payload.status })
        .where(eq(orders.id, payload.id))
        .returning();
      return Response.json({ row });
    }
    return Response.json({ error: "该类型暂不支持状态更新" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "更新失败" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const denied = await requireApiAccess(true);
  if (denied) return denied;
  try {
    const url = new URL(request.url);
    const entity = url.searchParams.get("entity") as Entity | null;
    const id = Number(url.searchParams.get("id"));
    if (!entity || !id)
      return Response.json({ error: "缺少记录标识" }, { status: 400 });
    const db = getDb();
    if (entity === "item")
      await db.delete(printItems).where(eq(printItems.id, id));
    else if (entity === "material")
      await db.delete(materialBatches).where(eq(materialBatches.id, id));
    else if (entity === "order")
      await db.delete(orders).where(eq(orders.id, id));
    else if (entity === "job")
      await db.delete(printJobs).where(eq(printJobs.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "删除失败" },
      { status: 500 },
    );
  }
}
