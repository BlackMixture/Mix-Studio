# Experimental photo-to-splat workflow

Enable **Preferences → General → Experimental Features**, then choose **Create → 3D**.
Add a photo and choose **Generate 3D**. Mix Studio generates a roughly twelve-second MiniMax H3 orbit with the same photo anchoring the first and last frame. Decoded frames pass through RIFE 2× and are encoded at 48 fps. The video is saved in the regular Library and displayed while COLMAP reconstructs cameras and Brush trains the splats. The result switches to an interactive viewer. Video and 3D views remain available, and the PLY can be downloaded.

Desktop uses the existing inputs / result / Library columns; mobile keeps the generation controls and result on one screen. Create 3D presents a photo picker and the shared Balance/Quality toggle. Dependency installation lives in Preferences and appears only when needed. No external website or cloud API is involved.

## Local dependencies

- Working ComfyUI with Mix Studio's MiniMax H3 first/last-frame models for photo input. Use the existing Video Models setup to install them.
- ComfyUI-Frame-Interpolation with the RIFE VFI node. Missing interpolation support fails clearly before H3 is queued; it is never silently skipped.
- FFmpeg, discovered from PATH, FFMPEG_PATH, or ComfyUI's imageio-ffmpeg environment.
- COLMAP 4.2.0 and Brush 0.3.0. The owner-only Windows x64 installer downloads the official release ZIPs, verifies pinned SHA-256 checksums, and extracts them into `data/splats/tools`. It uses COLMAP's CPU feature extraction/matching; Brush uses the GPU. No Rust compiler, Python environment changes or administrator install are required.
- Other platforms: install COLMAP and Brush, then set `MIX_SPLAT_COLMAP` and `MIX_SPLAT_BRUSH` to native executables, or put `colmap` and `brush` on PATH. Only Windows x64 automatic installation is implemented.
- A WebGL 2 browser for viewing. Three.js 0.160.1 and GaussianSplats3D 0.4.7 are vendored under `public/vendor/splats` with their MIT licenses. SharedArrayBuffer is disabled, so ordinary local HTTP works without cross-origin isolation headers.

Balance uses a 768-pixel maximum video edge, 20 H3 steps, at most 60 extracted frames, 5,000 training steps, and 500,000 splats. Quality uses a 1024-pixel maximum video edge, at most 100 frames, 15,000 training steps, and 1.5 million splats. Both use full 20-step H3 sampling without a Turbo LoRA. These are resource caps, not guarantees of a particular VRAM requirement.

Each creation persists its metadata, source photo/video, COLMAP data and training log in a UUID directory under `data/splats`. The browser may leave while processing continues. Restarted work is marked interrupted; it is not silently resubmitted. Completed orbit videos survive later reconstruction failures. One splat pipeline runs at a time, and the app refuses competing generation/setup operations while it runs. Other ComfyUI clients should also remain idle.

## Access and limits

API routes require a signed-in profile. Records and downloads are profile scoped; records derived from a Library item require that item to remain visible in the unlocked gallery. There are no arbitrary filesystem-path or command arguments accepted from clients. Raw uploads are limited to 256 MB; the photo picker limits input to 32 MB. Imported PLY files must contain binary little-endian Gaussian attributes and at most 3 million splats.

An orbit video must be between 2 and 120 seconds. The pipeline samples across its full duration, removes near-duplicate frames and requires at least 12 images. COLMAP must register at least ten views and at least half of the extracted frames before training starts. These checks catch disconnected reconstructions; they do not prove geometric accuracy. Hidden sides are invented by the video model. Background floaters or distortion can remain. This first release provides viewing and PLY export, not an in-app selection/cropping editor; exported scenes can be cleaned in SuperSplat.

## Sources and licenses

