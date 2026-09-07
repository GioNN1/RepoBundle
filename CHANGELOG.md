# Changelog

All notable changes to RepoBundle are documented here.

## 0.1.3 - Windows symlink path fix

- Normalize Windows extended-length (`\\?\`) paths before repository containment checks.
- Canonicalize the repository root before comparing resolved symlink targets.
- Preserve sensitive-target detection for internal symlinks on Windows instead of misclassifying them as outside the repository.
- Add a platform-independent regression test for Windows extended-length path containment.

## 0.1.2 - CI and packaging hardening

- Separate the runtime TypeScript build (`dist/`) from compiled tests (`.test-dist/`).
- Ensure test fixtures never enter the VSIX or VSCE secret scanning.
- Use `.vscodeignore` as the single package file-selection mechanism and remove `package.json#files`.
- Add `vsce ls --tree` to CI before packaging so the exact VSIX contents are visible in logs.
- Remove the build-only Node.js engine constraint from the extension runtime manifest.
- Split CI into explicit install/compile/manifest/test steps so failures identify the exact stage.
- Make `vscode:prepublish` clean stale output and rebuild only runtime files before every VSIX package.

## 0.1.1

- Rebuilt CI around a committed npm lockfile and `npm ci` for deterministic installs.
- Pinned Node.js, TypeScript, `@types/node`, and `@types/vscode` to versions compatible with the declared VS Code engine.
- Removed `@vscode/vsce` from the normal test dependency graph; packaging installs a pinned VSCE version only when needed.
- Added a manifest verification step that catches missing runtime assets, stale version pins, and lockfile drift before tests run.
- Replaced the SVG image in the Marketplace README with the PNG asset while retaining the SVG for the Activity Bar.
- Updated the generator version to `0.1.1`.

## 0.1.0

- Renamed the project and extension to **RepoBundle**.
- Added a polished, theme-aware RepoBundle dashboard in the VS Code Activity Bar.
- Added live in-sidebar progress and cancellation.
- Added workspace bundling, folder bundling, Command Palette actions, and Explorer context-menu support.
- Added integrated settings for Git ignore behavior, dependencies, sensitive files, line numbers, bundle sizing, and custom exclusions.
- Kept the bundling core independent from the VS Code API.
- Added filesystem-scan and `respectGitignore` discovery modes.
- Added sensitive-file, symlink-target, binary, dependency-tree, and virtual-environment protections.
- Added line-aware chunking and hard bundle-size enforcement.
- Added `00_REPO_INDEX.md`, optional `01_NOT_EMBEDDED.md`, and an embedded-text SHA-256 fingerprint.
- Replaced the old marker-file identity with the signed `repobundle` repository index.
- Added safe migration support for legacy `py-bundler` output.
- Added atomic output replacement and protection against deleting unknown files.
- Added MIT licensing and GitHub contribution, security, issue-template, Dependabot, and CI scaffolding.
- Added GitHub repository metadata for `GioNN1/RepoBundle`, a VSIX packaging workflow, and Marketplace icon assets.
