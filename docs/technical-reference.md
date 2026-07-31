# Technical reference

This document describes the curated workflows, their ComfyUI requirements, queue behavior, and local data layout. It is intended for advanced users, operators, and contributors.

## Image and regional generation

- **Krea 2 text-to-image:** Turbo is the default route. Raw can use the Turbo LoRA at 12 steps or the full 52-step CFG path.
- **Image guidance:** a source image can condition composition and color, visual style, or three-dimensional structure. Depth guidance runs Depth Anything V3 and applies the Krea 2 Control LoRA.
- **Prompt tools:** Qwen3-VL provides prompt revision and image-to-prompt analysis. Camera and lens controls produce a reusable prompt fragment.
- **Regional generation:** an aspect-correct editor assigns a prompt, LoRA stack, and optional reference image to each box. The server builds one Krea2RegionalMultiLoRAV3 graph and can export the annotated region map.
- **Resolution and batching:** presets expose exact output dimensions, seed, batch size, and generation-safe or native source matching. Low VRAM requests retain user control and require confirmation before safer settings are substituted.

## Editing

- **Model routes:** Flux 2 Klein 4B and 9B, Qwen Image Edit 2511, and Krea 2 use separate graph builders and model-specific sampling controls.
- **Krea 2 Identity Edit:** uses the `krea2_edit_bf16_v1_2.safetensors` identity LoRA and the current ComfyUI-Krea2Edit graph for identity-aware editing and outpainting.
- **Krea 2 Remix:** the multi-reference builder accepts up to three reference images and uses the corresponding image-mention prompt syntax. The advanced Reference boost control increases reference-conditioning strength without changing the main creative controls.
- **Multiple inputs:** numbered reference slots can be reordered and addressed from the prompt with tokens such as `@Image 1` and `@Image 2`.
- **Localized edits:** SAM3 text and point selection, brush masks, and boxes feed masked edit graphs. Krea 2 uses `VAEEncode` plus `SetLatentNoiseMask` for flow-model-compatible inpainting.
- **Canvas expansion:** outpainting supports source placement, optional organic preserve masks, and source-pixel compositing after generation.
- **Edit sets:** sequential mode runs prompt sentences in order, and camera variation mode creates grouped view, elevation, and framing variants. Focused results retain original-to-result comparison and saved input settings.

## Video generation, editing, and motion transfer

- **LTX 2.3:** two-stage text-to-video and image-to-video generation with first and last frames, joint audio generation, uploaded audio, waveform trimming, and motion controls.
- **LTX Director:** Extend continues an existing clip, Keyframes arranges images, clips, and directions as a storyboard, and Timeline places story, audio, and motion segments at explicit frame ranges. Projects can be saved as JSON.
- **LTX Face ID:** Best-FaceID and BFS overlap conditioning preserve a reference identity. An uploaded voice is encoded into the audio latent with a zero noise mask for lipsync.
- **LTX Edit:** an experimental source-video route applies a literal edit prompt to uploaded or generated footage.
- **10Eros DMD:** reference-conditioned generation with the Echo sampler and selectable sigma presets.
- **Wan 2.2:** dual-expert image-to-video sampling with fast and full-quality paths.
- **SCAIL 2:** a driving video and reference image feed SAM3 tracking and WanSCAILToVideo. Stable chunks and Infinity modes extend the supported duration while retaining overlap controls.
- **Video processing:** compatible outputs can run RIFE interpolation, RTX 4K upscaling, source extension, and side-by-side comparison. Reuse restores both settings and input assets.

## LoRAs and parameter comparison

LoRA stacks are stored separately for Create, Edit, Video, and regional inputs. Cards support enable state, exact or gesture-based strength changes, thumbnails, search, trigger phrases, and profile-scoped presets.

**Strength Hunt** keeps the prompt and seed fixed while stepping one or two selected LoRAs from 0 to each LoRA's configured maximum in 0.2 increments. The server submits the comparison as one queue job, saves every individual output, and adds a labeled square or matrix documentation image to the same gallery group.

