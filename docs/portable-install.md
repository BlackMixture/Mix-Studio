# Portable installation and updates

Mix Studio uses a portable Git checkout on Windows. The application, installer, and updater remain readable and editable; profiles and generated media stay in the ignored `data/` directory.

The bootstrap is intentionally small. It gets the Mix Studio web app running first, then leaves ComfyUI, models, and custom-node setup inside the app. On an unconfigured installation, the centered setup panel opens automatically. It can start a detected portable or Desktop environment, launch the signed official ComfyUI Desktop installer, discover a live endpoint, and install the curated groups used by Mix Studio's workflow-tested defaults from `installer/feature-manifest.json`.

## New machine

1. Open `https://blackmixture.github.io/Mix-Studio/` on Windows and download `install_MixStudio.bat` into the parent folder where you want Mix Studio installed.
2. Run the downloaded file. It installs Git through `winget` when necessary and clones the official repository into a `Mix Studio` folder beside the installer. For example, running `D:\AI\install_MixStudio.bat` installs the app at `D:\AI\Mix Studio`.
3. The downloaded checkout installs or updates Node.js LTS when Node 22+ is unavailable, prepares `install.json`, starts `start.bat`, and opens `http://127.0.0.1:3300/`.
4. Mix Studio creates the **Owner** profile and opens Generation setup automatically when no working ComfyUI connection is configured. Add an Owner PIN before enabling access from another device.
5. Start a detected ComfyUI installation, launch the official ComfyUI Desktop installer, or enter an endpoint and folders manually. Mix Studio searches live endpoints, including non-default ports, and does not report a connection ready until it verifies the server.
6. Choose **Quick setup** for the core files required by the recommended image starter, **Install this workflow** for only the current generation, or **Full setup guide** for individual control. Depth, style, regional prompting, masks, and upscaling are opt-in. Existing model files registered by ComfyUI are reused.
7. Review the detected NVIDIA GPU and VRAM. Each family is labeled recommended, capable with offload, or below the guided tier. A below-tier choice requires explicit confirmation but remains installable.
8. Complete setup to continue into the first-generation tutorial. The tutorial is offered only after the connection and starter workflow are ready.

The reviewed public source for `ComfyUI-Krea2Regional-MultiLoRA` is currently unavailable, so the dependency installer does not guess at a replacement. It reuses a valid existing copy. On a fresh machine, selecting Regional Prompting stops before any other dependency changes and identifies the expected `custom_nodes\ComfyUI-Krea2Regional-MultiLoRA` folder for a trusted manual installation. Deselect that group to install unrelated advanced capabilities separately.

## Low-VRAM setup

Mix Studio has no enforced VRAM cutoff. Its lowest guided tier is 4 GB of VRAM through Flux 2 Klein 4B FP8 with ComfyUI model/encoder offloading. The guided installer downloads the official `flux-2-klein-4b-fp8.safetensors` checkpoint for new setups. This is an offloaded compatibility route and will be slower than keeping the pipeline resident; ComfyUI's reference measurement for the distilled FP8 workflow is about 8.4 GB without the 4 GB constraint.

The curated Krea 2 image route uses 8 GB VRAM as its guided offload tier and recommends 16 GB. On detected 4–12 GB systems, Auto selects the Low VRAM profile and setup recommends the official Krea 2 INT8 ConvRot models when Krea is selected. Those files use ComfyUI's native quantized-weight support through its standard diffusion loader, not a GGUF or custom INT8 loader, and require ComfyUI 0.27.0 or newer. Generation setup checks that version before installing or running them and keeps FP8 available as a visible fallback. A fresh official ComfyUI Desktop install satisfies the requirement; an older existing installation must be updated before using INT8.

Low VRAM mode is guidance, not a hidden cap. Image requests above roughly one megapixel or batch one receive a confirmation that offers safer settings or the exact original request. LTX 2.3, LTX Edit, 10Eros, Wan 2.2 14B, and SCAIL 2 use 8 GB VRAM as an experimental offload tier and recommend 24 GB VRAM. System RAM is not used as an installation requirement. Shorter duration, smaller frames, native ComfyUI offloading, and supported GGUF weights for Wan and SCAIL improve the chance of success. Hardware below the guided tier still receives an install-anyway option rather than a block.

Klein, Qwen, Wan, and SCAIL graphs switch to `UnetLoaderGGUF` when their configured diffusion filename ends in `.gguf`, and their setup groups install ComfyUI-GGUF. Guided downloads still use the curated safetensors/FP8 files, so third-party GGUF weights must be downloaded and selected manually. The current LTX 2.3 and 10Eros graphs use combined checkpoints; transformer-only GGUF files are not drop-in replacements for those pipelines.

