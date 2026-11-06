// DOM helpers for the current Ed Discussion feed.
// Loaded as a classic script after archive-utils.js in the extension,
// and as a CommonJS module from the test runner.

const canonicalPostIdFn =
  typeof canonicalPostId === "function"
    ? canonicalPostId
    : require("./archive-utils.js").canonicalPostId;

const FEED_THREAD = ".discuss-feed-thread:not(.arch-thread)";

const ARCHIVE_ICON_SVG =
  '<svg role="img" aria-hidden="true" width="13" height="13" viewBox="0 0 24 24"><path fill="currentColor" d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z"/></svg>';

const PIN_ICON_SVG =
  '<svg role="img" aria-hidden="true" width="11" height="11" viewBox="0 0 24 24"><path fill="currentColor" d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6h2v-6h5v-2l-2-2z"/></svg>';

const SVG_TAGS = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "rect",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "title"
]);

const SVG_ATTRS = new Set([
  "viewbox",
  "width",
  "height",
  "fill",
  "stroke",
  "stroke-width",
  "d",
  "cx",
  "cy",
  "r",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "points",
  "role",
  "aria-hidden",
  "xmlns",
  "opacity",
  "fill-rule",
  "clip-rule",
  "rx",
  "ry"
]);

function clipText(value, max) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return text.slice(0, max);
}

