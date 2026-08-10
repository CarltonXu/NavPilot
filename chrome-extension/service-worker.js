chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "NAVPILOT_READ_BOOKMARKS" || !sender.tab) return false;
  chrome.bookmarks
    .getTree()
    .then((tree) => sendResponse({ tree }))
    .catch((error) => sendResponse({ error: error.message }));
  return true;
});