- [Source tutorial](https://www.reddit.com/r/StableDiffusion/comments/1wothsh/from_a_single_image_to_gaussian_splats_another/)
- [COLMAP CLI](https://colmap.github.io/cli.html), [COLMAP license](https://github.com/colmap/colmap/blob/main/COPYING.txt)
- [Brush](https://github.com/ArthurBrussee/brush), Apache-2.0
- [GaussianSplats3D](https://github.com/mkkellogg/GaussianSplats3D), MIT
- [Three.js](https://github.com/mrdoob/three.js), MIT

On Windows/Blackwell, ComfyUI may report `HostBuffer.read_file_slice failed` during H3 video VAE decoding. [Upstream issue 15337](https://github.com/Comfy-Org/ComfyUI/issues/15337) reports `--disable-pinned-memory --disable-async-offload` as a workaround. This feature does not silently change a user's ComfyUI launch flags.

## Viewing and Library

A completed photo-to-3D scene uses its existing orbit-video thumbnail in Library, with a small 3D badge. Tap the card to open the normal gallery viewer, including its generation settings and actions. Select the 3D thumbnail to interact with the scene in that same preview area. Image, video and 3D selections share the close button, information panel and action bar. The Create result also has an expand button. Orbit-video and PLY import APIs remain available, but are not exposed on the simplified Create 3D form.

The expanded viewer’s Process menu can add 5,000 or 10,000 training steps, up to 50,000 total. It starts from the saved PLY and camera reconstruction, with a new optimizer; this is not an exact optimizer-checkpoint resume. Each result is a separate version and preserves the original. Imported scenes without the source dataset cannot be refined.

The viewer toolbar provides Frame view, Center on subject, View options and Download PLY. Select Center on subject, then tap a visible surface to move the orbit pivot. View options limits visibility to a sphere around that pivot, with a 10–200% distance slider, a show-all toggle, flip-up and reset-framing controls. These are browser-local view adjustments: the downloaded PLY is unchanged. A clip range hides background floaters; it does not repair inconsistent geometry.

## BM Pro verification (24 September 2026)

A Mix Studio-generated Qwen courtyard-owl photo was submitted through the app's photo endpoint. An H3 orbit completed, followed by COLMAP and Brush, producing a viewable scene in 252 seconds: 60/60 registered frames and 56,626 splats. The subject reconstructed clearly, while ground/background floaters remained. A second run of the same video using Quality registered 100/100 frames and produced 403,315 splats in 504 seconds for reconstruction/training alone. These runs changed frame count, resolution and training duration together; they do not isolate which setting helps.

An H3 attention comparison used the same photo, prompt, 768×768 canvas, 192 frames, 20 steps and seed (1146265822). PyTorch completed in 177.49 seconds; native Comfy Kitchen completed in 129.18 seconds (about 27% less total time in this single comparison). Models were reloaded between runs. This is not a cross-hardware benchmark or a claim of equal visual output. Kitchen remains optional and does not stack with Sage/SLA.

[ComfyUI's native Kitchen implementation](https://github.com/Comfy-Org/ComfyUI/commit/bf4c9a08fc854df6d3b2bef1b92b509e2ef2d2c9) is separate from the [reported H3 memory-clone regression](https://github.com/Comfy-Org/ComfyUI/issues/15665). No upstream source patches were applied.

[RIFE](https://github.com/hzwer/ECCV2022-RIFE) synthesizes intermediate video frames. Create 3D now applies 2× interpolation after H3 decoding, with matching 48 fps playback and exact frame-count metadata. Reconstruction samples the resulting video within its existing 60/100-frame budget. More interpolated frames do not supply newly observed geometry or undo source motion blur. [COLMAP recommends textured, overlapping, sharp views](https://colmap.github.io/tutorial). The longer orbit prompt requests evenly timed quarter turns, static geometry, fixed focal length/camera height, deep focus and sharp short exposures. These requests cannot guarantee temporal consistency from a generative model.

Camera-adapter research: [Jojocodex Camera Motion](https://huggingface.co/Jojocodex/minimax-h3-Camera-Motion-lora) supports slow orbit prompts; the author recommends 0.8–1.0 strength. It is a candidate for testing, not a guaranteed 360-degree controller. The [equirectangular LoRA](https://huggingface.co/shamanic/minimax-h3-equi360-lora) targets panoramic video, and the [Turnaround LoRA](https://huggingface.co/matlod/minimax-h3-turnaround) produces contact sheets and explicitly degrades ordinary video motion; neither belongs in this orbit pipeline.


The revised orbit pipeline was verified end to end on BM Pro: 294 native frames, RIFE 2×, and an independently probed MP4 containing 587 frames at 48 fps (12.229 seconds). All 60 reconstruction views registered; 5,000 training steps produced 71,889 splats. Video generation/interpolation took 485.53 seconds and the full pipeline took 568 seconds. Further training through the normal app added 5,000 steps and saved a separate 222,498-splat result; the original PLY checksum remained unchanged.

A matched Camera Motion LoRA test at strength 0.8 used the same photo, seed (1112203401), 768² canvas, 20 steps, res_multistep/simple sampling and RIFE pass. Its required `camera motion,` trigger was prepended. The result introduced push-in/reframing and stronger background changes, so the adapter is not a default. This is a single-example qualitative comparison, not a general model ranking.

The expanded viewer's Documentation action reuses the existing export panel and aspect-ratio controls. It combines the source photo, generated orbit, and an actual 60-degree camera move through the splat using the current center and clipping settings. Export/cancel restores the camera. A real 1280 × 842, 48 fps MP4 was exported and inspected on this test; background reconstruction artifacts remain visible.
