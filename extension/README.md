# TubeGrab — browser extension

Adds "Download with TubeGrab" to Chrome, Edge, Brave and Opera: a toolbar button, a right-click menu entry and a small button on YouTube videos. It sends the link to the TubeGrab desktop app on this PC (through a `tubegrab://` link), which opens with the link ready: you still press **Download** there.

It needs the desktop app (installed or portable), which registers `tubegrab://` for your user when it starts.

## Install

1. In TubeGrab: **Settings → System → Browser extension → Install…** (opens a folder with the extension).
2. In the browser, go to `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
3. **Load unpacked** and choose that folder.

## Privacy

The extension has no access to your browsing: it only reads the address of the tab (or link) you click it on, and only sends it to the TubeGrab app on this computer. No servers, no tracking.
