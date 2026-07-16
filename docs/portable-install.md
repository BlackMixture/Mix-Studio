# Portable installation and updates

Mix Studio uses a portable Git checkout on Windows. The application, installer, and updater remain readable and editable; profiles and generated media stay in the ignored `data/` directory.

The bootstrap is intentionally small. It gets the Mix Studio web app running first, then leaves ComfyUI, models, and custom-node setup inside the app. The in-app guide can launch the signed official ComfyUI Desktop installer, detect an initialized environment, and install the curated groups used by Mix Studio's workflow-tested defaults from `installer/feature-manifest.json`.

## New machine

1. Open `https://blackmixture.github.io/Mix-Studio/` on Windows and download `install.bat`.
2. Run the downloaded file. It installs Git through `winget` when necessary and clones the official repository into `%USERPROFILE%\Mix Studio`.
3. The downloaded checkout installs or updates Node.js LTS when Node 22+ is unavailable, prepares `install.json`, starts `start.bat`, and opens `http://127.0.0.1:3300/`.
4. Mix Studio creates one open **Owner** profile on a fresh installation and shows the normal workspace. Rename the profile or add a PIN later from the profile menu.
5. Enter a prompt and press **Generate**. If that workflow needs ComfyUI, a model, or a node, the **Generation setup** panel opens without discarding the prompt.
6. Choose **Quick setup** for the recommended image starter, **Install this workflow** for only the current generation, or **Full setup guide** for individual control. The full guide can use a detected ComfyUI installation, accept a manual URL and folders, or launch the signed official ComfyUI Desktop installer.
7. Review the detected NVIDIA GPU, VRAM, and system RAM. Each family is labeled recommended, capable with offload, or difficult. A below-minimum choice requires explicit confirmation. Existing model files registered by ComfyUI are reused.

## Low-VRAM setup

The curated Krea 2 image route has an 8 GB VRAM minimum and a 16 GB recommendation. On detected 8–12 GB systems, Auto selects the Low VRAM profile and setup recommends the official Krea 2 INT8 ConvRot models. Those files use ComfyUI's native quantized-weight support through its standard diffusion loader—not a GGUF or custom INT8 loader—and require ComfyUI 0.27.0 or newer. Generation setup checks that version before installing or running them and keeps FP8 available as a visible fallback. A fresh official ComfyUI Desktop install satisfies the requirement; an older existing installation must be updated before using INT8.

Low VRAM mode is guidance, not a hidden cap. Image requests above roughly one megapixel or batch one receive a confirmation that offers safer settings or the exact original request. Current larger edit and video families retain their own hardware ratings: Klein 4B starts at 12 GB, while Klein 9B, Qwen Edit, LTX, Wan, 10Eros, and SCAIL start at 16 GB and benefit from substantial system RAM.

Klein, Qwen, Wan, and SCAIL graphs switch to `UnetLoaderGGUF` when their configured diffusion filename ends in `.gguf`, and their setup groups install ComfyUI-GGUF. Guided downloads still use the curated safetensors/FP8 files, so third-party GGUF weights must be downloaded and selected manually. The current LTX 2.3 and 10Eros graphs use combined checkpoints; transformer-only GGUF files are not drop-in replacements for those pipelines.

## Phone-first access with Tailscale

1. Install [Tailscale](https://tailscale.com/download) on the Windows generation machine and the phone.
2. Sign both devices into the same tailnet.
3. Start Mix Studio on Windows and find the `Phone:` URL associated with the Tailscale network adapter in the terminal output.
4. Open that address on the phone with port `3300`, then add it to the home screen for app-like access.

ComfyUI, model files, galleries, and generation work remain on the Windows machine. The phone sends requests and displays the Mix Studio interface over the private Tailscale connection; public port forwarding is not required.

For a manual installation, install Git for Windows and run `git clone https://github.com/BlackMixture/Mix-Studio.git`, then launch `install.bat` from that checkout.

The installer is intentionally idempotent. Rerunning it preserves the existing `data/` location and ComfyUI connection, refreshes the minimal bootstrap metadata atomically, starts the app, and opens the browser. Generation setup is always available later from **Advanced Settings → General**.

## Files setup creates

- `install.json`: portable-install metadata, Git update channel, data location, ComfyUI/model paths, and the in-app setup mode.
- `data/settings.json`: the ComfyUI URL and app settings. A fresh installation also receives the open Owner profile in `data/db.json`.
- `data/dependency-backups/`: `pip freeze` snapshots created before custom-node Python requirements are changed.

All are machine-specific and ignored by Git. The installer does not delete or replace `data/db.json` or any media directory.

## Uninstalling

Double-click `uninstall.bat` in the checkout. After confirmation it moves managed profiles, settings, uploads, and generations to `%LOCALAPPDATA%\Mix Studio\data`, preserves the previous ComfyUI connection, and removes the entire checkout. This leaves `%USERPROFILE%\Mix Studio` available for a clean downloader reinstall. The next bootstrap reconnects the preserved data and ComfyUI paths. The uninstaller never removes ComfyUI, shared model folders, mirrored exports, arbitrary external data paths, or Node.js.

For a full local removal, run `uninstall.bat -RemoveData` and type `DELETE` when prompted. This deletes the checkout, Mix Studio's managed local or preserved data folder, and its preserved setup profile. Arbitrary external data, export, ComfyUI, and model paths are not touched.

Browser-installed shortcuts, form state, media preferences, and compressed preview caches are stored independently on each device. Remove or clear them from that browser if a complete device-side cleanup is required.

## Reusing models

Mix Studio sends model filenames to the connected ComfyUI API. Generation setup reads `/object_info` and treats filenames already registered by ComfyUI as reusable even when they live outside the selected root. The dependency scanner also respects the configured ComfyUI and models folders. Guided downloads are placed under the detected or manually entered models folder. Setup never rewrites an existing ComfyUI path configuration or moves existing files.

The optional local models path additionally lets Mix Studio discover LoRA metadata and SeedVR2 files directly. No model is copied merely to satisfy the portable app layout.

## Updates

The owner-only **Update app** action runs the equivalent of:

```powershell
git pull --ff-only origin <current-branch>
```

It refuses to update a detached HEAD or a checkout with modified tracked code. Because `data/` and `install.json` are ignored, updating code does not overwrite the local database, settings, uploads, generations, or ComfyUI paths.

The owner-only **Restart app** action uses the restart-aware `start.bat` launcher. It refuses while either the Mix Studio queue or the connected ComfyUI queue is active.

A ZIP archive is runnable after setup, but it has no Git metadata and therefore cannot use the in-app updater. A clone is the supported installation method.
