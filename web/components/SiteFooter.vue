<template>
  <footer class="footer">
    <div class="footer-inner">
      <img src="/logo-footer.png" alt="La Quintaesencia" class="footer-logo" />

      <div class="footer-grid">
        <section>
          <h4>Visítanos</h4>
          <address>
            {{ settings?.address }}<br v-if="settings?.address && settings?.addressMapUrl" />
            <a v-if="settings?.addressMapUrl" :href="settings.addressMapUrl" class="link" target="_blank" rel="noopener">
              Cómo llegar
            </a>
          </address>
        </section>

        <section v-if="settings?.schedule?.length">
          <h4>Horario</h4>
          <ul class="plain">
            <li v-for="line in settings.schedule" :key="line.label"><span>{{ line.label }}</span> {{ line.hours }}</li>
          </ul>
        </section>

        <section v-if="settings?.phone || settings?.email">
          <h4>Contacto</h4>
          <ul class="plain">
            <li v-if="settings.phone"><a :href="`tel:${settings.phone.replace(/\s+/g, '')}`" class="link">{{ settings.phone }}</a></li>
            <li v-if="settings.email"><a :href="`mailto:${settings.email}`" class="link">{{ settings.email }}</a></li>
          </ul>
        </section>
      </div>

      <div v-if="socials.length" class="socials" aria-label="Redes sociales">
        <a v-for="s in socials" :key="s.name" :href="s.href" class="social" :aria-label="s.name" target="_blank" rel="noopener">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" v-html="s.icon" />
        </a>
      </div>

      <p class="legal">
        © {{ year }} La Quinta · Café de Especialidad · Todos los derechos reservados ·
        <NuxtLink to="/privacidad" class="staff-link">Política de privacidad</NuxtLink> ·
        <NuxtLink to="/staff" class="staff-link">Acceso personal</NuxtLink>
      </p>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { SITE_SETTINGS_QUERY, type SiteSettings } from "~/composables/useSiteSettings";

const year = new Date().getFullYear();

const { result } = useQuery<{ siteSettings: SiteSettings }>(SITE_SETTINGS_QUERY);
const settings = computed(() => result.value?.siteSettings);

// Los iconos son fijos (solo estas 4 redes); cada uno solo aparece si tiene URL configurada
// desde el panel de personal, para no mostrar enlaces muertos a "#".
const SOCIAL_ICONS: Record<string, string> = {
  socialInstagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor"/>',
  socialFacebook: '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/>',
  socialTiktok: '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.3 2.5 2 4.2 5 4.5"/>',
  socialWhatsapp: '<path d="M3 21l1.6-4.6A8.5 8.5 0 1 1 8 19.5L3 21z"/><path d="M9 9.5c.5 2.5 2.5 4.5 5.5 5.5l1.5-1.5-2-1-1 .8c-1-.5-1.8-1.3-2.3-2.3l.8-1-1-2L9 9.5z"/>',
};
const SOCIAL_NAMES: Record<string, string> = {
  socialInstagram: "Instagram",
  socialFacebook: "Facebook",
  socialTiktok: "TikTok",
  socialWhatsapp: "WhatsApp",
};

const socials = computed(() => {
  if (!settings.value) return [];
  return Object.keys(SOCIAL_ICONS)
    .filter((key) => !!(settings.value as any)[key])
    .map((key) => ({ name: SOCIAL_NAMES[key], href: (settings.value as any)[key], icon: SOCIAL_ICONS[key] }));
});
</script>

<style scoped>
.footer {
  margin-top: 40px;
  background: var(--color4);
  /* Las reglas de abajo usan var(--text), var(--text-muted), etc.: se redefinen aqui para
     contraste sobre el fondo marrón. Las custom properties atraviesan el scoping de Vue. */
  --text: var(--surface);
  --text-muted: rgba(255, 255, 255, 0.72);
  --border-strong: rgba(255, 255, 255, 0.3);
  border-top: 1px solid var(--border-strong);
  /* deja sitio a la barra fija del carrito */
  padding: 36px 20px calc(90px + env(safe-area-inset-bottom, 0px));
}
.footer-inner { max-width: 720px; margin: 0 auto; }
.footer-logo { display: block; height: 30px; width: auto; max-width: 100%; margin-bottom: 24px; }

.footer-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 24px;
}
h4 {
  margin: 0 0 8px;
  font-family: var(--font-futura-text);
  font-weight: 950;
  font-size: 15px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text);
}
address, .plain { font-style: normal; font-size: 13.5px; line-height: 1.7; color: var(--text-muted); white-space: pre-line; }
.plain { list-style: none; margin: 0; padding: 0; white-space: normal; }
.plain span { display: inline-block; min-width: 76px; color: var(--text); font-weight: 600; }
.link { color: var(--text-muted); text-decoration: none; border-bottom: 1px solid var(--border-strong); }
.link:hover { color: var(--text); }

.socials { display: flex; gap: 10px; margin-top: 26px; }
.social {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1px solid var(--text-muted);
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, color 0.15s ease;
}
.social:hover { background: var(--accent); border-color: var(--accent); }

.legal { margin: 26px 0 0; font-size: 11.5px; color: var(--text-muted); opacity: 0.85; }
.staff-link { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.staff-link:hover { color: var(--text); }
</style>
