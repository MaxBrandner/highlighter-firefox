// Konfiguration für das web-ext-Werkzeug (Bauen/Signieren).
module.exports = {
  // Diese Dateien gehören NICHT ins Erweiterungs-Paket.
  ignoreFiles: [
    "node_modules",
    "package.json",
    "package-lock.json",
    "README.md",
    "web-ext-config.cjs",
    "web-ext-artifacts",
    "updates.json",
  ],
  sign: {
    // Selbstverteilung: signiert, aber nicht öffentlich im AMO-Katalog gelistet.
    channel: "unlisted",
  },
};
