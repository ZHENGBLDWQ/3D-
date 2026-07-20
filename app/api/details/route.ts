import { desc, eq } from "drizzle-orm";
import { getD1, getDb } from "../../../db";
import { inventoryTransactions, itemMaterials, materialBatches, orderItems, orders, printItems } from "../../../db/schema";

type DetailEntity = "orderLine" | "bom" | "transaction";

export async function GET() {
  try {
    const db = getDb();
    const [lines, bom, transactions] = await Promise.all([
      db.select({ id:orderItems.id, orderId:orderItems.orderId, orderNo:orders.orderNo, itemId:orderItems.itemId, itemName:printItems.name, quantity:orderItems.quantity, unitPrice:orderItems.unitPrice })
        .from(orderItems).innerJoin(orders,eq(orderItems.orderId,orders.id)).innerJoin(printItems,eq(orderItems.itemId,printItems.id)).orderBy(desc(orderItems.createdAt)),
      db.select({ id:itemMaterials.id, itemId:itemMaterials.itemId, itemName:printItems.name, batchId:itemMaterials.batchId, material:materialBatches.material, color:materialBatches.color, gramsPerItem:itemMaterials.gramsPerItem, wastePercent:itemMaterials.wastePercent })
        .from(itemMaterials).innerJoin(printItems,eq(itemMaterials.itemId,printItems.id)).innerJoin(materialBatches,eq(itemMaterials.batchId,materialBatches.id)).orderBy(desc(itemMaterials.createdAt)),
      db.select({ id:inventoryTransactions.id, batchId:inventoryTransactions.batchId, material:materialBatches.material, color:materialBatches.color, type:inventoryTransactions.type, grams:inventoryTransactions.grams, note:inventoryTransactions.note, createdAt:inventoryTransactions.createdAt })
        .from(inventoryTransactions).innerJoin(materialBatches,eq(inventoryTransactions.batchId,materialBatches.id)).orderBy(desc(inventoryTransactions.createdAt)).limit(100),
    ]);
    return Response.json({ lines, bom, transactions });
  } catch (error) {
    return Response.json({ error:error instanceof Error?error.message:"读取明细失败" },{status:500});
  }
}

export async function POST(request:Request) {
  try {
    const payload=await request.json() as Record<string,unknown>&{entity?:DetailEntity};
    const db=getDb();
    if(payload.entity==="orderLine") {
      const orderId=Number(payload.orderId),itemId=Number(payload.itemId),quantity=Number(payload.quantity);
      if(!orderId||!itemId||quantity<=0) return Response.json({error:"订单、物品和有效数量必填"},{status:400});
      const [row]=await db.insert(orderItems).values({orderId,itemId,quantity,unitPrice:Number(payload.unitPrice||0)}).returning();
      return Response.json({row},{status:201});
    }
    if(payload.entity==="bom") {
      const itemId=Number(payload.itemId),batchId=Number(payload.batchId),grams=Number(payload.gramsPerItem);
      if(!itemId||!batchId||grams<=0) return Response.json({error:"物品、耗材和有效克重必填"},{status:400});
      const [row]=await db.insert(itemMaterials).values({itemId,batchId,gramsPerItem:grams,wastePercent:Number(payload.wastePercent||0)}).returning();
      return Response.json({row},{status:201});
    }
    if(payload.entity==="transaction") {
      const batchId=Number(payload.batchId),amount=Math.abs(Number(payload.grams)),type=String(payload.type||"");
      if(!batchId||!amount||!type) return Response.json({error:"耗材、类型和克重必填"},{status:400});
      const positive=["入库","退料"].includes(type);
      const delta=positive?amount:-amount;
      const batch=await getD1().prepare("SELECT remaining_grams FROM material_batches WHERE id = ?").bind(batchId).first<{remaining_grams:number}>();
      if(!batch) return Response.json({error:"耗材批次不存在"},{status:404});
      if(batch.remaining_grams+delta<0) return Response.json({error:`库存不足，当前仅剩 ${batch.remaining_grams} g`},{status:400});
      const d1=getD1();
      await d1.batch([
        d1.prepare("INSERT INTO inventory_transactions (batch_id, type, grams, note) VALUES (?, ?, ?, ?)").bind(batchId,type,delta,String(payload.note||"")),
        d1.prepare("UPDATE material_batches SET remaining_grams = remaining_grams + ? WHERE id = ?").bind(delta,batchId),
      ]);
      return Response.json({ok:true},{status:201});
    }
    return Response.json({error:"不支持的明细类型"},{status:400});
  } catch(error) {
    return Response.json({error:error instanceof Error?error.message:"保存失败"},{status:500});
  }
}

export async function DELETE(request:Request) {
  try {
    const url=new URL(request.url); const entity=url.searchParams.get("entity") as DetailEntity|null; const id=Number(url.searchParams.get("id"));
    if(!entity||!id) return Response.json({error:"缺少记录标识"},{status:400});
    const db=getDb();
    if(entity==="orderLine") await db.delete(orderItems).where(eq(orderItems.id,id));
    else if(entity==="bom") await db.delete(itemMaterials).where(eq(itemMaterials.id,id));
    else return Response.json({error:"库存流水不可删除，请使用反向调整"},{status:400});
    return Response.json({ok:true});
  } catch(error) { return Response.json({error:error instanceof Error?error.message:"删除失败"},{status:500}); }
}
