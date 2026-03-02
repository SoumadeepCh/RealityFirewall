/**
 * Reality Firewall Extension — Content Script
 *
 * Injected into every page. Responsibilities:
 * 1. Listen for messages from background (context menu results)
 * 2. Inject overlay badges on analyzed images/videos
 * 3. Optional auto-scan mode (off by default)
 */

const RF_ATTR = "data-rf-analyzed";
const RF_WRAPPER = "rf-wrapper";

// ---- Badge helpers ----

function getRiskClass(verdict, fakeProbability) {
  if (verdict === "inconclusive") return "rf-inconclusive";
  if (fakeProbability >= 0.65) return "rf-manipulated";
  if (fakeProbability >= 0.35) return "rf-suspicious";
  return "rf-authentic";
}

function getRiskEmoji(verdict, fakeProbability) {
  if (verdict === "inconclusive") return "◈";
  if (fakeProbability >= 0.65) return "✗";
  if (fakeProbability >= 0.35) return "⚠";
  return "✓";
}

function getRiskLabel(verdict, fakeProbability) {
  if (verdict === "inconclusive") return "Inconclusive";
  if (fakeProbability >= 0.65) return "Manipulated";
  if (fakeProbability >= 0.35) return "Suspicious";
  return "Authentic";
}

function createBadge(result) {
  const fakeP = result.fake_probability ?? 0;
  const verdict = result.verdict ?? "inconclusive";
  const cls = getRiskClass(verdict, fakeP);
  const emoji = getRiskEmoji(verdict, fakeP);
  const label = getRiskLabel(verdict, fakeP);

  const badge = document.createElement("div");
  badge.className = `rf-badge ${cls}`;
  badge.title = "Click to open full Reality Firewall analysis";
  badge.innerHTML = `<span>${emoji}</span> <span>${label}</span> <span style="opacity:0.7;font-size:10px">${Math.round(fakeP * 100)}%</span>`;

  // Tooltip
  const tooltip = document.createElement("div");
  tooltip.className = "rf-tooltip";
  tooltip.innerHTML = `
    <div class="rf-tooltip-title">Reality Firewall Analysis</div>
    <div class="rf-tooltip-row">
      <span class="rf-tooltip-label">Fake probability</span>
      <span class="rf-tooltip-value" style="color:${fakeP >= 0.65 ? '#ff4d6d' : fakeP >= 0.35 ? '#fbbf24' : '#06d6a0'}">${Math.round(fakeP * 100)}%</span>
    </div>
    <div class="rf-tooltip-row">
      <span class="rf-tooltip-label">Risk level</span>
      <span class="rf-tooltip-value">${result.risk_level ?? "—"}</span>
    </div>
    <div class="rf-tooltip-row">
      <span class="rf-tooltip-label">Risk score</span>
      <span class="rf-tooltip-value">${result.risk_score ?? "—"}/100</span>
    </div>
    ${result.manipulation_type ? `
    <div class="rf-tooltip-row">
      <span class="rf-tooltip-label">Type</span>
      <span class="rf-tooltip-value" style="color:#ff4d6d">${result.manipulation_type}</span>
    </div>` : ""}
    <div style="margin-top:8px;font-size:10px;color:#55556a;text-align:right">Click badge for full report</div>
  `;

  badge.addEventListener("click", () => {
    // Store result and open results page
    try {
      sessionStorage.setItem("rf_ext_result", JSON.stringify(result));
    } catch {}
    chrome.runtime.sendMessage({ type: "RF_OPEN_RESULTS", result });
  });

  return { badge, tooltip };
}

function createLoadingBadge() {
  const badge = document.createElement("div");
  badge.className = "rf-badge rf-loading";
  badge.innerHTML = `<span class="rf-pulse">◉</span> <span>Analyzing…</span>`;
  return badge;
}

function wrapElement(el) {
  // Already wrapped?
  if (el.parentElement?.classList.contains(RF_WRAPPER)) {
    return el.parentElement;
  }

  const wrapper = document.createElement("div");
  wrapper.className = RF_WRAPPER;
  // Copy dimensions approximately
  const cs = getComputedStyle(el);
  if (cs.display === "inline") {
    wrapper.style.display = "inline-block";
  }

  el.parentNode?.insertBefore(wrapper, el);
  wrapper.appendChild(el);
  return wrapper;
}

function injectBadge(mediaEl, result) {
  // Remove any existing badge
  const wrapper = wrapElement(mediaEl);
  const existingBadge = wrapper.querySelector(".rf-badge");
  existingBadge?.remove();
  const existingTooltip = wrapper.querySelector(".rf-tooltip");
  existingTooltip?.remove();

  const { badge, tooltip } = createBadge(result);
  wrapper.appendChild(badge);
  wrapper.appendChild(tooltip);
  mediaEl.setAttribute(RF_ATTR, "true");
}

function injectLoadingBadge(mediaEl) {
  const wrapper = wrapElement(mediaEl);
  const existing = wrapper.querySelector(".rf-badge");
  existing?.remove();
  const loading = createLoadingBadge();
  wrapper.appendChild(loading);
  return loading;
}

// ---- Find media element by src URL ----
function findMediaByUrl(url) {
  const all = document.querySelectorAll("img, video");
  for (const el of all) {
    const src = el.src || el.currentSrc;
    if (src === url || src.includes(url.split("/").pop())) return el;
  }
  return null;
}

// ---- Message listener from background ----
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "RF_STATUS" && msg.status === "loading") {
    const el = findMediaByUrl(msg.mediaUrl);
    if (el) injectLoadingBadge(el);
    return;
  }

  if (msg.type === "RF_RESULT") {
    const el = findMediaByUrl(msg.mediaUrl);
    if (el) injectBadge(el, msg.result);
    return;
  }

  if (msg.type === "RF_ERROR") {
    const el = findMediaByUrl(msg.mediaUrl);
    if (el) {
      const wrapper = wrapElement(el);
      const existing = wrapper.querySelector(".rf-badge");
      existing?.remove();
      const badge = document.createElement("div");
      badge.className = "rf-badge rf-inconclusive";
      badge.textContent = `⚠ Error: ${msg.error}`;
      wrapper.appendChild(badge);
    }
    return;
  }
});

// ---- Auto-scan (opt-in) ----
chrome.runtime.sendMessage({ type: "RF_GET_SETTINGS" }, (settings) => {
  if (!settings?.autoScan) return;

  // Throttle: max 5 per page load
  let count = 0;
  const MAX_AUTO = 5;

  const images = Array.from(document.querySelectorAll("img")).filter(
    (img) =>
      img.naturalWidth > 200 &&
      img.naturalHeight > 200 &&
      img.src &&
      !img.getAttribute(RF_ATTR)
  );

  for (const img of images) {
    if (count >= MAX_AUTO) break;
    count++;

    const loadingBadge = injectLoadingBadge(img);
    chrome.runtime.sendMessage(
      { type: "RF_ANALYZE_URL", mediaUrl: img.src },
      (result) => {
        loadingBadge.remove();
        if (result && !result.error) {
          injectBadge(img, result);
        }
      }
    );
  }
});
