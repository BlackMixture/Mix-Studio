# Installation and operations

This guide contains the setup, hardware, networking, update, and maintenance detail that is intentionally kept out of the main project page.

## Supported installation

Mix Studio supports Windows with NVIDIA for the complete curated workflow set, Linux with NVIDIA through a source-based ComfyUI environment, and Apple Silicon macOS for the Metal-compatible workflow set. AMD ROCm integration on Windows and Linux is experimental and requires an already working ROCm-enabled ComfyUI/PyTorch environment. Every platform uses a portable Git checkout rather than a packaged executable. This keeps the installation transparent and lets the owner-only updater fast-forward the checkout without touching user data.

### Windows one-file setup

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

### Apple Silicon macOS setup

1. Install Git, Node.js 22 or newer, and a source-based ComfyUI environment with its Python virtual environment at `ComfyUI/.venv` or `ComfyUI/venv`.
2. Download `install_MixStudio.command` from the [Mix Studio download page](https://blackmixture.github.io/Mix-Studio/).
3. In Terminal, run `zsh ~/Downloads/install_MixStudio.command`. If the file was saved elsewhere, use its actual path. The script verifies Git and Node, clones the official checkout into a `Mix Studio` folder beside the installer, prepares the local configuration, starts the restart-aware server launcher, and opens the app.
4. In Generation setup, use the detected ComfyUI source folder or **Browse computer** to select the folder containing `main.py`. Mix Studio recognizes `.venv/bin/python` and `venv/bin/python`, uses POSIX model paths, and can start or safely restart that local process.

Mix Studio reads the connected ComfyUI device backend and applies an MPS-specific capability profile:

- LTX 2.3 and LTX Edit use the official `ltx-2.3-22b-dev.safetensors` BF16 checkpoint. Generation setup selects it in place of the curated FP8 checkpoint.
- MiniMax H3, 10Eros, Wan 2.2, and SCAIL 2 stay visible but unavailable because their curated weight and kernel routes are not compatible with Apple Metal.
- Large two-stage LTX refine requests are rejected before queueing with a safe duration suggestion. Start with short clips and increase duration gradually.
- Face ID remains installable without the optional BFS audio-guide dependency; an unavailable `librosa` import no longer prevents the identity-overlap node from loading.

Mix Studio launches the configured source environment with `--listen 127.0.0.1 --fp32-vae --use-split-cross-attention` and `PYTORCH_ENABLE_MPS_FALLBACK=1`. It does not set PyTorch's high-watermark ratio to zero because removing that guard can let a generation consume memory needed by macOS. Unified memory is shared with macOS and other applications, so close memory-heavy applications before larger LTX runs.

### Linux setup: NVIDIA or AMD ROCm

1. Install Git, Node.js 22 or newer, and a source-based ComfyUI environment with `.venv/bin/python` or `venv/bin/python`. Confirm ComfyUI can generate successfully before connecting Mix Studio. AMD systems need a compatible ROCm-enabled PyTorch build; Mix Studio does not install or replace the GPU runtime.
2. Clone the repository and start the app:

   ```bash
   git clone https://github.com/BlackMixture/Mix-Studio.git
   cd Mix-Studio
   ./start-mixstudio.sh
   ```

3. In Generation setup, select the ComfyUI folder containing `main.py`, or connect to an already running loopback endpoint. The launcher defaults `COMFYUI_PATH` to `$HOME/ComfyUI`; set it before launch when ComfyUI lives elsewhere.
4. For an intentionally managed user service, set `MIXBOX_COMFY_SERVICE` to its validated unit name, such as `comfyui.service`. Mix Studio never guesses a service name and never manages a service for a remote ComfyUI endpoint.

Linux process control uses argument-based launches without a shell, verifies that the local listener belongs to the configured ComfyUI source, sends `SIGTERM`, waits for the port to close, and only then starts it again. ComfyUI Desktop 2 installations remain app-managed unless the operator explicitly configures a service.

NVIDIA uses the complete curated workflow set when the connected ComfyUI exposes the required nodes and models, including MiniMax H3 on ComfyUI 0.30.0 or newer. AMD is an experimental compatibility path: connected ComfyUI device data, `rocm-smi`, Linux sysfs, or Windows display-controller data supplies the vendor and memory profile. Krea 2 stays on FP8 rather than the NVIDIA-oriented INT8 recommendation, and SeedVR2 falls back to SDPA when a saved CUDA-only attention mode is selected. MiniMax H3 remains unavailable because its curated route uses NVIDIA-specific NVFP4/AWQ and INT8 ConvRot kernels. Actual model and node compatibility still depends on the installed ROCm, PyTorch, and ComfyUI versions.

## Hardware and VRAM

Mix Studio does not enforce a VRAM cutoff. Its ratings describe guided routes for the curated defaults, not guarantees that every resolution or duration will fit.

The lowest guided offload tier is **4 GB of VRAM** through the Flux 2 Klein 4B FP8 edit route with current ComfyUI and model or encoder offloading. This is an offloaded route rather than a claim that the complete pipeline remains resident in 4 GB. [ComfyUI's reference workflow](https://docs.comfy.org/tutorials/flux/flux-2-klein) measures the distilled FP8 pipeline at about 8.4 GB without that constraint, so a 4 GB run will be slower.

The curated Krea 2 image route uses **8 GB VRAM** as its guided offload tier and recommends 16 GB. Krea 2 requires ComfyUI 0.26.0 or newer for the `krea2` CLIP loader type. On detected 4 to 12 GB systems, setup selects the Low VRAM profile and recommends the official INT8 ConvRot weights for Krea 2. Native INT8 ConvRot requires ComfyUI 0.27.0 or newer, which Generation setup verifies. FP8 remains available as a fallback.

Most video workflows use **8 GB VRAM** as an experimental offload tier, while 24 GB remains the practical recommendation for Mix Studio's curated graphs. MiniMax H3 begins at a 12 GB guided offload tier and also recommends 24 GB. System RAM is not an installer requirement. [ComfyUI documents an 8 GB native-offload route for Wan 2.2 5B](https://docs.comfy.org/tutorials/video/wan/wan2_2), and [ModelScope documents an 8 GB managed-offload route for LTX-2](https://github.com/modelscope/DiffSynth-Studio). Mix Studio uses the heavier Wan 14B, LTX 2.3 22B, and H3 families, so begin with short, smaller videos at the guided tiers and expect long model-loading pauses.

Low VRAM mode never silently changes a request. If an image exceeds roughly one megapixel or batch one, Mix Studio asks whether to use safer values or continue unchanged.

| Workflow family | Guided offload tier | Practical recommendation | Model route |
| --- | ---: | ---: | --- |
| Flux 2 Klein 4B edit | 4 GB | 16 GB | Official FP8 checkpoint with system-RAM offload |
| Krea 2 image and Krea-based edit | 8 GB | 16 GB | FP8, or native INT8 ConvRot below 16 GB |
| LTX 2.3, LTX Edit, and 10Eros | 8 GB | 24 GB | Combined FP8 checkpoints with aggressive offload |
| Wan 2.2 14B and SCAIL 2 | 8 GB | 24 GB | FP8, or manually configured GGUF diffusion weights |
| MiniMax H3 | 12 GB | 24 GB | Official INT8 ConvRot FL2VA plus NVFP4/AWQ Qwen3-VL; Ref2VA is optional |
| Klein 9B and Qwen Edit | 16 GB | 24 GB | Curated BF16 or FP8 variants, or manually configured GGUF weights |

Lower resolution or duration, ComfyUI offloading, and manually configured quantized weights can allow some workflows below their listed tier, with slower generation and a greater out-of-memory risk. Mix Studio warns before a below-tier install or generation and lets the user continue unchanged.

Configured `.gguf` diffusion models automatically use the ComfyUI-GGUF loader in supported Klein, Qwen, Wan, and SCAIL graphs. Guided setup installs that loader but does not download third-party GGUF weights or quantized text encoders. LTX 2.3 and 10Eros use combined audio and video checkpoints and cannot use a transformer-only GGUF file as a drop-in replacement. Krea 2 INT8 ConvRot is not GGUF and uses ComfyUI's standard diffusion loader.

## ComfyUI and shared models

For a new machine, the in-app guide downloads ComfyUI Desktop only from the official stable Windows endpoint and refuses to run it unless Windows reports a valid Authenticode signature. Existing Desktop and portable environments can be started from setup.

Mix Studio discovers the live ComfyUI port rather than assuming `8188`. Manual URL, application-folder, and models-folder fields remain available. Setup scans the connected `/object_info` registry, classic `extra_model_paths.yaml` files, Desktop shared-model configurations, and Desktop 2 declared model directories across Windows, macOS, and Linux. Quoted YAML keys and literal or folded block paths are supported. Existing files are reported and reused; they are not moved or duplicated.

Reopen **Generation setup** from **Advanced Settings → General** to change the connection or add optional workflow families. Rerunning `install_MixStudio.bat` is safe and prepares and starts the existing checkout again.

MiniMax H3 setup is split into two independent groups. The standard group installs FL2VA, the Qwen3-VL encoder, and both VAEs for text, first-frame, and first/last-frame generation. Choosing H3 Reference mode installs the separate Ref2VA model and VideoHelperSuite on demand. Standard H3 use does not download Ref2VA. Both groups require ComfyUI 0.30.0 or newer.

## Installing and repairing dependencies

In **Advanced Settings → General**, the **Desktop Dependencies** card scans each enabled model and node family. The owner profile can install only the missing groups. Node packs are cloned into the configured `custom_nodes` directory, and their requirements are installed with that ComfyUI instance's Python environment without a blanket pip upgrade.

Before node requirements change, Mix Studio saves a `pip freeze` snapshot under `data/dependency-backups/`. Model files download into the configured shared models folder with live byte progress, and partial downloads remain as `.mixbox.part` files until complete.

Use **Repair missing tools** after an interrupted install or a custom-node dependency conflict. It reinstalls only the affected packs' declared Python packages, then asks for a ComfyUI restart. It does not reset profiles, gallery data, model files, or unrelated custom nodes.

Some Hugging Face files require accepting a license before their download URL works. Accept the license on the model page first. If the provider also requires authentication, add a read token under **Settings → General → Hugging Face token**, or launch Mix Studio with an `HF_TOKEN` environment variable.

If the official Hugging Face host is unavailable on the current network, enter a trusted Hugging Face-compatible HTTPS base URL under **Settings → General → Hugging Face download endpoint**, or set `HF_ENDPOINT` before launching Mix Studio. The endpoint rewrites only reviewed `huggingface.co` model sources. Mix Studio never sends the configured Hugging Face token to a custom endpoint. Clear the field to return to the official host.

The card exposes **Restart ComfyUI** for a configured local Windows, macOS, or Linux source installation, but it refuses while either queue is active. On macOS and Linux it verifies that the listener command belongs to the configured `main.py`, sends `SIGTERM`, waits for the port to close, and only then starts the configured environment again. Linux user-service control is available only when `MIXBOX_COMFY_SERVICE` is explicitly configured.

## Phone and private remote access

After the Owner profile has a PIN, the console prints local network URLs and Generation setup's **Phone access card** presents usable addresses:

- `Local: http://localhost:3300` opens on the desktop.
- `Phone: http://192.168.x.x:3300` opens on a phone connected to the same Wi-Fi.

Use **Copy** or **Share** to send the selected address to a phone. Add a PIN to the Owner profile before sharing access beyond the desktop. HTTP phone addresses support browser access, but mobile app installation requires HTTPS; adding an HTTP address to the home screen can create only a browser shortcut.

For private access away from home, install [Tailscale](https://tailscale.com/download) on both devices and sign them into the same tailnet. Refresh the Phone access card, then copy or share its Tailscale URL. The desktop continues to host ComfyUI, models, and media; the phone remains the control surface.

For app installation, use the secure-address action in **Preferences → System → Phone access**, then open the resulting HTTPS address on the phone. In Chrome on Android, choose **Install app**. On iPhone, use Safari's **Share → Add to Home Screen**. Keep Tailscale connected when using the private address.

If Tailscale Serve already hosts another app, Mix Studio refuses to replace that configuration. An operator can configure an unused HTTPS port with `tailscale serve --bg --https=8443 http://127.0.0.1:3300` after checking that port 8443 is free, then use `https://<device>.<tailnet>.ts.net:8443/`. This is private Tailscale Serve access; it does not require Funnel. The current Phone access card detects the default HTTPS endpoint, so retain the explicit URL when using an alternate port.

If Chrome offers **Open another app** instead of installing Mix Studio, check that the full address includes the intended port. An existing Android web app on the same hostname can also claim its links. In Android's **Settings → Apps → [that app] → Open by default**, turn off **Open supported links**, reopen the Mix Studio HTTPS address directly in Chrome, and retry installation. This changes phone link handling, not the other app's desktop installation.

If the phone cannot connect over the local network, allow Node through Windows Defender Firewall, macOS network security controls, or the Linux host firewall for private networks. Set a different application port with the `PORT` environment variable when required.

## Analytics and privacy

Anonymous product analytics use the app's public PostHog project by default. Users see a first-run notice and can disable or re-enable analytics under **Settings → General**.

The browser SDK uses memory-only persistence and disables autocapture, page views, session replay, surveys, and person profiles. It sends only `App_Launched` and `Generation_Started` with a public model label.

Operators can override the project with `MIXBOX_POSTHOG_KEY` and `MIXBOX_POSTHOG_HOST`, or an `analytics` object with `key` and HTTPS `host` fields in the ignored `install.json`. In PostHog, set **Settings → Project → General → IP data capture** to discard client IP addresses. This is a server-side project setting.

## Updating

Open Mix Studio's side menu and choose **Update app**. The confirmation names the exact release that will be installed. In the Updates inbox, the owner can select:

- **Stable** (default): the latest published stable GitHub Release.
- **Preview** (opt-in): the highest semantic version among the most recent 100 published releases, including prereleases and stable releases. Drafts are excluded.
- **Development** (explicit opt-in): a fast-forward pull of the configured Git branch. This can include unreleased work.

Release updates require an official Git checkout on the configured branch (normally `main`), no tracked local edits, and idle Mix Studio and ComfyUI queues. They fetch the offered tag, resolve it to a commit, validate it in a temporary worktree, and fast-forward only to that commit. They never reset local commits, discard untracked files, downgrade, or update ComfyUI, custom nodes, or models. A branch ahead of or diverged from a release stays unchanged with an explanatory error. Switching from Preview to Stable therefore waits for a stable release that includes the installed commits.

The prior `update.channel: "main"` setting continues to name a Git branch; it does not opt users into Development. Existing installations default to Stable when this transition reaches them through their old updater. The selected release channel is saved separately in ignored `data/update-channel.json`. Administrators can set `MIXBOX_RELEASE_CHANNEL=stable|preview|development` to lock the choice, or set `update.releaseChannel` in `install.json` as its default. Source contributors must opt into Development and configure their branch with `MIXBOX_UPDATE_CHANNEL` if it is not `main`.

New downloadable installers resolve a stable release tag before cloning, create a named `main` branch at that release, and stop if GitHub cannot verify a stable release. Re-running an installer does not pull development code into an existing installation. Manual Git clones are source checkouts; use the release installers for the stable community installation.

Updates preserve `install.json` and `data/`. Before a release is applied, the updater creates a recovery Git ref and a private snapshot of `install.json`, `db.json`, and `settings.json` under the configured updates directory. It does not duplicate gallery media. Release updates restart Mix Studio after application so the new code starts together; if external ComfyUI work appears, restart waits for idle. **Restart app** uses the same queue checks.

The Updates inbox checks the selected release channel at sign-in and every six hours, with a one-hour server cache. Cached results from an outage may still be displayed, but cannot authorize a release install. **Copy update diagnostics** produces only versions, revision, branch, channel, platform, and installation type—no settings, tokens, prompts, or gallery contents.

### Recovery limits

Recovery snapshots preserve the previous code revision and metadata for operator-assisted recovery; they are not an automatic downgrade button. If an update fails validation, the running checkout has not changed. If a new server starts but later proves faulty, first stop generation, confirm both queues are idle, and stop Mix Studio. Read the snapshot's `recovery.json`, preserve any new data, and review database compatibility before restoring code. Never overwrite the current database with a snapshot after new generations or edits have been made. Keep the recovery files private because settings may contain credentials. Snapshots are not automatically deleted in this version.

### Maintainer release procedure

Keep `main` safe for old installations until the transition updater has reached the community. Develop new work on feature branches and submit pull requests. Require the existing Node 22 checks on Linux, Windows, and macOS before merging; protect release tags against replacement/deletion. Repository rules must be configured in GitHub settings separately from these workflow files.

1. Update `release.json` and `CHANGELOG.md` on the intended release commit. Use a prerelease version such as `1.3.0-beta.1` for Preview.
2. Run syntax checks and the complete `node --test` suite. Test real generation on supported backend/hardware combinations; CI does not validate GPU output.
3. Merge the reviewed change and push an annotated matching tag (for example `v1.3.0-beta.1`). Never move an existing release tag.
4. The **Prepare release** workflow runs all platform checks, then creates a **draft** release with installer assets and checksums. It marks prerelease tags as prereleases. Nothing is announced to users while it is a draft.
5. Review notes and compatibility, then publish the Preview release. Test installation, upgrade from the preceding stable release, phone access, and idle/restart behavior with volunteers.
6. For Stable, create a new version/tag descending from the tested Preview commit, changing only release metadata and reviewed fixes. Test those final changes, then publish the stable draft and mark it Latest. The updater verifies tag/metadata agreement; the stable tag cannot simply point to a commit whose version still says beta.

Managed backend startup is a subsequent, optional Preview feature. Preserve existing Comfy Desktop, portable, and shared-backend behavior until those paths have been tested. Backend upgrades and database migrations need their own compatibility and recovery policies; they are not silently part of an app update.

## Restarting, uninstalling, and data safety

To remove Mix Studio, run `uninstall.bat`. By default, it moves the managed `data/` folder to `%LOCALAPPDATA%\Mix Studio User Data\data`, leaving the original checkout path free for a clean reinstall. A later setup reconnects those profiles, settings, generations, ComfyUI paths, and the last detected hardware profile.

Use `-RemoveData` only when you also intend to erase managed gallery data and preserved setup metadata. It requires typing `DELETE`. ComfyUI, shared models, mirrored export files, arbitrary external data paths, and the system Node.js installation are never removed.

Browser-installed shortcuts, local form settings, and compressed preview caches live on each phone or browser and must be cleared there.

Mix Studio backs up the database at startup and every 30 minutes. Deleted media is moved to `data/trash/` before permanent removal. For the full data layout and ComfyUI recovery-output location, see the [technical reference](technical-reference.md#local-data-and-recovery).
