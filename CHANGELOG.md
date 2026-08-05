# Changelog

## Unreleased

- Made documentation video exports prefer H.264 MP4, including AAC audio when supported, while retaining WebM as a compatibility fallback.
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
