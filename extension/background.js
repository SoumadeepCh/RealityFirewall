/**
 * Reality Firewall Extension — Background Service Worker
 *
 * Responsibilities:
 * - Register context menu item "Analyze with Reality Firewall"
 * - Fetch image/video from URL or receive blob from content script
 * - POST to AI service /analyze
 * - Return result to content script via message passing
 */

const AI_SERVICE_URL = "http://localhost:8000";
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB (extension limit)
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minute in-extension cache

// In-memory result cache (tab lifetime)
const _cache = new Map(); // sha256-like key → { result, ts }

// ---- Context Menu ----
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "rf-analyze",
    title: "🔍 Analyze with Reality Firewall",
    contexts: ["image", "video"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "rf-analyze" || !tab?.id) return;

  const mediaUrl = info.srcUrl;
  if (!mediaUrl) return;

  // Notify content script that analysis is starting
  chrome.tabs.sendMessage(tab.id, {
    type: "RF_STATUS",
    mediaUrl,
    status: "loading",
  });

  try {
    const result = await analyzeUrl(mediaUrl);
    chrome.tabs.sendMessage(tab.id, {
      type: "RF_RESULT",
      mediaUrl,
      result,
    });
  } catch (err) {
    chrome.tabs.sendMessage(tab.id, {
      type: "RF_ERROR",
      mediaUrl,
      error: err.message || "Analysis failed",
    });
  }
});

// ---- Message from content script ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "RF_ANALYZE_URL") {
    analyzeUrl(msg.mediaUrl).then(sendResponse).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true; // keep channel open for async
  }

  if (msg.type === "RF_GET_SETTINGS") {
    chrome.storage.sync.get(
      { aiServiceUrl: AI_SERVICE_URL, autoScan: false },
      sendResponse
    );
    return true;
  }

  if (msg.type === "RF_CLEAR_CACHE") {
    _cache.clear();
    sendResponse({ ok: true });
  }
});

// ---- Core: analyze a media URL ----
async function analyzeUrl(mediaUrl) {
  // Cache check
  const cacheKey = mediaUrl;
  const cached = _cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.result;
  }

  // Get configured AI service URL from storage
  const { aiServiceUrl } = await chrome.storage.sync.get({
    aiServiceUrl: AI_SERVICE_URL,
  });

  // Fetch the media bytes
  let blob;
  try {
    const resp = await fetch(mediaUrl, { mode: "no-cors" });
    blob = await resp.blob();
  } catch {
    // Try with CORS proxy as fallback (works for data: URIs too)
    const resp = await fetch(mediaUrl);
    blob = await resp.blob();
  }

  if (blob.size > MAX_FILE_BYTES) {
    throw new Error(`File too large (${(blob.size / 1e6).toFixed(1)}MB, max 20MB)`);
  }

  // Build FormData
  const filename = mediaUrl.split("/").pop()?.split("?")[0] || "media";
  const file = new File([blob], filename, { type: blob.type });
  const form = new FormData();
  form.append("file", file);

  // POST to AI service
  const res = await fetch(`${aiServiceUrl}/analyze`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI service error ${res.status}: ${text}`);
  }

  const result = await res.json();

  // Store in cache
  _cache.set(cacheKey, { result, ts: Date.now() });

  return result;
}
