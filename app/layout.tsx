import type { Metadata } from "next";
import "./globals.css";
import { getSessionUser, needsInitialAdminSetup } from "./session-auth";
import SetupForm from "./setup-form";
import { ensureDatabaseSchema } from "../db/ensure-schema";
import AppShell from "./app-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "层迹 · 3D 打印生产管理",
  description: "统一管理打印物品、耗材库存、客户订单与打印队列。",
  openGraph: {
    title: "层迹 · 3D 打印生产管理",
    description: "统一管理打印物品、耗材库存、客户订单与打印队列。",
    images: [{ url: "/og.png", width: 1680, height: 945, alt: "层迹 3D 打印生产管理" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "层迹 · 3D 打印生产管理",
    description: "统一管理打印物品、耗材库存、客户订单与打印队列。",
    images: ["/og.png"],
  },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await ensureDatabaseSchema();
  const user = await getSessionUser();
  if (!user) {
    const needsSetup = await needsInitialAdminSetup();
    return <html lang="zh-CN"><body><main className="signin-shell">
      <section className="signin-card">
        <div className="signin-mark">LT</div>
        <p>LAYERTRACE WORKSPACE</p>
        <h1>{needsSetup?"设置你的管理员账号":"登录 3D 打印管理系统"}</h1>
        <span>{needsSetup?"首次使用，请创建管理员邮箱和密码。完成后只有授权账号可以进入。":"登录后管理打印机、AMS 耗材、订单、打印队列与生产成本。"}</span>
        {needsSetup?<SetupForm/>:<form className="signin-form" action="/api/login" method="post">
          <label><span>管理员邮箱</span><input name="email" type="email" autoComplete="username" required /></label>
          <label><span>密码</span><input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="signin-button" type="submit">登录系统</button>
        </form>}
        <small>{needsSetup?"邮箱和密码只用于此 LayerTrace 工作区。":"仅已授权的管理员和员工账号可以进入工作区。"}</small>
      </section>
    </main></body></html>;
  }
  return <html lang="zh-CN"><body><AppShell user={user}>{children}</AppShell></body></html>;
}
