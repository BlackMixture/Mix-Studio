# AGENTS.md — working on KreaStudio

Handbook for AI agents (and humans) continuing development. Read this before touching anything. The app is in daily production use by Nathan (Black Mixture) — his real gallery lives in `data/`.

## What this is

A zero-dependency Node.js (≥22) server (`server.js`) that builds **ComfyUI API-format graphs** server-side and relays progress to a vanilla-JS mobile frontend (`public/`). No npm packages, no build step, no framework. ComfyUI runs on the same Windows machine (URL in `data/settings.json`, `comfyUrl`).

```
server.js                 ~3.7k lines: routes, graph builders, job tracking, SSE
lib/                      focused modules (regional-workflows, video-workflows,
                          upscale-workflows, profiles, private-gallery, queue-health, …)
public/index.html|app.js|style.css   the whole frontend
test/*.test.js            node:test suites — `node --test` must stay green
data/                     LIVE USER DATA — never in git, never test destructively
docs/superpowers/plans/   old planning docs (gitignored)
```

## Architecture in five sentences

1. The frontend POSTs to routes like `/api/generate`, `/api/animate`, `/api/upscale`; the server builds a ComfyUI graph (per engine), POSTs it to `/prompt`, and stores a job in the `jobs` Map keyed by `prompt_id`.
2. A WebSocket to ComfyUI (with polling fallback) tracks progress and fires `completeJob`, which downloads outputs from ComfyUI's `/history` + `/view`, writes them into `data/images|videos`, creates/updates gallery items in `db.json`, and broadcasts over SSE (`/api/events`).
3. Everything user-visible is scoped to a **profile** (signed cookie `ks_profile`; see `lib/profiles.js`); the first profile in `db.profiles` is the owner/admin.
4. Uploaded inputs (refs, masks, audio, driving videos, faces) go to ComfyUI's input dir via `/api/upload` → `uploadToComfy`; `/api/input?name=` proxies them back for reuse previews.
5. Graph builders use two safety layers: `nodeFromOrdered(class, orderedWidgets, links, overrides)` maps workflow-JSON widget arrays onto the real `/object_info` input order, and `filterInputs(graph)` drops keys the installed node version doesn't know.

## Engines and their builders (server.js)

| Engine | Builder | Notes |
|---|---|---|
| Krea2 t2i | `buildT2I` | euler/beta, 12 steps, cfg 1 |
| Regional t2i | `lib/regional-workflows.buildRegionalT2IGraph` | Ideogram4PromptBuilderKJ (bboxes from slot 2!) + Krea2RegionalMultiLoRAV3 |
| Klein edit | `buildEdit` | ReferenceLatent chains, Flux2Scheduler, 4 steps |
| Qwen edit | `buildEditQwen` | 2511 + Lightning LoRA, source-encoded latent |
| Krea2 inpaint | `lib/regional-workflows.buildKrea2InpaintGraph` | **soft inpaint**: `VAEEncode` + `SetLatentNoiseMask` (see gotchas) |
| LTX 2.3 | `buildAnimate` | two-stage: base sigmas + ×2 latent upsample refine |
| LTX Face ID | `buildAnimateFaceId` | single-stage 24 fps, BFS `LTXIdentityOverlapConditioning`, FaceID LoRA @1.0 over distilled-1.1 @0.6 |
| 10Eros | `buildAnimateEros` | Echo DMD sampler, sigma presets in `EROS_SIGMA_PRESETS` |
| Wan 2.2 | `buildAnimateWan` | dual KSamplerAdvanced handoff, 16 fps 4n+1 frames |
| SCAIL 2 | `buildAnimateScail` (+ chunk/infinity variants in `lib/video-workflows`) | SAM3 tracks driving video + ref, WanSCAILToVideo |
| Upscales | `buildUpscale` / `lib/upscale-workflows` | SeedVR2 / Ultimate SD |
| Composite | `/api/composite` route | ImageStitch side-by-side, per-frame |

Enhancement passes: LTX enhances **in-graph** (`TextGenerateLTX2Prompt` / `TextGenerate` with image input); Krea2/Wan/SCAIL enhance via a **separate server-side job** (`enhancePrompt`, `wanEnhance` — two-pass with `<final_prompt>` sentinel + `cleanEnhancedText`, because Qwen3-VL leaks its reasoning otherwise).

## Hard-won gotchas (do not relearn these the expensive way)

