import { createInitialAdmin, createSessionCookie, sessionCookieName } from "../../session-auth";

export async function POST(request: Request) {
  const body = await request.json() as {email?:string;password?:string;confirmPassword?:string};
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email.includes("@")) return Response.json({error:"请输入有效的管理员邮箱"},{status:400});
  if (password.length < 10) return Response.json({error:"密码至少需要 10 位"},{status:400});
  if (password !== String(body.confirmPassword || "")) return Response.json({error:"两次输入的密码不一致"},{status:400});
  if (!await createInitialAdmin(email,password)) return Response.json({error:"管理员已经设置，请直接登录"},{status:409});
  const cookie = await createSessionCookie(email);
  return Response.json({ok:true},{headers:{"Set-Cookie":`${sessionCookieName}=${encodeURIComponent(cookie)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`}});
}
