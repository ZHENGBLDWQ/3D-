import { sessionCookieName } from "../../session-auth";

export async function GET(request: Request) {
  return new Response(null, { status: 303, headers: {
    Location: new URL("/", request.url).pathname,
    "Set-Cookie": `${sessionCookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  } });
}
