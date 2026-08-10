# Changelog

## Unreleased

## 1.2.3 - 2026-08-09

### Mobile responsiveness

- Kept the entire app interactive immediately after entering Library by replacing its blind delayed full-grid rebuild with a lightweight revision check that does no DOM work when gallery data is unchanged.
- Deferred mobile video-preview observer and decoder activation until an interaction-safe idle window; early taps or scrolling take priority and postpone that background work automatically.
- Preserved immediate full refreshes after actual gallery mutations, profile changes, and generation events while coalescing only the passive tab-entry freshness check.

## 1.2.2 - 2026-08-09

### Mobile library

- Made Create/Edit-to-Library transitions interactive on the first painted frame by reusing the mounted grid, deferring stale-data refresh until idle, and skipping hidden generation-panel rendering.
- Made video cards open their expanded view immediately on the first mobile tap instead of waiting for the desktop-style double-tap window.
- Handed active gallery preview playback over to the focused player before it loads, preventing hidden card videos from competing for mobile decoders and bandwidth beneath the expanded view.
- Made gallery preview videos touch-transparent for more reliable iPhone and Android card taps, then safely resume centered previews after the expanded viewer closes.

### Workflow reliability

- Fixed Wan Animate 2 reference and performance resizing to serialize the current dynamic node inputs explicitly, avoiding validation failures while preserving the selected output dimensions and center crop.
- Added a dedicated, stage-aware Revise Prompt progress card that distinguishes queueing, model loading, reference reading, writing, and finishing states.
- Versioned this maintenance set as v1.2.2 so a matching stable GitHub Release is recognized as newer by v1.2.1 installations and triggers the normal Update available card, desktop action, and mobile profile badge.

## 1.2.1 - 2026-08-09

### MiniMax H3 Turbo

- Updated Frames Turbo to the creator-recommended `minimax_h3_turbo_v4_step600_ema.safetensors` adapter and made six steps the default. Existing installs using Mix Studio's former v1/850 default migrate automatically, while users can still select that older checkpoint manually for specialized four-step, high-motion work.
- Kept Reference Turbo on its separate Kijai LightX2V adapter and six-step audio-safe sampler path, so the Frames Turbo upgrade does not change the reference-video workflow.
- Added generation metadata for the exact H3 Turbo adapter used, including gallery and documentation-video details.
- Added a compact caution icon at four Frames Turbo steps explaining v4's possible smearing or motion trails, with the full guidance available by hover or tap instead of permanent warning text.

### Long videos and references

- Added experimental H3 Long Context generation for Standard, Full BF16, and Turbo frame or reference workflows, extending generation up to 120 seconds as sequential clips with a pinned 22-frame joint video-and-audio latent bridge.
- Added automatic installation and revision checks for the reviewed H3 Motion Context node, sequential queue progress such as `H3 Long context clip 2 of 4`, and final joining into one MP4.
- Allowed Turbo in Long Context with a compact quality caution, while keeping DynTime disabled until its core patch is validated with Motion Context. Video-backed Reference Turbo uses safe five-second source windows throughout the chain.
- Made H3 Prompt Enhance, Revise Prompt, prompt-guide timelines, and validation aware of the complete Long Context duration instead of treating every prompt as a maximum 15-second clip.
- Added a Match video aspect option for H3 Reference generation and aspect-ratio badges on video reference thumbnails, while preserving manual aspect choices and saved-workspace behavior.

### Interface and reliability

- Replaced full inline compatibility warnings with consistent caution icons whose details open on hover, keyboard focus, or tap.
- Persisted Long Context and reference aspect choices across workspace saves and gallery reuse, and recorded Long Context clip counts in generation details.
- Improved H3 chunk and continuation status labels so the task queue distinguishes Reference Turbo chunks from Long Context clips.

## 1.2.0 - 2026-08-07

