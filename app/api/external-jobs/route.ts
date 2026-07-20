import { getD1 } from "../../../db";
import { requireApiAccess } from "../../api-auth";

export async function GET() {
  const denied = await requireApiAccess();
  if (denied) return denied;
  try {
    const rows = await getD1()
      .prepare(
        `SELECT e.id,e.filename,e.quantity,e.material,e.ams_unit amsUnit,e.tray_index trayIndex,e.estimated_grams estimatedGrams,e.consumed_grams consumedGrams,e.status,e.result,e.started_at startedAt,e.completed_at completedAt,e.item_id itemId,e.order_id orderId,e.batch_id batchId,p.name printerName,i.name itemName,o.order_no orderNo,m.material batchMaterial,m.color batchColor FROM external_print_jobs e JOIN printers p ON p.id=e.printer_id LEFT JOIN print_items i ON i.id=e.item_id LEFT JOIN orders o ON o.id=e.order_id LEFT JOIN material_batches m ON m.id=e.batch_id ORDER BY e.id DESC LIMIT 200`,
      )
      .all();
    return Response.json({ jobs: rows.results });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "外部任务读取失败" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const denied = await requireApiAccess(true);
  if (denied) return denied;
  try {
    const body = (await request.json()) as {
      id?: number;
      itemId?: number;
      orderId?: number | null;
      batchId?: number;
      quantity?: number;
      estimatedGrams?: number;
    };
    if (!body.id || !body.itemId || !body.batchId)
      return Response.json({ error: "请选择产品和耗材卷" }, { status: 400 });
    const quantity = Math.max(1, Number(body.quantity || 1));
    const estimatedGrams = Math.max(0, Number(body.estimatedGrams || 0));
    const d1 = getD1();
    const job = await d1
      .prepare(
        "SELECT id,printer_id printerId,status,result,consumed_grams consumedGrams,inventory_deducted inventoryDeducted FROM external_print_jobs WHERE id=?",
      )
      .bind(body.id)
      .first<Record<string, number | string>>();
    if (!job)
      return Response.json({ error: "外部任务不存在" }, { status: 404 });
    const batch = await d1
      .prepare(
        "SELECT remaining_grams remainingGrams,material,color FROM material_batches WHERE id=?",
      )
      .bind(body.batchId)
      .first<Record<string, number | string>>();
    if (!batch)
      return Response.json({ error: "耗材卷不存在" }, { status: 404 });
    const amount = Number(job.consumedGrams || estimatedGrams);
    if (!job.inventoryDeducted && amount > Number(batch.remainingGrams))
      return Response.json(
        {
          error: `${batch.material} ${batch.color} 库存不足，需要 ${amount.toFixed(1)}g，当前 ${Number(batch.remainingGrams).toFixed(1)}g`,
        },
        { status: 400 },
      );
    const statements = [
      d1
        .prepare(
          "UPDATE external_print_jobs SET item_id=?,order_id=?,batch_id=?,quantity=?,estimated_grams=?,status=CASE WHEN completed_at IS NULL THEN '已认领' ELSE status END,claimed_at=CURRENT_TIMESTAMP WHERE id=?",
        )
        .bind(
          body.itemId,
          body.orderId || null,
          body.batchId,
          quantity,
          estimatedGrams,
          body.id,
        ),
    ];
    if (!job.inventoryDeducted && job.result && amount > 0) {
      statements.push(
        d1
          .prepare(
            "UPDATE material_batches SET remaining_grams=remaining_grams-? WHERE id=?",
          )
          .bind(amount, body.batchId),
      );
      statements.push(
        d1
          .prepare(
            "INSERT INTO inventory_transactions(batch_id,type,grams,note) VALUES(?,'打印消耗',?,?)",
          )
          .bind(body.batchId, -amount, `Bambu Studio外部任务 #${body.id}`),
      );
      statements.push(
        d1
          .prepare(
            "UPDATE external_print_jobs SET inventory_deducted=1,status='已结算' WHERE id=?",
          )
          .bind(body.id),
      );
      statements.push(
        d1.prepare(`UPDATE inventory_printer_allocations
          SET remaining_grams=MAX(0,remaining_grams-?),updated_at=CURRENT_TIMESTAMP,
              status=CASE WHEN remaining_grams-?<=0 THEN '已用完' ELSE status END
          WHERE id=(SELECT id FROM inventory_printer_allocations WHERE printer_id=? AND batch_id=? AND status='使用中' ORDER BY assigned_at LIMIT 1)`)
          .bind(amount,amount,Number(job.printerId),body.batchId),
      );
    }
    await d1.batch(statements);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "外部任务认领失败" },
      { status: 500 },
    );
  }
}