function sanitizeIconSvg(raw) {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed || typeof DOMParser === "undefined") return "";
  const wrapped = /^<svg[\s>]/i.test(trimmed)
    ? trimmed
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${trimmed}</svg>`;
  let doc;
  try {
    doc = new DOMParser().parseFromString(wrapped, "image/svg+xml");
  } catch {
    return "";
  }
  if (!doc || doc.querySelector("parsererror")) return "";
  const svg = doc.querySelector("svg");
  if (!svg) return "";
  pruneSvg(svg);
  const html = svg.outerHTML || "";
  return html.length > 4000 ? "" : html;
}

function pruneSvg(node) {
  for (const child of [...node.children]) {
    if (!SVG_TAGS.has(child.tagName.toLowerCase())) {
      child.remove();
      continue;
    }
    pruneSvg(child);
  }
  for (const attr of [...node.attributes]) {
    const name = attr.name.toLowerCase();
    if (
      name.startsWith("on") ||
      name === "href" ||
      name.endsWith(":href") ||
      name === "style"
    ) {
      node.removeAttribute(attr.name);
      continue;
    }
    if (!SVG_ATTRS.has(name)) node.removeAttribute(attr.name);
  }
}

function absoluteEdUrl(href) {
  if (!href) return "";
  try {
    const url = new URL(href, "https://edstem.org");
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function discussionIndexPath(pathname) {
  if (!pathname) return "";
  const marker = "/discussion";
  const idx = pathname.indexOf(marker);
  if (idx === -1) return "";
  return pathname.slice(0, idx + marker.length);
}

function numericThreadIdFromRow(post) {
  const item = post.closest?.(".dlv-item");
  const id = item?.id || "";
  const match = id.match(/-option-(\d+)$/);
  return match ? match[1] : "";
}

function threadHref(post, loc) {
  if (post.matches?.("a[href]")) {
    const own = post.getAttribute("href");
    if (own) return own;
  }
  const title = post.querySelector(".dft-title");
  const fromTitle = title?.closest?.("a[href]")?.getAttribute("href");
  if (fromTitle) return fromTitle;
  const link = post.querySelector('a[href*="/discussion"], a[href*="/discuss"]');
  if (link) return link.getAttribute("href") || "";

  const numeric = numericThreadIdFromRow(post);
  const base = discussionIndexPath(loc?.pathname || "");
  if (numeric && base) return `${base}/${numeric}`;
  return "";
}

function readCount(iconEl) {
  const countEl = iconEl.nextElementSibling;
  if (!countEl?.classList?.contains("dft-count")) return null;
  return {
    text: clipText(countEl.textContent, 40),
    active: countEl.classList.contains("active"),
    iconSvg: sanitizeIconSvg(iconEl.innerHTML)
  };
}

function readFeedPost(post, loc) {
  const href = threadHref(post, loc);
  const id = canonicalPostIdFn(href);
  const foot = post.querySelector(".dft-foot");
  const counts = [];
  foot?.querySelectorAll(".icon.dft-count-icon, .dft-count-icon").forEach((iconEl) => {
    const count = readCount(iconEl);
    if (count) counts.push(count);
  });
  const typeIcon = post.querySelector(".icon.dft-type-icon, .dft-type-icon");

  return {
    id,
    title: clipText(post.querySelector(".dft-title")?.textContent, 300) || "Untitled",
    url: absoluteEdUrl(href),
    header: clipText(post.querySelector(".dft-header")?.textContent, 120),
    user: clipText(post.querySelector(".dft-user")?.textContent, 120),
    userRole: clipText(post.querySelector(".dft-user-role")?.textContent, 80),
    date: clipText(post.querySelector(".dft-date")?.textContent, 80),
    category: clipText(post.querySelector(".dft-category")?.textContent, 120),
    typeIconSvg: sanitizeIconSvg(typeIcon?.innerHTML || ""),
    counts
  };
}

function isOpenThread(el) {
  return !!(
    el?.classList?.contains("discuss-thread") &&
    !el.classList.contains("discuss-feed-thread") &&
    el.querySelector(".disthrb-title") &&
    el.querySelector(".disthrb-head-end")
  );
}

function readThreadDetail(thread, loc) {
  const href = `${loc?.pathname || ""}${loc?.search || ""}`;
  const id = canonicalPostIdFn(href);
  const pageUrl = loc?.href ? String(loc.href).split("#")[0] : absoluteEdUrl(href);
  return {
    id,
    title: clipText(thread.querySelector(".disthrb-title")?.textContent, 300) || "Untitled",
    url: pageUrl,
    header: "",
    user: clipText(thread.querySelector(".disthrb-user-name")?.textContent, 120),
    userRole: clipText(thread.querySelector(".disthrb-role")?.textContent, 80),
    date: clipText(thread.querySelector(".disthrb-date")?.textContent, 80),
    category: clipText(thread.querySelector(".disthrb-category")?.textContent, 120),
    typeIconSvg: "",
    counts: []
  };
}

function readArchiveTarget(el, loc) {
  if (!el?.classList) return null;
  if (el.classList.contains("discuss-feed-thread")) return readFeedPost(el, loc);
  if (isOpenThread(el)) return readThreadDetail(el, loc);
  return null;
}

function collectedIds(post, loc) {
  const ids = new Set();
  const primary = readFeedPost(post, loc).id;
  if (primary) ids.add(primary);
  if (post.matches?.("a[href]")) {
    const id = canonicalPostIdFn(post.getAttribute("href"));
    if (id) ids.add(id);
  }
  post.querySelectorAll("a[href]").forEach((anchor) => {
    const id = canonicalPostIdFn(anchor.getAttribute("href"));
    if (id) ids.add(id);
  });
  return ids;
}

function isTypingTarget(el) {
  if (!el?.tagName) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return !!el.closest?.("[contenteditable='true']");
}

function userPinKey(post) {
  const links = post.querySelectorAll("a[href]");
  for (const anchor of links) {
    const href = anchor.getAttribute("href") || "";
    const match = href.match(/\/(?:us\/|au\/|eu\/)?(?:users|user|profiles)\/(\d+)/i);
    if (match) return `user:${match[1]}`;
  }
  const withData = post.querySelector("[data-user-id]");
  const id = withData?.getAttribute("data-user-id");
  if (id) return `user:${id}`;
  return "";
}

function pinKeyForThread(post, loc) {
  const userKey = userPinKey(post);
  if (userKey) return userKey;
  const id = readFeedPost(post, loc).id;
  return id ? `thread:${id}` : "";
}

function hasNativePin(thread) {
  const badges = thread.querySelectorAll(".dft-badge.pinned, .icon-pin.pinned");
  for (const badge of badges) {
    if (!badge.hasAttribute("data-ed-ext-pin-badge")) return true;
  }
  return false;
}

function findListView(root) {
  const scope = root?.querySelector ? root : null;
  if (!scope) return null;
  return (
    scope.querySelector(".discuss-thread-list .discuss-list-view") ||
    scope.querySelector(".discuss-list-view-container .discuss-list-view") ||
    scope.querySelector(".dlr-list .discuss-list-view") ||
    (scope.classList?.contains("discuss-list-view") ? scope : null) ||
    scope.querySelector(".discuss-list-view")
  );
}

function groupElements(listView) {
  return [...listView.children].filter((el) => el.querySelector?.(".dlv-item"));
}

function isPinnedGroup(groupEl) {
  for (const child of groupEl.children) {
    if (child.classList?.contains("dtl-group-heading")) return false;
    if (child.classList?.contains("sr-only")) return true;
  }
  return false;
}

function itemHost(groupEl) {
  if (!groupEl) return null;
  const item = groupEl.querySelector(".dlv-item");
  if (item?.parentElement && groupEl.contains(item.parentElement)) {
    return item.parentElement;
  }
  for (const child of groupEl.children) {
    if (
      child.tagName === "DIV" &&
      !child.classList.contains("sr-only") &&
      !child.classList.contains("dtl-group-heading")
    ) {
      return child;
    }
  }
  return null;
}

function pinHosts(root) {
  const listView = findListView(root);
  if (!listView) return null;
  const groups = groupElements(listView);
  if (!groups.length) return null;
  const pinGroup = groups.find(isPinnedGroup) || null;
  const pinHost = itemHost(pinGroup || groups[0]);
  const mainGroup = pinGroup ? groups.find((group) => group !== pinGroup) : null;
  const mainHost = mainGroup ? itemHost(mainGroup) : null;
  if (!pinHost) return null;
  return { listView, pinHost, mainHost: mainHost && mainHost !== pinHost ? mainHost : null };
}

function rowInfo(item, pinnedMap, loc) {
  const thread = item.querySelector(FEED_THREAD);
  const key = thread ? pinKeyForThread(thread, loc) : "";
  const archived = thread?.getAttribute("data-ed-archived") === "1";
  return {
    item,
    key,
    archived,
    pinned: !!(key && pinnedMap && pinnedMap[key] && !archived),
    t: Number((key && pinnedMap && pinnedMap[key]) || 0) || 0,
    native: thread ? hasNativePin(thread) : false
  };
}

function byPinTime(a, b) {
  if (a.t !== b.t) return a.t - b.t;
  return String(a.key).localeCompare(String(b.key));
}

function applyChildOrder(parent, desiredItems) {
  const desired = desiredItems.filter(Boolean);
  const extras = [...parent.children].filter((el) => !desired.includes(el));
  const next = [...desired, ...extras];
  const actual = [...parent.children];
  if (actual.length === next.length && actual.every((el, index) => el === next[index])) {
    return false;
  }
  for (const el of next) parent.appendChild(el);
  return true;
}

function reorderPins(root, pinnedMap, loc) {
  const hosts = pinHosts(root);
  if (!hosts) return false;
  const { pinHost, mainHost, listView } = hosts;

  if (!mainHost) {
    const rows = [...pinHost.children]
      .filter((el) => el.classList.contains("dlv-item"))
      .map((item) => rowInfo(item, pinnedMap, loc));
    const pins = rows.filter((row) => row.pinned).sort(byPinTime);
    const rest = rows.filter((row) => !row.pinned);
    return applyChildOrder(pinHost, [...pins, ...rest].map((row) => row.item));
  }

  const pinnedRows = [];
  listView.querySelectorAll(".dlv-item").forEach((item) => {
    const info = rowInfo(item, pinnedMap, loc);
    if (info.pinned) pinnedRows.push(info);
  });
  pinnedRows.sort(byPinTime);

  const returning = [...pinHost.children]
    .filter((el) => el.classList.contains("dlv-item"))
    .map((item) => rowInfo(item, pinnedMap, loc))
    .filter((info) => !info.pinned && !info.native);

  let changed = false;
  for (const info of returning) {
    mainHost.appendChild(info.item);
    changed = true;
  }

  const natives = [...pinHost.children]
    .filter((el) => el.classList.contains("dlv-item"))
    .map((item) => rowInfo(item, pinnedMap, loc))
    .filter((info) => !info.pinned);

  changed =
    applyChildOrder(pinHost, [
      ...natives.map((info) => info.item),
      ...pinnedRows.map((info) => info.item)
    ]) || changed;
  return changed;
}

function markArchived(post, archived) {
  const item = post.closest?.(".dlv-item");
  if (archived) {
    post.setAttribute("data-ed-archived", "1");
    item?.setAttribute("data-ed-archived", "1");
    post.removeAttribute("data-ed-archiving");
    return;
  }
  post.removeAttribute("data-ed-archived");
  post.removeAttribute("data-ed-archiving");
  if (item && !item.querySelector('.discuss-feed-thread[data-ed-archived="1"]')) {
    item.removeAttribute("data-ed-archived");
  }
}

function threadIsArchived(post, state) {
  const ids = collectedIds(post, state.location);
  for (const id of ids) {
    if (state.pending?.has?.(id)) return true;
    if (state.archive && state.archive[id]) return true;
  }
  return false;
}

function makeIconButton(className, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.setAttribute("aria-label", label);
  button.innerHTML = `<span class="icon ed-archive-icon" aria-hidden="true">${ARCHIVE_ICON_SVG}</span>`;
  return button;
}

function ensureArchiveButton(post) {
  const host = post.querySelector(".dft-foot") || post.querySelector(".dft-body");
  if (!host || host.querySelector(".ed-archive-btn")) return;
  const button = makeIconButton("ed-archive-btn", "Archive");
  button.dataset.edAction = "archive";
  host.appendChild(button);
}

function syncPinBadge(thread, pinnedMap, loc) {
  const body = thread.querySelector(".dft-body");
  if (!body) return;
  const key = pinKeyForThread(thread, loc);
  const on = !!(key && pinnedMap && pinnedMap[key]);
  let badge = body.querySelector("[data-ed-ext-pin-badge]");
  if (!on || hasNativePin(thread)) {
    badge?.remove();
    return;
  }
  if (!badge) {
    badge = document.createElement("span");
    badge.setAttribute("data-ed-ext-pin-badge", "1");
    badge.className = "icon icon-pin dft-badge pinned";
    badge.setAttribute("aria-hidden", "true");
    badge.innerHTML = PIN_ICON_SVG;
    body.appendChild(badge);
  }
}

function detailButton(label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "disthrb-head-action ed-archive-detail-btn";
  button.dataset.edAction = action;
  button.setAttribute("aria-label", label);
  button.innerHTML = `<span class="icon disthrb-head-action-icon ed-archive-icon" aria-hidden="true">${ARCHIVE_ICON_SVG}</span><span class="disthrb-head-action-label">${label}</span>`;
  return button;
}

function isDiscussionThreadLocation(loc) {
  return /\/discussion\/\d+(?:\/|$)/.test(loc?.pathname || "");
}

function updateDetailButton(thread, state) {
  if (!isOpenThread(thread)) return;
  if (!isDiscussionThreadLocation(state.location)) {
    thread.querySelector(".ed-archive-detail-btn")?.remove();
    return;
  }
  const headEnd = thread.querySelector(".disthrb-head-end");
  if (!headEnd) return;
  const data = readThreadDetail(thread, state.location);
  if (!data.id) return;
  const archived = !!(
    state.pending?.has?.(data.id) ||
    (state.archive && state.archive[data.id])
  );
  const action = archived ? "restore" : "archive";
  const label = archived ? "Restore" : "Archive";
  let button = headEnd.querySelector(".ed-archive-detail-btn");
  if (!button) {
    button = detailButton(label, action);
    headEnd.insertBefore(button, headEnd.firstChild);
    return;
  }
  button.dataset.edAction = action;
  button.setAttribute("aria-label", label);
  const text = button.querySelector(".disthrb-head-action-label");
  if (text) text.textContent = label;
}

function applyFeedChrome(root, state) {
  const scope = root?.querySelectorAll ? root : null;
  if (!scope) return;
  scope.querySelectorAll(FEED_THREAD).forEach((post) => {
    if (threadIsArchived(post, state)) {
      if (post.getAttribute("data-ed-archiving") === "1") {
        post.querySelector(".ed-archive-btn")?.remove();
        return;
      }
      markArchived(post, true);
      post.querySelector(".ed-archive-btn")?.remove();
      return;
    }

    markArchived(post, false);
    const data = readFeedPost(post, state.location);
    if (!data.id || !post.querySelector(".dft-body")) return;
    syncPinBadge(post, state.pinned, state.location);
    ensureArchiveButton(post);
  });

  scope.querySelectorAll(".discuss-thread").forEach((thread) => {
    if (thread.classList.contains("discuss-feed-thread")) return;
    updateDetailButton(thread, state);
  });

  reorderPins(scope, state.pinned || {}, state.location);
}

function findShortcutThread(doc, state) {
  const active = doc.activeElement;
  if (active && !isTypingTarget(active)) {
    const feed = active.closest?.(FEED_THREAD);
    if (feed && feed.getAttribute("data-ed-archived") !== "1") return feed;
    const detail = active.closest?.(".discuss-thread");
    if (detail && isOpenThread(detail)) return detail;
  }

  const selected = doc.querySelector(
    `.dlv-item[aria-selected="true"] ${FEED_THREAD}, [role="option"][aria-selected="true"] ${FEED_THREAD}`
  );
  if (selected && selected.getAttribute("data-ed-archived") !== "1") return selected;

  const highlighted = doc.querySelector(`.dlv-item.ed-ext-feed-selected ${FEED_THREAD}`);
  if (highlighted && highlighted.getAttribute("data-ed-archived") !== "1") return highlighted;

  const open = [...doc.querySelectorAll(".discuss-thread")].find(isOpenThread);
  if (!open) return null;
  const data = readThreadDetail(open, state.location || doc.location);
  if (!data.id) return null;
  if (state.pending?.has?.(data.id) || state.archive?.[data.id]) return null;
  return open;
}

function nextVisibleFeedThread(thread) {
  const doc = thread.ownerDocument;
  const all = [...doc.querySelectorAll(FEED_THREAD)];
  const start = all.indexOf(thread);
  for (let index = start + 1; index < all.length; index += 1) {
    const candidate = all[index];
    if (candidate.getAttribute("data-ed-archived") === "1") continue;
    if (candidate.getAttribute("data-ed-archiving") === "1") continue;
    return candidate;
  }
  return null;
}

function insertPinMenuRow(popup, label) {
  if (!popup?.querySelector) return null;
  if (popup.querySelector(".ed-ext-context-pin-row")) {
    return popup.querySelector(".ed-ext-context-pin-row");
  }
  const table = popup.querySelector("table");
  if (!table) return null;
  const host = table.tBodies?.[0] || table.querySelector("tbody") || table;
  const refRow = [...host.querySelectorAll("tr")].find((row) => row.querySelector("td"));
  if (!refRow) return null;

  const row = refRow.cloneNode(true);
  row.removeAttribute("id");
  row.classList.add("ed-ext-context-pin-row");
  row.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
  const textNodes = [...row.querySelectorAll("td div")].filter((el) =>
    el.textContent.trim()
  );
  if (textNodes.length) {
    textNodes[0].textContent = label;
    textNodes.slice(1).forEach((el) => {
      el.textContent = "";
    });
  } else {
    const cell = row.querySelector("td");
    if (cell) cell.textContent = label;
  }
  host.appendChild(row);
  return row;
}

function acceptsThreadMenu(popup) {
  if (!popup?.classList?.contains("popup")) return false;
  if (popup.getAttribute("role") !== "menu") return false;
  if (popup.querySelector(".ed-ext-context-pin-row")) return false;
  return !!popup.querySelector("table");
}

const feedDomApi = {
  ARCHIVE_ICON_SVG,
  PIN_ICON_SVG,
  sanitizeIconSvg,
  absoluteEdUrl,
  discussionIndexPath,
  readFeedPost,
  readThreadDetail,
  readArchiveTarget,
  isOpenThread,
  isTypingTarget,
  pinKeyForThread,
  hasNativePin,
  findListView,
  reorderPins,
  markArchived,
  applyFeedChrome,
  findShortcutThread,
  nextVisibleFeedThread,
  isDiscussionThreadLocation,
  insertPinMenuRow,
  acceptsThreadMenu,
  threadIsArchived
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = feedDomApi;
}
