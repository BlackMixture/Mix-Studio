# Running Mix Studio on Linux (NVIDIA GB10 / DGX-class devices)

> Community guide for running Mix Studio on **aarch64 Linux** DGX-class desktops built on the
> **NVIDIA GB10 Grace Blackwell** superchip — NVIDIA DGX Spark, ASUS Ascent GX10, and similar.
> The supported path remains Windows (see
> [installation-and-operations.md](installation-and-operations.md)); this document covers the
> unattended Linux setup that the Windows `install_MixStudio.bat` bootstrapper does not.

Mix Studio itself is portable here: the server is zero-dependency Node.js and the frontend needs
no build step, so it runs unchanged on aarch64 Linux. Only the *first-launch bootstrapper*
(`install_MixStudio.bat`, `winget`, registry probing) is Windows-specific and is bypassed below.

## Prerequisites

- **Node.js 22+** (`node --version`). Any install location works; make sure `node` is on `PATH`.
- **A working ComfyUI** reachable over HTTP, with a PyTorch build that matches your GPU.
  On GB10 (compute capability `sm_121`, CUDA 13, aarch64) this means a CUDA/PyTorch build with
  `sm_121` kernels — verify with:
  ```bash
  <comfyui-venv>/bin/python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_capability())"
  # e.g. 2.13.0+cu130 True (12, 1)
  ```
  Mix Studio does **not** install or bundle ComfyUI; point it at your existing instance.
- Model storage. GB10 ships with large unified memory, so VRAM ceilings in the workflow guides are
  generous headroom here; the practical limit is disk/throughput for weights.

## 1. Get the source

```bash
git clone --depth 1 https://github.com/BlackMixture/Mix-Studio.git
cd Mix-Studio
```

## 2. Point Mix Studio at ComfyUI

Configuration is fully environment-driven (see [`lib/runtime-config.js`](../lib/runtime-config.js));
no `install.json` is required. The relevant variables:

| Variable | Purpose |
| --- | --- |
| `MIXBOX_COMFY_URL` | ComfyUI base URL (default `http://127.0.0.1:8188`). |
| `COMFYUI_PATH` | ComfyUI install dir (enables the Restart hook below). |
| `COMFYUI_MODELS_DIR` | Model root Mix Studio downloads into and reads from. Point it at your ComfyUI model root (or a shared/fast volume) so weights are not duplicated. |
| `PORT` | Mix Studio port (default `3300`). |

## 3. Run it

The quick way:

```bash
MIXBOX_COMFY_URL=http://127.0.0.1:8188 \
COMFYUI_PATH=/path/to/ComfyUI \
COMFYUI_MODELS_DIR=/path/to/ComfyUI/models \
node server.js
```

Open `http://127.0.0.1:3300/`. The Generation setup panel will probe the ComfyUI endpoint and query
its registered model filenames; compatible files already in your model root are reused.

### A reusable launcher

The repository ships **`start-mixstudio.sh`** at its root — the Linux counterpart to `start.bat`. It
puts `node` on `PATH`, exports the configuration below, enables the Linux restart hooks (step 4), and
`exec`s `node server.js`. The systemd unit in step 5 and any manual run share this one file:

```bash
./start-mixstudio.sh
```

Every setting has a `${VAR:-default}` fallback, so override any of them from the environment (or a
systemd unit) without editing the script:

| Variable | Default |
| --- | --- |
| `MIXBOX_COMFY_URL` | `http://127.0.0.1:8188` |
| `COMFYUI_PATH` | `$HOME/ComfyUI` |
| `COMFYUI_MODELS_DIR` | `$HOME/ComfyUI/models` |
| `PORT` | `3300` |
| `NODE_BIN` | (used only if `node` is not already on `PATH`) |

For example, to run against a ComfyUI whose models live on a shared volume:

```bash
COMFYUI_MODELS_DIR=/mnt/models/comfyui NODE_BIN=$HOME/.local/node22/bin ./start-mixstudio.sh
```

## 4. Restart ComfyUI from the UI on Linux

On Windows, Mix Studio can stop/start a local ComfyUI from the dependency panel. On Linux there is no
Comfy Desktop app or `run_nvidia_gpu.bat`, so Mix Studio delegates to a command you provide:

| Variable | Effect |
| --- | --- |
| `MIXBOX_COMFY_RESTART_CMD` | Shell command run for the UI **Restart ComfyUI** action. |
| `MIXBOX_COMFY_START_CMD` | Shell command run for the **Start ComfyUI** action. |

