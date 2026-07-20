import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  bambuAmsSlots,
  bambuMaterialUsage,
  printFiles,
  printerCommands,
  printers,
  spoolmanSpools,
} from "../../../db/schema";
import { requireApiAccess } from "../../api-auth";

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}

export async function GET() {
  const denied = await requireApiAccess();
  if (denied) return denied;
  try {
    const rows = await getDb()
      .select()
      .from(printers)
      .orderBy(desc(printers.createdAt));
    const slots = await getDb().select().from(bambuAmsSlots);
    const usage = await getDb()
      .select()
      .from(bambuMaterialUsage)
      .orderBy(desc(bambuMaterialUsage.completedAt))
      .limit(200);
    return Response.json({
      printers: rows.map((p) => ({
        ...p,
        amsSlots: slots.filter((s) => s.printerId === p.id),
        materialUsage: usage.filter((u) => u.printerId === p.id),
      })),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "读取设备失败" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const denied = await requireApiAccess(true);
  if (denied) return denied;
  try {
    const p = (await request.json()) as Record<string, unknown>;
    if (!p.name)
      return Response.json({ error: "设备名称必填" }, { status: 400 });
    const [row] = await getDb()
      .insert(printers)
      .values({
        name: String(p.name),
        model: String(p.model || ""),
        technology: String(p.technology || "FDM"),
        location: String(p.location || ""),
        nozzleDiameter: Number(p.nozzleDiameter || 0.4),
        buildVolume: String(p.buildVolume || ""),
        status: String(p.status || "空闲"),
        totalHours: Number(p.totalHours || 0),
        hourlyRate: Number(p.hourlyRate || 0),
        powerWatts: Math.max(0, Number(p.powerWatts || 1000)),
        maintenanceDueAt: p.maintenanceDueAt
          ? String(p.maintenanceDueAt)
          : null,
        notes: String(p.notes || ""),
        connectorType: String(p.connectorType || "manual"),
      })
      .returning();
    return Response.json({ row }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    return Response.json(
      { error: message.includes("UNIQUE") ? "设备名称已存在" : message },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const denied = await requireApiAccess(true, "printers.control");
  if (denied) return denied;
  try {
    const p = (await request.json()) as {
      id?: number;
      status?: string;
      totalHours?: number;
      hourlyRate?: number;
      powerWatts?: number;
      maintenanceDueAt?: string | null;
      action?: string;
      connectorType?: string;
      command?: string;
      fileId?: number;
      plateIndex?: number;
    };
    if (!p.id) return Response.json({ error: "缺少设备标识" }, { status: 400 });
    if (p.action === "rotateToken") {
      const token = `lt_${crypto.randomUUID().replaceAll("-", "")}_${crypto.randomUUID().replaceAll("-", "")}`;
      const type = ["moonraker", "octoprint", "bambu_lan"].includes(
        p.connectorType || "",
      )
        ? p.connectorType!
        : "moonraker";
      const [row] = await getDb()
        .update(printers)
        .set({
          connectorType: type,
          connectorTokenHash: await sha256(token),
          connectionState: "等待代理连接",
        })
        .where(eq(printers.id, p.id))
        .returning();
      return Response.json({ row, token });
    }
    if (p.action === "command") {
      if (
        !p.command ||
        !["pause", "resume", "cancel", "start"].includes(p.command)
      )
        return Response.json({ error: "不支持的设备命令" }, { status: 400 });
      const [target] = await getDb()
        .select()
        .from(printers)
        .where(eq(printers.id, p.id))
        .limit(1);
      let payload = "{}";
      if (p.command === "start") {
        if (!p.fileId)
          return Response.json({ error: "请选择打印文件" }, { status: 400 });
        const [file] = await getDb()
          .select()
          .from(printFiles)
          .where(eq(printFiles.id, p.fileId))
          .limit(1);
        const allowed =
          target?.connectorType === "bambu_lan"
            ? ["3MF", "G-code"]
            : ["G-code"];
        if (!file || !allowed.includes(file.kind))
          return Response.json(
            {
              error:
                target?.connectorType === "bambu_lan"
                  ? "Bambu 仅支持 3MF 或 G-code"
                  : "该设备只能下发 G-code",
            },
            { status: 400 },
          );
        payload = JSON.stringify({
          fileId: file.id,
          filename: file.filename,
          plateIndex: Number(p.plateIndex || 0),
        });
      }
      const [command] = await getDb()
        .insert(printerCommands)
        .values({ printerId: p.id, command: p.command, payload })
        .returning();
      return Response.json({ command }, { status: 202 });
    }
    const [row] = await getDb()
      .update(printers)
      .set({
        status: p.status,
        totalHours: p.totalHours,
        hourlyRate: p.hourlyRate,
        powerWatts: p.powerWatts,
        maintenanceDueAt: p.maintenanceDueAt,
      })
      .where(eq(printers.id, p.id))
      .returning();
    return Response.json({ row });
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
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!id) return Response.json({ error: "缺少设备标识" }, { status: 400 });
    await getDb()
      .update(spoolmanSpools)
      .set({ syncedByPrinterId: null })
      .where(eq(spoolmanSpools.syncedByPrinterId, id));
    await getDb()
      .delete(bambuMaterialUsage)
      .where(eq(bambuMaterialUsage.printerId, id));
    await getDb().delete(bambuAmsSlots).where(eq(bambuAmsSlots.printerId, id));
    await getDb()
      .delete(printerCommands)
      .where(eq(printerCommands.printerId, id));
    await getDb().delete(printers).where(eq(printers.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "删除失败" },
      { status: 500 },
    );
  }
}
