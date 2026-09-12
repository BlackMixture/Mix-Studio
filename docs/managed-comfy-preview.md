# Managed ComfyUI Preview

This is an opt-in experiment for a dedicated Mix Studio generation backend. It is not a bundled standalone distribution: ComfyUI, its Python environment, models, and custom nodes must already be installed.

## Enable it

Use a build containing this feature, select **Preview** (or Development) in Updates, and open **Setup → Connection → Managed ComfyUI**. Choose **On** and save. Selecting Preview alone does not enable management, install a new backend, or change a running process.

Supported in this first iteration:

- Source installations with a detected Python environment and `main.py`.
- Registered Comfy Desktop instances that expose their Python executable and source directory. Saved launch flags and adopted data directories are preserved. The configured port is enforced and the listener is restricted to IPv4 loopback.
- Local HTTP endpoints using `127.0.0.1` or `localhost`.

Portable batch scripts, system services, remote backends, TLS backend URLs, and IPv6-only endpoints retain the existing Start/Connect workflow. Arbitrary launch scripts can contain required vendor-specific GPU switches; this Preview does not reinterpret them.

## What happens

Opening the gallery never starts ComfyUI. Generation, uploads needed for generation, and local Prompt AI can start the configured backend. Simultaneous startup requests share one launch. Mix Studio waits up to three minutes for both a verified process and the ComfyUI API.

If the port is already occupied, Mix Studio verifies the API and treats it as **shared**. It never adopts that process for cleanup. An occupied but unresponsive port produces an error instead of launching a replacement.

After 10 minutes idle by default, Mix Studio requests model unloading and memory cleanup through `/free`. Choose 5, 10, 30, or 60 minutes, or Never. This keeps the backend alive for the next generation; it does not guarantee zero RAM use. The next generation may take longer while models reload. Automatic checks run every 30 seconds, so timing is approximate.

**Release model memory** requests the same cleanup immediately when idle. **Stop managed ComfyUI** stops only this Mix Studio session's verified managed process, after checking both the app's in-flight work and ComfyUI's running/pending queue. On Windows, an immediate Python child of the retained virtual-environment launcher must also match the expected ComfyUI command; shutdown includes that verified launcher's process tree.

Closing a browser, phone app, or tab does not cancel jobs or stop ComfyUI. Turning management off or leaving Preview disables automatic cleanup without killing the backend. An explicit idle stop remains available for a process still owned by the current Mix Studio server.

## Boundaries and recovery

- The ownership handle lasts only for the current Mix Studio server session. A backend surviving a server restart/update is subsequently shared. Stop that backend manually before expecting Mix Studio to launch and own it again.
- Do not use automatic cleanup for an instance that other apps submit jobs to. Queue checks prevent cleanup while known work is active, but another client can submit work between the check and cleanup. ComfyUI does not offer an atomic queue lock across independent clients.
- Queue lookup errors, malformed responses, changed port ownership, and unverified process relationships block cleanup. They never authorize killing a process by its port.
- If startup times out, Mix Studio retains its launch handle and reports the error. A slow startup may finish later; retry Start to verify it. Inspect the Python environment separately if it fails repeatedly. No forced restart or automatic retry of generation POSTs occurs.
- Stop the managed backend before changing the connection address or installation path. Models and gallery files are not moved by this feature.
- Configuration is stored in `data/comfy-lifecycle.json`; it contains only opt-in and idle-time settings. No process ownership is restored from disk.

## Validation before broader release

Automated tests cover opt-in, launch arguments, concurrent starts, shared instances, queue failures, request reservations, ownership changes, and Windows launcher-child shutdown. A disposable HTTP fixture was also started, verified, freed, and stopped using BM Pro's existing Windows Python environment, without loading models or touching its live ComfyUI process.

A real generation and idle GPU-memory check against supported ComfyUI installations is still required before promoting this feature to Stable. The fixture verifies process control and HTTP behavior, not model/node compatibility or actual GPU-memory reclamation.
