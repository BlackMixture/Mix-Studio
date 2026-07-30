# Changelog

## Unreleased

### Workflow and setup fixes

- Added negative LoRA strengths from `-100` to `100` across image, region, edit, and video workflows. Strength Hunt remains bounded to a magnitude of `2` so a high manual value cannot create an unexpectedly huge batch.
- Updated LTX 2.3 video graphs to submit the current `frames_number`, `frame_rate`, and `batch_size` inputs required by `LTXVEmptyLatentAudio`.
- Made ComfyUI's live model registry authoritative for compatible Krea 2 text encoders, including `qwen3vl_4b_fp8_scaled.safetensors`, so existing external models are reused and their saved filenames persist.
- Added an optional Hugging Face download endpoint for networks that cannot reach `huggingface.co`. Tokens continue to be sent only to the official Hugging Face host.
- Prevented Generation setup from launching the ComfyUI Desktop installer when it is already connected to a portable instance but still needs the local ComfyUI folder selected.

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
