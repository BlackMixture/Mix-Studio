# Update showcase media

The update carousel currently includes these public MP4 previews:

- `v1.2.4-ltx-2.5.mp4`

- `v1.2.0-h3-turbo.mp4`
- `v1.2.0-wan-animate2.mp4`
- `v1.2.0-mix-packs.mp4`
- `v1.2.0-mix-packs-mobile.mp4`

Use muted, looping, web-optimized H.264 MP4 previews. A 16:9 source is preferred; the optional `-mobile` cut is selected for viewports up to 560 pixels wide. The interface displays its animated built-in artwork if a preview is not present or cannot load.

`v1.2.4-ltx-2.5.mp4` is the Mix Studio-generated LTX car-chase example selected for the v1.2.4 LTX 2.5 support highlight.

`v1.2.0-wan-animate2.mp4` is a muted 960×540 web rendition of ComfyUI's official `WAN_ANIMATE2_NOLOGO_16x9.mp4` demo from [Wan Animate 2 is now available in ComfyUI](https://blog.comfy.org/p/wan-animate-2-is-now-available-in).

## v1.3.0 Qwen Image 2.1 highlight

`v1.3.0-qwen-2.1.mp4` is a nine-second, muted, looping 960×540 H.264 animation showing creation and editing with Qwen Image 2.1. The matching `v1.3.0-qwen-2.1.gif` is a 768×432, 15 fps GIF; `v1.3.0-qwen-2.1.jpg` is the completed-edit poster for static or reduced-motion presentation. Prefer the MP4 for efficient in-app playback; the GIF is available for release notes and other image-only surfaces.

Both photographs are genuine Qwen Image 2.1 results. The original café scene comes from the BM Pro comparison (40 steps, CFG 2.5, Euler/simple, seed 738291046125, INT8 ConvRot). The red-jacket edit was generated through Mix Studio on BM Pro (job `4deb0c92-99f9-4dcf-bca1-6112e6797f6d`, 40 steps, CFG 2.5, seed 29170418). The animation uses condensed prompts and compresses the interaction into a short feature demonstration; it makes no inference-speed claim. Images are unretouched.

Authored and rendered using HyperFrames with its `before-after-wipe` comparison mechanic, then encoded with FFmpeg. Verified duration, dimensions, codec, key frames, layout, runtime, and text contrast. Source project is kept locally under `_tmp/qwen-release-highlight/`. Older update media remain unchanged.

## v1.3.0 experimental photo-to-3D highlight

`v1.3.0-photo-to-3d.mp4` is an eight-second muted 960×540 H.264 loop with a matching `.jpg` poster. It shows the real stone-owl H3 orbit generated through Mix Studio on BM Pro, labeled **Generated orbit**, alongside the Photo → Orbit video → 3D scene workflow. The associated experiment completed a 56,626-splat reconstruction. The final Open your 3D scene action illustrates the app flow; the orbit footage is not presented as a recording of the interactive splat viewer.

The opening thumbnail is extracted from the first orbit frame. No model output was retouched. Authored/rendered with HyperFrames and encoded with FFmpeg; verified runtime, layout, contrast, proof frames, duration, and codec. Local source project: `_tmp/splat-release-highlight/`.
