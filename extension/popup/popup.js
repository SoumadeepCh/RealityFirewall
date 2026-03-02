/**
 * Reality Firewall Extension — Popup Script
 */

const DEFAULT_AI_URL = "http://localhost:8000";

// ---- Load settings ----
chrome.storage.sync.get(
  { aiServiceUrl: DEFAULT_AI_URL, autoScan: false },
  (settings) => {
    document.getElementById("service-url").value = settings.aiServiceUrl;
    document.getElementById("auto-scan").checked = settings.autoScan;
  }
);

// ---- Check service health ----
async function checkHealth(aiUrl) {
  const dot = document.getElementById("status-dot");
  try {
    const res = await fetch(`${aiUrl}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      dot.classList.remove("offline");
      return data;
    }
  } catch {}
  dot.classList.add("offline");
  return null;
}

// ---- Load stats ----
async function loadStats(aiUrl) {
  try {
    const res = await fetch(`${aiUrl}/stats`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return;
    const stats = await res.json();
    document.getElementById("stat-total").textContent =
      (stats.total_analyses ?? "—").toLocaleString();
    document.getElementById("stat-threats").textContent =
      (stats.threats_detected ?? "—").toLocaleString();
  } catch {}
}

// ---- Init ----
chrome.storage.sync.get({ aiServiceUrl: DEFAULT_AI_URL }, async (s) => {
  const aiUrl = s.aiServiceUrl;
  checkHealth(aiUrl);
  loadStats(aiUrl);
});

// ---- Save settings ----
document.getElementById("save-btn").addEventListener("click", () => {
  const aiUrl = document.getElementById("service-url").value.trim() || DEFAULT_AI_URL;
  const autoScan = document.getElementById("auto-scan").checked;

  chrome.storage.sync.set({ aiServiceUrl: aiUrl, autoScan }, () => {
    const status = document.getElementById("save-status");
    status.textContent = "✓ Settings saved";
    status.style.opacity = "1";
    setTimeout(() => { status.style.opacity = "0"; }, 2000);
    checkHealth(aiUrl);
    loadStats(aiUrl);
  });
});

// ---- Open dashboard ----
document.getElementById("open-dashboard").addEventListener("click", () => {
  chrome.storage.sync.get({ aiServiceUrl: DEFAULT_AI_URL }, (s) => {
    // Open the Next.js frontend dashboard
    chrome.tabs.create({ url: "http://localhost:3000/dashboard" });
  });
});

// ---- Retrain model ----
document.getElementById("retrain-btn").addEventListener("click", async () => {
  const btn = document.getElementById("retrain-btn");
  const origText = btn.textContent;
  btn.textContent = "Retraining…";
  btn.disabled = true;

  chrome.storage.sync.get({ aiServiceUrl: DEFAULT_AI_URL }, async (s) => {
    try {
      const res = await fetch(`${s.aiServiceUrl}/retrain?n_samples=5000`, {
        method: "POST",
        signal: AbortSignal.timeout(60000),
      });
      const data = await res.json();
      btn.textContent = `Done! AUC: ${data.metrics?.auc ?? "?"}`;
    } catch (err) {
      btn.textContent = "Retrain failed";
    } finally {
      setTimeout(() => {
        btn.textContent = origText;
        btn.disabled = false;
      }, 3000);
    }
  });
});
