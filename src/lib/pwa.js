/**
 * PWA Service Worker & Notification Helper
 */

let globalAudioCtx = null;

function getSharedAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!globalAudioCtx) {
    globalAudioCtx = new AudioContextClass();
  }
  if (globalAudioCtx.state === 'suspended') {
    globalAudioCtx.resume().catch(() => {});
  }
  return globalAudioCtx;
}

/**
 * Membuka kunci (unlock) AudioContext pada gesture pertama pengguna di HP/Desktop
 */
export function unlockAudio() {
  if (typeof window === 'undefined') return;
  const unlock = () => {
    const ctx = getSharedAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  };
  window.addEventListener('click', unlock, { once: false, passive: true });
  window.addEventListener('touchstart', unlock, { once: false, passive: true });
  window.addEventListener('touchend', unlock, { once: false, passive: true });
}

export function registerServiceWorker() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => {
        // Registration success
      })
      .catch((err) => {
        console.warn('Service Worker registration failed:', err);
      });
  }
}

export async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  try {
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return Notification.permission === 'granted';
  } catch (err) {
    console.warn('Error requesting notification permission:', err);
    return false;
  }
}

export async function sendSystemNotification(title, body) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;

  if (Notification.permission !== 'granted') {
    const granted = await requestNotificationPermission();
    if (!granted) return;
  }

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          body,
          icon: '/icon.svg',
          badge: '/icon.svg',
          vibrate: [300, 150, 300, 150, 400],
          tag: 'antrean-call-' + Date.now(),
          renotify: true,
          requireInteraction: true,
          silent: false,
        });
        return;
      }
    }
  } catch (err) {
    console.warn('Service Worker showNotification error:', err);
  }

  try {
    new Notification(title, {
      body,
      icon: '/icon.svg',
      silent: false,
    });
  } catch (err) {
    console.warn('Direct Notification constructor error:', err);
  }
}

/**
 * Memainkan nada bip lonceng medis klinis (Harmonik 3-Nada Lembut: E5 -> G5 -> C6)
 * Khas suara pengumuman rumah sakit / puskesmas
 */
export function playNotificationChime() {
  if (typeof window === 'undefined') return;
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Nada 1: E5 (659.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.28, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Nada 2: G5 (783.99 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(783.99, now + 0.15);
    gain2.gain.setValueAtTime(0.3, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.55);

    // Nada 3: C6 (1046.50 Hz) - Nada penyelesaian lonceng medis
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(1046.50, now + 0.32);
    gain3.gain.setValueAtTime(0.35, now + 0.32);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(now + 0.32);
    osc3.stop(now + 0.95);
  } catch (e) {
    console.warn('Audio chime error:', e);
  }
}
