# Neue Version veröffentlichen

Kurzanleitung, um eine neue Version der Erweiterung an die Nutzer auszuliefern.

## Wie das Ganze zusammenhängt

Es gibt **zwei unabhängige** Dinge, die beide „Update" heißen:

1. **Signieren bei Mozilla** – holt Mozillas Signatur für die neue Version.
   Machst *du* als Entwickler, einmal pro Version. Ohne Signatur installiert
   Firefox die `.xpi` nicht dauerhaft.
2. **`update_url` / `updates.json`** – der Auslieferungskanal zu den Nutzern.
   Firefox liest bei jedem Nutzer regelmäßig die `updates.json` auf GitHub und
   installiert eine neuere Version **automatisch**. Hat mit Mozilla nichts zu tun.

```
manifest.json (in der .xpi)  --update_url-->  updates.json (GitHub)
                                                     |
                                                     +--update_link--> highlighter-X.Y.Z.xpi (GitHub Release)
```

Die verteilte Erweiterung ist **unlisted** (nicht im öffentlichen AMO-Katalog),
wird aber über das öffentliche GitHub-Repo verteilt.

## Schritt für Schritt

### 1. Versionsnummer erhöhen (an allen drei Stellen gleich!)

- `manifest.json`  → `"version": "X.Y.Z"`
- `package.json`   → `"version": "X.Y.Z"`
- `updates.json`   → `"version": "X.Y.Z"` **und** den `update_link` auf
  `.../releases/download/vX.Y.Z/highlighter-X.Y.Z.xpi` anpassen

> Jede Versionsnummer darf bei AMO nur **einmal** existieren – immer hochzählen,
> nie eine bereits hochgeladene Nummer wiederverwenden.

### 2. Paket bauen

```bash
npm run build          # erzeugt web-ext-artifacts/highlighter-X.Y.Z.zip
```

Das gebaute ZIP enthält **keine** `updates.json` (per `web-ext-config.cjs`
ausgeschlossen) und die `update_url` im Manifest.

### 3. Bei Mozilla signieren lassen

**Weg A – Web (manuell):**
1. https://addons.mozilla.org/developers/addons → Add-on „Highlighter" öffnen.
2. **„Upload New Version"** → `highlighter-X.Y.Z.zip` hochladen.
3. Source-Code-Frage: **No** (kein Bundler/Minifier – Code ist direkt lesbar).
4. Nach dem automatischen Signieren die signierte `.xpi` herunterladen.

**Weg B – Kommandozeile (mit API-Keys, bequemer):**
```bash
npm run sign -- --api-key=DEIN_JWT_ISSUER --api-secret=DEIN_JWT_SECRET
# → signierte .xpi landet direkt in web-ext-artifacts/
```
API-Keys: https://addons.mozilla.org/developers/addon/api/key/

### 4. GitHub-Release anlegen

Die signierte Datei **muss** exakt `highlighter-X.Y.Z.xpi` heißen (passend zum
`update_link`):

```bash
cp <heruntergeladene-signierte>.xpi web-ext-artifacts/highlighter-X.Y.Z.xpi

git add manifest.json package.json updates.json
git commit -m "Version X.Y.Z"
git push origin main

gh release create vX.Y.Z \
  web-ext-artifacts/highlighter-X.Y.Z.xpi \
  --title "Highlighter X.Y.Z" \
  --notes "Beschreibung der Änderungen."
```

### 5. Prüfen, dass alles öffentlich erreichbar ist

```bash
# updates.json erreichbar?
curl -s -o /dev/null -w "%{http_code}\n" \
  https://raw.githubusercontent.com/MaxBrandner/highlighter-firefox/main/updates.json

# .xpi ohne Login ladbar?
curl -s -L -o /dev/null -w "%{http_code}\n" \
  https://github.com/MaxBrandner/highlighter-firefox/releases/download/vX.Y.Z/highlighter-X.Y.Z.xpi
```

Beide müssen `200` liefern. Danach aktualisiert Firefox alle Nutzer automatisch.

## Wichtige Fakten

- **Add-on-ID:** `highlighter@max.local` – muss im Manifest und als Schlüssel in
  `updates.json` identisch bleiben. Ändern = für Firefox eine *andere*
  Erweiterung (bestehende Installationen updaten dann nicht mehr).
- **update_url:** `https://raw.githubusercontent.com/MaxBrandner/highlighter-firefox/main/updates.json`
  Steht im Manifest und ist Teil der signierten Datei – bei einem Umzug müsste
  neu signiert werden.
- **Verteil-Link für Nutzer:**
  `https://github.com/MaxBrandner/highlighter-firefox/releases/latest`
