function enqueueArchiveWrite(mutator) {
  return new Promise((resolve, reject) => {
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
        resolve();
      });
    });
  });
}

function removeArchiveItem(item) {
  const targetId = canonicalPostId(item.id);
  return enqueueArchiveWrite((archive) => {
    const next = removeArchiveEntry(archive, targetId);
    for (const k of Object.keys(archive)) delete archive[k];
    Object.assign(archive, next);
  });
}

function createArchiveRow(item) {
  const wrap = document.createElement("div");
  wrap.className = "dlv-item arch-dlv-item";
  wrap.dataset.archiveId = item.id;

  const thread = document.createElement("div");
  thread.className = "discuss-feed-thread arch-thread";
  thread.tabIndex = 0;
  thread.setAttribute("role", "link");
  thread.setAttribute("aria-label", item.title || "Untitled");

  if (item.header) {
    const header = document.createElement("div");
    header.className = "dft-header";
    header.textContent = item.header;
    thread.appendChild(header);
  }

  const body = document.createElement("div");
  body.className = "dft-body";

  if (item.typeIconSvg) {
    const typeIcon = document.createElement("span");
    typeIcon.className = "icon dft-type-icon";
    typeIcon.setAttribute("aria-hidden", "true");
    typeIcon.innerHTML = item.typeIconSvg;
    body.appendChild(typeIcon);
  }

  const title = document.createElement("div");
  title.className = "dft-title";
  title.textContent = item.title || "Untitled";
  body.appendChild(title);
  thread.appendChild(body);

  const foot = document.createElement("div");
  foot.className = "dft-foot";

  const footFill = document.createElement("div");
  footFill.className = "dft-foot-fill";

  if (item.user) {
    const user = document.createElement("span");
    user.className = "dft-user";
    user.textContent = item.user;
    footFill.appendChild(user);
  }

  if (item.userRole) {
    const role = document.createElement("span");
    role.className = "user-role-label dft-user-role";
    role.textContent = item.userRole;
    footFill.appendChild(role);
  }

  if (item.date) {
    const date = document.createElement("span");
    date.className = "dft-date";
    date.textContent = item.date;
    footFill.appendChild(date);
  }

  if (item.category) {
    const category = document.createElement("span");
    category.className = "discuss-category-text dft-category";
    category.textContent = item.category;
    footFill.appendChild(category);
  }

  foot.appendChild(footFill);

  (item.counts || []).forEach(({ text, active, iconSvg }) => {
    const icon = document.createElement("span");
    icon.className = "icon dft-count-icon" + (active ? " active" : "");
    icon.setAttribute("aria-hidden", "true");
    if (iconSvg) icon.innerHTML = iconSvg;
    foot.appendChild(icon);

    const count = document.createElement("span");
    count.className = "dft-count" + (active ? " active" : "");
    count.textContent = text;
    foot.appendChild(count);
  });

  const restore = document.createElement("button");
  restore.type = "button";
  restore.className = "arch-restore-btn";
  restore.textContent = "×";
  restore.setAttribute("aria-label", "Restore to feed");
  restore.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    removeArchiveItem(item).then(renderArchive);
  };
  foot.appendChild(restore);

  thread.appendChild(foot);
  wrap.appendChild(thread);

  const openPost = () => {
    if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
  };

  thread.addEventListener("click", (e) => {
    if (e.target.closest(".arch-restore-btn")) return;
    openPost();
  });

  thread.addEventListener("keydown", (e) => {
    if (e.target.closest(".arch-restore-btn")) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPost();
    }
  });

  return wrap;
}

let renderArchiveTimer = null;
let lastRenderKey = "";

function renderArchive() {
  if (renderArchiveTimer !== null) {
    clearTimeout(renderArchiveTimer);
  }

  renderArchiveTimer = setTimeout(() => {
    renderArchiveTimer = null;

    chrome.storage.local.get(["archive"], (res) => {
      const items = listArchiveItems(res.archive || {});
      const renderKey = items
        .map((item) => `${item.id}:${item.archivedAt ?? item.time ?? 0}`)
        .join("|");
      const list = document.getElementById("archive-list");
      const empty = document.getElementById("empty-state");
      const clearBtn = document.getElementById("clear-archive");

      if (clearBtn) clearBtn.hidden = items.length === 0;

      if (!items.length) {
        list.innerHTML = "";
        empty.hidden = false;
        lastRenderKey = "";
        return;
      }

      empty.hidden = true;

      if (renderKey === lastRenderKey) return;
      lastRenderKey = renderKey;

      list.innerHTML = "";
      items.forEach((item) => {
        list.appendChild(createArchiveRow(item));
      });
    });
  }, 50);
}

renderArchive();

document.getElementById("clear-archive").onclick = () => {
  chrome.storage.local.get(["archive"], (res) => {
    const archive = normalizeArchive(res.archive || {});
    if (!Object.keys(archive).length) return;
    if (!confirm("Restore all archived posts to the feed?")) return;

    chrome.storage.local.set({ archive: {} }, () => {
      if (chrome.runtime.lastError) return;
      lastRenderKey = "";
      renderArchive();
    });
  });
};

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.archive) {
    renderArchive();
  }
});
