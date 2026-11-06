const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("manifest points at files that exist and does not ask for extra permissions", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "1.1.0");
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(manifest.host_permissions, ["https://edstem.org/*"]);
  assert.deepEqual(manifest.content_scripts[0].js, [
    "archive-utils.js",
    "feed-dom.js",
    "content.js"
  ]);
  assert.deepEqual(manifest.content_scripts[0].css, ["styles.css"]);

  const files = [
    manifest.action.default_popup,
    ...manifest.content_scripts[0].js,
    ...manifest.content_scripts[0].css,
    ...Object.values(manifest.icons)
  ];
  for (const file of files) {
    assert.equal(fs.existsSync(path.join(root, file)), true, file);
  }
});

test("tracked examples do not contain credentials", () => {
  const sample = fs.readFileSync(path.join(root, "examples/storage.sample.json"), "utf8");
  assert.doesNotMatch(sample, /api[_-]?token|password|secret|bearer\s+/i);
  assert.equal(JSON.parse(sample).archive["/us/courses/9/discussion/22"].title.length > 0, true);
});
