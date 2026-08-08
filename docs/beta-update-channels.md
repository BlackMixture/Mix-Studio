# Stable and Early Beta update channels

Status: deferred design reference. Do not expose an Early Beta channel until the release, signing, recovery, and compatibility checks below are implemented together.

## Goal

Let the normal public installation remain on `main` (Stable), while invited testers can place a small signed access file in their Mix Studio installation to reveal an Early Beta update channel. The access file is an entitlement, not a Git credential.

## Recommended repository model

- `main` remains public, release-tagged, forward-only, and suitable for every user.
- `beta` may also be public. A signed local entitlement can hide the beta option in Mix Studio, but it cannot make a public Git branch private.
- If the beta source itself must be private, use a private repository or a release artifact service. Do not put a reusable GitHub token in the access file.
- Changes normally land in `beta`, soak with invited users, then merge to `main`. Urgent stable fixes should merge to both branches immediately.
- Data migrations must be backward compatible while a beta build could return to Stable. Destructive or irreversible migrations require a separate backup-and-confirm flow.

## Signed access file

Suggested filename: `mix-studio-beta-access.json`, stored beside `server.js` or in a dedicated `config/` folder that survives updates.

Suggested payload:

```json
{
  "version": 1,
  "channel": "beta",
  "subject": "tester-id",
  "issuedAt": "2026-08-08T00:00:00Z",
  "expiresAt": "2026-11-08T00:00:00Z",
  "nonce": "random-128-bit-value",
  "signature": "base64url-ed25519-signature"
}
```

The app ships only the Ed25519 public verification key. The private signing key stays offline. Sign a canonical serialization of every field except `signature`. Reject unknown versions, expired grants, malformed values, invalid signatures, and channels other than `beta`. Never treat a filename or an unsigned Boolean as authorization.

## Updater behavior

1. Read the installed release and current Git branch.
2. Verify the optional access file locally.
3. Show Stable for everyone; show Early Beta only when the entitlement is valid.
4. Refuse channel switches while Mix Studio or ComfyUI has active jobs, downloads, or tracked-file changes.
5. Fetch the selected remote branch and require a fast-forward update. Never reset user files.
6. Before switching from Beta to Stable, run a compatibility check against settings and database schema versions.
7. Preserve `data/`, the entitlement file, runtime configuration, and user-created add-ons.
8. Restart only when server-side files changed; public-only changes can reload the browser.
9. Record the previous commit and show a recovery instruction, but do not automate a destructive rollback.

## Release presentation

- Stable displays normal semantic versions such as `v1.2.0`.
- Beta displays an identifiable prerelease such as `v1.3.0-beta.4` plus its short commit.
- Update cards and changelogs must be channel-specific. Never advertise an unreleased beta feature to Stable users.
- The top-bar update action should say which channel it will install before confirmation.

## Operational discipline

- Keep the delta between `beta` and `main` small and merge Stable into Beta frequently.
- Cut Beta builds from CI, run the full `node --test` suite, and smoke-test Windows served installs before announcing them.
- Maintain one changelog entry per user-visible change and mark migrations or ComfyUI requirements explicitly.
- Revoke a tester by issuing short-lived entitlements and declining renewal. A local signed file cannot be remotely erased once delivered.
- Assume an entitled tester can share beta source or binaries. The mechanism controls convenience and access in the app, not confidentiality.

## Required tests before launch

- Valid, expired, tampered, malformed, and wrong-channel entitlement files.
- Stable-to-Beta and Beta-to-Stable switching on Windows and macOS.
- Dirty worktree, active generation, active download, offline network, missing branch, and non-fast-forward failures.
- Public-file-only update versus server restart update.
- Database/settings compatibility when returning from Beta to Stable.
- Entitlement and live `data/` survival across updates.
- Recovery from a process exit between fetch, branch switch, and restart.

## Phased implementation

1. Add verification and read-only channel visibility behind tests.
2. Add CI-produced beta prereleases and channel-specific update metadata.
3. Add safe branch switching with idle/dirty/compatibility guards.
4. Pilot with a small set of testers and short-lived access files.
5. Re-evaluate whether a public beta branch is sufficient or private distribution is warranted.
