# Changelog

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