## Library and reusable assets

- The Library indexes images, videos, audio uploads, prompts, LoRAs, model metadata, duration, generation time, folders, likes, and user-defined group names.
- Generated images, attached videos, Strength Hunts, camera variants, and manual groups retain their parent and child hierarchy.
- Focused images support wheel zoom and drag or trackpad pan. Actions can reuse media, save originals, build documentation images, extend video, upscale, compare, group, move, or delete.
- Uploaded image, video, and audio assets remain available as reusable workflow inputs in an Uploaded assets collection.
- Custom folders support merge and optional PIN locking. Search, date navigation, sorting, drag-sweep multi-select, ZIP export, composites, and optional desktop-folder mirroring operate on profile-scoped records.

## Upscaling, queue state, and profiles

- **Upscaling:** SeedVR2 and Ultimate SD Upscale support target-resolution and multiplier modes. The comparison viewer synchronizes pan and zoom and provides reveal, 1:1, and fit controls.
- **Queue:** each ComfyUI prompt is tracked with node-specific progress, overall progress for multi-stage jobs, ETA estimates, duration, thumbnail, cancellation, reordering, history, and GPU health. Strength Hunts remain one logical queue item.
- **Profiles:** signed-cookie sessions isolate gallery items, folders, history, LoRA presets, Face ID records, and saved form state. Profiles can use an optional PIN, and the first profile owns administrative actions.
- **Generation setup:** hardware detection, ComfyUI registry scanning, model discovery, custom-node checks, precision selection, and low-VRAM recommendations run before a missing workflow is submitted.
- **Maintenance:** the owner can update or restart Mix Studio and ComfyUI only while both queues are idle.

## ComfyUI requirements

All model filenames and the ComfyUI URL are editable in **Advanced Settings**. Generation setup health-checks each node group and identifies missing dependencies.

Curated workflow families include:

- Krea 2 UNet, CLIP, VAE, depth Control LoRA, Identity Edit v1.2 LoRA, and Depth Anything V3 Large
- ComfyUI-Krea2Edit and Krea2-Regional-MultiLoRA
- Flux 2 Klein 4B and 9B
- Qwen Image Edit 2511
- LTX 2.3, its standalone video VAE, spatial upscaler, and Gemma encoder
- Wan 2.2, 10Eros, and SCAIL 2 with SAM3 multiplex and `clip_vision_h`
- Best-FaceID LoRA and [ComfyUI-BFSNodes](https://github.com/alisson-anjos/ComfyUI-BFSNodes)
- SeedVR2, KJNodes, VideoHelperSuite, ComfyUI-Frame-Interpolation with RIFE, and Ultimate SD Upscale

For installation, version, model-reuse, and VRAM details, see [Installation and operations](installation-and-operations.md).

## Local data and recovery

Mix Studio stores user data separately from tracked application code:

- `data/db.json`: profile, item, folder, preset, and face metadata
- `data/backups/`: rolling database snapshots
- `data/images/` and `data/videos/`: generated media
- `data/faces/`, `data/avatars/`, and `data/lorathumbs/`: reusable identity images and thumbnails
- `data/settings.json`: model and connection configuration
- `data/auth_secret.txt`: session-signing secret
- `data/trash/`: recoverable media from deleted gallery items, videos, and profiles

The `data/` directory is deliberately excluded from Git. Private folders provide lightweight interface privacy: locked folders hide their items from gallery responses, but files remain on disk.

ComfyUI's disaster-recovery copies are organized under:

```text
ComfyUI/output/MixStudio/<profile-name>_<profile-id>/
```

Separate prefixes identify images, edits, videos, upscales, posters, and composites. Existing files in the legacy `ComfyUI/output/KreaStudio/` folder are left untouched.

PNG outputs embed the generation graph in their metadata, and ComfyUI retains its output copies independently of Mix Studio's gallery database.
