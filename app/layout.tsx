import type { Metadata } from "next";
import "./globals.css";
import { requireChatGPTUser } from "./chatgpt-auth";

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
  await requireChatGPTUser("/");
  return <html lang="zh-CN"><body>{children}</body></html>;
}
