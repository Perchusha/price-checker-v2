import { useCallback, useEffect, useState } from "react";
import { playBeep, playWavFile } from "../lib/audio";

export interface AppSettings {
  autostart: boolean;
  startMinimized: boolean;
  soundEnabled: boolean;
  selectedSound: string;
}

export interface SoundFile {
  name: string;
  path: string;
}

const electron = (window as any).require?.("electron");
const ipcRenderer = electron?.ipcRenderer;

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [sounds, setSounds] = useState<SoundFile[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ipcRenderer) return;
    Promise.all([
      ipcRenderer.invoke("get-settings"),
      ipcRenderer.invoke("get-available-sounds"),
    ]).then(([s, soundList]) => {
      setSettings(s);
      setSounds(soundList);
    });
  }, []);

  const saveSettings = useCallback(async (newSettings: AppSettings) => {
    if (!ipcRenderer) return false;
    setSaving(true);
    try {
      const result = await ipcRenderer.invoke("save-settings", newSettings);
      if (result.success) setSettings(newSettings);
      return result.success as boolean;
    } finally {
      setSaving(false);
    }
  }, []);

  const previewSound = useCallback((soundPath: string) => {
    if (soundPath) {
      playWavFile(soundPath);
    } else {
      playBeep();
    }
  }, []);

  return { settings, sounds, saving, saveSettings, previewSound };
}
