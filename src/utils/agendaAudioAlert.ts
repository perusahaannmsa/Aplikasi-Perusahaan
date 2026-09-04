/**
 * Audio Synthesizer Engine & Notification Reminder System for Agenda
 * Uses Web Audio API to produce pleasant chimes, bells, and melodies without external audio files.
 */

export type SoundMelodyType = 'melodi_lembut' | 'lonceng_agenda' | 'alarm_ringkas' | 'marimba';

class AgendaSoundEngine {
  private audioCtx: AudioContext | null = null;
  private isPlayingLoop = false;
  private loopIntervalId: any = null;
  private soundEnabled = true;
  private currentVolume = 0.7;
  private currentMelody: SoundMelodyType = 'melodi_lembut';

  constructor() {
    try {
      const storedEnabled = localStorage.getItem('agenda_sound_enabled');
      if (storedEnabled !== null) {
        this.soundEnabled = storedEnabled === 'true';
      }
      const storedVol = localStorage.getItem('agenda_sound_volume');
      if (storedVol !== null) {
        this.currentVolume = Math.max(0.1, Math.min(1.0, parseFloat(storedVol) || 0.7));
      }
      const storedMelody = localStorage.getItem('agenda_sound_melody') as SoundMelodyType;
      if (storedMelody) {
        this.currentMelody = storedMelody;
      }
    } catch {
      // ignore
    }
  }

  private getAudioContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  public isEnabled(): boolean {
    return this.soundEnabled;
  }

  public setEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    try {
      localStorage.setItem('agenda_sound_enabled', enabled ? 'true' : 'false');
    } catch {}
    if (!enabled) {
      this.stopAlert();
    }
  }

  public getVolume(): number {
    return this.currentVolume;
  }

  public setVolume(vol: number): void {
    this.currentVolume = Math.max(0.05, Math.min(1.0, vol));
    try {
      localStorage.setItem('agenda_sound_volume', String(this.currentVolume));
    } catch {}
  }

  public getMelody(): SoundMelodyType {
    return this.currentMelody;
  }

  public setMelody(melody: SoundMelodyType): void {
    this.currentMelody = melody;
    try {
      localStorage.setItem('agenda_sound_melody', melody);
    } catch {}
  }

  /**
   * Synthesizes a single note with harmonic richness and smooth envelope
   */
  private playNote(freq: number, startTime: number, duration: number, type: OscillatorType = 'sine', decayMult = 1.0) {
    try {
      const ctx = this.getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);

      // Primary Gain Envelope
      const peakGain = 0.3 * this.currentVolume;
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * decayMult);

      // Add a subtle second harmonic for warmth
      const harmonicOsc = ctx.createOscillator();
      const harmonicGain = ctx.createGain();
      harmonicOsc.type = 'triangle';
      harmonicOsc.frequency.setValueAtTime(freq * 2, startTime);
      harmonicGain.gain.setValueAtTime(0.0001, startTime);
      harmonicGain.gain.exponentialRampToValueAtTime(peakGain * 0.35, startTime + 0.03);
      harmonicGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 0.7);

      osc.connect(gain);
      harmonicOsc.connect(harmonicGain);

      gain.connect(ctx.destination);
      harmonicGain.connect(ctx.destination);

      osc.start(startTime);
      harmonicOsc.start(startTime);

      osc.stop(startTime + duration + 0.1);
      harmonicOsc.stop(startTime + duration + 0.1);
    } catch (e) {
      console.warn('Audio synthesis note error:', e);
    }
  }

  /**
   * Plays the selected melody sequence
   */
  public playMelody(melody?: SoundMelodyType): void {
    if (!this.soundEnabled) return;
    const targetMelody = melody || this.currentMelody;

    try {
      const ctx = this.getAudioContext();
      const now = ctx.currentTime;

      if (targetMelody === 'melodi_lembut') {
        // C5 (523.25), E5 (659.25), G5 (783.99), B5 (987.77), C6 (1046.50)
        // Gentle uplifting arpeggio
        const notes = [523.25, 659.25, 783.99, 987.77, 1046.50];
        notes.forEach((freq, i) => {
          this.playNote(freq, now + i * 0.14, 0.7, 'sine', 1.2);
        });
      } else if (targetMelody === 'lonceng_agenda') {
        // Dual crystal chime bell: G5 (783.99), C6 (1046.50) with lingering reverberation
        this.playNote(783.99, now, 0.9, 'sine', 1.6);
        this.playNote(1046.50, now + 0.28, 1.2, 'sine', 1.8);
      } else if (targetMelody === 'alarm_ringkas') {
        // Modern alert chime: A5 (880), F5 (698.46), D5 (587.33), A5 (880)
        this.playNote(880, now, 0.3, 'sine', 0.8);
        this.playNote(698.46, now + 0.18, 0.3, 'sine', 0.8);
        this.playNote(587.33, now + 0.36, 0.3, 'sine', 0.8);
        this.playNote(880, now + 0.54, 0.7, 'sine', 1.3);
      } else if (targetMelody === 'marimba') {
        // Marimba wooden chime: E5 (659.25), G#5 (830.61), B5 (987.77), E6 (1318.51)
        const notes = [659.25, 830.61, 987.77, 1318.51];
        notes.forEach((freq, i) => {
          this.playNote(freq, now + i * 0.11, 0.45, 'triangle', 0.9);
        });
      }
    } catch (err) {
      console.warn('Gagal memutar melodi agenda:', err);
    }
  }

  /**
   * Starts a repeating melody loop until dismissed or stopped
   */
  public startAlertLoop(melody?: SoundMelodyType, intervalMs = 3800): void {
    if (!this.soundEnabled || this.isPlayingLoop) return;
    this.isPlayingLoop = true;

    // Play immediately
    this.playMelody(melody);

    // Repeat every intervalMs
    this.loopIntervalId = setInterval(() => {
      if (this.isPlayingLoop && this.soundEnabled) {
        this.playMelody(melody);
      } else {
        this.stopAlert();
      }
    }, intervalMs);
  }

  /**
   * Stops any currently playing repeating alert
   */
  public stopAlert(): void {
    this.isPlayingLoop = false;
    if (this.loopIntervalId) {
      clearInterval(this.loopIntervalId);
      this.loopIntervalId = null;
    }
  }

  public isLooping(): boolean {
    return this.isPlayingLoop;
  }
}

export const agendaSound = new AgendaSoundEngine();

// Web Desktop Notification Support
export async function requestAgendaNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export function sendDesktopNotification(title: string, options?: NotificationOptions): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission === 'granted') {
    try {
      const n = new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        ...options
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
      return true;
    } catch (e) {
      console.warn('Desktop notification dispatch note:', e);
      return false;
    }
  }
  return false;
}
