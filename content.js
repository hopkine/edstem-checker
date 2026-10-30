// ---------- ARCHIVE STORAGE ----------

/** In-memory cache so hide/re-inject works before async storage callbacks (EdStem re-renders often). */
let archiveCache = {};
let pinnedCache = {};
let pinnedOrderSnapshot = "";

function refreshStorageCache(done) {
  chrome.storage.local.get(["archive", "pinnedUsers"], (res) => {
    const raw = res.archive || {};
    const normalized = normalizeArchive(raw);
    archiveCache = normalized;
    pinnedCache = res.pinnedUsers || {};
    pinnedOrderSnapshot = "";

    if (Object.keys(raw).length !== Object.keys(normalized).length) {
      chrome.storage.local.set({ archive: normalized });
    }

    done?.();
  });
}

/** URLs being archived before chrome.storage.local.set finishes (avoids a race with injectButtons). */
const pendingArchiveIds = new Set();

/** Serializes read-modify-write on `archive` so rapid E-presses cannot drop entries. */
let archiveWriteChain = Promise.resolve();

function enqueueArchiveWrite(mutator) {
  archiveWriteChain = archiveWriteChain.then(
    () =>
      new Promise((resolve, reject) => {
        chrome.storage.local.get(["archive"], (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          const archive = res.archive || {};
          try {
            mutator(archive);
          } catch (e) {
            reject(e);
            return;
          }
          const normalized = normalizeArchive(archive);
          chrome.storage.local.set({ archive: normalized }, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            archiveCache = normalized;
            resolve();
          });
        });
      })
  );
  return archiveWriteChain;
}

function isPostArchivedOrPending(archive, canonicalId) {
  if (!canonicalId) return false;
  if (pendingArchiveIds.has(canonicalId)) return true;
  return !!normalizeArchive(archive)[canonicalId];
}

function postMatchesArchive(post) {
  const ids = new Set();
  const primary = getPostData(post).id;
  if (primary) ids.add(primary);
  post.querySelectorAll("a[href]").forEach((a) => {
    const id = canonicalPostId(a.getAttribute("href"));
    if (id) ids.add(id);
  });
  for (const id of ids) {
    if (isPostArchivedOrPending(archiveCache, id)) return true;
  }
  return false;
}

function getFeedPostData(post) {
  const titleEl = post.querySelector(".dft-title");
  const titleLink =
    titleEl?.closest("a[href]") ||
    post.querySelector('a[href*="/discuss"]') ||
    post.querySelector("a[href]");
  const href = titleLink?.getAttribute("href") || "";
  const id = canonicalPostId(href);
  const foot = post.querySelector(".dft-foot");

  const counts = [];
  foot?.querySelectorAll(".icon.dft-count-icon").forEach((iconEl) => {
    const countEl = iconEl.nextElementSibling;
    if (!countEl?.classList.contains("dft-count")) return;
    counts.push({
      text: countEl.textContent.trim(),
      active: countEl.classList.contains("active"),
      iconSvg: iconEl.innerHTML
    });
  });

  const typeIcon = post.querySelector(".icon.dft-type-icon");

  return {
    id,
    title: titleEl?.innerText?.trim() || "Untitled",
    url: href.startsWith("http") ? href : `https://edstem.org${href}`,
    header: post.querySelector(".dft-header")?.innerText?.trim() || "",
    user: post.querySelector(".dft-user")?.innerText?.trim() || "",
    userRole: post.querySelector(".dft-user-role")?.innerText?.trim() || "",
    date: post.querySelector(".dft-date")?.innerText?.trim() || "",
    category: post.querySelector(".dft-category")?.innerText?.trim() || "",
    typeIconSvg: typeIcon?.innerHTML || "",
    counts
  };
}

/** Open thread view (`.discuss-thread` + `.disthrb-*`), not feed rows. */
function getThreadDetailData(thread) {
  const pageId = canonicalPostId(location.pathname + location.search);
  const link =
    thread.querySelector('a.disthrb-number[href*="/discuss"]') ||
    thread.querySelector('a[href*="/discuss"]');
  const href = link?.getAttribute("href") || "";
  const id = pageId || canonicalPostId(href);

  return {
    id,
    title: thread.querySelector(".disthrb-title")?.innerText?.trim() || "Untitled",
    url: location.href.split("#")[0],
    header: "",
    user: thread.querySelector(".disthrb-user-name")?.innerText?.trim() || "",
    userRole: thread.querySelector(".disthrb-role")?.innerText?.trim() || "",
    date: thread.querySelector(".disthrb-date")?.innerText?.trim() || "",
    category: thread.querySelector(".disthrb-category")?.innerText?.trim() || "",
    typeIconSvg: "",
    counts: []
  };
}

