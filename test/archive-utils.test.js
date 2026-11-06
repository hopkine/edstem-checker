const test = require("node:test");
const assert = require("node:assert/strict");
const {
  canonicalPostId,
  normalizeArchive,
  listArchiveItems,
  upsertArchiveEntry,
  removeArchiveEntry
} = require("../archive-utils.js");

test("canonicalPostId keeps region, path, and query without a hash", () => {
  assert.equal(
    canonicalPostId("https://edstem.org/us/courses/9/discussion/22?comment=5#top"),
    "/us/courses/9/discussion/22?comment=5"
  );
  assert.equal(
    canonicalPostId("/au/courses/3/discussion/8/"),
    "/au/courses/3/discussion/8"
  );
  assert.equal(canonicalPostId("#"), "");
  assert.equal(canonicalPostId(""), "");
});

test("normalizeArchive collapses duplicate ids and keeps the earlier archive time", () => {
  const normalized = normalizeArchive({
    old: {
      id: "https://edstem.org/us/courses/9/discussion/22",
      title: "First",
      archivedAt: 100
    },
    again: {
      id: "/us/courses/9/discussion/22/",
      title: "Updated",
      archivedAt: 400
    }
  });
  const ids = Object.keys(normalized);
  assert.deepEqual(ids, ["/us/courses/9/discussion/22"]);
  assert.equal(normalized[ids[0]].title, "Updated");
  assert.equal(normalized[ids[0]].archivedAt, 100);
});

test("list, upsert, and remove keep one row per thread", () => {
  let archive = upsertArchiveEntry({}, {
    id: "/us/courses/9/discussion/22",
    title: "Malloc",
    archivedAt: 50
  });
  archive = upsertArchiveEntry(archive, {
    id: "/us/courses/9/discussion/33",
    title: "Lab",
    archivedAt: 80
  });
  archive = upsertArchiveEntry(archive, {
    id: "/us/courses/9/discussion/22",
    title: "Malloc revised"
  });

  const items = listArchiveItems(archive);
  assert.deepEqual(
    items.map((item) => item.title),
    ["Lab", "Malloc revised"]
  );
  assert.equal(items[1].archivedAt, 50);

  archive = removeArchiveEntry(archive, "/us/courses/9/discussion/33");
  assert.deepEqual(Object.keys(archive), ["/us/courses/9/discussion/22"]);
});
