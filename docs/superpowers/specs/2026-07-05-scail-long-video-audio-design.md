# SCAIL Long Video + Motion Audio Design

## Context

SCAIL 2 currently appears capped at about 10 seconds because KreaStudio enforces that limit in two places:

- The Video tab changes the duration slider max to 10 seconds when SCAIL is selected.
- The `/api/animate` route clamps SCAIL requests with `seconds = Math.min(seconds, 10)`.

The installed ComfyUI node definitions show that this is not a hard node limit. `WanSCAILToVideo` accepts long `length` values and exposes continuation inputs:

- `previous_frames`
- `previous_frame_count`
- `video_frame_offset`

The node tooltip says SCAIL 2 was trained at 81-frame chunks with a 5-frame anchor, which implies 76-frame advancement per chunk. `VHS_LoadVideo` also outputs the driving clip audio, and `CreateVideo` accepts an optional `audio` input, so SCAIL can preserve source video audio without a separate upload.

## Goals

- Let SCAIL 2 generate videos longer than the current 10-second app cap.
- Default SCAIL duration to the selected motion-video trim length, capped at 60 seconds.
- Let the user choose the SCAIL length strategy: direct single-pass or chunked continuation.
- Preserve the driving motion video's audio in the generated SCAIL output.
- Keep short SCAIL clips simple and compatible with the current workflow.
- Keep the phone UI straightforward: no segment-count setup or separate stitching screen.

## Non-Goals

- No truly unlimited jobs in the first version.
- No separate multi-job queue/stitch workflow.
- No audio generation for silent SCAIL inputs.
- No manual audio attachment for SCAIL in this pass; the driving video's own audio is used automatically when available.
- No change to LTX, 10Eros, or Wan duration behavior beyond avoiding regressions.

## User Experience

When SCAIL 2 is selected and a motion video is attached:

1. The duration defaults to the selected trim length.
2. If the selected trim is longer than 60 seconds, the app uses 60 seconds and makes that visible in the duration control.
3. The selected trim start plus the chosen duration drives both pose frames and audio.
4. A compact SCAIL mode control lets the user choose **Direct** or **Chunked**.
5. The generated result includes audio from the motion video when the motion video has audio.

The SCAIL engine info should no longer say "silent" or "up to 10s". It should communicate that SCAIL uses motion-video audio and can use longer clips up to the current app cap.

The default mode is **Chunked**, because it uses SCAIL's continuation inputs and is expected to be safer for long clips. **Direct** sends the full requested duration to a single `WanSCAILToVideo` node. Direct is simpler and may be useful for testing or shorter extended clips, but it can be more VRAM-heavy and may fail sooner on long clips.

## Server Design

Add a small set of SCAIL timing helpers that can be tested independently:

- `scailFramesForSeconds(seconds)`: converts seconds to Wan-compatible `4n+1` frames at 16 fps.
- `scailSegments(totalFrames)`: returns one segment for short clips, or multiple 81-frame chunks advancing 76 frames each.
- `scailDurationSeconds(requestedSeconds, driveDurSeconds)`: clamps to the selected motion trim length and the 60-second app cap.
- `scailMode(value)`: normalizes the request to `chunked` or `direct`, defaulting to `chunked`.

For direct SCAIL jobs, keep the existing graph shape with a larger allowed frame count:

- Load the selected motion video with `VHS_LoadVideo`.
- Run one `WanSCAILToVideo`.
- Decode, optionally RIFE smooth, and save through `CreateVideo`.

For chunked SCAIL jobs, use the direct graph shape when the requested duration fits in one 81-frame chunk. For longer chunked jobs, build a single ComfyUI graph with multiple SCAIL chunks:

- Reuse model, text, VAE, reference image, masks, and CLIP-vision nodes.
- For each chunk, load the appropriate driving-video frame window with `VHS_LoadVideo`.
- The first chunk runs without `previous_frames`.
- Each later chunk passes the previous decoded output into `previous_frames`, sets `previous_frame_count` to 5, and wires or sets the frame offset so the SCAIL node knows where the chunk begins.
- Join decoded chunk images into one image batch, dropping the 5 overlap frames from later chunks so the final frame count matches the requested duration.
- Attach the driving video's audio to `CreateVideo`.

