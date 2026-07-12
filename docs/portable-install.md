# Portable installation and updates

Mix Studio uses a portable Git checkout on Windows. The application, installer, and updater remain readable and editable; profiles and generated media stay in the ignored `data/` directory.

The guided bootstrap supports both a clean Windows machine and an existing ComfyUI environment. It can launch the signed official ComfyUI Desktop installer, detect the initialized environment, and install the curated model and custom-node groups used by Mix Studio's workflow-tested defaults from `installer/feature-manifest.json`.

## New machine

1. Open `https://blackmixture.github.io/Mix-Studio/` on Windows and download `install.bat`.
2. Run the downloaded file. It installs Git through `winget` when necessary and clones the official repository into `%USERPROFILE%\Mix Studio`.
3. The native setup wizard opens automatically and uses the same black surfaces, compact cards, spectrum accents, and restrained motion as the Mix Studio web interface.
4. Let setup install Node.js LTS with `winget` if Node 22+ is not already available, then rerun `%USERPROFILE%\Mix Studio\install.bat` after PATH refreshes.
5. Choose whether to install official ComfyUI Desktop or reuse an existing environment. Complete ComfyUI's NVIDIA and storage-location screens if it is new.
6. Enable the desired Edit and Video families, then leave dependency downloads enabled to install their curated models and custom nodes. The optimized image starter set includes Krea 2 depth guidance and SeedVR2. Each Edit selection includes its matching outpaint tools, and LTX includes Face ID support. Optional video and advanced edit families can each add tens of gigabytes.
7. Double-click `start.bat` inside the Mix Studio folder.

## Phone-first access with Tailscale

1. Install [Tailscale](https://tailscale.com/download) on the Windows generation machine and the phone.
2. Sign both devices into the same tailnet.
3. Start Mix Studio on Windows and find the `Phone:` URL associated with the Tailscale network adapter in the terminal output.
4. Open that address on the phone with port `3300`, then add it to the home screen for app-like access.

ComfyUI, model files, galleries, and generation work remain on the Windows machine. The phone sends requests and displays the Mix Studio interface over the private Tailscale connection; public port forwarding is not required.

For a manual installation, install Git for Windows and run `git clone https://github.com/BlackMixture/Mix-Studio.git`, then launch `install.bat` from that checkout.

The installer is intentionally idempotent: rerunning it reads existing values, presents them as defaults, backs up `settings.json` and `install.json`, and writes merged configuration atomically. `installer/install-ui.ps1` owns only presentation and invokes `installer/install.ps1` non-interactively for prerequisite checks and writes.

## Files setup creates

- `install.json`: portable-install metadata, Git update channel, and existing ComfyUI/model paths.
- `data/settings.json`: the ComfyUI URL and enabled model families merged with existing app settings.
- `data/settings.json.backup-<timestamp>`: created before setup updates an existing settings file.
- `install.json.backup-<timestamp>`: created before setup updates an existing install file.

All are machine-specific and ignored by Git. The installer does not delete or replace `data/db.json` or any media directory.

## Uninstalling

Double-click `uninstall.bat` in the checkout. After confirmation it moves managed profiles, settings, uploads, and generations to `%LOCALAPPDATA%\Mix Studio\data`, preserves the previous ComfyUI connection metadata, and removes the entire checkout. This leaves `%USERPROFILE%\Mix Studio` available for a clean downloader reinstall. Setup automatically reconnects the preserved data and ComfyUI paths. The uninstaller never removes ComfyUI, shared model folders, mirrored exports, arbitrary external data paths, or Node.js.

For a full local removal, run `uninstall.bat -RemoveData` and type `DELETE` when prompted. This deletes the checkout and Mix Studio's managed local or preserved data folder; arbitrary external data, export, and model paths are not touched.

Browser-installed shortcuts, form state, media preferences, and compressed preview caches are stored independently on each device. Remove or clear them from that browser if a complete device-side cleanup is required.

## Reusing models

Mix Studio sends model filenames to the connected ComfyUI API. Guided downloads are placed under the selected ComfyUI models folder. For a separate shared-model directory, add it to ComfyUI's `extra_model_paths.yaml`; setup does not rewrite an existing path configuration without permission.

The optional local models path additionally lets Mix Studio discover LoRA metadata and SeedVR2 files directly. No model is copied merely to satisfy the portable app layout.

## Updates

The owner-only **Update app** action runs the equivalent of:

```powershell
git pull --ff-only origin <current-branch>
```

It refuses to update a detached HEAD or a checkout with modified tracked code. Because `data/` and `install.json` are ignored, updating code does not overwrite the local database, settings, uploads, generations, or ComfyUI paths.

The owner-only **Restart app** action uses the restart-aware `start.bat` launcher. It refuses while either the Mix Studio queue or the connected ComfyUI queue is active.

A ZIP archive is runnable after setup, but it has no Git metadata and therefore cannot use the in-app updater. A clone is the supported installation method.
