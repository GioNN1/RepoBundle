# Architecture

RepoBundle is split into two layers.

## VS Code integration

`src/extension.ts` owns commands, configuration, progress, cancellation, output-channel logging, and editor/file-manager actions.

`src/dashboard.ts` owns the Activity Bar webview and translates UI messages into RepoBundle commands. The webview assets live in `media/` and have no direct filesystem access.

## Bundler core

`src/bundler/` does not import the VS Code API. It owns repository discovery, Git integration, safety rules, text/binary detection, encoding handling, chunking, bundle layout, manifest generation, and atomic output replacement.

This boundary is intentional: core behavior can be unit-tested with Node alone and can later be reused by a CLI or another editor integration.

## Output safety

A run writes to a temporary sibling directory first. Only a completed snapshot is committed. Existing non-empty output directories are replaced only when they are recognized as clean RepoBundle output (or a supported legacy output) and contain no unknown entries.

The output identity is stored in `00_REPO_INDEX.md`; RepoBundle does not create a hidden marker file.
