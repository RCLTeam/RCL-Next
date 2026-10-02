// Keep an index in our history entries so cancelling Back/Forward restores the
// original entry instead of inserting duplicate entries into the history stack.
export function browserNavigation(
  onNavigate: (path: string) => void,
  canLeave: () => boolean,
  browser: Window = window
) {
  let index = Number(browser.history.state?.rclIndex ?? 0);
  let restoring = false;
  browser.history.replaceState({ ...browser.history.state, rclIndex: index }, '');
  const onPopState = (event: PopStateEvent) => {
    if (restoring) {
      restoring = false;
      return;
    }
    const nextIndex = event.state?.rclIndex;
    if (typeof nextIndex !== 'number') {
      // Entries from outside this router need a document navigation, which is
      // protected by the editor's beforeunload handler.
      browser.location.reload();
      return;
    }
    if (!canLeave()) {
      restoring = true;
      browser.history.go(index - nextIndex);
      return;
    }
    index = nextIndex;
    onNavigate(browser.location.pathname);
  };
  browser.addEventListener('popstate', onPopState);
  return {
    navigate(path: string) {
      if (restoring || path === browser.location.pathname || !canLeave()) return false;
      index++;
      browser.history.pushState({ rclIndex: index }, '', path);
      onNavigate(path);
      return true;
    },
    dispose() {
      browser.removeEventListener('popstate', onPopState);
    }
  };
}
