// popup.js (module) – runs in the popup
import { streamChat } from "./proxy-api.js";

const btn = document.getElementById("test");
const out = document.getElementById("output");

btn.addEventListener("click", async () => {
  out.textContent = "Requesting…";

  try {
    const messages = [
      { role: "system", content: "You respond very briefly." },
      { role: "user", content: "Say hello in one short sentence." }
    ];

    const stream = await streamChat({ messages });

    out.textContent = ""; // clear once streaming starts
    for await (const chunk of stream) {
      out.textContent += chunk;
    }
  } catch (err) {
    out.textContent = `Error: ${err?.message || err}`;
  }
});