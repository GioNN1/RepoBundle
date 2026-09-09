<p align="center">
  <img src="resources/repobundle.png" width="88" height="88" alt="RepoBundle logo">
</p>

<h1 align="center">RepoBundle</h1>

<p align="center">
  Turn a repository into structured, retrieval-friendly Markdown for LLM analysis — directly from VS Code.
</p>

<p align="center">
  <a href="https://github.com/GioNN1/RepoBundle/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/GioNN1/RepoBundle/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/GioNN1/RepoBundle/blob/main/LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg"></a>
  <img alt="VS Code" src="https://img.shields.io/badge/VS%20Code-1.100%2B-007ACC">
</p>

RepoBundle is a VS Code extension that turns a codebase into compact Markdown bundles designed for analysis by ChatGPT and other LLM tools. It preserves repository structure, records omissions explicitly, and keeps bundle sizes under predictable limits so you can share useful context without manually collecting files.

No account, API key, or external service is required. RepoBundle reads and writes files on the VS Code extension host that owns the workspace.

## Getting started

1. Install **RepoBundle** from the VS Code Extensions view.
2. Open a repository or project folder.
3. Click the **RepoBundle** icon in the Activity Bar.
4. Click **Bundle workspace**.
5. RepoBundle creates the snapshot next to the repository and opens `00_REPO_INDEX.md` when it finishes.

You can also run RepoBundle from the Command Palette or right-click a folder in the Explorer and choose **RepoBundle: Bundle This Folder**.

## What RepoBundle creates

A repository such as:

```text
my-project/
```

produces:

```text
my-project_bundled/
  00_REPO_INDEX.md
  bundle_001.md
  bundle_002.md
  ...
```

When needed, RepoBundle also creates `01_NOT_EMBEDDED.md`, an inventory of discovered files whose contents were not embedded.

`00_REPO_INDEX.md` is the entry point for the snapshot. It records repository metadata, bundle boundaries, file-to-bundle mappings, omissions, excluded directories, discovery mode, and a SHA-256 fingerprint of the embedded source set.

Each `bundle_*.md` keeps original file boundaries with headings such as:

```md
## File: `src/example.ts`
```

Large text files are split into numbered parts with original line ranges instead of being silently dropped.

## Why RepoBundle

- **Repository-aware output** — preserves paths and original file boundaries.
- **LLM-friendly retrieval** — starts with a compact index instead of one undifferentiated text dump.
- **Predictable bundle sizes** — separate preferred and hard maximum size limits.
- **Explicit omissions** — skipped files and excluded directories are recorded in the index.
- **Git-aware discovery** — `.gitignore` is respected by default in Git work trees.
- **Large-file support** — large text files are streamed and chunked instead of loaded as one giant string.
- **Safe output replacement** — existing non-empty output is replaced only when it is a recognized RepoBundle snapshot with no unknown entries.
- **No upload step** — the extension itself does not send repository contents to an external service.

## Sidebar dashboard

RepoBundle adds a dedicated Activity Bar view with:

- one-click workspace bundling;
- live progress and cancellation;
- Git ignore, line-number, dependency, and one-shot sensitive-file controls;
- editable target size, hard limit, bundle count, and excluded directories;
- latest-run metrics;
- shortcuts to the generated index and output folder.

The dashboard uses VS Code theme colors and adapts to light and dark themes.

## Commands

| Command | Purpose |
| --- | --- |
| `RepoBundle: Bundle Workspace` | Bundle the current workspace |
| `RepoBundle: Bundle This Folder` | Bundle a selected folder |
| `RepoBundle: Open Last Repository Index` | Open the latest generated index |
| `RepoBundle: Open Last Output Folder` | Open the latest output directory |
| `RepoBundle: Cancel Current Bundle` | Cancel the active run |
| `RepoBundle: Open Settings` | Open RepoBundle settings |

## Settings

| Setting | Default | Purpose |
| --- | ---: | --- |
| `repoBundle.targetMb` | `2.5` | Preferred size of each Markdown bundle |
| `repoBundle.hardMaxMb` | `3.25` | Hard maximum size of each bundle |
| `repoBundle.maxBundles` | `0` | Soft bundle-count target; `0` means unlimited |
| `repoBundle.lineNumbers` | `false` | Prefix embedded source lines with original line numbers |
| `repoBundle.includeDependencies` | `false` | Include dependency trees and virtual environments |
| `repoBundle.respectGitignore` | `true` | Use Git discovery in Git work trees and omit ignored files |
| `repoBundle.excludeDirs` | `[]` | Additional directory basenames to exclude |

The dashboard also offers **Include sensitive files for this run**. It is an in-memory, one-shot option and is never stored in workspace settings.

## Safety and privacy

RepoBundle is designed to make its behavior visible rather than silently guessing what should be shared.

By default it:

- respects `.gitignore` when Git-backed discovery is available;
- excludes VCS metadata, caches, dependency/environment trees, known binary formats, and obvious credential/key files;
- does not follow directory symlinks;
- accepts file symlinks only when their resolved target stays inside the repository and re-checks the target for sensitive or binary content;
- writes to a temporary sibling directory before committing a completed snapshot;
- refuses to replace a non-empty output directory containing unknown user files.

RepoBundle itself does **not** upload repository contents. Generated bundles can still contain proprietary code or secrets stored in ordinary-looking text files. The sensitive-file filter is intentionally conservative and filename-based; it cannot guarantee that arbitrary secrets are absent. Review generated material before sharing it outside your trusted environment.

For more detail, see [Privacy notes](docs/PRIVACY.md) and [Security policy](SECURITY.md).

## Requirements

- VS Code 1.100 or later
- Windows, macOS, or Linux
- Git is optional; when unavailable, RepoBundle falls back to a filesystem scan and records that discovery mode in the index

Virtual workspaces are not supported because RepoBundle requires direct filesystem access on the extension host.

## Support

- [Report a bug](https://github.com/GioNN1/RepoBundle/issues/new?template=bug_report.yml)
- [Request a feature](https://github.com/GioNN1/RepoBundle/issues/new?template=feature_request.yml)
- [Browse open issues](https://github.com/GioNN1/RepoBundle/issues)
- [Report a security issue](https://github.com/GioNN1/RepoBundle/security)

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for local development and pull-request guidelines.

## License

RepoBundle is available under the [MIT License](LICENSE).
