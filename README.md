# Highlighter (Firefox)

Textstellen auf Webseiten farbig markieren, Notizen hinzufügen und alles in der
Seitenleiste verwalten.

## Funktionen

- **Markieren mit Farbleiste** – Text auswählen → schwebendes Popup erscheint →
  Farbe anklicken (6 Farben).
- **Bleibt gespeichert** – Highlights werden pro Seite gesichert und beim
  erneuten Besuch wiederhergestellt.
- **Notizen** – zu jedem Highlight eine Notiz. Sichtbar beim **Hovern** über die
  Markierung und in der **Seitenleiste**.
- **Seitenleiste** – listet alle Highlights der aktuellen Seite; anklicken springt
  zur Stelle, Farbe ändern, Notiz bearbeiten, löschen.
- **Klick auf eine Markierung** öffnet ein Popup zum Bearbeiten (Farbe, Notiz, löschen).

## Laden zum Testen (temporär)

1. In Firefox `about:debugging#/runtime/this-firefox` öffnen.
2. **„Temporäres Add-on laden…"** klicken.
3. Die Datei `manifest.json` in diesem Ordner auswählen.

Die Erweiterung ist geladen, bis Firefox neu gestartet wird. Über das Symbol in
der Toolbar (oder das Sidebar-Menü) öffnest du die Seitenleiste.

> Hinweis: Auf internen Seiten (`about:`, `addons.mozilla.org`, …) funktioniert
> das Markieren nicht – das verbietet Firefox für Erweiterungen.

## Dauerhaft installieren (signieren über Mozilla)

Damit die Erweiterung Neustarts übersteht, muss sie von Mozilla signiert werden
(bleibt dabei privat, „unlisted"). Einmalig `web-ext` ist bereits als
Dev-Abhängigkeit installiert (`npm install`).

1. **AMO-Account** anlegen: https://addons.mozilla.org/
2. **API-Schlüssel** erzeugen:
   https://addons.mozilla.org/developers/addon/api/key/
   → liefert *JWT issuer* (Key) und *JWT secret*.
3. Signieren (privat/unlisted, Kanal steht schon in `web-ext-config.cjs`):

   ```bash
   npm run sign -- --api-key=DEIN_JWT_ISSUER --api-secret=DEIN_JWT_SECRET
   ```

4. Die signierte `.xpi` landet in `web-ext-artifacts/`. Installieren über:
   `about:addons` → ⚙ → **„Add-on aus Datei installieren…"** → `.xpi` wählen.

Nach jeder Code-Änderung: `version` in `manifest.json` erhöhen und erneut
`npm run sign …` ausführen.

## Nützliche Befehle

```bash
npm run lint    # Erweiterung auf Fehler prüfen
npm run build   # unsigniertes .zip in web-ext-artifacts/ bauen
```

## Dateien

| Datei | Zweck |
|-------|-------|
| `manifest.json` | Erweiterungs-Konfiguration |
| `background.js` | Öffnet die Seitenleiste beim Klick aufs Symbol |
| `content.js` | Markieren, Speichern, Wiederherstellen, Notizen |
| `content.css` | Styles für Farbleiste, Tooltip, Popup |
| `sidebar/` | Seitenleisten-Oberfläche |
| `icons/icon.svg` | Symbol |

## Bekannte Grenzen (erste Version)

- Wiederherstellung basiert auf Textsuche mit Kontext – bei stark dynamischen
  Seiten kann eine Markierung mal nicht wiedergefunden werden.
- Noch keine Übersicht über alle Seiten hinweg (nur aktuelle Seite).
- Highlights in `<iframe>`s werden nicht erfasst.
