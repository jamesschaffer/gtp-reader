export interface Env {
  OPENAI_API_KEY: string;
  ALLOWED_EXT_IDS?: string;
  RATE_LIMIT_KV?: KVNamespace;
  DAILY_REQUEST_LIMIT?: string;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Install-Token,X-Ext-Id",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const DEFAULT_DAILY_LIMIT = 20;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

    const extId = req.headers.get("X-Ext-Id") || "";
    const installToken = req.headers.get("X-Install-Token") || "";
    if (!installToken) return new Response("Missing install token", { status: 401, headers: CORS });

    // Rate limiting per install token
    if (env.RATE_LIMIT_KV) {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const rateLimitKey = `rate:${installToken}:${today}`;
      const dailyLimit = parseInt(env.DAILY_REQUEST_LIMIT || String(DEFAULT_DAILY_LIMIT));

      const currentCount = await env.RATE_LIMIT_KV.get(rateLimitKey);
      const count = currentCount ? parseInt(currentCount) : 0;

      if (count >= dailyLimit) {
        return new Response(
          JSON.stringify({
            error: "Daily request limit exceeded. Try again tomorrow.",
            limit: dailyLimit,
            resetDate: today
          }),
          {
            status: 429,
            headers: { ...CORS, "Content-Type": "application/json" }
          }
        );
      }

      // Increment counter - expire after 48 hours to clean up old keys
      await env.RATE_LIMIT_KV.put(rateLimitKey, String(count + 1), { expirationTtl: 172800 });
    }

    // Optional allowlist (only enforced if configured)
    const allow = (env.ALLOWED_EXT_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
    if (allow.length && !allow.includes(extId)) {
      return new Response("Extension not allowed", { status: 403, headers: CORS });
    }

    let body: any;
    try { body = await req.json(); } catch { return new Response("Bad JSON", { status: 400, headers: CORS }); }

    // Health probe
    if (body?.health) {
      return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Expect: { messages: [...], model?, temperature?, max_tokens? }
    const model = body.model || "gpt-4o-mini";
    const messages = body.messages || [];
    const temperature = body.temperature ?? 0.2;
    const max_tokens = body.max_tokens ?? 800;

    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens, stream: true }),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text();
      return new Response(text || "Upstream error", { status: 502, headers: CORS });
    }

    // Stream passthrough
    const { readable, writable } = new TransformStream();
    upstream.body.pipeTo(writable).catch(() => { /* ignore */ });

    return new Response(readable, {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  }
} satisfies ExportedHandler<Env>;
