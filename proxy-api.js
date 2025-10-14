// proxy-api.js — minimal client for your Cloudflare Worker
const PROXY_URL = "https://gtp-reader-ai-proxy.jamesschaffer.workers.dev";

/**
 * Call the proxy and stream back text chunks.
 * Usage:
 *   const stream = await streamChat({ messages:[{role:'user', content:'Hi'}] });
 *   for await (const chunk of stream) { ...append chunk... }
 */
export async function streamChat({ messages, model = "gpt-4o-mini", temperature = 0.2, max_tokens = 800 }) {
  // Ensure we have the per-install token created by sw.js
  const { installToken } = await chrome.storage.local.get("installToken");
  const token = installToken || "dev-token";

  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Install-Token": token,
      "X-Ext-Id": chrome.runtime.id
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens })
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Proxy error ${res.status}: ${text || "no body"}`);
  }

  // Stream reader
  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  return {
    async *[Symbol.asyncIterator]() {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        yield decoder.decode(value, { stream: true });
      }
    }
  };
}