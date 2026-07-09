# MixBox Studio

Minimalist, mobile-first web app for driving a local **ComfyUI** install — image and video generation in the Modatory design language. Generations run on the Windows desktop; you drive it from your phone (same Wi-Fi or Tailscale). Zero dependencies: one Node.js server, vanilla JS frontend, no build step.

> Working on this codebase (human or AI agent)? **Read `AGENTS.md` first.**

## Portable Windows install

This project is distributed as a portable Git checkout rather than a packaged executable. That keeps installation transparent for advanced users and lets the owner-only **Update app** button safely run a fast-forward Git update.

The current bootstrap supports an existing ComfyUI installation and can install Node.js through `winget`. Automated installation of ComfyUI, custom nodes, and optional model packs will build on the checked-in feature manifest; those downloads are not enabled until their exact sources and license acknowledgements are defined.

1. Install [Git for Windows](https://git-scm.com/download/win) and Node.js 22 or newer.
2. Clone the repository. Do not use GitHub's **Download ZIP** if you want in-app updates:

   ```powershell
   git clone https://github.com/BlackMixture/KreaStudio.git
   ```

3. Open the cloned folder and double-click **install.bat**. A MixBox Studio-styled setup window walks through prerequisites, ComfyUI connection, optional model families, review, and installation.
4. Enter the URL and optional folders for an existing ComfyUI installation. Existing models stay where they are; MixBox Studio does not copy or redownload them.
5. Choose which optional Edit and Video model families should appear in the interface.
6. Start ComfyUI, then double-click **start.bat**.

The visual installer delegates all writes to a separate non-interactive install engine. That engine writes ignored, machine-specific configuration to `install.json` and merges the ComfyUI URL and feature choices into `data/settings.json`. If settings already exist, it creates a timestamped backup first. It never resets `data/db.json`, profiles, gallery media, folders, prompts, or presets.

The console prints two URLs:

   - `Local:  http://localhost:3300` — on the desktop
   - `Phone:  http://192.168.x.x:3300` — open on your phone (same Wi-Fi)

On the phone, use **Add to Home Screen** for an app-like fullscreen experience.

If the phone can't connect, allow Node through Windows Defender Firewall (private networks). Port changes via the `PORT` env var.

### Existing ComfyUI and shared models

The installer supports an existing ComfyUI URL, application folder, and models folder. MixBox Studio uses those paths for local LoRA metadata and SeedVR2 discovery, while ComfyUI remains responsible for loading the models used by generation graphs. If your models folder is outside the ComfyUI folder, make sure that ComfyUI already includes it through its `extra_model_paths.yaml` configuration.

You can rerun **install.bat** later to change these paths or optional feature families. Existing settings are used as the defaults and backed up before the merged configuration is saved.

### Installing missing dependencies

In **Advanced Settings → General**, the **Desktop Dependencies** card scans every enabled MixBox model and node family. The owner profile can install only the red groups; node packs are cloned into the configured `custom_nodes` directory and their requirements are added with that ComfyUI instance's Python environment **without a blanket pip upgrade**. Before any node requirements are changed, MixBox Studio saves a `pip freeze` snapshot under `data/dependency-backups/`. Model files download into the configured shared models folder with live byte progress, and partial downloads are kept as `.mixbox.part` files until complete.

Use **Repair missing tools** after an interrupted install or a custom-node dependency conflict. It reinstalls only the affected packs' declared Python packages, then asks for a ComfyUI restart; it does not reset profiles, gallery data, model files, or unrelated custom nodes.

Some upstream Hugging Face files require accepting a license before their download URL will work. Accept the license on the model page first; if the provider requires authentication, launch MixBox Studio with an `HF_TOKEN` environment variable. The card also exposes **Restart ComfyUI** for a configured Windows ComfyUI folder, but it will refuse while either queue is active.

### Updating

Open MixBox Studio's side menu and choose **Update app**. Updates require:

- a Git clone with its `.git` directory;
- a named branch and configured `origin` remote;
- no uncommitted tracked code changes; and
- idle MixBox Studio and ComfyUI queues.

Machine-specific `install.json` and all `data/` content are ignored by Git, so normal updates do not replace profiles, settings, metadata, or generations. Server-side updates restart the Node process automatically; frontend-only updates do not need a restart.

## Features

**Profiles** — Netflix-style profile picker with avatars and optional PINs. Every profile has its own gallery, folders, history, LoRA presets, Face ID library, and form state. The first profile owns profile management. Signed-cookie sessions; rolling db backups (boot + every 30 min).

**Create (text-to-image)** — Krea 2 Turbo by default, with a Raw checkpoint switch (Raw starts with the Turbo LoRA at 0.6/12 steps and can fall back to full 52-step CFG sampling); optional image-to-image guidance; ✨ prompt enhance via Qwen3-VL; collapsible resolution selector with live aspect glyph; camera-settings helper; image→prompt vision tool; **regional prompting**: draw boxes on an aspect-true canvas, per-region prompt/LoRA/reference, no general prompt required, gallery hold-preview + color-coded annotated PNG export.

**Edit** — Flux 2 Klein 4B/9B multi-reference editing (numbered slots: "the jacket from image 2"), Qwen Image Edit 2511 (Lightning 4-step), **Krea2 mask inpainting** (paint the mask, denoise = change strength, mask preview on the slot), KleinEditComposite preserve-unchanged, hold-to-compare original.

**Video** — five engines with per-engine contextual controls:
- **LTX 2.3**: two-stage, 25 fps, generates audio, t2v/i2v, end frames, audio-driven with waveform trimming, motion freedom
- **LTX Face ID**: reference-to-video identity preservation (Best-FaceID + BFS overlap node), 24 fps, named face library
- **10Eros DMD**: Echo sampler, reference conditioning, sigma presets
- **Wan 2.2**: 14B dual-expert i2v, 4-step or full quality
- **SCAIL 2**: motion transfer from a driving video (SAM3 tracking), trim UI, first-frame→Edit, chunked/Infinity long-video modes
- Plus: RIFE 32/48 fps interpolation (16 fps engines), RTX 4K pass, side-by-side comparison export, per-video reuse (restores settings *and* input assets)

**LoRAs** — card grid shared by every tab: tap to toggle, hold-and-slide to adjust strength, thumbnails, searchable picker (also used for region LoRAs), server-stored presets.

**Gallery** — folders with PIN-locked privates (items can be dropped in without unlocking; viewing requires the PIN), folder merge, long-press + drag-sweep multi-select, filter/sort, full-page swipe viewer, videos grouped under their source image, queue viewer with per-profile history and GPU health.

**Upscale** — SeedVR2 (selectable attention backend) and Ultimate SD Upscale, with a before/after compare slider.

**Remote updates** — the owner can open the side menu from a phone and pull the desktop app's current Git branch. Updates wait for an idle queue, require a clean checkout, and restart the Node server only when server-side files changed.

## ComfyUI requirements

All model filenames and the ComfyUI URL are editable in **Settings (gear) → Save & test connection**, which health-checks every node group. Highlights: Krea 2 (unet/clip/vae), Flux Klein 4B/9B, Qwen Image Edit 2511, LTX 2.3 (+ spatial upscaler, Gemma encoder), Wan 2.2, 10Eros, SCAIL-2 (+ SAM3 multiplex, clip_vision_h), Best-FaceID LoRA + [ComfyUI-BFSNodes](https://github.com/alisson-anjos/ComfyUI-BFSNodes), SeedVR2, KJNodes, VideoHelperSuite, ComfyUI-Frame-Interpolation (RIFE), Krea2-Regional-MultiLoRA.

## Where things live

- `data/db.json` — all metadata (items, folders, profiles, presets, faces) · `data/backups/` — rolling snapshots
- `data/images/`, `data/videos/` — media · `data/faces/`, `data/avatars/`, `data/lorathumbs/` — thumbnails
- `data/settings.json` — model config · `data/auth_secret.txt` — session signing secret
- `data/trash/` — content from deleted profiles (never hard-deleted)

`data/` is deliberately not in git. Private folders are lightweight UI privacy: locked folders hide their items from gallery responses, but files remain on disk.
