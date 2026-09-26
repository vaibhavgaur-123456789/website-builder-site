// Same-origin proxy for Supabase Auth + REST.
// Some Indian ISPs block *.supabase.co at the DNS level, so the browser talks only to
// this site (/sb/...) and Cloudflare forwards the request to Supabase.
const SUPABASE_URL = "https://ioekjezivvesclpgfhbj.supabase.co";

// Only the endpoints the website uses are forwarded.
const ALLOWED = /^(auth\/v1\/(signup|token|logout|recover|user|verify|settings)|rest\/v1\/(projects|project_updates|contact_messages|profiles))$/;
const FORWARD_HEADERS = ["apikey", "authorization", "content-type", "prefer", "accept"];

export async function onRequest({ request, params }) {
  const path = Array.isArray(params.path) ? params.path.join("/") : String(params.path || "");
  if (!ALLOWED.test(path)) return new Response("Not found", { status: 404 });
  if (!["GET", "POST", "PUT", "OPTIONS"].includes(request.method)) {
    return new Response("Method not allowed", { status: 405 });
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });

  const url = new URL(request.url);
  const headers = new Headers();
  for (const name of FORWARD_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) headers.set("x-forwarded-for", ip);

  const upstream = await fetch(SUPABASE_URL + "/" + path + url.search, {
    method: request.method,
    headers,
    body: request.method === "GET" ? undefined : await request.arrayBuffer(),
    redirect: "manual"
  });

  const out = new Headers(upstream.headers);
  out.delete("set-cookie");
  out.set("cache-control", "no-store");
  // Email links (auth/v1/verify) redirect back to this site with the session in the URL hash
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
