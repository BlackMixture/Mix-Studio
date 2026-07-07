# KreaStudio

Minimalist, mobile-first web app for driving a local **ComfyUI** install — image and video generation in the Modatory design language. Generations run on the Windows desktop; you drive it from your phone (same Wi-Fi or Tailscale). Zero dependencies: one Node.js server, vanilla JS frontend, no build step.

> Working on this codebase (human or AI agent)? **Read `AGENTS.md` first.**

## Quick start

1. Start **ComfyUI** on the desktop (URL configurable in Settings, e.g. `http://127.0.0.1:8161`).
2. Double-click **start.bat** (or `node server.js`). Node 22+ recommended — older Node works but without live progress/previews.
3. The console prints two URLs:
   - `Local:  http://localhost:3300` — on the desktop
   - `Phone:  http://192.168.x.x:3300` — open on your phone (same Wi-Fi)
4. On the phone, use **Add to Home Screen** for an app-like fullscreen experience.

If the phone can't connect, allow Node through Windows Defender Firewall (private networks). Port changes via the `PORT` env var.

## Features

**Profiles** — Netflix-style profile picker with avatars and optional PINs. Every profile has its own gallery, folders, history, LoRA presets, Face ID library, and form state. The first profile owns profile management. Signed-cookie sessions; rolling db backups (boot + every 30 min).

**Create (text-to-image)** — Krea 2 turbo (12 steps, cfg 1); ✨ prompt enhance via Qwen3-VL; collapsible resolution selector with live aspect glyph; camera-settings helper; image→prompt vision tool; **regional prompting**: draw boxes on an aspect-true canvas, per-region prompt/LoRA/reference, no general prompt required, gallery hold-preview + color-coded annotated PNG export.

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

## ComfyUI requirements

All model filenames and the ComfyUI URL are editable in **Settings (gear) → Save & test connection**, which health-checks every node group. Highlights: Krea 2 (unet/clip/vae), Flux Klein 4B/9B, Qwen Image Edit 2511, LTX 2.3 (+ spatial upscaler, Gemma encoder), Wan 2.2, 10Eros, SCAIL-2 (+ SAM3 multiplex, clip_vision_h), Best-FaceID LoRA + [ComfyUI-BFSNodes](https://github.com/alisson-anjos/ComfyUI-BFSNodes), SeedVR2, KJNodes, VideoHelperSuite, ComfyUI-Frame-Interpolation (RIFE), Krea2-Regional-MultiLoRA.

## Where things live

- `data/db.json` — all metadata (items, folders, profiles, presets, faces) · `data/backups/` — rolling snapshots
- `data/images/`, `data/videos/` — media · `data/faces/`, `data/avatars/`, `data/lorathumbs/` — thumbnails
- `data/settings.json` — model config · `data/auth_secret.txt` — session signing secret
- `data/trash/` — content from deleted profiles (never hard-deleted)

`data/` is deliberately not in git. Private folders are lightweight UI privacy: locked folders hide their items from gallery responses, but files remain on disk.
