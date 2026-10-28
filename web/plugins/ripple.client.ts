/**
 * Efecto ripple en todos los botones: una onda que sale de donde se toca. Un solo listener para
 * toda la app, en vez de tocar cada componente.
 *
 * La onda no va dentro del boton (haria falta position: relative y overflow: hidden en cada uno, y
 * eso movería o recortaría los badges que se salen de su caja): va en una capa fija encima, con su
 * mismo tamaño y borde redondeado. Dentro de un <dialog> abierto se pone en el propio dialog, que
 * esta en la capa superior y taparia una capa del body.
 */
const SELECTOR = "button, .button, [role='button']";
const DURATION_MS = 450;

export default defineNuxtPlugin(() => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0 || reducedMotion.matches) return;
      const target = (event.target as Element | null)?.closest<HTMLElement>(SELECTOR);
      if (!target || target.matches(":disabled, [aria-disabled='true']")) return;

      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const style = getComputedStyle(target);

      const layer = document.createElement("span");
      layer.className = "ripple-layer";
      layer.setAttribute("aria-hidden", "true");
      Object.assign(layer.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        borderRadius: style.borderRadius,
        color: style.color,
      });

      // Lo bastante grande para cubrir el boton entero desde el punto tocado
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const radius = Math.hypot(Math.max(x, rect.width - x), Math.max(y, rect.height - y));
      const wave = document.createElement("span");
      wave.className = "ripple-wave";
      Object.assign(wave.style, {
        left: `${x - radius}px`,
        top: `${y - radius}px`,
        width: `${radius * 2}px`,
        height: `${radius * 2}px`,
        animationDuration: `${DURATION_MS}ms`,
      });

      layer.appendChild(wave);
      (target.closest("dialog[open]") ?? document.body).appendChild(layer);
      window.setTimeout(() => layer.remove(), DURATION_MS);
    },
    { passive: true }
  );
});
