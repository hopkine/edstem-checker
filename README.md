# BetterEd

BetterEd is a Chrome extension for [Ed Discussion](https://edstem.org) (EdStem). It hides threads you are finished with, keeps them in a private archive on this browser, and lets you pin threads to the top of the course feed.

The extension does not call the Ed API, does not read an API token, and does not send thread text anywhere. Archive and pin data stay in `chrome.storage.local` on your Chrome profile.

## Install

There is no build step.

1. Clone this repository.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select this folder (the folder that contains `manifest.json`).
5. Open a course at `https://edstem.org/...` and refresh the discussion page.

Chrome will show the BetterEd icon in the toolbar. Pin it from the extensions menu if you do not see it.

To confirm the UI before you are logged in, from this folder run:

```bash
npm install
npm test
```

`npm test` checks syntax, runs the archive logic against a local copy of the feed markup, and opens `preview/index.html` in headless Chrome. That preview never contacts Ed. You can also open `preview/index.html` in a normal browser and click the archive icons.

## Use it on Ed

Works on `https://edstem.org/*`, including `/us`, `/au`, and `/eu` course URLs.

### Archive a thread

On a course feed, each thread row gets an archive icon at the right of the metadata line.

- Click that icon, or
- Select a thread with the keyboard (Ed marks the row `aria-selected`) and press `E`.

The row slides away. Open the BetterEd toolbar popup to see it. Click a saved row to open the thread in a new tab. Click `×` to put that one row back on the feed, or **Clear** to restore every saved thread. Clearing asks you to confirm.

On an open thread page (`.../discussion/123`), the header gets **Archive**. Choosing it saves the thread and returns to the feed. If that thread is already archived, the button says **Restore**.

`E` does nothing while you are typing in a field.

### Pin a thread

Right-click a feed row. In Ed's menu, choose **Pin thread**. The row moves into the top pinned section and gets a green pin. Choose **Unpin thread** to put it back.

Ed's own staff pins stay in that top section. BetterEd pins are stored only in this browser. If Ed redraws the list, the extension puts your pins back at the top.

Author pins are used only when the row exposes a profile link or `data-user-id`. The current Ed feed does not, so the menu pins the thread.

## Configuration

There is nothing to configure and no `.env` file. Do not put an Ed API token in this project; the extension never reads one.

`examples/storage.sample.json` shows the shape of the data Chrome stores. The sample titles are fake. You do not import that file.

| Storage key | Meaning |
| --- | --- |
| `archive` | Map of canonical thread paths to the title, author, category, and link shown in the popup |
| `pinnedUsers` | Map of `thread:<path>` (or `user:<id>` when a profile id is present) to the time it was pinned |

To remove everything, use **Clear** in the popup for the archive, unpin threads from the feed menu, or remove the extension.

## Project layout

- `manifest.json` — Manifest V3 entry
- `content.js` — watches Ed pages, saves archive and pin changes
- `feed-dom.js` — reads the current feed markup and updates the page
- `archive-utils.js` — normalizes stored threads
- `popup.html`, `popup.js`, `popup.css` — the toolbar archive
- `styles.css` — archive button, hidden rows, and pin badge on Ed
- `preview/index.html` — local feed used by the tests and for a dry run
- `icons/` — toolbar icons

## Checks

```bash
npm install
npm test
```

That requires Node.js and Google Chrome (the end-to-end test uses `/usr/bin/google-chrome-stable`, or `CHROME_PATH` if Chrome lives elsewhere).

The automated feed matches the public Ed Discussion frontend inspected on 6 Nov 2026 (build `08cd2629413f141a`): feed rows are `.discuss-feed-thread` inside `.dlv-item`, pinned threads sit in their own list group, and the right-click menu is `.popup[role="menu"]`. It does **not** sign in to Ed or open a real course. After you load the extension, archive one thread on a course you can access and restore it from the popup before you rely on it.

## License

This repository does not include a license file.
