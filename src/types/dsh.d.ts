/**
 * Local type faces for the DSH client services this plugin consumes, matching
 * the verified 0.2.0-rc.2 contracts (see FINDINGS.md). Declared as ambient
 * module augmentation so the plugin compiles standalone — at runtime the
 * services come from the host's own copies, waited on via `apply.inject`.
 */
export {}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Slot registry (dsh-client-ui-slots). */
    readonly slots: {
      inject(key: string, callback: () => unknown): unknown
      register(options: Record<string, unknown>, component: unknown): () => void
    }
    /** Locale registry (dsh-client-locale). */
    readonly locale: {
      register(ns: string, dict: Record<string, unknown>): () => void
      /** Translator for one namespace (dotted keys). */
      bind(ns: string): (key: string) => unknown
    }
    /** Layout service (dsh-client-ui-layout). */
    readonly layout: {
      toggleSidebar(): void
      selectPanel(panelId: string | null): void
    }
    /** Typert remote client face (dsh-api-remotes). */
    readonly remote: {
      $on(event: string, listener: (...args: never[]) => void): () => void
    }
    /** Effect scope helper (cordis). */
    effect(execute: () => unknown, label?: string): unknown
    /** Wait for declared services, run the callback with an injected context (cordis). */
    inject(services: string[], callback: (injected: Context) => unknown): unknown
    on(event: 'connection/reset', listener: () => void): () => void
    get<T = unknown>(service: string): T
    /** Loader row iteration (cordis-plugin-loader; node half). */
    readonly loader: { entries(): Iterable<{ options: { id?: unknown; name?: unknown }; fiber?: unknown; disabled?: unknown }> }
    /** The fiber this plugin's apply runs in (cordis; node half). */
    readonly fiber: unknown
    /** Structured logger (node half; optional at runtime). */
    readonly logger?: { warn?: (...args: unknown[]) => void; info?: (...args: unknown[]) => void }
    /** HTTP route registry (dsh-web-server; node half). */
    readonly webServer?: {
      register(options: { kind: string; path: string; handler: unknown }): () => void
    }
    /** Deployment facts for the route trust fence (node half). */
    readonly webRuntime?: { trustedHosts?: readonly string[] }
    /** Settings service (dsh-settings, node half). */
    readonly settings: {
      configure(presentation: { auto?: boolean }, owner?: unknown): () => void
      describe(options?: { redactSecrets?: boolean }): Array<{
        ns: string
        value?: unknown
        revision?: number
      }>
      update(ns: string, patch: Record<string, unknown>, expectedRevision?: number): Promise<unknown>
    }
  }
}

declare module '@deepseek-ai/dsh-client-store' {
  export interface ObservableSnapshotStatic {
    getSnapshot(): unknown
    subscribe(listener: () => void): () => void
  }
}