## Phone-first access with Tailscale

1. Add a PIN to the Owner profile before sharing the studio with another device.
2. Open the **Phone access card** on the setup Finish step. It lists reachable same-Wi-Fi and Tailscale addresses without requiring the terminal.
3. For access away from home, use the card's links to install [Tailscale](https://tailscale.com/download) on the Windows generation machine and the phone, then sign both devices into the same tailnet.
4. Refresh the card, select the private Tailscale address, and use **Copy or share** to send it to the phone.
5. Open the address on the phone, then add it to the home screen for app-like access.

ComfyUI, model files, galleries, and generation work remain on the Windows machine. The phone sends requests and displays the Mix Studio interface over the private Tailscale connection; public port forwarding is not required.

For a manual installation, install Git for Windows and run `git clone https://github.com/BlackMixture/Mix-Studio.git`, then launch `install_MixStudio.bat` from that checkout.

The installer is intentionally idempotent. Rerunning it preserves the existing `data/` location and ComfyUI connection, refreshes the minimal bootstrap metadata atomically, starts the app, and opens the browser. Generation setup is always available later from **Advanced Settings → General**, and the Phone access card can be reopened from its Finish step.

## Files setup creates

- `install.json`: portable-install metadata, Git update channel, data location, ComfyUI/model paths, and the in-app setup mode.
- `data/settings.json`: the ComfyUI URL and app settings. A fresh installation also receives the Owner profile in `data/db.json`; remote sign-in remains locked until that Owner has a PIN.
- `data/dependency-backups/`: `pip freeze` snapshots created before custom-node Python requirements are changed.

All are machine-specific and ignored by Git. The installer does not delete or replace `data/db.json` or any media directory.

## Uninstalling

Double-click `uninstall.bat` in the checkout. After confirmation it moves managed profiles, settings, uploads, and generations to `%LOCALAPPDATA%\Mix Studio User Data\data`, preserves the previous ComfyUI connection, and removes the entire checkout. This leaves the original installation location available for a clean downloader reinstall. The next bootstrap reconnects the preserved data and ComfyUI paths. The uninstaller never removes ComfyUI, shared model folders, mirrored exports, arbitrary external data paths, or Node.js.

For a full local removal, run `uninstall.bat -RemoveData` and type `DELETE` when prompted. This deletes the checkout, Mix Studio's managed local or preserved data folder, and its preserved setup profile. Arbitrary external data, export, ComfyUI, and model paths are not touched.

Browser-installed shortcuts, form state, media preferences, and compressed preview caches are stored independently on each device. Remove or clear them from that browser if a complete device-side cleanup is required.

## Reusing models

Mix Studio sends model filenames to the connected ComfyUI API. Generation setup reads `/object_info` and treats filenames already registered by ComfyUI as reusable even when they live outside the selected root. The dependency scanner also respects the configured ComfyUI and models folders. Guided downloads are placed under the detected or manually entered models folder. Setup never rewrites an existing ComfyUI path configuration or moves existing files.

The optional local models path additionally lets Mix Studio discover LoRA metadata and SeedVR2 files directly. No model is copied merely to satisfy the portable app layout.

## Updates

After sign-in, Mix Studio checks the official `BlackMixture/Mix-Studio` GitHub Releases channel for a newer stable semantic version. The server caches successful checks for one hour, and an open browser checks again every six hours. Release notes appear in the Updates inbox; optional browser alerts work while Mix Studio is open. No GitHub credential is shipped with the app, so only maintainers of the official repository can publish notifications.

Each release uses the semantic version and date in `release.json` plus a matching `v<version>` Git tag. GitHub Actions checks server and browser syntax and runs the complete Node test suite on Node 22 for both Linux and Windows. A mismatched release tag fails validation, and the download page deploy waits for the same checks.

The owner-only **Update app** action runs the equivalent of:

```powershell
git pull --ff-only origin <current-branch>
```

It refuses to update a detached HEAD or a checkout with modified tracked code. Because `data/` and `install.json` are ignored, updating code does not overwrite the local database, settings, uploads, generations, or ComfyUI paths.

The owner-only **Restart app** action uses the restart-aware `start.bat` launcher. It refuses while either the Mix Studio queue or the connected ComfyUI queue is active.

A ZIP archive is runnable after setup, but it has no Git metadata and therefore cannot use the in-app updater. A clone is the supported installation method.
