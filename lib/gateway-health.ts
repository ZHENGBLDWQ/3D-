export type GatewayCheckState = "healthy" | "attention" | "waiting";

export type GatewayHealthInput = {
  lastSeenAt: string | null;
  discoveries: Array<{ lastSeenAt: string }>;
  bindings: Array<{ status: string; lastSeenAt: string | null }>;
};

export type GatewayHealth = {
  state: GatewayCheckState;
  headline: string;
  nextAction: string;
  checks: Array<{ key: "hub" | "discovery" | "binding" | "telemetry"; label: string; state: GatewayCheckState; detail: string }>;
};

const RECENT_HEARTBEAT_MS = 60_000;
const RECENT_TELEMETRY_MS = 120_000;

function isRecent(value: string | null, now: number, threshold: number) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && now - timestamp <= threshold;
}

export function assessGatewayHealth(input: GatewayHealthInput, now = Date.now()): GatewayHealth {
  const hubOnline = isRecent(input.lastSeenAt, now, RECENT_HEARTBEAT_MS);
  const hasDevices = input.discoveries.length > 0;
  const hasBindings = input.bindings.length > 0;
  const pendingCredentials = input.bindings.some(binding => binding.status === "pending_local_credential");
  const telemetryOnline = input.bindings.some(binding => isRecent(binding.lastSeenAt, now, RECENT_TELEMETRY_MS));

  const checks: GatewayHealth["checks"] = [
    { key: "hub", label: "Local Hub", state: hubOnline ? "healthy" : "waiting", detail: hubOnline ? "心跳正常" : "等待本地电脑上线" },
    { key: "discovery", label: "局域网发现", state: hasDevices ? "healthy" : hubOnline ? "attention" : "waiting", detail: hasDevices ? `已发现 ${input.discoveries.length} 台设备` : "尚未发现 Bambu 打印机" },
    { key: "binding", label: "安全绑定", state: pendingCredentials ? "attention" : hasBindings ? "healthy" : "waiting", detail: pendingCredentials ? "需要在本地输入 LAN Access Code" : hasBindings ? `已绑定 ${input.bindings.length} 台设备` : "等待选择设备" },
    { key: "telemetry", label: "实时数据", state: telemetryOnline ? "healthy" : hasBindings ? "attention" : "waiting", detail: telemetryOnline ? "打印与 AMS 数据正在同步" : hasBindings ? "已绑定，但暂未收到实时数据" : "绑定后开始监控" },
  ];

  if (!hubOnline) return { state: "waiting", headline: "等待 Local Hub 上线", nextAction: "在打印农场 Windows 电脑安装并启动 Local Hub。", checks };
  if (!hasDevices) return { state: "attention", headline: "网关在线，尚未发现打印机", nextAction: "确认电脑与打印机在同一局域网，并检查 Windows 防火墙。", checks };
  if (!hasBindings) return { state: "waiting", headline: "已发现设备，等待安全绑定", nextAction: "选择打印机并发起绑定。", checks };
  if (pendingCredentials) return { state: "attention", headline: "等待本地凭据确认", nextAction: "LAN Access Code 只在 Local Hub 本地输入，不会上传网站。", checks };
  if (!telemetryOnline) return { state: "attention", headline: "设备已绑定，实时数据未到达", nextAction: "检查打印机 Developer Mode、LAN Access Code 和 MQTT 连接。", checks };
  return { state: "healthy", headline: "设备监控运行正常", nextAction: "Bambu Studio 继续负责切片与打印，本系统自动记录打印和耗材数据。", checks };
}
