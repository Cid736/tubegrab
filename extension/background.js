// Hands a link to the TubeGrab desktop app through its tubegrab:// link.
// The app only fills in its download box with it (from a supported site);
// nothing is downloaded until you press Download there.
const handoff = (url) => `tubegrab://download?url=${encodeURIComponent(url)}`;
const isWeb = (url) => /^https?:\/\//i.test(url || '');

function send(tabId, url) {
  if (!isWeb(url)) return;
  // The browser shows its own "Open TubeGrab?" prompt the first time; the
  // page itself stays where it is.
  chrome.tabs.update(tabId, { url: handoff(url) });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'tubegrab',
    title: chrome.i18n.getMessage('menuTitle'),
    contexts: ['page', 'link', 'video', 'audio'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'tubegrab' || !tab) return;
  send(tab.id, info.linkUrl || info.srcUrl || info.pageUrl);
});

chrome.action.onClicked.addListener((tab) => send(tab.id, tab.url));

// The button on YouTube pages (youtube.js) asks for its own page.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === 'tubegrab' && sender.tab) send(sender.tab.id, sender.tab.url);
});
