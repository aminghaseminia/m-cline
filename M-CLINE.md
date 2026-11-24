# M-Cline

M-Cline is a personal fork of [Cline](https://github.com/cline/cline) that adds **provider profiles**:
save the whole provider setup — provider, models, API key, base URL, region, thinking budget — as a named
profile and switch between them with one click.

Fork: https://github.com/aminghaseminia/m-cline · Upstream: https://github.com/cline/cline

## What is different from upstream?

### Multiple profiles, one-click switching

- **Settings → API Configuration → Profiles**
  - *Save current setup as profile* snapshots the live provider configuration (both Plan and Act mode
    settings) under a name.
  - The profile selector switches the live configuration instantly.
  - *Rename* / *Delete* manage the saved profiles.
  - After a manual provider change, the active profile follows along, so a profile always means "the
    setup I last used with this provider". Delete a profile you no longer need instead of editing around it.
- **Chat input toolbar → profile button** (next to the model name) opens a compact switcher, so you can
  jump between e.g. work / personal / local setups without opening Settings. *Manage profiles…* jumps to
  the full manager.

Switching a profile applies the same code path as editing the settings by hand, so the active session is
restarted when the provider changes, exactly like a manual provider switch.

How it is stored: profile metadata (non-secret provider settings) lives in the extension global state
(`mclineProfiles`, `mclineActiveProfileId`); API keys for inactive profiles live in the secrets store
(`mclineProfileSecrets`, 0600 file under `~/.cline/data`), never in the settings JSON.

### Rebranding

The extension identity is `aminghaseminia.m-cline` (display name **M-Cline**), so it installs alongside
the official Cline extension. Command ids, view ids and the activity-bar title use the `m-cline` prefix.

## Build and install (VS Code)

From `apps/vscode`:

```bash
bun install                       # repo root
bun run build:sdk                 # repo root, once (or after SDK changes)
bun run build:production          # webview + extension bundle
bunx vsce package --no-dependencies
code --install-extension m-cline-<version>.vsix --force
```

## Tests

```bash
cd apps/vscode
bun test src/core/controller/profile     # profile store + gRPC handlers
```

## Layout of the feature

| Path | Purpose |
| --- | --- |
| `apps/vscode/proto/cline/profile.proto` | `ProfileService` RPCs (`getProfiles`, `saveProfile`, `activateProfile`, `renameProfile`, `deleteProfile`) |
| `apps/vscode/src/core/controller/profile/profile-store.ts` | Snapshot/apply/store logic |
| `apps/vscode/src/core/controller/profile/*.ts` | gRPC handlers (auto-wired by `scripts/generate-protobus-setup.mjs`) |
| `apps/vscode/webview-ui/src/context/ProfileContext.tsx` | Webview profile state |
| `apps/vscode/webview-ui/src/components/settings/sections/ProfilesSection.tsx` | Settings manager |
| `apps/vscode/webview-ui/src/components/chat/ProfileQuickSwitcher.tsx` | Chat toolbar switcher |

Upstream code is otherwise unchanged; `updateSettings` calls `syncActiveProfileFromCurrentConfiguration`
so manual edits are reflected in the active profile.