- **V3 DynamicCombo inputs** (TextGenerate `sampling_mode`, Ideogram `style`) must be serialized **flat**: `sampling_mode: 'on'` plus dot-keys like `'sampling_mode.temperature': 0.7`. Objects break validation. See `textGenInputs()`.
- **Literal arrays in API graphs are treated as node links** (`[id, slot]`) — you cannot pass arrays/objects as widget values (`editor_state` on CreateBoundingBoxes is unusable via API; that's why regional bboxes come from Ideogram4PromptBuilderKJ **output slot 2**).
- **Flow/DiT models (Krea2, Flux, Qwen) cannot use `VAEEncodeForInpaint`** — they reproduce the grey erase. Use `VAEEncode` + `SetLatentNoiseMask` and denoise ≥0.75.
- **libx264 requires even dimensions.** Any graph ending in SaveVideo must guarantee even W/H (`ImageResizeKJv2` with `divisible_by: 2`, or compute even dims). MP4 container metadata lies about rotated phone videos — resize decoded frames in-graph, never trust `tkhd`.
- **LoRA paths in combos use backslashes on Windows** (`Wan2.1\file.safetensors`).
- **ComfyUI saves outputs forever** in its own output dir — that's the disaster-recovery source of truth. PNGs embed the full generation graph in tEXt chunks (see `recover_nathan.js` for the parser).
- Model dims can lie: gallery items store **actual PNG IHDR dims** (`pngDims`), not requested dims — edit engines snap to their own buckets.
- **[Errno 22] on KSampler** = ComfyUI's stderr pipe died (tqdm→wandb capture chain), not a graph problem. Fix: kill the python on the ComfyUI port and relaunch Comfy Desktop.
- KJNodes' `ideogram4_nodes.py` was manually updated (backup: `.bak` next to it); the Fedor regional pack expects that newer version.

## Operational protocols (this machine, agent-driven)

- **Deploying server changes**: `node --check` + `node --test` first, then restart **only when idle**: check `/api/queue` (app) or ComfyUI `/queue` before killing the process on port 3300. Pattern lives in the various `deploy_*.bat` files (gitignored): kill by netstat PID → `start.bat` → verify a route. Static files (`public/`) need **no restart**.
- **In-app updates**: the owner-only K menu calls `POST /api/update`, which refuses to run while either queue is active or tracked files are dirty, then performs a fast-forward-only pull of the current branch. Public-only changes reload the browser; server/lib changes exit with code 75 so `start.bat` restarts Node (direct `node server.js` launches a detached replacement).
- **Restarting ComfyUI**: kill the python listening on the ComfyUI port **and** `Comfy Desktop.exe`, relaunch the Desktop app, click the instance card. Killing only the Desktop can orphan the python server.
- **Agent shell access is via Run-dialog + .bat files** writing results to `D:\output\*.txt` (the sandbox mount of `E:` serves stale caches — write probe outputs to fresh filenames on `D:\output`). In the Run dialog always click the field and **Ctrl+A before typing** (text inserts into leftover content otherwise).
- **NEVER run destructive tests against live data.** A profile-deletion smoke test once wiped the owner's entire gallery (recovered from ComfyUI outputs — see `recover_nathan.js`, `fix_posters.js`). Destructive routes require server-side typed confirmation (`confirmName`) by design — keep it that way. Verify with read-only checks; use throwaway fixtures only, and never assume db state (other profiles/folders may exist).
- **Backups**: `backupDb()` runs at boot + every 30 min (last 40 in `data/backups/`), plus `pre-delete` snapshots. Deleted-profile media goes to `data/trash/`, never unlinked.
- Tests: `node --test` (from repo root). All lib modules are covered; keep new logic in `lib/` with a test where practical.

## Frontend conventions (public/app.js)

- Single global `state` object; per-tab prompt/LoRA arrays (`curLoras()` switches on `state.view`). Form state persists per profile in `localStorage` under `formKey()`.
- Sheets are `.sheet` divs toggled with `.show` (+ `syncSheetScrollLock()`); `data-close` buttons are wired globally.
- `api()` throws on non-OK and auto-opens the profile gate on 401 `code:'auth'`.
- LoRA UI = card grid (`renderLoras`), hold-and-slide strength, shared searchable picker `openLoraPicker(onPick?, {allowNone, title})` — reuse it for any new LoRA selection.
- Contextual visibility: engines hide irrelevant controls (`renderVidFace`, `renderVidDrive`, engine row handlers). Follow that pattern for anything new.
- After re-renders triggered from press gestures, preserve `window.scrollY` (layout can shift when prompt-suggestion chips appear).

## Data model sketch (db.json)

```
profiles[]     {id, name, pinHash?, pinSalt?, avatar?, createdAt}
items[]        {id, file, mode: t2i|edit|video, profileId, prompt, refinedPrompt,
                width, height, seed, loras[], regions[]?, folder, videos[]:
                {id, file, createdAt, info{engine, frames, fps, …asset names for reuse}},
                upscaled?, sourceFile?, sourceItemId?, recovered?}
folders[]      {id, name, locked, profileId}
history[]      last 50 {ts, kind, itemId, label, profileId}
loraPresets[]  {id, name, loras[], profileId}
faces[]        {id, name, file, imageName, profileId}
loraThumbs     { [loraName]: file }   (global)
```

Item lookups in routes must check `it.profileId === req.profile.id`. Locked folders: listed while locked (drop-box moves allowed), contents hidden; merging/viewing/moving-out requires the private-gallery unlock cookie.