function getPostData(post) {
  return getFeedPostData(post);
}

function getArchiveData(el) {
  if (el.classList.contains("discuss-feed-thread")) return getFeedPostData(el);
  if (el.classList.contains("discuss-thread")) return getThreadDetailData(el);
  return null;
}

function isThreadDetail(el) {
  return (
    el?.classList?.contains("discuss-thread") &&
    !el.classList.contains("discuss-feed-thread")
  );
}

/** Prefer pinning by author; fallback to thread id when no profile link in row. */
function getUserPinKey(post) {
  const links = post.querySelectorAll("a[href]");
  for (const a of links) {
    const href = a.getAttribute("href") || "";
    const m = href.match(
      /\/(?:us\/)?(?:users|user|profiles)\/(\d+)/i
    );
    if (m) return `user:${m[1]}`;
  }
  const withData = post.querySelector("[data-user-id]");
  if (withData) {
    const id = withData.getAttribute("data-user-id");
    if (id) return `user:${id}`;
  }
  return null;
}

function getPinKeyForThread(post) {
  const userKey = getUserPinKey(post);
  if (userKey) return userKey;
  const d = getPostData(post);
  return d.id ? `thread:${d.id}` : null;
}

function isPinnedEntry(pinnedMap, key) {
  return !!(key && pinnedMap && pinnedMap[key]);
}

// ---------- EXTENSION PINS (context menu; rows move into top dlr-list section) ----------

let pinnedWriteChain = Promise.resolve();

function enqueuePinnedWrite(mutator) {
  pinnedWriteChain = pinnedWriteChain.then(
    () =>
      new Promise((resolve, reject) => {
        chrome.storage.local.get(["pinnedUsers"], (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          const pinned = res.pinnedUsers || {};
          try {
            mutator(pinned);
          } catch (e) {
            reject(e);
            return;
          }
          chrome.storage.local.set({ pinnedUsers: pinned }, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve();
          });
        });
      })
  );
  return pinnedWriteChain;
}

function togglePinnedForKey(key) {
  if (!key) return Promise.resolve();
  return enqueuePinnedWrite((pinned) => {
    if (pinned[key]) delete pinned[key];
    else pinned[key] = Date.now();
  });
}

function applyExtensionPinClass(thread, pinnedMap) {
  const key = getPinKeyForThread(thread);
  const on = key && isPinnedEntry(pinnedMap, key);
  thread.classList.toggle("ed-ext-user-pinned", !!on);
}

const EXT_PIN_BADGE_ATTR = "data-ed-ext-pin-badge";

/** EdStem staff pin in `.dft-body` — not our synthetic badge. */
function hasNativeEdstemPin(thread) {
  for (const el of thread.querySelectorAll(".icon-pin.pinned, .dft-badge.pinned")) {
    if (!el.hasAttribute(EXT_PIN_BADGE_ATTR)) return true;
  }
  return false;
}

/** Same DOM as instructor pins: `span.icon.icon-pin.dft-badge.pinned` + `svg`; green via CSS. */
function getNativePinSvgInnerHTML() {
  const ref = document.querySelector(
    `.discuss-feed-thread .dft-body .icon-pin.pinned:not([${EXT_PIN_BADGE_ATTR}]) svg`
  );
  if (ref) return ref.innerHTML;
  return '<path fill="currentColor" d="M16 12V4h-2V2h6v2h-2v8l-4 4v-4l-4-4V4H8V2h4v2H8v8H4l-4-4V4H8V2h4v2H8v8h4l-4 4v4l4-4h4V4z"/>';
}

function syncSyntheticPinBadge(thread, pinnedMap) {
  const body = thread.querySelector(".dft-body");
  if (!body) return;

  const key = getPinKeyForThread(thread);
  const on = key && isPinnedEntry(pinnedMap, key);
  let synth = body.querySelector(`[${EXT_PIN_BADGE_ATTR}]`);

  if (!on) {
    if (synth) synth.remove();
    return;
  }

  if (hasNativeEdstemPin(thread)) {
    if (synth) synth.remove();
    return;
  }

  if (!synth) {
    synth = document.createElement("span");
    synth.setAttribute(EXT_PIN_BADGE_ATTR, "1");
    synth.className = "icon icon-pin dft-badge pinned";
    synth.setAttribute("aria-hidden", "true");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("width", "11");
    svg.setAttribute("height", "11");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "currentColor");
    svg.innerHTML = getNativePinSvgInnerHTML();
    synth.appendChild(svg);
    body.appendChild(synth);
  } else {
    synth.className = "icon icon-pin dft-badge pinned";
    if (synth.parentElement === body) {
      body.appendChild(synth);
    }
  }
}

