"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import styles from "./gateways.module.css";

type CheckState = "healthy" | "attention" | "waiting";
type Discovery = { id: number; deviceId: string; deviceSerial: string; deviceName: string; deviceModel: string; host: string; lastSeenAt: string };
type Binding = { id: number; printerId: number; deviceSerial: string; status: string; lastSeenAt: string | null };
type Health = { state: CheckState; headline: string; nextAction: string; checks: Array<{ key: string; label: string; state: CheckState; detail: string }> };
type Gateway = { id: number; gatewayId: string; name: string; status: string; version: string; platform: string; lastSeenAt: string | null; discoveries: Discovery[]; bindings: Binding[]; health: Health };

const stateLabel: Record<CheckState, string> = { healthy: "正常", attention: "需处理", waiting: "等待中" };

export default function GatewayClient({ canManage }: { canManage: boolean }) {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [message, setMessage] = useState("");
  const [showRegistration, setShowRegistration] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const response = await fetch("/api/gateways", { cache: "no-store" });
    const body = await response.json() as { gateways?: Gateway[]; error?: string };
    if (response.ok) setGateways(body.gateways ?? []);
    else setMessage(body.error ?? "读取网关状态失败");
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const response = await fetch("/api/gateways", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: new FormData(form).get("name"), platform: "windows" }) });
    const body = await response.json() as { token?: string; error?: string };
    if (!response.ok) return setMessage(body.error ?? "创建网关失败");
    setToken(body.token ?? "");
    setShowRegistration(false);
    setShowGuide(true);
    form.reset();
    await load();
  }

  async function bind(gatewayId: number, discoveryId: number, name: string) {
    const response = await fetch("/api/gateways", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "bind", gatewayId, discoveryId, printerName: name }) });
    const body = await response.json() as { error?: string };
    setMessage(response.ok ? "绑定申请已创建。下一步请在 Local Hub 本地输入该打印机的 LAN Access Code。" : body.error ?? "绑定失败");
    if (response.ok) await load();
  }

  return <main className={styles.shell}>
    <header>
      <a href="/">← 返回工作台</a>
      <div><span className={styles.eyebrow}>BAMBU MONITORING</span><h1>设备接入与连接诊断</h1><p>Bambu Studio 负责打印操作，LayerTrace 只读采集设备、任务和 AMS 耗材数据</p></div>
      {canManage ? <button onClick={() => setShowRegistration(true)}>接入新场地</button> : <span />}
    </header>

    <section className={styles.boundary}><strong>监控边界</strong><span>不会远程切片、下发、暂停或取消打印</span><i /> <span>LAN Access Code 只保存在本地 Windows 电脑</span><button onClick={() => setShowGuide(true)}>查看接入步骤</button></section>
    {message ? <div className={styles.notice}>{message}<button onClick={() => setMessage("")}>×</button></div> : null}
    {token ? <section className={styles.token}><strong>网关令牌只显示一次</strong><code>{token}</code><p>复制到 Local Hub 后请安全保存并关闭此提示。它不是打印机的 LAN Access Code。</p><button onClick={() => setToken("")}>我已安全保存</button></section> : null}

    <section className={styles.summary}>
      <div><b>{gateways.length}</b><span>本地网关</span></div>
      <div><b>{gateways.reduce((sum, item) => sum + item.discoveries.length, 0)}</b><span>发现设备</span></div>
      <div><b>{gateways.reduce((sum, item) => sum + item.bindings.length, 0)}</b><span>监控设备</span></div>
      <div><b>{gateways.filter(item => item.health.state === "attention").length}</b><span>需要处理</span></div>
    </section>

    <section className={styles.grid} aria-busy={loading}>
      {loading ? <div className={styles.empty}>正在读取网关状态…</div> : gateways.length === 0 ? <div className={styles.empty}><b>还没有接入 Local Hub</b><p>在与打印机同一局域网的 Windows 电脑上运行 Local Hub，即可自动发现 Bambu 设备。</p>{canManage ? <button onClick={() => setShowRegistration(true)}>开始三步接入</button> : null}</div> : gateways.map(gateway => <article className={styles.card} key={gateway.id}>
        <div className={styles.cardHead}><div><span className={`${styles.dot} ${styles[gateway.health.state]}`} /><h2>{gateway.name}</h2><p>{gateway.gatewayId} · {gateway.platform || "未知平台"} · {gateway.version || "等待首次连接"}</p></div><span className={`${styles.badge} ${styles[gateway.health.state]}`}>{stateLabel[gateway.health.state]}</span></div>
        <div className={styles.health}><div><span>当前判断</span><strong>{gateway.health.headline}</strong><p>{gateway.health.nextAction}</p></div><button onClick={() => setShowGuide(true)}>排查指南</button></div>
        <ol className={styles.checks}>{gateway.health.checks.map((check, index) => <li key={check.key} className={styles[check.state]}><span>{check.state === "healthy" ? "✓" : index + 1}</span><div><b>{check.label}</b><small>{check.detail}</small></div></li>)}</ol>
        <div className={styles.metrics}><div><b>{gateway.discoveries.length}</b><span>发现设备</span></div><div><b>{gateway.bindings.length}</b><span>已申请绑定</span></div><div><b>{gateway.lastSeenAt ? new Date(gateway.lastSeenAt).toLocaleString() : "—"}</b><span>最后心跳</span></div></div>
        <h3>局域网设备</h3>
        {gateway.discoveries.length === 0 ? <p className={styles.muted}>Local Hub 在线后会自动上报同网段 Bambu 打印机。</p> : gateway.discoveries.map(device => { const binding = gateway.bindings.find(item => item.deviceSerial === device.deviceSerial); return <div className={styles.device} key={device.id}><div><b>{device.deviceName}</b><span>{device.deviceModel || "Bambu"} · {device.host}</span><small>序列号 …{device.deviceSerial.slice(-6)} · {new Date(device.lastSeenAt).toLocaleString()}</small></div>{binding ? <em>{binding.status === "online" ? "实时监控中" : "等待本地确认"}</em> : canManage ? <button onClick={() => void bind(gateway.id, device.id, device.deviceName)}>安全绑定</button> : null}</div> })}
      </article>)}
    </section>

    {showRegistration ? <div className={styles.overlay} onMouseDown={event => { if (event.target === event.currentTarget) setShowRegistration(false); }}><form className={styles.modal} onSubmit={create}><span className={styles.eyebrow}>STEP 1 OF 3</span><h2>注册打印农场电脑</h2><p>选择一台长期在线、与打印机处于同一局域网的 Windows 电脑作为 Local Hub。</p><label>网关名称<input name="name" required maxLength={80} placeholder="例如：一号打印农场电脑" /></label><aside>创建后会生成一次性网关令牌。打印机 LAN Access Code 不在网页填写。</aside><footer><button type="button" onClick={() => setShowRegistration(false)}>取消</button><button>创建并生成令牌</button></footer></form></div> : null}
    {showGuide ? <div className={styles.overlay} onMouseDown={event => { if (event.target === event.currentTarget) setShowGuide(false); }}><section className={`${styles.modal} ${styles.guide}`}><span className={styles.eyebrow}>ONBOARDING GUIDE</span><h2>三步完成真实设备接入</h2><ol><li><b>注册并启动 Local Hub</b><p>在打印农场 Windows 电脑保存网关令牌，启动后台 Agent，并允许专用网络通信。</p></li><li><b>发现并安全绑定打印机</b><p>电脑与打印机保持同一局域网；在打印机开启 LAN Only / Developer Mode；LAN Access Code 仅在本地输入。</p></li><li><b>确认实时数据</b><p>当心跳、设备发现、绑定和实时数据全部变绿，打印任务及 AMS 状态会自动进入系统。</p></li></ol><div className={styles.troubleshoot}><b>常见排查顺序</b><p>同一网段 → Windows 防火墙 → Developer Mode → LAN Access Code → MQTT 8883 端口 → 打印机重启或 IP 变化</p></div><footer><button onClick={() => setShowGuide(false)}>关闭</button></footer></section></div> : null}
  </main>;
}
