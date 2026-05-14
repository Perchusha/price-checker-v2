import React, { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { cn } from "../lib/utils";
import { AppSettings, useSettings } from "../hooks/useSettings";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Label } from "./ui/label";

export function SettingsDialog() {
  const { settings, sounds, saving, saveSettings, previewSound } = useSettings();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AppSettings | null>(null);

  useEffect(() => {
    if (open && settings) {
      setDraft({ ...settings });
    }
  }, [open, settings]);

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = async () => {
    if (!draft) return;
    const ok = await saveSettings(draft);
    if (ok) setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="Настройки" className="px-2">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Настройки</DialogTitle>
        </DialogHeader>

        {!draft ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Загрузка…</div>
        ) : (
          <>
            <div className="space-y-4 py-1">
              <SettingRow label="Автозапуск с Windows">
                <Toggle checked={draft.autostart} onChange={(v) => set("autostart", v)} />
              </SettingRow>

              <SettingRow label="Открывать свёрнутым">
                <Toggle checked={draft.startMinimized} onChange={(v) => set("startMinimized", v)} />
              </SettingRow>

              <SettingRow label="Звук при нахождении цены">
                <Toggle checked={draft.soundEnabled} onChange={(v) => set("soundEnabled", v)} />
              </SettingRow>

              {draft.soundEnabled && sounds.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Системный звук</Label>
                  <div className="flex gap-2">
                    <select
                      className="flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      value={draft.selectedSound}
                      onChange={(e) => set("selectedSound", e.target.value)}
                    >
                      <option value="">Стандартный (системный beep)</option>
                      {sounds.map((s) => (
                        <option key={s.path} value={s.path}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="shrink-0"
                      disabled={!draft.selectedSound}
                      onClick={() => previewSound(draft.selectedSound)}
                      title="Прослушать"
                    >
                      ▶
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Сохранение…" : "Сохранить"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        checked ? "bg-primary" : "bg-input"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm ring-0 transition-transform",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}
