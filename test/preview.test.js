const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const puppeteer = require("puppeteer-core");

const root = path.resolve(__dirname, "..");
const chromePath = process.env.CHROME_PATH || "/usr/bin/google-chrome-stable";
const artifacts = "/opt/cursor/artifacts";

function contentType(filePath) {
  switch (path.extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".png":
      return "image/png";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const filePath = path.resolve(root, rel);
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    fs.readFile(filePath, (error, data) => {
      if (error) {
        res.writeHead(404);
        res.end("missing");
        return;
      }
      res.writeHead(200, { "content-type": contentType(filePath) });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function shot(page, name) {
  fs.mkdirSync(artifacts, { recursive: true });
  await page.screenshot({
    path: path.join(artifacts, name),
    fullPage: false
  });
}

test("preview archives, restores, pins, and clears without contacting Ed", { timeout: 60000 }, async () => {
  assert.equal(fs.existsSync(chromePath), true, `Chrome not found at ${chromePath}`);
  const server = await startServer();
  const { port } = server.address();
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });

  try {
    const page = await browser.newPage();
    const pageErrors = [];
    const requests = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("request", (request) => requests.push(request.url()));
    await page.setViewport({ width: 1100, height: 760, deviceScaleFactor: 1 });
    const url = `http://127.0.0.1:${port}/preview/index.html`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.removeItem("bettered-preview-store"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".feed-shell .ed-archive-btn");
    assert.equal(await page.$$eval(".feed-shell .ed-archive-btn", (nodes) => nodes.length), 3);
    await shot(page, "bettered-feed.png");

    await page.evaluate(() => {
      const title = [...document.querySelectorAll(".feed-shell .dft-title")].find((el) =>
        el.textContent.includes("Lab 2")
      );
      title.closest(".discuss-feed-thread").querySelector(".ed-archive-btn").click();
    });
    await page.waitForFunction(() => {
      const title = [...document.querySelectorAll(".feed-shell .dft-title")].find((el) =>
        el.textContent.includes("Lab 2")
      );
      return (
        title.closest(".dlv-item").getAttribute("data-ed-archived") === "1" &&
        document.querySelector("#archive-list").textContent.includes("Lab 2")
      );
    });
    await shot(page, "bettered-archived.png");

    await page.click(".arch-restore-btn");
    await page.waitForFunction(() => {
      const title = [...document.querySelectorAll(".feed-shell .dft-title")].find((el) =>
        el.textContent.includes("Lab 2")
      );
      return title.closest(".dlv-item").getAttribute("data-ed-archived") !== "1";
    });

    await page.keyboard.press("e");
    await page.waitForFunction(() => {
      const title = [...document.querySelectorAll(".feed-shell .dft-title")].find((el) =>
        el.textContent.includes("How does malloc work?")
      );
      return (
        document.querySelector("#archive-list").textContent.includes("How does malloc work?") &&
        title.closest(".dlv-item").getAttribute("data-ed-archived") === "1"
      );
    });

    await page.evaluate(() => {
      chrome.storage.local.set({
        pinnedUsers: { "thread:/us/courses/9/discussion/33": 5 }
      });
    });
    await page.waitForFunction(() => {
      const title = [...document.querySelectorAll(".feed-shell .dft-title")].find((el) =>
        el.textContent.includes("Lab 2")
      );
      return (
        title.closest("[data-group]").dataset.group === "pinned" &&
        title.closest(".discuss-feed-thread").querySelector("[data-ed-ext-pin-badge]")
      );
    });
    await shot(page, "bettered-pinned.png");

    page.once("dialog", (dialog) => dialog.accept());
    await page.click("#clear-archive");
    await page.waitForFunction(
      () =>
        document.querySelector("#archive-list").textContent.trim() === "" &&
        [...document.querySelectorAll(".feed-shell .dlv-item")].every(
          (item) => item.getAttribute("data-ed-archived") !== "1"
        )
    );

    assert.deepEqual(pageErrors, []);
    assert.equal(
      requests.some((entry) => /edstem\.org|edcdn\.net/i.test(entry)),
      false
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
