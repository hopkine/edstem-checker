function canonicalPostId(href) {
  if (!href || typeof href !== "string") return "";
  const t = href.trim();
  if (!t || t === "#") return "";
  try {
    const withOrigin = t.startsWith("http")
      ? t
      : `https://edstem.org${t.startsWith("/") ? t : `/${t}`}`;
    const u = new URL(withOrigin);
    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return path + u.search;
  } catch {
    const noHash = t.split("#")[0];
    return noHash.startsWith("/") ? noHash : `/${noHash}`;
  }
}

/** One canonical entry per post; stable archivedAt for ordering. */
function normalizeArchive(archive) {
  const out = {};

  for (const [key, raw] of Object.entries(archive || {})) {
    if (!raw || typeof raw !== "object") continue;
    const id = canonicalPostId(raw.id || key);
    if (!id) continue;

    const archivedAt = Number(raw.archivedAt ?? raw.time) || 0;
    const prev = out[id];

    if (!prev) {
      out[id] = { ...raw, id, archivedAt: archivedAt || Date.now() };
      continue;
    }

    const prevAt = Number(prev.archivedAt) || 0;
    const keepPrev = prevAt <= archivedAt;
    const base = keepPrev ? prev : raw;
    const other = keepPrev ? raw : prev;

    out[id] = {
      ...base,
      ...other,
      id,
      archivedAt: Math.min(prevAt || archivedAt, archivedAt || prevAt) || Date.now()
    };
  }

  return out;
}

function listArchiveItems(archive) {
  return Object.values(normalizeArchive(archive)).sort((a, b) => {
    const ta = Number(a.archivedAt) || 0;
    const tb = Number(b.archivedAt) || 0;
    if (tb !== ta) return tb - ta;
    return String(a.id).localeCompare(String(b.id));
  });
}

function upsertArchiveEntry(archive, data) {
  const normalized = normalizeArchive(archive);
  const existing = normalized[data.id];
  normalized[data.id] = {
    ...(existing || {}),
    ...data,
    id: data.id,
    archivedAt: existing?.archivedAt ?? Date.now()
  };
  return normalized;
}

function removeArchiveEntry(archive, targetId) {
  const normalized = normalizeArchive(archive);
  delete normalized[targetId];
  return normalized;
}