Store the selected strategy in gallery metadata as `scailMode: 'direct' | 'chunked'` so reuse can restore it.

The exact image-batch join node should be chosen from the installed node set during implementation. The local ComfyUI install includes `ImageBatch`, `GetImageRangeFromBatch`, and related batch utilities, so the implementation should prefer existing nodes over file-level post-processing.

## Audio Design

For SCAIL, use the driving video's audio as the default audio source.

For trimmed motion videos:

- Use `VHS_LoadAudio` with `seek_seconds` and `duration` when possible, because it can read audio from the uploaded video and trim it independently.
- The audio window should begin at `driveStartSeconds` and last for the final clamped SCAIL duration, so manually choosing a shorter duration also shortens the audio.
- If that node is unavailable or does not accept the uploaded video filename in the installed setup, fall back to the untrimmed `VHS_LoadVideo` audio for untrimmed clips and omit audio for trimmed clips rather than attaching badly offset audio.

The saved gallery metadata should mark SCAIL outputs with `drivenAudio: true` when audio is attached and keep the existing `driveVideoName`, `driveStartSeconds`, and `driveDurSeconds` fields for reuse.

## UI Design

Update the Video tab behavior for SCAIL:

- Change the SCAIL duration max from 10 to 60 seconds.
- When a motion video is attached or trimmed, set the duration to the selected trim length capped at 60 seconds.
- Show a SCAIL-only segmented control with **Chunked** selected by default and **Direct** as the alternate choice.
- Keep the duration control visible so the user can choose a shorter section than the full trim if desired.
- Update the engine note and info sheet copy to reflect longer SCAIL clips and motion-video audio.

No new screen is needed. The existing motion-video trim UI remains the control for selecting the source section.

## Error Handling

- If the selected SCAIL duration is longer than the selected motion-video trim, clamp to the trim length.
- If the user chooses a shorter duration than the selected trim, generate from the trim start for that shorter duration.
- If Direct mode fails due to ComfyUI memory/runtime limits, surface the normal job error and leave the user able to retry in Chunked mode.
- If the requested SCAIL segment graph cannot be built because expected batch/continuation nodes are unavailable, return a clear error instead of queuing a broken graph.
- If the motion video has no audio, generate a silent SCAIL video as today.
- If audio trimming cannot be done safely, omit audio for that trimmed case and record that no driven audio was attached.

## Testing

Add unit tests for:

- SCAIL duration clamping to the drive trim and 60-second cap.
- SCAIL frame conversion preserving the `4n+1` Wan requirement.
- SCAIL mode normalization defaulting to `chunked` and accepting `direct`.
- SCAIL segment planning: one chunk for short videos, multiple 81-frame chunks with 5-frame overlap for longer videos.
- SCAIL audio-source decision: untrimmed clips can use driving-video audio, trimmed clips require a trim-capable audio loader.

Add graph-shape verification where practical:

- A Direct SCAIL graph contains one `WanSCAILToVideo`, even for a longer requested duration.
- A long Chunked SCAIL graph contains multiple `WanSCAILToVideo` nodes and later chunks receive `previous_frames`.
- SCAIL `CreateVideo` gets an audio input when the audio plan says audio is available.

Manual verification:

- Start the app on port 3300.
- Attach a SCAIL motion video longer than 10 seconds.
- Confirm the duration control can use more than 10 seconds and caps at 60 seconds.
- Confirm the SCAIL mode control switches between Chunked and Direct and the choice is sent with the request.
- Queue a short SCAIL clip and confirm no regression.
- Queue a longer SCAIL clip and confirm the result is saved with expected duration and audio when the source has audio.

## Risks

- Long SCAIL jobs may still be slow or VRAM-heavy even when chunked.
- Direct mode may be useful but is expected to be less reliable for long clips than chunked mode.
- Batch joining and overlap removal depend on local ComfyUI node behavior and may need small adjustments after graph inspection.
- Audio extraction from video files depends on the installed audio/video nodes; the implementation must verify the actual node schemas before relying on trimmed audio.
