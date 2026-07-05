# Klein 9B Edit And LoRA Compatibility Design

## Goal

Add Flux Klein 9B as a separate image-editing path and make LoRA selection clearer by warning about engine/model-family mismatches.

## Current State

The Edit tab currently has two engines: Flux Klein and Qwen Edit. Flux Klein uses one configured UNET, one configured text encoder, and the shared Flux2 VAE. Qwen Edit uses its own UNET, Qwen Image text encoder, and built-in Qwen Edit Lightning LoRA.

The LoRA UI is shared across Create, Edit, and Video. Edit mode correctly sends selected LoRAs to the server, and completed edit metadata stores those LoRAs. The current failure mode is that users can choose Krea2 LoRAs while running Qwen Edit or Flux Klein, where those LoRAs are incompatible or ineffective.

Local model discovery on July 5, 2026 found:

- `flux-2-klein-4b.safetensors`
- `flux-2-klein-9b-fp8.safetensors`

The 9B text encoder `qwen_3_8b_fp8mixed.safetensors` was not present in the scanned model folders, so the app must surface missing-model health information rather than assuming 9B is ready.

## Design

Rename the existing Flux Klein edit engine to `Klein 4B` and add a third edit engine chip, `Klein 9B`. Keep `Qwen Edit` as-is.

The backend will route both Klein engines through the same graph builder, but the selected engine determines the Klein model settings:

- `klein4Unet`: default `flux-2-klein-4b.safetensors`
- `klein4Clip`: default `qwen_3_4b.safetensors`
- `klein9Unet`: default `flux-2-klein-9b-fp8.safetensors`
- `klein9Clip`: default `qwen_3_8b_fp8mixed.safetensors`
- `kleinVae`: existing shared Flux2 VAE setting

For backward compatibility, existing `kleinUnet` and `kleinClip` settings should migrate into `klein4Unet` and `klein4Clip` if the new fields are absent.

## LoRA Compatibility UX

Add lightweight compatibility classification in a small shared helper module. The classifier uses LoRA metadata when available and falls back to filename/key-prefix heuristics.

Target categories:

- `krea2`
- `klein4`
- `klein9`
- `qwen-edit`
- `video`
- `unknown`

The LoRA picker should default to compatible LoRAs for the current tab/engine and include an `All LoRAs` toggle or chip for override. Selected incompatible LoRAs should stay visible so older presets and experiments are not lost.

If a selected LoRA looks incompatible, show a concise warning under the LoRA panel. Generation is still allowed because many community LoRAs lack clean metadata.

## Backend Validation And Health

The Settings health check should report Klein 4B and Klein 9B model availability separately.

The debug model endpoint should include enough LoRA metadata for the frontend to classify LoRAs without loading full weight files in the browser. Since the server already reads ComfyUI model lists from `/object_info`, a companion endpoint can scan safetensors headers locally from the ComfyUI LoRA folder when possible.

If metadata cannot be read for a LoRA, classify it as `unknown` and keep it available.

## Testing

Add tests for the compatibility helper:

- Krea2 metadata and diffusion-model Krea2 key patterns classify as `krea2`.
- Flux Klein 9B metadata classifies as `klein9`.
- Qwen Image Edit key patterns classify as `qwen-edit`.
- Unknown LoRAs remain available and do not trigger hard blocking.
- Current edit engine maps to the expected compatible categories.

Existing privacy helper tests remain unchanged.

## Non-Goals

- No hard-blocking incompatible LoRAs.
- No automatic model downloads.
- No full safetensors weight loading.
- No change to Qwen Edit graph behavior beyond compatibility warnings.
