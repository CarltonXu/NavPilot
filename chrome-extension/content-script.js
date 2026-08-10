if (document.querySelector('meta[name="navpilot-app"][content="true"]')) {
  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      event.data?.type !== "NAVPILOT_BOOKMARKS_REQUEST"
    )
      return;
    const requestId = event.data.requestId;
    chrome.runtime.sendMessage(
      { type: "NAVPILOT_READ_BOOKMARKS" },
      (response) => {
        const error = chrome.runtime.lastError?.message || response?.error;
        window.postMessage(
          {
            type: "NAVPILOT_BOOKMARKS_RESPONSE",
            requestId,
            tree: response?.tree || [],
            error: error || null,
          },
          "*",
        );
      },
    );
  });
}
