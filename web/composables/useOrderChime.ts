// Aviso sonoro de "pedido nuevo" para el panel de personal. Se genera el tono con Web Audio
// API (un par de notas cortas) en vez de cargar un archivo de audio.
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (!import.meta.client) return null;
  if (!audioCtx) {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  return audioCtx;
}

/**
 * Desbloquea el audio para el resto de la sesion. Los navegadores solo permiten reproducir
 * sonido tras un gesto real del usuario: hay que llamarla de forma SINCRONA, antes de
 * cualquier `await`, dentro del propio handler del clic (p. ej. el boton de "Entrar").
 */
export function primeAudio() {
  try {
    getAudioContext()?.resume();
  } catch {
    // si el navegador no soporta AudioContext, sencillamente no habra sonido
  }
}

/** Tono corto de aviso (dos notas ascendentes). Nunca lanza: un fallo de audio no debe
 * interrumpir el flujo de pedidos. */
export function playNewOrderChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [660, 880].forEach((freq, i) => {
      const start = now + i * 0.14;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      // Envolvente corta (ataque/caida) para evitar el "click" de un tono cuadrado.
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  } catch {
    // el aviso visual (pulso en la tarjeta) sigue funcionando aunque falle el sonido
  }
}
