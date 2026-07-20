import { createSessionCookie, sessionCookieName, verifyAdminCredentials } from "../../session-auth";

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  if (!await verifyAdminCredentials(email, password)) {
    return new Response(null, { status: 303, headers: { Location: "/?login=failed" } });
  }
  const cookie = await createSessionCookie(email);
  return new Response(null, { status: 303, headers: {
    Location: "/",
    "Set-Cookie": `${sessionCookieName}=${encodeURIComponent(cookie)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`,
  } });
}

export async function DELETE() {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": `${sessionCookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` } });
}