function getDlrListRoot() {
  return (
    document.querySelector(".discuss-list-view.discuss-thread-list.dlr-list") ||
    document.querySelector(".discuss-thread-list.dlr-list")
  );
}

/** First column in dlr-list (same block as staff-pinned “Slido Recap”, etc.). */
function getTopPinnedSectionHost() {
  const root = getDlrListRoot();
  if (!root?.firstElementChild) return null;
  const first = root.firstElementChild;
  return (
    first.querySelector(".dlv-item")?.parentElement ||
    first.querySelector(":scope > div") ||
    first
  );
}

/** Second column / main feed — threads return here when extension-unpinned (unless native pin). */
function getMainFeedHost() {
  const root = getDlrListRoot();
  if (!root || root.children.length < 2) return null;
  const second = root.children[1];
  return (
    second.querySelector(".dlv-item")?.parentElement ||
    second.querySelector(":scope > div") ||
    second
  );
}

function reorderPinnedThreadRows(pinnedMap) {
  const topHost = getTopPinnedSectionHost();
  const mainHost = getMainFeedHost();
  if (!topHost) return;

  const extPinnedRows = [];

  document.querySelectorAll(".discuss-feed-thread").forEach((thread) => {
    if (thread.classList.contains("ed-archived-hidden")) return;
    const key = getPinKeyForThread(thread);
    const item = thread.closest(".dlv-item");
    if (!item || !key) return;

    if (isPinnedEntry(pinnedMap, key)) {
      extPinnedRows.push({
        item,
        t: pinnedMap[key] || 0
      });
    } else if (
      mainHost &&
      topHost.contains(item) &&
      !hasNativeEdstemPin(thread)
    ) {
      mainHost.appendChild(item);
    }
  });

  extPinnedRows.sort((a, b) => a.t - b.t);
  extPinnedRows.forEach(({ item }) => {
    topHost.appendChild(item);
  });
}

function syncExtensionPinsState() {
  chrome.storage.local.get(["pinnedUsers"], (res) => {
    const pinned = res.pinnedUsers || {};
    document.querySelectorAll(".discuss-feed-thread").forEach((thread) => {
      applyExtensionPinClass(thread, pinned);
      syncSyntheticPinBadge(thread, pinned);
    });
    reorderPinnedThreadRows(pinned);
  });
}

function getNextVisiblePost(afterPost) {
  const all = [...document.querySelectorAll(".discuss-feed-thread")];
  const i = all.indexOf(afterPost);
  if (i === -1) return null;
  for (let j = i + 1; j < all.length; j++) {
    const p = all[j];
    if (p.classList.contains("ed-archived-hidden")) continue;
    const d = getPostData(p);
    if (d.id && pendingArchiveIds.has(d.id)) continue;
    return p;
  }
  return null;
}

/** Visual selection only — avoid mutating aria-selected (framework may re-render and drop our archive classes). */
function syncDiscussListSelection(postEl) {
  const item = postEl.closest(".dlv-item");
  if (!item) return;

  const list = item.closest(".discuss-list-view");
  const peers = list
    ? list.querySelectorAll(".dlv-item.ed-ext-feed-selected")
    : item.parentElement?.querySelectorAll(
        ":scope > .dlv-item.ed-ext-feed-selected"
      );

  peers?.forEach((el) => el.classList.remove("ed-ext-feed-selected"));
  item.classList.add("ed-ext-feed-selected");
}

