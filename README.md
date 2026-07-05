# KreaStudio

Minimalist mobile-first image generation app for **ComfyUI + Krea 2**, in the Modatory design language. Generations run on your desktop; you drive it from your phone.

## Quick start

1. Start **ComfyUI** on the desktop (default `http://127.0.0.1:8188`).
2. Double-click **start.bat** (or run `node server.js`). Node 22+ recommended — older Node still works but without live progress/previews.
3. The console prints two URLs:
   - `Local:  http://localhost:3300` — use on the desktop
   - `Phone:  http://192.168.x.x:3300` — open this on your phone (same Wi-Fi)
4. On the phone, use **Add to Home Screen** for an app-like fullscreen experience.

If the phone can't connect, allow Node through Windows Defender Firewall (private networks) the first time it asks.

## Features

- **Create** — Krea 2 Turbo text-to-image (12 steps, CFG 1, euler/beta, exactly like the Black Mixture workflow)
- **✨ Prompt enhance** — toggle in the prompt box; Qwen3-VL rewrites your prompt (same system prompt + TextGenerate node as the workflow). The enhanced prompt is saved with each image.
- **Resolution picker** — aspect-ratio chips + S/M/L size + custom width/height (replaces the ResolutionMaster node with a standard latent, so no extra custom node needed)
- **LoRAs** — add/remove, on/off toggle, strength slider; the list comes live from your ComfyUI loras folder and filters by the active mode/model family
- **Edit mode** — Flux Klein 4B/9B or Qwen Image Edit Plus with 0–3 reference images (photos straight from your phone), denoise slider
- **Gallery** — organize into folders (long-press a folder chip to delete it), view metadata, reuse seeds, send any image back into Edit
- **Private folders** - any gallery folder can be locked and hidden from the default gallery behind a basic password (`1234` by default)
- **Upscale** — SeedVR2 (3B fp16, optional 2× lanczos pre-resize, target 1080/1440/2160)
- **Compare** — draggable before/after slider between original and upscaled

## Requirements on the ComfyUI side

- Krea 2 models: `krea2_turbo_fp8_scaled.safetensors` (unet), `Huihui-Qwen3-VL-4B-Instruct…` (clip), `qwen_image_vae.safetensors` (vae)
- Flux Klein edit models:
  - 4B: `flux-2-klein-4b.safetensors` + `qwen_3_4b.safetensors`
  - 9B: `flux-2-klein-9b-fp8.safetensors` + `qwen_3_8b_fp8mixed.safetensors`
  - shared VAE: `flux2-vae.safetensors`
- Prompt enhance: the custom node pack providing `TextGenerate` (same one your workflow uses)
- Upscaling: **ComfyUI-SeedVR2_VideoUpscaler** with `seedvr2_ema_3b_fp16.safetensors` + `ema_vae_fp16.safetensors`

Open **Settings (gear icon) → Save & test connection** to see a health check of all required nodes. Model filenames and the ComfyUI URL are editable there.

## Where things live

- `data/images/` — every generation + upscale, saved as PNG
- `data/db.json` — gallery metadata (prompts, seeds, folders)
- `data/settings.json` — your settings

Private folders are lightweight UI privacy only. They hide locked folders from normal gallery responses, but files remain in `data/images/` and `data/videos/`.

The app is zero-dependency (no `npm install`). Port can be changed via the `PORT` env var.
