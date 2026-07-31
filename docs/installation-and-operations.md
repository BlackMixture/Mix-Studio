# Installation and operations

This guide contains the setup, hardware, networking, update, and maintenance detail that is intentionally kept out of the main project page.

## Supported installation

Mix Studio's supported path is a Windows PC with an NVIDIA GPU and an existing or newly installed ComfyUI environment. The application is distributed as a portable Git checkout rather than a packaged executable. This keeps the installation transparent and lets the owner-only updater fast-forward the checkout without touching user data.

### One-file setup

1. Open the [Mix Studio download page](https://blackmixture.github.io/Mix-Studio/) and save `install_MixStudio.bat`.
2. Put the installer in the parent folder where you want Mix Studio installed. For example, `D:\AI\install_MixStudio.bat` creates `D:\AI\Mix Studio`.
3. Run the installer. It installs Git and Node.js through `winget` when needed, clones the official repository, starts the local server, and opens `http://127.0.0.1:3300/`.

On an unconfigured installation, the centered **Generation setup** panel opens automatically. It looks for live ComfyUI endpoints, including non-default ports; offers to start a detected portable or Desktop installation; and offers the signed official ComfyUI Desktop installer when no usable installation exists. Mix Studio marks the connection ready only after verifying a live endpoint.

Choose one of the setup paths:

- **Quick setup** installs the core model files required for the recommended starter workflow.
- **Install this workflow** downloads only what the current generation needs.
- **Full setup guide** exposes manual URL and folder fields plus individual capability groups.

Depth, style, regional prompting, masks, and upscaling remain optional. A running ComfyUI instance is queried for registered model filenames, so compatible files in a shared model root can be reused.

The reviewed public source for `ComfyUI-Krea2Regional-MultiLoRA` is currently unavailable. Mix Studio will reuse a valid existing installation but will not clone an unreviewed replacement. A fresh Regional Prompting setup explains that the compatible custom node must be installed manually; deselect that feature to install other advanced groups independently.

### Manual Git install

1. Install [Git for Windows](https://git-scm.com/download/win) and Node.js 22 or newer.
2. Clone the repository:

   ```powershell
   git clone https://github.com/BlackMixture/Mix-Studio.git
   ```

3. Open the cloned folder and double-click `install_MixStudio.bat`.
4. Complete the Generation setup panel.
5. Install only the workflow families you intend to use.
6. Review the hardware rating before adding larger Edit and Video families.
7. Use the first-generation tutorial to create and review a test image.

Do not use GitHub's **Download ZIP** if you want in-app updates. The updater requires a real Git checkout.

The bootstrap writes ignored, machine-specific configuration to `install.json`. Generation setup merges the ComfyUI URL into `data/settings.json`. It does not reset `data/db.json`, profiles, gallery media, folders, prompts, or presets.

## Hardware and VRAM

Mix Studio does not enforce a VRAM cutoff. Its ratings describe guided routes for the curated defaults, not guarantees that every resolution or duration will fit.

The lowest guided offload tier is **4 GB of VRAM** through the Flux 2 Klein 4B FP8 edit route with current ComfyUI and model or encoder offloading. This is an offloaded route rather than a claim that the complete pipeline remains resident in 4 GB. [ComfyUI's reference workflow](https://docs.comfy.org/tutorials/flux/flux-2-klein) measures the distilled FP8 pipeline at about 8.4 GB without that constraint, so a 4 GB run will be slower.

The curated Krea 2 image route uses **8 GB VRAM** as its guided offload tier and recommends 16 GB. Krea 2 requires ComfyUI 0.26.0 or newer for the `krea2` CLIP loader type. On detected 4 to 12 GB systems, setup selects the Low VRAM profile and recommends the official INT8 ConvRot weights for Krea 2. Native INT8 ConvRot requires ComfyUI 0.27.0 or newer, which Generation setup verifies. FP8 remains available as a fallback.

Video workflows use **8 GB VRAM** as an experimental offload tier, while 24 GB remains the practical recommendation for Mix Studio's curated graphs. System RAM is not an installer requirement. [ComfyUI documents an 8 GB native-offload route for Wan 2.2 5B](https://docs.comfy.org/tutorials/video/wan/wan2_2), and [ModelScope documents an 8 GB managed-offload route for LTX-2](https://github.com/modelscope/DiffSynth-Studio). Mix Studio uses the heavier Wan 14B and LTX 2.3 22B families, so begin with short, smaller videos at this tier and expect long model-loading pauses.

Low VRAM mode never silently changes a request. If an image exceeds roughly one megapixel or batch one, Mix Studio asks whether to use safer values or continue unchanged.

| Workflow family | Guided offload tier | Practical recommendation | Model route |
| --- | ---: | ---: | --- |
| Flux 2 Klein 4B edit | 4 GB | 16 GB | Official FP8 checkpoint with system-RAM offload |
| Krea 2 image and Krea-based edit | 8 GB | 16 GB | FP8, or native INT8 ConvRot below 16 GB |
| LTX 2.3, LTX Edit, and 10Eros | 8 GB | 24 GB | FP8 checkpoints, standalone video VAE, and aggressive offload |
| Wan 2.2 14B and SCAIL 2 | 8 GB | 24 GB | FP8, or manually configured GGUF diffusion weights |
| Klein 9B and Qwen Edit | 16 GB | 24 GB | Curated BF16 or FP8 variants, or manually configured GGUF weights |

Lower resolution or duration, ComfyUI offloading, and manually configured quantized weights can allow some workflows below their listed tier, with slower generation and a greater out-of-memory risk. Mix Studio warns before a below-tier install or generation and lets the user continue unchanged.

Configured `.gguf` diffusion models automatically use the ComfyUI-GGUF loader in supported Klein, Qwen, Wan, and SCAIL graphs. Guided setup installs that loader but does not download third-party GGUF weights or quantized text encoders. LTX 2.3 and 10Eros use combined transformer and audio checkpoints plus a standalone BF16 video VAE for bounded temporal decoding; a transformer-only GGUF file is not a drop-in replacement. Krea 2 INT8 ConvRot is not GGUF and uses ComfyUI's standard diffusion loader.

## ComfyUI and shared models

For a new machine, the in-app guide downloads ComfyUI Desktop only from the official stable Windows endpoint and refuses to run it unless Windows reports a valid Authenticode signature. Existing Desktop and portable environments can be started from setup.

Mix Studio discovers the live ComfyUI port rather than assuming `8188`. Manual URL, application-folder, and models-folder fields remain available. Setup scans the connected `/object_info` registry and common `extra_model_paths.yaml` files, reports what it finds, and skips recognized filenames before downloading. Existing files are not moved or duplicated.

Reopen **Generation setup** from **Advanced Settings → General** to change the connection or add optional workflow families. Rerunning `install_MixStudio.bat` is safe and prepares and starts the existing checkout again.

## Installing and repairing dependencies

In **Advanced Settings → General**, the **Desktop Dependencies** card scans each enabled model and node family. The owner profile can install only the missing groups. Node packs are cloned into the configured `custom_nodes` directory, and their requirements are installed with that ComfyUI instance's Python environment without a blanket pip upgrade.

Before node requirements change, Mix Studio saves a `pip freeze` snapshot under `data/dependency-backups/`. Model files download into the configured shared models folder with live byte progress, and partial downloads remain as `.mixbox.part` files until complete.

Use **Repair missing tools** after an interrupted install or a custom-node dependency conflict. It reinstalls only the affected packs' declared Python packages, then asks for a ComfyUI restart. It does not reset profiles, gallery data, model files, or unrelated custom nodes.

Some Hugging Face files require accepting a license before their download URL works. Accept the license on the model page first. If the provider also requires authentication, add a read token under **Settings → General → Hugging Face token**, or launch Mix Studio with an `HF_TOKEN` environment variable.

If the official Hugging Face host is unavailable on the current network, enter a trusted Hugging Face-compatible HTTPS base URL under **Settings → General → Hugging Face download endpoint**, or set `HF_ENDPOINT` before launching Mix Studio. The endpoint rewrites only reviewed `huggingface.co` model sources. Mix Studio never sends the configured Hugging Face token to a custom endpoint. Clear the field to return to the official host.

The card exposes **Restart ComfyUI** for a configured Windows ComfyUI folder, but it refuses while either queue is active.

## Phone and private remote access

After the Owner profile has a PIN, the console prints local network URLs and Generation setup's **Phone access card** presents usable addresses:

- `Local: http://localhost:3300` opens on the desktop.
- `Phone: http://192.168.x.x:3300` opens on a phone connected to the same Wi-Fi.

Use **Copy** or **Share** to send the selected address to a phone. Add a PIN to the Owner profile before sharing access beyond the desktop. On the phone, use **Add to Home Screen** for an app-like fullscreen experience.

For private access away from home, install [Tailscale](https://tailscale.com/download) on both devices and sign them into the same tailnet. Refresh the Phone access card, then copy or share its Tailscale URL. The desktop continues to host ComfyUI, models, and media; the phone remains the control surface.

If the phone cannot connect over the local network, allow Node through Windows Defender Firewall for private networks. Set a different application port with the `PORT` environment variable when required.

## Analytics and privacy

Anonymous product analytics use the app's public PostHog project by default. Users see a first-run notice and can disable or re-enable analytics under **Settings → General**.

The browser SDK uses memory-only persistence and disables autocapture, page views, session replay, surveys, and person profiles. It sends only `App_Launched` and `Generation_Started` with a public model label.

Operators can override the project with `MIXBOX_POSTHOG_KEY` and `MIXBOX_POSTHOG_HOST`, or an `analytics` object with `key` and HTTPS `host` fields in the ignored `install.json`. In PostHog, set **Settings → Project → General → IP data capture** to discard client IP addresses. This is a server-side project setting.

## Updating

Open Mix Studio's side menu and choose **Update app**. Updates require:

- a Git clone with its `.git` directory;
- a named branch and configured `origin` remote;
- no uncommitted tracked application changes; and
- idle Mix Studio and ComfyUI queues.

The updater installs the exact stable Git tag advertised by the official GitHub Release instead of pulling unreleased changes from the tip of `main`. Before changing the live branch, it checks the release out separately and runs the server and browser syntax checks plus the full automated test suite. A download, ancestry, or test failure leaves the installed revision unchanged.

Machine-specific `install.json` and all `data/` content are ignored by Git, so normal updates do not replace profiles, settings, metadata, or generations. Server-side changes restart the Node process automatically. Frontend-only changes reload without a server restart. Keep development changes in a separate worktree and contribute reusable fixes upstream so the production checkout remains eligible for one-click fast-forward updates.

Mix Studio checks the official `BlackMixture/Mix-Studio` GitHub Releases channel when a profile signs in and every six hours while the app stays open. A newer stable semantic version appears in the **Updates inbox** with release notes and an optional browser alert. The check is read-only, cached locally for one hour, and uses no bundled GitHub credentials. The local owner still decides when to install the update.

The owner can also choose **Restart app**. The same queue safety checks run before the Node server restarts.

### Maintainer release procedure

Every user-facing release uses the semantic version in `release.json` and a matching Git tag such as `v1.1.0`.

1. Keep `main` release-ready and ensure the working tree contains the intended changes only.
2. Update `release.json` with the version and release date.
3. Add the user-facing notes to `CHANGELOG.md`.
4. Run `node --check server.js`, `node --check public/app.js`, and `node --test`.
5. Commit and push the release state.
6. Tag that commit with the matching annotated Git tag and push the tag.
7. Publish a GitHub Release for that tag with the changelog notes. This final step enables the public Updates inbox notification.

Repository quality checks run on Node 22 for Linux and Windows. A release tag fails validation when it does not match `release.json`, and the download page cannot deploy until the same checks pass.

## Restarting, uninstalling, and data safety

To remove Mix Studio, run `uninstall.bat`. By default, it moves the managed `data/` folder to `%LOCALAPPDATA%\Mix Studio User Data\data`, leaving the original checkout path free for a clean reinstall. A later setup reconnects those profiles, settings, generations, ComfyUI paths, and the last detected hardware profile.

Use `-RemoveData` only when you also intend to erase managed gallery data and preserved setup metadata. It requires typing `DELETE`. ComfyUI, shared models, mirrored export files, arbitrary external data paths, and the system Node.js installation are never removed.

Browser-installed shortcuts, local form settings, and compressed preview caches live on each phone or browser and must be cleared there.

Mix Studio backs up the database at startup and every 30 minutes. Deleted media is moved to `data/trash/` before permanent removal. For the full data layout and ComfyUI recovery-output location, see the [technical reference](technical-reference.md#local-data-and-recovery).
