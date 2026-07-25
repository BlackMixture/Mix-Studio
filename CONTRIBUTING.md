# Contributing to Mix Studio

Bug reports, focused fixes, documentation improvements, and new workflow integrations are welcome.

## Before opening a pull request

- Use Node.js 22 or newer.
- Keep the server zero-dependency and the frontend build-free unless a project-level decision explicitly changes that constraint.
- Do not test destructive routes against a real `data/` directory.
- Keep new graph logic in a focused `lib/` module with tests when practical.
- Run:

  ```text
  node --check server.js
  node --check public/app.js
  node --test
  ```

## Contribute a workflow

Workflow contributions are evaluated for API-format graph compatibility, repeatable output, dependency scope, and whether the controls can be represented clearly in the existing interface.

### What we look for

- **Performance:** document a practical memory tier, including a 4 GB offloaded or quantized route when the model supports one, plus appropriate 8 GB, 12 GB, 16 GB, or 24 GB targets for larger workflows.
- **Stability:** include fixed node and model versions where behavior depends on a specific upstream implementation.
- **Scope:** identify the user task, required inputs, exposed controls, output types, and expected queue and Library behavior.

### How to submit

- **[GitHub Discussions](https://github.com/BlackMixture/Mix-Studio/discussions):** share a ComfyUI JSON graph for technical review before implementation.
- **[Pull requests](https://github.com/BlackMixture/Mix-Studio/pulls):** submit the graph builder, interface controls, dependency-manifest entries, and tests together when the integration is already implemented.

Include:

- a concise description of the workflow and intended use case;
- all model files, encoders, VAEs, LoRAs, and custom nodes, including tested versions;
- tested VRAM, system RAM, resolution or duration, and generation time; and
- example inputs, outputs, and the original ComfyUI workflow JSON.

## Repository map

- `server.js`: routes, graph builders, job tracking, and server-sent events
- `lib/`: focused workflow and operational modules
- `public/`: the vanilla JavaScript interface
- `test/`: Node test suites
- `docs/`: public installation and technical reference material

User data belongs under `data/` and must never be committed.
