/**
 * Plugin-owned `<style>` elements.
 *
 * The host's client module loader (dsh-client-modules) claims every
 * **untagged** `<style>` in the document for whichever module is being
 * materialized (`claimStyles`) and deletes a module's claimed styles when that
 * module is reloaded, invalidated or pruned (`removeOwnedStyles`). An untagged
 * sheet of ours therefore ends up booked under some other plugin and vanishes
 * when that plugin updates while the app runs (seen 2026-10: the history
 * arrows lost all positioning and sat unstyled over the traffic lights).
 *
 * So every sheet carries `data-plugin` = our own module id: other modules'
 * claims skip it, and the host only removes it when *this* plugin reloads —
 * after which `apply` mounts it again. Callers also re-mount on use, so a
 * sheet removed by anything else heals on the next render / peek.
 */
const OWNER = 'dsh-sidebar-hover'

/** Ensure the sheet `id` is in `<head>` with `css`; returns the element. */
export function mountStyle(id: string, css: string): HTMLStyleElement {
  let style = document.getElementById(id)
  if (!(style instanceof HTMLStyleElement) || !style.isConnected) {
    style?.remove()
    style = document.createElement('style')
    style.id = id
    document.head.appendChild(style)
  }
  if (style.getAttribute('data-plugin') !== OWNER) style.setAttribute('data-plugin', OWNER)
  if (style.textContent !== css) style.textContent = css
  return style as HTMLStyleElement
}

export function unmountStyle(id: string): void {
  document.getElementById(id)?.remove()
}
