/**
 * UI copy for the plugin's Settings section, its rows and the titlebar
 * arrows (typed dictionary + `t`, per the client-stack rules). NS doubles as
 * the slot `locale` face.
 */
export const LOCALE_NS = 'sidebarHover'

export interface HoverRevealStrings {
  /** Settings navigation label of the plugin's own section. */
  nav: string
  row: {
    title: string
    subtitle: string
    delayLabel: string
    delayHint: string
    delayUnit: string
  }
  arrowsRow: {
    title: string
    subtitle: string
  }
  arrows: {
    back: string
    forward: string
  }
}

const en: HoverRevealStrings = {
  nav: 'Sidebar hover',
  row: {
    title: 'Hover to reveal sidebar',
    subtitle: 'Peek the sidebar by hovering the sidebar toggle. Selecting a session collapses it again.',
    delayLabel: 'Hover delay',
    delayHint: 'How long the pointer must rest before the sidebar peeks.',
    delayUnit: 'ms',
  },
  arrowsRow: {
    title: 'Session history arrows',
    subtitle: 'Back/forward arrows next to the sidebar toggle step through the sessions you opened.',
  },
  arrows: {
    back: 'Go back',
    forward: 'Go forward',
  },
}

const zh: HoverRevealStrings = {
  nav: '侧栏悬停',
  row: {
    title: '悬停展开侧栏',
    subtitle: '将指针悬停在侧栏按钮上即可临时展开；选择会话后自动收起。',
    delayLabel: '悬停延迟',
    delayHint: '指针停留多久后临时展开侧栏。',
    delayUnit: '毫秒',
  },
  arrowsRow: {
    title: '会话历史箭头',
    subtitle: '侧栏按钮旁的后退/前进箭头，在打开过的会话之间切换。',
  },
  arrows: {
    back: '后退',
    forward: '前进',
  },
}

export const localeDict = { zh, en }
