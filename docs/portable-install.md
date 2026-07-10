# Portable installation and updates

Mix Studio uses a portable Git checkout on Windows. The application, installer, and updater remain readable and editable; profiles and generated media stay in the ignored `data/` directory.

This first bootstrap configures an existing ComfyUI installation. Automatic ComfyUI, custom-node, and model-pack downloads remain a separate installer phase because every artifact needs a pinned source, checksum, destination, and license acknowledgement. The optional families are already represented in `installer/feature-manifest.json` so that phase can use the same choices as the interface.

## New machine

1. Open `https://blackmixture.github.io/KreaStudio/` on Windows and download `install.bat`.
2. Run the downloaded file. It installs Git through `winget` when necessary and clones the official repository into `%USERPROFILE%\Mix Studio`.
3. The native setup wizard opens automatically and uses the same black surfaces, compact cards, spectrum accents, and restrained motion as the Mix Studio web interface.
4. Let setup install Node.js LTS with `winget` if Node 22+ is not already available, then rerun `%USERPROFILE%\Mix Studio\install.bat` after PATH refreshes.
5. Enter the running ComfyUI URL. If ComfyUI and its models already exist, enter those folders to reuse them in place.
6. Enable only the Edit and Video model families installed on that machine.
7. Double-click `start.bat` inside the Mix Studio folder.

For a manual installation, install Git for Windows and run `git clone https://github.com/BlackMixture/KreaStudio.git`, then launch `install.bat` from that checkout.

The installer is intentionally idempotent: rerunning it reads existing values, presents them as defaults, backs up `settings.json` and `install.json`, and writes merged configuration atomically. `installer/install-ui.ps1` owns only presentation and invokes `installer/install.ps1` non-interactively for prerequisite checks and writes.

## Files setup creates

- `install.json`: portable-install metadata, Git update channel, and existing ComfyUI/model paths.
- `data/settings.json`: the ComfyUI URL and enabled model families merged with existing app settings.
- `data/settings.json.backup-<timestamp>`: created before setup updates an existing settings file.
- `install.json.backup-<timestamp>`: created before setup updates an existing install file.

All are machine-specific and ignored by Git. The installer does not delete or replace `data/db.json` or any media directory.

## Uninstalling

Double-click `uninstall.bat` in the checkout. It removes the portable Mix Studio application files after the confirmation and keeps the local `data/` folder by default. This makes a later reinstall possible without losing profiles, settings, uploads, or generations. The uninstaller never removes ComfyUI, shared model folders, or Node.js.

For a full local removal, run `uninstall.bat -RemoveData` and type `DELETE` when prompted. This deletes the checkout and its local `data/` folder; external data and model paths are not touched.

Browser-installed shortcuts, form state, media preferences, and compressed preview caches are stored independently on each device. Remove or clear them from that browser if a complete device-side cleanup is required.

## Reusing models

Mix Studio sends model filenames to the connected ComfyUI API. The selected ComfyUI instance must therefore already see the model folder. For a separate shared-model directory, add it to ComfyUI's `extra_model_paths.yaml`; the installer does not modify an existing ComfyUI configuration without permission.

The optional local models path additionally lets Mix Studio discover LoRA metadata and SeedVR2 files directly. No model is copied merely to satisfy the portable app layout.

## Updates

The owner-only **Update app** action runs the equivalent of:

```powershell
git pull --ff-only origin <current-branch>
```

It refuses to update a detached HEAD or a checkout with modified tracked code. Because `data/` and `install.json` are ignored, updating code does not overwrite the local database, settings, uploads, generations, or ComfyUI paths.

The owner-only **Restart app** action uses the restart-aware `start.bat` launcher. It refuses while either the Mix Studio queue or the connected ComfyUI queue is active.

A ZIP archive is runnable after setup, but it has no Git metadata and therefore cannot use the in-app updater. A clone is the supported installation method.