function focusNavigateToPost(postEl) {
  syncDiscussListSelection(postEl);

  const link =
    postEl.querySelector(".dft-title a[href]") ||
    postEl.querySelector('a[href*="/discuss"]') ||
    postEl.querySelector("a[href]");
  const target =
    link || postEl.querySelector(".ed-archive-btn") || postEl.querySelector("button");

  if (target?.focus) {
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest", behavior: "smooth" });
  } else {
    postEl.setAttribute("tabindex", "-1");
    postEl.focus({ preventScroll: true });
    postEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function navigateBackFromArchivedThread() {
  if (history.length > 1) {
    history.back();
    return;
  }
  const path = location.pathname;
  const discussIdx = path.indexOf("/discuss");
  if (discussIdx > 0) {
    location.assign(path.slice(0, discussIdx + "/discuss".length));
  }
}

function persistArchive(data) {
  pendingArchiveIds.add(data.id);
  archiveCache = upsertArchiveEntry(archiveCache, data);

  return enqueueArchiveWrite((archive) => {
    const next = upsertArchiveEntry(archive, data);
    for (const k of Object.keys(archive)) delete archive[k];
    Object.assign(archive, next);
  })
    .then(() => {
      pendingArchiveIds.delete(data.id);
    })
    .catch(() => {
      pendingArchiveIds.delete(data.id);
      archiveCache = removeArchiveEntry(archiveCache, data.id);
      scheduleInjectButtons();
    });
}

function archivePost(post) {
  const data = getArchiveData(post);
  if (!data?.id) return;
  if (
    post.classList.contains("ed-archived-hidden") ||
    post.classList.contains("ed-archiving") ||
    isPostArchivedOrPending(archiveCache, data.id)
  ) {
    return;
  }

  const fromDetail = isThreadDetail(post);
  const nextPost = fromDetail ? null : getNextVisiblePost(post);

  persistArchive(data);

  post.querySelector(".ed-archive-btn, .ed-archive-detail-btn")?.remove();

  if (fromDetail) {
    navigateBackFromArchivedThread();
    return;
  }

  post.classList.add("ed-archiving");

  setTimeout(() => {
    post.classList.remove("ed-archiving");
    post.classList.add("ed-archived-hidden");
  }, 300);

  if (nextPost) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => focusNavigateToPost(nextPost));
    });
  }
}

// ---------- KEYBOARD: E to archive ----------

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable || !!el.closest("[contenteditable='true']");
}

function findOpenThreadDetail() {
  return document.querySelector(
    ".discuss-thread:not(.discuss-feed-thread):not(.dissho-answer):has(.disthrb-head-end)"
  );
}

function findPostForArchiveShortcut() {
  const ae = document.activeElement;
  if (!isTypingTarget(ae)) {
    const feed = ae?.closest(".discuss-feed-thread");
    if (feed) return feed;
    const detail = ae?.closest(".discuss-thread");
    if (detail && isThreadDetail(detail)) return detail;
  }

  const selected = document.querySelector(
    ".dlv-item.ed-ext-feed-selected .discuss-feed-thread"
  );
  if (selected) return selected;

  const openThread = findOpenThreadDetail();
  if (openThread) {
    const id = getThreadDetailData(openThread).id;
    if (id && !isPostArchivedOrPending(archiveCache, id)) return openThread;
  }

  return null;
}

document.addEventListener("keydown", (e) => {
  if (e.key !== "e" && e.key !== "E") return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (isTypingTarget(e.target)) return;

  const post = findPostForArchiveShortcut();
  if (!post || post.classList.contains("ed-archived-hidden")) return;

  e.preventDefault();
  archivePost(post);
});

/** Thread under cursor for EdStem’s native discuss context menu (Open in New Tab, …). */
let lastDiscussContextThread = null;

document.addEventListener(
  "contextmenu",
  (e) => {
    const thread = e.target.closest(".discuss-feed-thread");
    if (thread) {
      lastDiscussContextThread = thread;
    } else if (!e.target.closest(".popup")) {
      lastDiscussContextThread = null;
    }
  },
  true
);

function injectDiscussContextMenuPinRow(popup) {
  if (
    !popup?.classList?.contains("popup-kind-plain") ||
    popup.querySelector(".ed-ext-context-pin-row")
  ) {
    return;
  }
  const table = popup.querySelector("table");
  if (!table) return;
  const host = table.querySelector("tbody") || table;
  const refRow = host.querySelector("tr");
  if (!refRow) return;
  const menuText = popup.textContent || "";
  if (!/open in new tab/i.test(menuText) && !/copy link/i.test(menuText)) {
    return;
  }

  const thread = lastDiscussContextThread;
  if (!thread || !document.contains(thread)) return;
  const key = getPinKeyForThread(thread);
  if (!key) return;

  chrome.storage.local.get(["pinnedUsers"], (res) => {
    if (!document.contains(popup)) return;
    if (popup.querySelector(".ed-ext-context-pin-row")) return;

    const pinned = res.pinnedUsers || {};
    const isOn = isPinnedEntry(pinned, key);
    const label = isOn ? "Unpin (extension)" : "Pin (extension)";

    const newRow = refRow.cloneNode(true);
    newRow.removeAttribute("id");
    newRow.classList.add("ed-ext-context-pin-row");
    newRow.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));

    const refTds = refRow.querySelectorAll("td");
    const newTds = newRow.querySelectorAll("td");
    let setLabel = false;
    refTds.forEach((refTd, i) => {
      const td = newTds[i];
      if (!td) return;
      if (/open in new tab/i.test(refTd.textContent || "")) {
        td.textContent = label;
        setLabel = true;
      }
    });
    if (!setLabel && newTds.length) {
      newTds[newTds.length - 1].textContent = label;
    }

    newRow.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePinnedForKey(key).then(() => {
        syncExtensionPinsState();
        popup.remove();
        setTimeout(() => {
          chrome.storage.local.get(["pinnedUsers"], (res) => {
            reorderPinnedThreadRows(res.pinnedUsers || {});
          });
        }, 100);
      });
    });

    host.appendChild(newRow);
  });
}

