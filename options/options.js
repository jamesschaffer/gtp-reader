const keyEl = document.getElementById('openaiApiKey');
const modelEl = document.getElementById('model');
const savedEl = document.getElementById('saved');

(async () => {
  const { openaiApiKey, openaiModel } = await chrome.storage.local.get({ openaiApiKey: '', openaiModel: 'gpt-4o-mini' });
  keyEl.value = openaiApiKey || '';
  modelEl.value = openaiModel || 'gpt-4o-mini';
})();

document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.local.set({
    openaiApiKey: keyEl.value.trim(),
    openaiModel: modelEl.value
  });
  savedEl.style.display = 'inline';
  setTimeout(() => (savedEl.style.display = 'none'), 1500);
});