- Added MiniMax H3 Turbo generation with its recommended custom sampler, audio-safe workflow, configurable steps, and optional LoRA strength under Advanced settings.
- Added the official MiniMax H3 prompt guide, local no-LLM structure and dialogue formatting, and guide-aware Prompt Enhance while keeping all formatting optional at generation time.
- Made H3 Revise Prompt resilient to long ComfyUI waits with live queued/running status, explicit cancellation, bounded retries, orphan cleanup, and advisory guide warnings instead of speaker-format dead ends.
- Added SeedVR2 as a temporally coherent video post-upscale option alongside fast RTX Video Super Resolution.
- Added a centered, animated update showcase with feature slides, full changelog and install actions, a desktop top-bar Update button, and a mobile profile notification and Update action.
- Improved MiniMax H3 Turbo controls and native audio behavior, including editable step counts and a consistent Advanced LoRA strength control.
- Added critical web-asset integrity checks to app updates, plus startup-memory and Git fallbacks for missing HTML, CSS, or JavaScript so a partial desktop deployment cannot leave the app unstyled.
- Added one shared external prompt-AI provider for OpenAI, Gemini, or Ollama, with independent Image and Video switches for Revise Prompt and Prompt Enhance, connection testing, vision-aware references, and API-key controls in the renamed Preferences panel.
- Improved documentation video readability by letting long prompts use the full available details panel, removing the colored marker beside media labels, and avoiding a duplicate H3 references row.
- Added social-ready aspect-ratio choices to documentation video exports, including 16:9, 4:3, square, 4:5, 3:4, and 9:16, with a live preview before recording.
- Added compatibility-critical custom-node revision checks so Generation Setup detects stale installed node packs, marks every affected workflow for repair, and repins them before ComfyUI restarts.
- Made documentation video exports save as H.264 MP4 with AAC audio when supported. Browsers that record only WebM now use a bounded server-side FFmpeg conversion, with the original WebM preserved as a fallback if conversion is unavailable.
- Added manual and automatic first-frame motion prompting to H3 Text + frames, with H3-specific chronological motion and native-audio guidance while Reference mode retains explicit reference assignments.
- Simplified MiniMax H3 input controls by removing redundant mode and Reference-mode instructional copy.
- Made the H3 frontend duration limit explicitly match its supported 5–15 second backend range at 24 fps.

## 1.1.0 - 2026-08-03

- Added MiniMax H3 text-to-video, image-to-video, first/last-frame, and native-audio generation through ComfyUI's day-zero native nodes.
- Added H3 Reference mode for prompt-addressable image, video, and audio inputs. Its separate Ref2VA model installs only when Reference mode is selected, so standard H3 users do not download it.
- Kept LoRA sliders and hold-drag strength controls within the practical `0–2` range while retaining exact manual entry from `-100` to `100`.
- Made Mix Packs available from Create, Edit, and video prompt fields, including preset-card persistence, gallery metadata, and image or video documentation exports.
- Fixed desktop Image Guide and Depth Guide actions so they open the complete Create Image workspace instead of entering an invalid partial view.
- Centered the Camera Motion, Face ID, video-model, and Director story-beat dialogs with balanced viewport margins and bounded scrolling for tall content.

## 1.0.3 - 2026-07-30

### Generation and workflows

- Added signed LoRA strengths from `-100` to `100` across image, Region, Edit, video, and Director workflows. Exact decimal entry is supported, and workflow graphs preserve the signed value.
- Updated Strength Hunt to step from zero toward a negative current LoRA strength. Hunts remain bounded to a magnitude of `2` so an extreme manual value cannot create an unexpectedly large batch.
- Updated all LTX 2.3 empty-audio graphs to submit the current `frames_number`, `frame_rate`, and `batch_size` inputs required by `LTXVEmptyLatentAudio`, including the standard LTX, Face ID, and 10Eros routes.
- Added configurable Krea 2 Identity Edit sampling presets within its supported step and CFG range. App-managed workflow LoRAs no longer trigger misleading compatibility warnings.
- Preserved the user's editor prompt separately from the expanded graph prompt so gallery reuse restores the editable text without losing workflow metadata.
- Added Mix Pack preset identity to generation details and documentation exports while retaining the complete submitted prompt.

