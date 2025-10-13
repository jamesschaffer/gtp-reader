// Summary-only view.
// No ARTICLE rendering, no "Summary" headline—just the bullets.

const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const metaEl = document.getElementById("meta");

function setStatus(msg) { statusEl.textContent = msg; }

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "GTP_READER_ERROR") {
    console.error("[GTP-Reader] error:", msg.error);
    setStatus(msg.error || "Error");
    return;
  }
  if (msg?.type !== "GTP_READER_RESULTS") return;

  const { sourceUrl, summary } = msg.data || {};
  metaEl.textContent = sourceUrl ? new URL(sourceUrl).hostname : "";

  // Render bullets only (no heading)
  summaryEl.innerHTML = "";
  const bullets = (summary?.bullets || "").trim();
  if (bullets) {
    const ul = document.createElement("ul");
    bullets.split(/\n+/).forEach((line) => {
      const t = line.replace(/^[-*•]\s*/, "").trim();
      if (t) { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); }
    });
    summaryEl.appendChild(ul);
    setStatus("Done");
  } else {
    setStatus("No summary available.");
  }
});

// Handshake to background in case message was sent before we loaded
chrome.runtime.sendMessage({ type: "GTP_READER_READY" });