import { env } from "cloudflare:workers";
import { getChatGPTUser } from "./chatgpt-auth";

export async function requireApiAccess(write = false): Promise<Response | null> {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "请先使用 ChatGPT 登录" }, { status: 401 });
  if (write) {
    const configured = (env as unknown as { ADMIN_EMAILS?: string }).ADMIN_EMAILS ?? "";
    const allowed = configured.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
    if (!allowed.includes(user.email.toLowerCase())) return Response.json({ error: "当前账号没有修改权限" }, { status: 403 });
  }
  return null;
}
