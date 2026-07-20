import { env } from "cloudflare:workers";
import { headers } from "next/headers";

const COOKIE_NAME = "layertrace_session";
const encoder = new TextEncoder();

function config() {
  const values = env as unknown as { ADMIN_EMAILS?: string; ADMIN_PASSWORD?: string; SESSION_SECRET?: string };
  return {
    emails: (values.ADMIN_EMAILS || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean),
    password: values.ADMIN_PASSWORD || "",
    secret: values.SESSION_SECRET || "",
  };
}

async function hmac(value: string) {
  const { secret } = config();
  if (!secret) return "";
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyAdminCredentials(email: string, password: string) {
  const values = config();
  return values.emails.includes(email.trim().toLowerCase()) && !!values.password && password === values.password;
}

export async function createSessionCookie(email: string) {
  const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 12;
  const payload = `${email.trim().toLowerCase()}|${expires}`;
  return `${payload}|${await hmac(payload)}`;
}

export async function getSessionUser(): Promise<{ email: string; displayName: string } | null> {
  const raw = (await headers()).get("cookie")?.split(";").map(x => x.trim()).find(x => x.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  if (!raw) return null;
  const [email, expires, signature] = decodeURIComponent(raw).split("|");
  if (!email || !expires || !signature || Number(expires) <= Date.now() / 1000) return null;
  const expected = await hmac(`${email}|${expires}`);
  if (!expected || signature !== expected || !config().emails.includes(email)) return null;
  return { email, displayName: email.split("@")[0] };
}

export const sessionCookieName = COOKIE_NAME;