### Model installation and setup

- Added resumable HTTP model downloads and isolated Hugging Face Xet acceleration, including byte progress reporting and automatic fallback when accelerated transfer fails.
- Added an optional trusted HTTPS Hugging Face-compatible download endpoint for networks that cannot reach `huggingface.co`. Hugging Face access tokens are never sent to a custom endpoint.
- Made ComfyUI's live model registry authoritative for compatible Krea 2 text encoders, including `qwen3vl_4b_fp8_scaled.safetensors`, so existing external models are reused and their exact registered paths persist.
- Expanded model discovery across configured model roots, manual subfolders, and ComfyUI extra model paths. Existing files are reused instead of being downloaded again.
- Added support for ComfyUI Desktop adopted base directories when installing SAM3 custom nodes.
- Improved portable ComfyUI dependency installation with a `uv` fallback for missing or broken `pip` environments, and isolated incompatible custom-node packages so one failure does not block unrelated selected workflows.
- Corrected the Qwen and SAM model download sources used by Generation setup.
- Prevented Generation setup from launching the ComfyUI Desktop installer when Mix Studio is already connected to a portable instance but still needs its local folder selected.

### Mix Packs and prompt presets

- Replaced the legacy camera control wheels with a visual, searchable Mix Pack preset browser.
- Added a dedicated pack landing grid and detail pages with pack-scoped search, continuous category sections, scroll-aware category navigation, and smooth navigation to a selected section.
- Added responsive three-column desktop and two-column mobile layouts, full-thumbnail presentation, category rail scroll controls, and clearer selected and missing-thumbnail states.
- Added independent multi-preset selection, including multiple presets from the same category, with removable thumbnail cards in Applied Looks.
- Added immediate toggle-on and toggle-off behavior and color-coded preset phrases in the prompt composer.
- Restored preset cards from saved generation metadata and from exact prompt text when transient UI state or older saved generations do not contain the card state.
- Increased the Mix Pack limit to 200 presets and expanded the validated thumbnail budget accordingly.
- Added atomic upgrades for newer pack versions, permanent deletion when removing a pack, and reviewed pack installation and management under Advanced Settings.
- Added profile preferences for prompt composition and whether applied preset cards are shown.

### Mobile and remote access

- Made Mix Studio installable as a Progressive Web App with Mix Studio home-screen icons, maskable artwork, a service worker, and an offline fallback page.
- Added private HTTPS phone access through an existing or newly configured Tailscale Serve route, including detection that avoids replacing unrelated Serve configuration.
- Improved mobile Mix Pack navigation and responsive preset browsing on small screens.

### Interface and documentation

- Updated Mix Studio branding, installed assets, and application metadata.
- Hid release action controls when no compatible public release action is available.
- Streamlined the public README and moved detailed setup, low-VRAM, contribution, and operator guidance into focused documentation.

## 1.0.2 - 2026-07-24

### Krea 2 editing

- Reworked **Krea 2 Edit** around the recommended full-rank Identity Edit v1.2 model and current ComfyUI-Krea2Edit nodes. The graph now uses dual latent and image-grounded conditioning, FIT reference geometry, a 2-megapixel output guard, and the recommended 8–12 step, CFG 1 sampling range.
- Added **Reference boost** to Advanced options, with the upstream-recommended starting value of 4.
- Added ordered two-image editing with the scene or source first and the subject reference second.
- Renamed the existing Conditioning Rebalance workflow to **Krea 2 Remix**, preserving its multi-reference composition workflow as a separate model choice.
- Updated Generation setup to install `krea2_identity_edit_v1_2.safetensors` and the compatible Krea2Edit node revision. Existing default v1 and v1.1 Identity Edit settings migrate to v1.2.
- Updated Krea 2 Expand to use the v1.2 identity-conditioning path and Reference boost.

### Interface

- Docked Director sequence metadata and validation inside the Extend and Keyframes setup cards instead of leaving it at the bottom of an empty workspace.
