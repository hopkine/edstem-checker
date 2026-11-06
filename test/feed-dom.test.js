const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const feed = require("../feed-dom.js");

const previewPath = path.join(__dirname, "../preview/index.html");
const feedLocation = {
  pathname: "/us/courses/9/discussion",
  search: "",
  href: "https://edstem.org/us/courses/9/discussion"
};
const threadLocation = {
  pathname: "/us/courses/9/discussion/22",
  search: "",
  href: "https://edstem.org/us/courses/9/discussion/22"
};

function loadPreview() {
  const dom = new JSDOM(fs.readFileSync(previewPath, "utf8"), {
    url: "https://edstem.org/us/courses/9/discussion"
  });
  global.document = dom.window.document;
  global.DOMParser = dom.window.DOMParser;
  return dom.window.document;
}

function state(extra = {}) {
  return {
    archive: {},
    pending: new Set(),
    pinned: {},
    location: feedLocation,
    ...extra
  };
}

function title(document, text) {
  return [...document.querySelectorAll(".feed-shell .dft-title")].find((el) =>
    el.textContent.includes(text)
  );
}

test("discussion index path keeps the /discussion segment", () => {
  assert.equal(
    feed.discussionIndexPath("/us/courses/9/discussion/22"),
    "/us/courses/9/discussion"
  );
  assert.equal(feed.isDiscussionThreadLocation(threadLocation), true);
  assert.equal(feed.isDiscussionThreadLocation(feedLocation), false);
});

test("feed rows expose ids, counts, and one archive button", () => {
  const document = loadPreview();
  feed.applyFeedChrome(document, state());
  feed.applyFeedChrome(document, state());

  const buttons = document.querySelectorAll(".feed-shell .ed-archive-btn");
  assert.equal(buttons.length, 3);

  const malloc = feed.readFeedPost(
    title(document, "malloc").closest(".discuss-feed-thread"),
    feedLocation
  );
  assert.equal(malloc.id, "/us/courses/9/discussion/22");
  assert.equal(malloc.url, "https://edstem.org/us/courses/9/discussion/22");
  assert.equal(malloc.user, "Ada Lovelace");
  assert.equal(malloc.category, "Lectures");
  assert.equal(malloc.counts[0].text, "3");
  assert.match(malloc.typeIconSvg, /^<svg/i);
  assert.doesNotMatch(malloc.typeIconSvg, /<script/i);

  const lab = feed.readFeedPost(
    title(document, "Lab 2").closest(".discuss-feed-thread"),
    feedLocation
  );
  assert.equal(lab.header, "Pending approval");
  assert.equal(lab.counts[0].active, true);
});

test("rows without an anchor still archive from the list option id", () => {
  const document = loadPreview();
  const host = document.querySelector('[data-group="week"] .thread-items');
  host.insertAdjacentHTML(
    "beforeend",
    `<div class="dlv-item" id="ab-option-44" role="option">
      <div class="discuss-feed-thread dft-full">
        <div class="dft-body"><span class="dft-title">No link row</span></div>
        <footer class="dft-foot"></footer>
      </div>
    </div>`
  );
  const row = document.querySelector("#ab-option-44 .discuss-feed-thread");
  assert.equal(feed.readFeedPost(row, feedLocation).id, "/us/courses/9/discussion/44");
  row.querySelector(".dft-user") || row.insertAdjacentHTML("beforeend", '<span class="dft-user" data-user-id="15">Pat</span>');
  const named = document.querySelector("#ab-option-44 .discuss-feed-thread");
  named.querySelector(".dft-body").insertAdjacentHTML(
    "beforeend",
    '<span class="dft-user" data-user-id="15">Pat</span>'
  );
  assert.equal(feed.pinKeyForThread(named, feedLocation), "user:15");
});

test("archived rows stay hidden and pinned rows move once", () => {
  const document = loadPreview();
  const archive = {
    "/us/courses/9/discussion/22": {
      id: "/us/courses/9/discussion/22",
      title: "How does malloc work?"
    }
  };
  feed.applyFeedChrome(document, state({ archive }));
  const mallocThread = title(document, "malloc").closest(".discuss-feed-thread");
  assert.equal(mallocThread.getAttribute("data-ed-archived"), "1");
  assert.equal(mallocThread.closest(".dlv-item").getAttribute("data-ed-archived"), "1");
  assert.equal(mallocThread.querySelector(".ed-archive-btn"), null);

  const pinned = { "thread:/us/courses/9/discussion/33": 10 };
  assert.equal(feed.reorderPins(document, pinned, feedLocation), true);
  const labItem = title(document, "Lab 2").closest(".dlv-item");
  assert.equal(labItem.closest("[data-group]").dataset.group, "pinned");
  assert.equal(feed.reorderPins(document, pinned, feedLocation), false);
  assert.equal(labItem.querySelector("[data-ed-ext-pin-badge]") === null, true);

  feed.applyFeedChrome(document, state({ archive, pinned }));
  assert.ok(labItem.querySelector("[data-ed-ext-pin-badge]"));
  assert.equal(
    title(document, "Staff note").closest(".discuss-feed-thread").querySelector("[data-ed-ext-pin-badge]"),
    null
  );
});

test("E targets the row Ed has selected", () => {
  const document = loadPreview();
  const selected = feed.findShortcutThread(document, state());
  assert.match(selected.querySelector(".dft-title").textContent, /malloc/);
});

test("thread pages get Archive and then Restore", () => {
  const document = loadPreview();
  const detail = document.querySelector(".thread-page .discuss-thread");
  feed.applyFeedChrome(document, state());
  assert.equal(detail.querySelector(".ed-archive-detail-btn"), null);

  feed.applyFeedChrome(document, state({ location: threadLocation }));
  assert.equal(detail.querySelector(".ed-archive-detail-btn").dataset.edAction, "archive");

  const archived = state({
    location: threadLocation,
    archive: {
      "/us/courses/9/discussion/22": { id: "/us/courses/9/discussion/22" }
    }
  });
  feed.applyFeedChrome(document, archived);
  const button = detail.querySelector(".ed-archive-detail-btn");
  assert.equal(button.dataset.edAction, "restore");
  assert.equal(button.querySelector(".disthrb-head-action-label").textContent, "Restore");
  assert.equal(feed.readThreadDetail(detail, threadLocation).title, "How does malloc work?");
});

test("context menu row is added once and icons drop scripts", () => {
  const document = loadPreview();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="popup popup-kind-plain" role="menu">
      <table data-testid="context-menu"><tbody>
        <tr><td><div>Open in new tab</div><div>extra</div></td></tr>
      </tbody></table>
    </div>`
  );
  const popup = document.querySelector(".popup[role='menu']");
  assert.equal(feed.acceptsThreadMenu(popup), true);
  const row = feed.insertPinMenuRow(popup, "Pin thread");
  assert.equal(row.classList.contains("ed-ext-context-pin-row"), true);
  assert.equal(row.textContent.trim(), "Pin thread");
  assert.equal(feed.insertPinMenuRow(popup, "Pin thread"), row);
  assert.equal(feed.acceptsThreadMenu(popup), false);

  const clean = feed.sanitizeIconSvg(
    '<svg onload="alert(1)" href="javascript:alert(1)"><script>alert(1)</script><path d="M0 0h1v1z"/></svg>'
  );
  assert.match(clean, /<path/i);
  assert.doesNotMatch(clean, /script|onload|javascript/i);
});
