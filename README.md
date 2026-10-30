# BetterEd

BetterEd is a Chrome extension for EdStem that helps you keep your course discussion feed focused and organized.

It adds lightweight archive tools to EdStem threads so you can hide posts you are not currently interested in, keep them accessible in a local archive, and restore items later with a click.

## Features

- Archive discussion posts from the feed with one click or the keyboard shortcut `E`
- Restore archived posts back to the feed from the extension popup
- Keep a local archive of archived posts in browser storage
- Pin important threads or authors using the extension context menu
- Lightweight UI that blends into the EdStem discussion layout

## Why use it?

EdStem discussion feeds can get crowded as courses progress. BetterEd helps you:

- reduce visual noise in active feeds
- keep a personal archive of useful discussions
- revisit old posts without losing them permanently
- focus on current conversations without clutter

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable Developer mode
3. Click Load unpacked
4. Select the folder containing this repository
5. The BetterEd extension will be installed and ready to use on EdStem pages

## Usage

### Archive a post

- Click the archive button added to each discussion thread in the feed
- Or press `E` while a feed item or thread is focused

### View archived posts

- Click the BetterEd extension icon in the browser toolbar
- The popup shows all archived posts
- Use the Clear button to restore everything back to the feed

### Restore an item

- Open the popup
- Click the `×` button for the item you want to restore

### Pin threads

- Right-click a discussion thread
- Choose the Pin (extension) option in the context menu
- Pinned threads are moved to the top section of the feed

## Project structure

- `content.js` — main extension logic for detecting posts, injecting archive buttons, and archiving/restoring state
- `archive-utils.js` — archive normalization and storage helpers
- `popup.html` / `popup.js` — popup UI for browsing and restoring archived posts
- `manifest.json` — Chrome extension manifest
- `styles.css` / `popup.css` — styling for the extension UI

## Notes

- The extension stores archive state locally in Chrome storage (`chrome.storage.local`)
- It targets EdStem pages at `https://edstem.org/*`
- It is designed as a browser extension utility rather than a standalone web app

## License

This project does not currently include a license file.

## Contributing

Contributions are welcome. Feel free to open an issue or submit a pull request if you have improvements or bug fixes.
