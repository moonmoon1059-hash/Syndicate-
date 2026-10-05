/**
 * Dual-Channel Push Notification Service
 * Manages native Web Push Notifications, browser sound synth beeps, and mobile vibration.
 */

// Web Audio API Synth Beeper (zero external mp3/audio files needed)
let audioCtx: AudioContext | null = null;

export function playAlertChime(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;

    // Dual-tone high-velocity chime (880Hz A5 -> 1174Hz D6)
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(1174, now + 0.12);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(440, now);
    osc2.frequency.exponentialRampToValueAtTime(587.33, now + 0.12);

    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.linearRampToValueAtTime(0.25, now + 0.03);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.46);
    osc2.stop(now + 0.46);
  } catch (err) {
    console.warn('[NotificationService] Audio chime error:', err);
  }
}

// 30-Minute In-Memory cooldown to avoid repeating chimes/pushes for the same symbol
const notifiedSymbolsCooldown = new Map<string, number>();
const CLIENT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

const STORAGE_KEY = 'syndicate_alerts_enabled';

export class NotificationService {
  private static alertsEnabled: boolean = typeof window !== 'undefined'
    ? localStorage.getItem(STORAGE_KEY) === 'true'
    : false;

  public static isAlertsEnabled(): boolean {
    return this.alertsEnabled;
  }

  public static async toggleAlerts(): Promise<boolean> {
    if (this.alertsEnabled) {
      this.alertsEnabled = false;
      try {
        localStorage.setItem(STORAGE_KEY, 'false');
      } catch {
        // ignore
      }
      return false;
    }

    // 1) Immediate Audio Unlock: On user click, immediately initialize audio context and play dual-tone synth chime (880Hz -> 1174Hz)
    playAlertChime();
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([150, 50, 150]);
      } catch {
        // ignore
      }
    }

    // 2) Permission Handling: Wrap Notification.requestPermission() in safe try/catch with iframe fallback
    // Even if blocked, denied, or embedded in an iframe, keep alertsEnabled = true so audio beeps and UI alerts work!
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        if (Notification.permission === 'default') {
          await Notification.requestPermission();
        }
      } catch (err) {
        console.warn('[NotificationService] Notification permission request non-fatal fallback:', err);
      }
    }

    this.alertsEnabled = true;
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // ignore
    }

    return true;
  }

  /**
   * Evaluates new candidates feed and dispatches alerts for 🟢 VALID signals
   */
  public static handleCandidateUpdates(candidates: Array<{
    symbol: string;
    tier: string;
    score: number;
    direction: string;
    volMultiplier: number;
    markPrice: number;
    executionLabel?: string;
    executionMode?: string;
    entryZone?: string;
    slPrice?: number;
    slPercent?: number;
  }>): void {
    if (!this.alertsEnabled) return;

    const now = Date.now();
    const validRunners = candidates.filter(c => c.tier === 'VALID' && c.score >= 85);

    for (const runner of validRunners) {
      const sym = runner.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
      const lastNotified = notifiedSymbolsCooldown.get(sym);

      if (lastNotified && now - lastNotified < CLIENT_COOLDOWN_MS) {
        continue;
      }

      // Record dispatch time
      notifiedSymbolsCooldown.set(sym, now);

      // 1. Audio synth chime
      playAlertChime();

      // 2. Mobile device vibration: [300, 100, 300]
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate([300, 100, 300]);
        } catch {
          // ignore
        }
      }

      // 3. Native Web Notification
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const mode = runner.executionLabel || runner.executionMode || 'VALID EXECUTION';
          const title = `🚨 ${mode}: #${runner.symbol} (${runner.direction})`;
          const body = `Vol ${runner.volMultiplier.toFixed(2)}x | Mark $${runner.markPrice}\nEntry: ${runner.entryZone || 'Pivot Shelf'}\nSL: $${runner.slPrice || 'Floor'}`;

          const notification = new Notification(title, {
            body,
            icon: '/icon.svg',
            badge: '/icon.svg',
            tag: `syndicate-${sym}`
          } as NotificationOptions);

          notification.onclick = () => {
            window.focus();
            notification.close();
          };
        } catch (e) {
          console.warn('[NotificationService] Notification dispatch error:', e);
        }
      }
    }
  }
}
