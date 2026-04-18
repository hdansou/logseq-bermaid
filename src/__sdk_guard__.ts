import '@logseq/libs'

// Compile-time guard: references an API that only exists in @logseq/libs ≥ 0.3.1.
// If this file fails typecheck, upgrade the SDK.
export const _sdkGuard: typeof logseq.App.getCurrentRoute = logseq.App.getCurrentRoute
