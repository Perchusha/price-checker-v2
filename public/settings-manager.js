"use strict";
const fs = require("fs");
const path = require("path");

const DEFAULT_SETTINGS = {
  autostart: false,
  startMinimized: false,
  soundEnabled: true,
  selectedSound: "",
};

class SettingsManager {
  constructor(userDataPath) {
    this.settingsPath = path.join(userDataPath, "data", "settings.json");
  }

  load() {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const raw = fs.readFileSync(this.settingsPath, "utf-8");
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      }
    } catch {}
    return { ...DEFAULT_SETTINGS };
  }

  save(settings) {
    try {
      const dir = path.dirname(this.settingsPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2), "utf-8");
      return true;
    } catch (err) {
      console.error("Failed to save settings:", err);
      return false;
    }
  }

  getAvailableSounds() {
    if (process.platform !== "win32") return [];
    const mediaDir = "C:\\Windows\\Media";
    try {
      const files = fs.readdirSync(mediaDir);
      return files
        .filter((f) => f.toLowerCase().endsWith(".wav"))
        .map((f) => ({ name: f, path: path.join(mediaDir, f) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  }
}

module.exports = SettingsManager;
