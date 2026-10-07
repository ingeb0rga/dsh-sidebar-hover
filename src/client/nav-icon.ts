/**
 * Settings navigation icon for the plugin's own section.
 *
 * `settings.section` (rc.2) projects only `id`, `order` and `label`; the
 * shell picks icons from a closed list of built-in ids and gives external
 * sections a generic gear. Same workaround as dsh-better-sidebar's Side card:
 * mark our nav button (matched by its current localized label) and let a
 * stylesheet hide the gear and draw a Lucide `panel-left` glyph as a
 * currentColor mask, so it follows the native hover/active colors at the
 * shell's 16 px icon size.
 */
const MARKER = 'data-dsh-sidebar-hover-settings-nav'
const STYLE_ID = 'dsh-sidebar-hover-nav-icon'

const GLYPH =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='18' height='18' x='3' y='3' rx='2'/%3E%3Cpath d='M9 3v18'/%3E%3C/svg%3E"

const CSS = `
[${MARKER}] > svg:first-child { display: none; }
[${MARKER}]::before {
  content: '';
  flex: none;
  width: 16px;
  height: 16px;
  background: currentColor;
  -webkit-mask: url("${GLYPH}") center / contain no-repeat;
  mask: url("${GLYPH}") center / contain no-repeat;
}
`

/** Keep the marker on our settings nav button; returns the disposer. */
export function installSettingsNavIcon(label: () => string): () => void {
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.getElementById(STYLE_ID)?.remove()
  document.head.appendChild(style)

  let frame = 0
  const sync = (): void => {
    frame = 0
    const current = label().trim()
    for (const button of document.querySelectorAll('[role="dialog"] nav button')) {
      if (current.length > 0 && button.textContent?.trim() === current) button.setAttribute(MARKER, '')
      else button.removeAttribute(MARKER)
    }
  }
  // Coalesce mutation bursts (streaming transcript) into one sync per frame.
  const observer = new MutationObserver(() => {
    if (frame === 0) frame = window.requestAnimationFrame(sync)
  })
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  sync()

  return () => {
    observer.disconnect()
    if (frame !== 0) window.cancelAnimationFrame(frame)
    for (const element of document.querySelectorAll(`[${MARKER}]`)) element.removeAttribute(MARKER)
    style.remove()
  }
}
