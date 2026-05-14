export interface AlertLoop {
  stop(): void;
}

export function playWavFile(soundPath: string): void {
  const fs = (window as any).require?.("fs") as
    | { readFileSync(p: string): Buffer }
    | undefined;
  if (!fs) return;
  try {
    const buffer = fs.readFileSync(soundPath);
    const blob = new Blob([buffer], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
    audio.play().catch(() => URL.revokeObjectURL(url));
  } catch {}
}

export function playBeep(): void {
  try {
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new (Ctx as typeof AudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    setTimeout(() => { try { ctx.close(); } catch {} }, 1000);
  } catch {}
}

export function startAlertLoop(soundPath: string): AlertLoop {
  return soundPath ? startWavLoop(soundPath) : startBeepLoop();
}

function startWavLoop(soundPath: string): AlertLoop {
  const fs = (window as any).require?.("fs") as
    | { readFileSync(p: string): Buffer }
    | undefined;
  if (!fs) return startBeepLoop();
  try {
    const buffer = fs.readFileSync(soundPath);
    const blob = new Blob([buffer], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.loop = true;
    audio.play().catch(() => {});
    return {
      stop() {
        audio.pause();
        audio.src = "";
        URL.revokeObjectURL(url);
      },
    };
  } catch {
    return startBeepLoop();
  }
}

function startBeepLoop(): AlertLoop {
  const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctx) return { stop: () => {} };

  const ctx = new (Ctx as typeof AudioContext)();
  let stopped = false;

  function tick() {
    if (stopped) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.start(t);
    osc.stop(t + 0.4);
    setTimeout(tick, 1500);
  }

  tick();
  return {
    stop() {
      stopped = true;
      try { ctx.close(); } catch {}
    },
  };
}
