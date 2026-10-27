<template>
  <!-- Una casilla por digito; se avanza al escribir, se retrocede con borrar y se puede pegar el
       codigo entero (o que el movil lo autocomplete) en cualquiera de ellas. -->
  <div class="code-boxes" role="group" :aria-label="`Código de ${length} dígitos`">
    <input
      v-for="(_, i) in digits"
      :key="i"
      :ref="(el) => (boxes[i] = el as HTMLInputElement)"
      :value="digits[i]"
      type="text"
      inputmode="numeric"
      pattern="[0-9]*"
      :maxlength="length"
      :autocomplete="i === 0 ? 'one-time-code' : 'off'"
      :aria-label="`Dígito ${i + 1} de ${length}`"
      @input="onDigitInput(i, $event)"
      @keydown="onDigitKeydown(i, $event)"
      @paste.prevent="onPaste(i, $event)"
      @focus="($event.target as HTMLInputElement).select()"
    />
  </div>
</template>

<script setup lang="ts">
/** Codigo de un solo uso (login de clientes, contraseña olvidada del personal). v-model: el codigo. */
const props = withDefaults(defineProps<{ length?: number }>(), { length: 6 });
const model = defineModel<string>({ default: "" });
// Enter en cualquier casilla: el padre decide si ya se puede enviar.
const emit = defineEmits<{ (e: "submit"): void }>();

const boxes: HTMLInputElement[] = [];
// Las casillas van aparte del v-model: una vacia en medio no debe desplazar las siguientes.
const split = (code: string) => Array.from({ length: props.length }, (_, i) => code[i] ?? "");
const digits = ref<string[]>(split(model.value));
// Cambio desde fuera (p. ej. vaciarlo al reenviar el codigo).
watch(model, (code) => {
  if (code !== digits.value.join("")) digits.value = split(code);
});

function setDigits(next: string[]) {
  digits.value = next;
  model.value = next.join("");
}

// Reparte los digitos de `text` a partir de la casilla `from` y deja el foco en la siguiente libre.
function fillFrom(from: number, text: string) {
  const chars = text.replace(/\D/g, "").slice(0, props.length - from).split("");
  if (!chars.length) return;
  const next = [...digits.value];
  chars.forEach((c, k) => (next[from + k] = c));
  setDigits(next);
  boxes[Math.min(from + chars.length, props.length - 1)]?.focus();
}

function setDigit(i: number, value: string) {
  const next = [...digits.value];
  next[i] = value;
  setDigits(next);
}

function onDigitInput(i: number, event: Event) {
  const input = event.target as HTMLInputElement;
  const value = input.value.replace(/\D/g, "");
  if (!value) {
    setDigit(i, "");
    input.value = "";
    return;
  }
  // El codigo entero de golpe (autocompletado del movil): se reparte desde la primera casilla.
  if (value.length >= props.length) {
    input.value = digits.value[i];
    fillFrom(0, value);
    return;
  }
  // Un digito escrito sobre el que ya habia: se queda el nuevo.
  const typed = value.length > 1 ? value.replace(digits.value[i], "").slice(-1) || value.slice(-1) : value;
  setDigit(i, typed);
  input.value = typed;
  if (i < props.length - 1) boxes[i + 1]?.focus();
}

function onDigitKeydown(i: number, event: KeyboardEvent) {
  if (event.key === "Backspace" && !digits.value[i] && i > 0) {
    event.preventDefault();
    setDigit(i - 1, "");
    boxes[i - 1]?.focus();
  } else if (event.key === "ArrowLeft" && i > 0) {
    event.preventDefault();
    boxes[i - 1]?.focus();
  } else if (event.key === "ArrowRight" && i < props.length - 1) {
    event.preventDefault();
    boxes[i + 1]?.focus();
  } else if (event.key === "Enter") {
    event.preventDefault();
    emit("submit");
  }
}

function onPaste(i: number, event: ClipboardEvent) {
  const text = event.clipboardData?.getData("text") ?? "";
  fillFrom(text.replace(/\D/g, "").length >= props.length ? 0 : i, text);
}

defineExpose({ focus: () => boxes[0]?.focus() });
</script>

<style scoped>
.code-boxes { display: flex; gap: 8px; width: 100%; }
.code-boxes input {
  flex: 1 1 0;
  min-width: 0;
  height: 52px;
  padding: 0;
  text-align: center;
  font-size: 22px;
  font-variant-numeric: tabular-nums;
}
</style>
