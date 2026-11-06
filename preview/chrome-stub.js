// Local stand-in for chrome.storage used only by preview/index.html.
// The installed extension uses chrome.storage.local and never loads this file.
(function () {
  const KEY = "bettered-preview-store";

  function emptyStore() {
    return { archive: {}, pinnedUsers: {} };
  }

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || "");
      if (!parsed || typeof parsed !== "object") return emptyStore();
      return {
        archive: parsed.archive && typeof parsed.archive === "object" ? parsed.archive : {},
        pinnedUsers:
          parsed.pinnedUsers && typeof parsed.pinnedUsers === "object" ? parsed.pinnedUsers : {}
      };
    } catch {
      return emptyStore();
    }
  }

  let memory = load();
  const listeners = new Set();

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(memory));
    } catch {
      // file:// pages can reject localStorage; the in-memory copy still works.
    }
  }

  function emit(changes) {
    for (const listener of listeners) {
      try {
        listener(changes, "local");
      } catch (error) {
        console.error(error);
      }
    }
  }

  const chromeApi = {
    runtime: { lastError: null },
    storage: {
      local: {
        get(keys, callback) {
          const names = Array.isArray(keys) ? keys : [keys];
          const result = {};
          for (const name of names) result[name] = memory[name];
          chromeApi.runtime.lastError = null;
          callback(result);
        },
        set(values, callback) {
          const changes = {};
          for (const [key, value] of Object.entries(values || {})) {
            changes[key] = { oldValue: memory[key], newValue: value };
            memory[key] = value;
          }
          persist();
          chromeApi.runtime.lastError = null;
          emit(changes);
          if (callback) callback();
        }
      },
      onChanged: {
        addListener(listener) {
          listeners.add(listener);
        },
        removeListener(listener) {
          listeners.delete(listener);
        }
      }
    }
  };

  globalThis.chrome = chromeApi;
})();
