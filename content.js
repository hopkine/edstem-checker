// BetterEd content script. Archive state lives in chrome.storage.local.
// Ed Discussion re-renders the feed in place, so visibility is stored in
// data attributes (Vue replaces class names) and buttons are re-applied
// whenever the thread list changes.

let archiveCache = {};
let pinnedCache = {};
const pendingArchiveIds = new Set();
let archiveWriteChain = Promise.resolve();
let pinnedWriteChain = Promise.resolve();
let lastDiscussContextThread = null;
let expectThreadMenuUntil = 0;

function extensionState() {
  return {
    archive: archiveCache,
    pending: pendingArchiveIds,
    pinned: pinnedCache,
    location
  };
}

function replaceArchiveContents(archive, next) {
  for (const key of Object.keys(archive)) delete archive[key];
  Object.assign(archive, next);
}

function refreshStorageCache(done) {
  chrome.storage.local.get(["archive", "pinnedUsers"], (res) => {
    if (chrome.runtime.lastError) {
      done?.();
      return;
    }
    const raw = res.archive || {};
    const normalized = normalizeArchive(raw);
    archiveCache = normalized;
    pinnedCache = res.pinnedUsers && typeof res.pinnedUsers === "object" ? res.pinnedUsers : {};
    if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
      chrome.storage.local.set({ archive: normalized });
    }
    done?.();
  });
}

function enqueueArchiveWrite(mutator) {
  const run = archiveWriteChain.then(
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
          } catch (error) {
            reject(error);
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
  archiveWriteChain = run.catch(() => {});
  return run;
}

function enqueuePinnedWrite(mutator) {
  const run = pinnedWriteChain.then(
    () =>
      new Promise((resolve, reject) => {
        chrome.storage.local.get(["pinnedUsers"], (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          const pinned =
            res.pinnedUsers && typeof res.pinnedUsers === "object" ? res.pinnedUsers : {};
          try {
            mutator(pinned);
          } catch (error) {
            reject(error);
            return;
          }
          chrome.storage.local.set({ pinnedUsers: pinned }, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            pinnedCache = pinned;
            resolve();
          });
        });
      })
  );
  pinnedWriteChain = run.catch(() => {});
  return run;
}

function idIsArchived(id) {
  if (!id) return false;
  return pendingArchiveIds.has(id) || !!archiveCache[id];
}

