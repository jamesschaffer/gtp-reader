// sw.js — Chrome Extension Service Worker (Manifest V3)

// Create and persist a per-install token so your proxy can identify this install.
async function getInstallToken() {
  const { installToken } = await chrome.storage.local.get("installToken");
  if (installToken) return installToken;

  // Generate a random UUID for this install
  const token = crypto.randomUUID();
  await chrome.storage.local.set({ installToken: token });
  return token;
}

// On first install (and on update), ensure we have a token and clean up any old user API key.
chrome.runtime.onInstalled.addListener(async () => {
  try {
    await getInstallToken();

    // Migrate away from any old local user-provided API key if it exists.
    const { openaiApiKey } = await chrome.storage.local.get("openaiApiKey");
    if (openaiApiKey) {
      await chrome.storage.local.remove("openaiApiKey");
      await chrome.storage.local.set({ migratedFromUserKey: true });
    }
  } catch (e) {
    // Non-fatal: store an error flag for debugging if needed.
    await chrome.storage.local.set({ installBootstrapError: String(e?.message || e) });
  }
});

// (Optional) Respond to a ping so popup/content can verify the worker is alive.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "ping") {
    sendResponse({ ok: true, ts: Date.now() });
    return true;
  }
});