const discussMenuObserver = new MutationObserver(() => {
  document.querySelectorAll(".popup.popup-kind-plain").forEach((popup) => {
    injectDiscussContextMenuPinRow(popup);
  });
});

// ---------- BUTTON INJECTION ----------

const ARCHIVE_ICON_SVG =
  '<svg role="img" aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z"/></svg>';

function ensureArchiveButton(post) {
  const host = post.querySelector(".dft-foot") || post.querySelector(".dft-body");
  if (!host || host.querySelector(".ed-archive-btn")) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ed-archive-btn";
  btn.setAttribute("aria-label", "Archive");
  btn.innerHTML = `<span class="icon ed-archive-icon" aria-hidden="true">${ARCHIVE_ICON_SVG}</span>`;
  host.appendChild(btn);
}

function createDetailArchiveButton() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "disthrb-head-action ed-archive-detail-btn";
  btn.setAttribute("aria-label", "Archive");
  btn.innerHTML = `
    <span class="icon disthrb-head-action-icon ed-archive-icon" aria-hidden="true">${ARCHIVE_ICON_SVG}</span>
    <span class="disthrb-head-action-label">Archive</span>
  `;
  return btn;
}

function injectThreadDetailArchive() {
  document
    .querySelectorAll(
      ".discuss-thread:not(.discuss-feed-thread):not(.dissho-answer):has(.disthrb-head-end)"
    )
    .forEach((thread) => {
      const headEnd = thread.querySelector(".disthrb-head-end");
      if (!headEnd) return;

      const data = getThreadDetailData(thread);
      if (!data.id) return;

      if (isPostArchivedOrPending(archiveCache, data.id)) {
        headEnd.querySelector(".ed-archive-detail-btn")?.remove();
        return;
      }

      if (headEnd.querySelector(".ed-archive-detail-btn")) return;

      headEnd.insertBefore(createDetailArchiveButton(), headEnd.firstChild);
    });
}

function maybeReorderPinnedRows() {
  const snapshot = JSON.stringify(pinnedCache);
  if (snapshot === pinnedOrderSnapshot) return;
  pinnedOrderSnapshot = snapshot;
  reorderPinnedThreadRows(pinnedCache);
}

function injectButtons() {
  const posts = document.querySelectorAll(".discuss-feed-thread");

  posts.forEach((post) => {
    if (postMatchesArchive(post)) {
      post.classList.add("ed-archived-hidden");
      post.classList.remove("ed-archiving");
      post.querySelector(".ed-archive-btn")?.remove();
      return;
    }

    const data = getPostData(post);
    if (!data.id) return;

    post.classList.remove("ed-archived-hidden", "ed-archiving");

    if (!post.querySelector(".dft-body")) return;

    applyExtensionPinClass(post, pinnedCache);
    syncSyntheticPinBadge(post, pinnedCache);
    ensureArchiveButton(post);
  });

  injectThreadDetailArchive();
  maybeReorderPinnedRows();
}

document.addEventListener(
  "click",
  (e) => {
    const btn = e.target.closest(".ed-archive-btn, .ed-archive-detail-btn");
    if (!btn) return;

    const post =
      btn.closest(".discuss-feed-thread") || btn.closest(".discuss-thread");
    if (!post || post.classList.contains("ed-archived-hidden")) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    archivePost(post);
  },
  true
);

let injectButtonsTimer = null;
function scheduleInjectButtons() {
  if (injectButtonsTimer !== null) return;
  injectButtonsTimer = setTimeout(() => {
    injectButtonsTimer = null;
    injectButtons();
  }, 80);
}

// ---------- INIT ----------

const observer = new MutationObserver(() => {
  scheduleInjectButtons();
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.archive) {
    archiveCache = normalizeArchive(changes.archive.newValue || {});
  }
  if (changes.pinnedUsers) {
    pinnedCache = changes.pinnedUsers.newValue || {};
    pinnedOrderSnapshot = "";
  }
  if (changes.archive || changes.pinnedUsers) {
    scheduleInjectButtons();
  }
});

refreshStorageCache(injectButtons);

discussMenuObserver.observe(document.body, { childList: true, subtree: true });