function persistArchive(data) {
  pendingArchiveIds.add(data.id);
  archiveCache = upsertArchiveEntry(archiveCache, data);
  return enqueueArchiveWrite((archive) => {
    replaceArchiveContents(archive, upsertArchiveEntry(archive, data));
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

function restoreArchivedId(id) {
  if (!id) return Promise.resolve();
  pendingArchiveIds.delete(id);
  archiveCache = removeArchiveEntry(archiveCache, id);
  scheduleInjectButtons();
  return enqueueArchiveWrite((archive) => {
    replaceArchiveContents(archive, removeArchiveEntry(archive, id));
  }).catch(() => {
    refreshStorageCache(scheduleInjectButtons);
  });
}

function togglePinnedForKey(key) {
  if (!key) return Promise.resolve();
  return enqueuePinnedWrite((pinned) => {
    if (pinned[key]) delete pinned[key];
    else pinned[key] = Date.now();
  }).then(() => {
    scheduleInjectButtons();
  });
}

function focusFeedThread(postEl) {
  const item = postEl.closest(".dlv-item");
  if (item) {
    const list = item.closest(".discuss-list-view") || document;
    list.querySelectorAll(".dlv-item.ed-ext-feed-selected").forEach((el) => {
      el.classList.remove("ed-ext-feed-selected");
    });
    item.classList.add("ed-ext-feed-selected");
  }

  const target =
    postEl.querySelector(".dft-title") ||
    postEl.querySelector("a[href]") ||
    postEl.querySelector(".ed-archive-btn") ||
    postEl;
  if (postEl.matches("a[href]")) {
    postEl.focus({ preventScroll: true });
  } else if (target?.focus) {
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }
  (item || postEl).scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function navigateBackFromArchivedThread() {
  if (history.length > 1) {
    history.back();
    return;
  }
  const indexPath = discussionIndexPath(location.pathname);
  if (indexPath) location.assign(indexPath);
}

function archiveElement(el) {
  const data = readArchiveTarget(el, location);
  if (!data?.id) return;
  if (
    el.getAttribute("data-ed-archived") === "1" ||
    el.getAttribute("data-ed-archiving") === "1" ||
    idIsArchived(data.id)
  ) {
    return;
  }

  const detail = isOpenThread(el);
  const next = detail ? null : nextVisibleFeedThread(el);
  el.setAttribute("data-ed-archiving", "1");
  el.querySelectorAll(".ed-archive-btn, .ed-archive-detail-btn").forEach((button) => {
    button.remove();
  });
  persistArchive(data);

  if (detail) {
    navigateBackFromArchivedThread();
    return;
  }

  window.setTimeout(() => {
    if (!el.isConnected) return;
    markArchived(el, true);
    if (next && next.isConnected) focusFeedThread(next);
  }, 280);
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "e" && event.key !== "E") return;
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  if (isTypingTarget(event.target)) return;
  const post = findShortcutThread(document, extensionState());
  if (!post || post.getAttribute("data-ed-archived") === "1") return;
  event.preventDefault();
  archiveElement(post);
});

document.addEventListener(
  "contextmenu",
  (event) => {
    const thread = event.target.closest?.(".discuss-feed-thread:not(.arch-thread)");
    if (thread) {
      lastDiscussContextThread = thread;
      expectThreadMenuUntil = Date.now() + 1500;
      return;
    }
    if (!event.target.closest?.(".popup")) {
      lastDiscussContextThread = null;
      expectThreadMenuUntil = 0;
    }
  },
  true
);

function pinLabelForThread(thread) {
  const key = pinKeyForThread(thread, location);
  if (!key) return "";
  const pinned = !!pinnedCache[key];
  if (key.startsWith("user:")) return pinned ? "Unpin author" : "Pin author";
  return pinned ? "Unpin thread" : "Pin thread";
}

function injectDiscussContextMenuPinRow(popup) {
  if (Date.now() > expectThreadMenuUntil) return;
  if (!acceptsThreadMenu(popup)) return;
  const thread = lastDiscussContextThread;
  if (!thread || !document.contains(thread)) return;
  const key = pinKeyForThread(thread, location);
  const label = pinLabelForThread(thread);
  if (!key || !label) return;

  const row = insertPinMenuRow(popup, label);
  if (!row || row.dataset.edPinBound === "1") return;
  row.dataset.edPinBound = "1";
  expectThreadMenuUntil = 0;

  row.addEventListener("mouseup", (event) => {
    event.preventDefault();
    event.stopPropagation();
    togglePinnedForKey(key).finally(() => {
      popup.remove();
    });
  });
}

const discussMenuObserver = new MutationObserver(() => {
  if (Date.now() > expectThreadMenuUntil) return;
  document.querySelectorAll(".popup[role='menu']").forEach((popup) => {
    injectDiscussContextMenuPinRow(popup);
  });
});

document.addEventListener(
  "click",
  (event) => {
    const button = event.target.closest?.(".ed-archive-btn, .ed-archive-detail-btn");
    if (!button) return;
    const post =
      button.closest(".discuss-feed-thread") || button.closest(".discuss-thread");
    if (!post) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (button.dataset.edAction === "restore") {
      const data = readArchiveTarget(post, location);
      restoreArchivedId(data?.id);
      return;
    }
    archiveElement(post);
  },
  true
);

let injectButtonsTimer = null;
function scheduleInjectButtons() {
  if (injectButtonsTimer !== null) return;
  injectButtonsTimer = window.setTimeout(() => {
    injectButtonsTimer = null;
    applyFeedChrome(document, extensionState());
  }, 80);
}

const observer = new MutationObserver(() => {
  scheduleInjectButtons();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.archive) {
    archiveCache = normalizeArchive(changes.archive.newValue || {});
  }
  if (changes.pinnedUsers) {
    pinnedCache =
      changes.pinnedUsers.newValue && typeof changes.pinnedUsers.newValue === "object"
        ? changes.pinnedUsers.newValue
        : {};
  }
  if (changes.archive || changes.pinnedUsers) scheduleInjectButtons();
});

function start() {
  if (!document.body) {
    document.addEventListener("DOMContentLoaded", start, { once: true });
    return;
  }
  observer.observe(document.body, { childList: true, subtree: true });
  discussMenuObserver.observe(document.body, { childList: true, subtree: true });
  refreshStorageCache(() => {
    applyFeedChrome(document, extensionState());
  });
}

start();