When set, the UI restart/start buttons become available on any platform and run the command via
`/bin/sh -c "<cmd>"`. With ComfyUI managed by systemd (below):

```bash
export MIXBOX_COMFY_RESTART_CMD="systemctl --user restart comfyui.service"
export MIXBOX_COMFY_START_CMD="systemctl --user start comfyui.service"
```

## 5. Optional: run as systemd `--user` services

For boot persistence and auto-restart, manage both ComfyUI and Mix Studio as user services.

`~/.config/systemd/user/comfyui.service`:

```ini
[Unit]
Description=ComfyUI
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/path/to/ComfyUI
ExecStart=/path/to/ComfyUI/venv/bin/python -u main.py --listen 127.0.0.1 --port 8188
Restart=on-failure

[Install]
WantedBy=default.target
```

`~/.config/systemd/user/mixstudio.service`:

```ini
[Unit]
Description=Mix Studio
After=network-online.target comfyui.service
Wants=network-online.target comfyui.service

[Service]
Type=simple
WorkingDirectory=/path/to/Mix-Studio
# Configuration lives in the launcher from step 3 (env, PATH, restart hooks):
ExecStart=/bin/bash /path/to/Mix-Studio/start-mixstudio.sh
Restart=on-failure

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now comfyui.service mixstudio.service
loginctl enable-linger "$USER"   # start user services at boot without an active login
```

> **Note:** `node` is frequently missing from the minimal `systemd --user` `PATH`. The launcher's
> `export PATH=...` line handles this; if the service logs `exec: node: not found`, fix that path.
> (If you run `node server.js` directly from the unit instead of the launcher, set
> `Environment=PATH=...` or use an absolute `ExecStart` path to `node`.)

## Appendix: bringing up the ComfyUI backend (in brief)

Mix Studio is the front end; the GPU work is ComfyUI's. Setting ComfyUI up is out of scope for a
step-by-step here, but these are the points that matter on a GB10 device:

- **The hard part is the PyTorch build, not ComfyUI itself.** You need a ComfyUI whose venv has a
  PyTorch with `sm_121` (GB10) kernels on CUDA 13 / aarch64. Producing that build is device-specific
  and evolves quickly — follow the current
  [NVIDIA DGX Spark / GB10 developer resources](https://forums.developer.nvidia.com/) for wheels and
  known caveats (e.g. `sgl-kernel` / `sglang` builds linked against CUDA 12 need an `nvrtc` shim on a
  CUDA 13 system). Verify the result before wiring Mix Studio to it:
  ```bash
  <comfyui-venv>/bin/python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_capability())"
  # want: cuda available True, capability (12, 1) == sm_121
  ```
- **ComfyUI version for Krea 2.** Mix Studio's default text-to-image engine is Krea 2, whose
  `krea2` text-encoder type is built into **ComfyUI ≥ 0.26**. On older cores the setup panel will ask
  you to update. Any recent release works; the `krea2` type shows up in a `CLIPLoader`'s options once
  the core is new enough.
- **Custom-node Python deps.** Several video/utility nodes (LTXVideo, WanVideoWrapper, SeedVR2,
  Crystools, …) import packages that aren't always installed with the node. If you see
  `IMPORT FAILED` at ComfyUI startup, the usual missing ones are `gguf`, `piexif`,
  `rotary_embedding_torch`, `ftfy`, `omegaconf`, and `py-cpuinfo` — install them into the ComfyUI
  venv (`uv pip install …` or the venv's `pip`), then restart ComfyUI.
- **Model storage.** Keep weights on a fast shared volume and point both ComfyUI
  (`extra_model_paths.yaml`) and Mix Studio (`COMFYUI_MODELS_DIR`) at the same root so Mix Studio's
  downloads land there and are not duplicated.
- **Run it as a service.** Manage ComfyUI with the `comfyui.service` unit shown in step 5 so the UI
  restart hook and boot persistence work.

## Notes

- **Privacy / headless.** Mix Studio's anonymous product analytics can be turned off from the
  in-app privacy toggle. Beyond that, the server makes no periodic outbound calls — network egress is
  limited to update checks (GitHub releases API), model/dependency downloads (Hugging Face, custom
  node Git repos, on explicit user action), and your local ComfyUI.
- **GB10 GPU builds.** Getting a working `sm_121` ComfyUI/PyTorch stack is out of scope here; consult
  the NVIDIA DGX Spark / GB10 developer resources for current CUDA 13 / aarch64 wheels.
