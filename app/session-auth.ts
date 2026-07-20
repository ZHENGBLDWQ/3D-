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
  const secret = await getSessionSecret();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

async function getSessionSecret() {
  const configured = config().secret;
  if (configured) return configured;
  const db = getD1();
  await db.prepare("CREATE TABLE IF NOT EXISTS app_secrets (name TEXT PRIMARY KEY,value TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  let row = await db.prepare("SELECT value FROM app_secrets WHERE name='session_secret'").first<{value:string}>();
  if (!row?.value) {
    const generated = hex(crypto.getRandomValues(new Uint8Array(32)));
    await db.prepare("INSERT OR IGNORE INTO app_secrets(name,value) VALUES('session_secret',?)").bind(generated).run();
    row = await db.prepare("SELECT value FROM app_secrets WHERE name='session_secret'").first<{value:string}>();
  }
  if (!row?.value) throw new Error("无法初始化会话密钥");
  return row.value;
}

export async function verifyAdminCredentials(email: string, password: string) {
  const values = config();
  const normalized = email.trim().toLowerCase();
  if (values.emails.includes(normalized) && !!values.password && password === values.password) return true;
  await ensurePasswordColumn();
  const member = await getD1().prepare("SELECT password_hash AS passwordHash,status FROM organization_members WHERE lower(email)=?").bind(normalized).first<{passwordHash:string|null;status:string}>();
  return !!member?.passwordHash && member.status !== "disabled" && await verifyPassword(password, member.passwordHash);
}

async function ensureAuthSchema() {
  const db = getD1();
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS organizations (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,slug TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS organization_members (id INTEGER PRIMARY KEY AUTOINCREMENT,organization_id INTEGER NOT NULL,email TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL DEFAULT '',role TEXT NOT NULL DEFAULT 'operator',status TEXT NOT NULL DEFAULT 'invited',printer_scope TEXT NOT NULL DEFAULT '[]',invited_by TEXT NOT NULL DEFAULT '',password_hash TEXT,last_login_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS auth_setup (id INTEGER PRIMARY KEY,owner_email TEXT NOT NULL,completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
  ]);
  const columns = await db.prepare("PRAGMA table_info(organization_members)").all<{name:string}>();
  if (!columns.results.some((column:{name:string}) => column.name === "password_hash")) {
    await db.prepare("ALTER TABLE organization_members ADD COLUMN password_hash TEXT").run();
  }
}

async function ensurePasswordColumn() { await ensureAuthSchema(); }

export async function needsInitialAdminSetup() {
  const values = config();
  if (values.emails.length > 0 && values.password) return false;
  await ensureAuthSchema();
  const row = await getD1().prepare("SELECT COUNT(*) AS count FROM organization_members WHERE password_hash IS NOT NULL AND password_hash<>''").first<{count:number}>();
  return Number(row?.count || 0) === 0;
}

export async function createInitialAdmin(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@") || password.length < 10) return false;
  if (!await needsInitialAdminSetup()) return false;
  const db = getD1();
  const claim = await db.prepare("INSERT OR IGNORE INTO auth_setup(id,owner_email) VALUES(1,?)").bind(normalized).run();
  if (!claim.meta.changes) return false;
  await db.prepare("INSERT OR IGNORE INTO organizations(name,slug) VALUES(?,?)").bind("LayerTrace 3D 打印工作室","layertrace").run();
  const organization = await db.prepare("SELECT id FROM organizations WHERE slug='layertrace'").first<{id:number}>();
  if (!organization) throw new Error("无法创建工作区");
  const passwordHash = await hashPassword(password);
  await db.prepare("INSERT INTO organization_members(organization_id,email,display_name,role,status,printer_scope,invited_by,password_hash) VALUES(?,?,?,?,?,'[]',?,?)")
    .bind(organization.id, normalized, normalized.split("@")[0], "owner", "active", normalized, passwordHash).run();
  return true;
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
