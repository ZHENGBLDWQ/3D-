import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { getD1 } from "../db";

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
  const normalized = email.trim().toLowerCase();
  if (values.emails.includes(normalized) && !!values.password && password === values.password) return true;
  await ensurePasswordColumn();
  const member = await getD1().prepare("SELECT password_hash AS passwordHash,status FROM organization_members WHERE lower(email)=?").bind(normalized).first<{passwordHash:string|null;status:string}>();
  return !!member?.passwordHash && member.status !== "disabled" && await verifyPassword(password, member.passwordHash);
}

async function ensurePasswordColumn() {
  const columns = await getD1().prepare("PRAGMA table_info(organization_members)").all<{name:string}>();
  if (!columns.results.some(column => column.name === "password_hash")) {
    await getD1().prepare("ALTER TABLE organization_members ADD COLUMN password_hash TEXT").run();
  }
}

function hex(bytes: Uint8Array) { return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(""); }
function unhex(value: string) { return new Uint8Array(value.match(/.{2}/g)?.map(x => parseInt(x, 16)) || []); }

export async function hashPassword(password: string) {
  await ensurePasswordColumn();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const result = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 120000 }, key, 256));
  return `pbkdf2$120000$${hex(salt)}$${hex(result)}`;
}

async function verifyPassword(password: string, stored: string) {
  const [kind, rounds, salt, expected] = stored.split("$");
  if (kind !== "pbkdf2" || !rounds || !salt || !expected) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const result = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unhex(salt), iterations: Number(rounds) }, key, 256));
  return hex(result) === expected;
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
  if (!expected || signature !== expected) return null;
  return { email, displayName: email.split("@")[0] };
}

export const sessionCookieName = COOKIE_NAME;
