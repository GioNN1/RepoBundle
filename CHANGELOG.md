# Changelog

All notable changes to RepoBundle are documented here.

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
