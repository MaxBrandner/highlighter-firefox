// Öffnet die Seitenleiste, wenn auf das Symbol in der Toolbar geklickt wird.
// sidebarAction.open() ist nur direkt aus einer Nutzeraktion (Klick) heraus erlaubt.
browser.browserAction.onClicked.addListener(() => {
  browser.sidebarAction.open();
});
