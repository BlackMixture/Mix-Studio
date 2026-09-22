# Qwen Image 2.1

Choose **Qwen Image 2.1** in Create’s Image model control or the Edit model picker. Krea 2 remains the default. Qwen uses the official ComfyUI workflow, with a Balance/Quality toggle alongside the generation settings. Balance uses 25 steps; Quality uses 40 steps. The older Qwen Edit 2511 Lightning LoRA is not compatible with 2.1 and is not loaded for it. Masks, Expand, regional, depth, and camera tools remain with their existing models.

Generation setup downloads three official [ComfyUI model files](https://huggingface.co/Comfy-Org/Qwen-Image-2.1) without requiring a Hugging Face token. Preferences → Models → Qwen Image 2.1 offers automatic hardware selection or an explicit choice:

| Variant | Model / text encoder | Intended use |
| --- | --- | --- |
| Lower memory | INT8 ConvRot / W4A8 | NVIDIA below 16 GB VRAM; system RAM offloading may be necessary |
| Balanced | INT8 ConvRot / INT8 ConvRot | NVIDIA with at least 16 GB VRAM |
| Full precision | BF16 / BF16 | Other supported ComfyUI backends or an explicit precision preference; considerably more memory |

All variants use Qwen 2.1’s dedicated VAE. These are download recommendations, not guarantees for every resolution or device. Current ComfyUI with native `TextEncodeQwenImage21` support is required (introduced in v0.37.0). Setup checks the installed nodes before downloading.

**Model license:** Qwen Image 2.1 is released under the [Qwen Research License](https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE), for noncommercial research and evaluation; commercial use requires separate permission. Mix Studio’s open-source app license does not change the model’s terms.
