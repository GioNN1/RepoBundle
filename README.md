<p align="center">
  <img src="resources/repobundle.png" width="84" height="84" alt="RepoBundle logo">
</p>

<h1 align="center">RepoBundle</h1>

<p align="center">
  Turn a local repository into compact, retrieval-friendly Markdown bundles for LLM analysis — directly from VS Code.
</p>

<p align="center">
  <a href="https://github.com/GioNN1/RepoBundle/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/GioNN1/RepoBundle/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/GioNN1/RepoBundle/blob/main/LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg"></a>
  <img alt="VS Code" src="https://img.shields.io/badge/VS%20Code-1.100%2B-007ACC">
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.1-6f42c1">
</p>

RepoBundle is a VS Code extension for creating safe, near-lossless repository snapshots that are convenient to upload to ChatGPT or other LLM tools. It is designed for code review, architecture analysis, debugging, migration planning, onboarding, and any workflow where an AI system needs structured repository context instead of a blind file dump.

## Sidebar dashboard

RepoBundle adds its own icon to the VS Code Activity Bar. Opening it shows a theme-aware dashboard where you can:

- bundle the current workspace with one click;
- follow live progress and cancel an active run;
- toggle Git ignore behavior, source line numbers, dependency trees, and sensitive files;
- edit target size, hard bundle limit, soft maximum bundle count, and custom directory exclusions;
- inspect the latest run summary;
- open the generated repository index or output folder.

The dashboard uses VS Code theme variables and adapts automatically to light and dark themes.

## Quick start

1. Open a local repository in VS Code.
2. Click **RepoBundle** in the Activity Bar.
3. Click **Bundle workspace**.
4. RepoBundle creates the snapshot next to the repository.
5. `00_REPO_INDEX.md` opens automatically when generation completes.

The same actions are available from the Command Palette:

- `RepoBundle: Bundle Workspace`
- `RepoBundle: Bundle This Folder`
- `RepoBundle: Open Last Repository Index`
- `RepoBundle: Open Last Output Folder`

You can also right-click a folder in the Explorer and choose **RepoBundle: Bundle This Folder**.

## Output

By default, a repository such as:

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

When needed, RepoBundle also creates `01_NOT_EMBEDDED.md`, containing the inventory of discovered files whose contents were not embedded.

Each generated index carries an explicit snapshot identity:

```md
- Generator: `repobundle`
- Format version: `1`
- Generator version: `0.1.1`
```

RepoBundle does **not** create a hidden marker file in the output directory.

## Safe defaults

RepoBundle intentionally favors a near-lossless snapshot while keeping accidental sharing safer by default:

- scans the filesystem by default, including project files ignored by Git;
- excludes VCS metadata, caches, dependency/environment trees, obvious binary formats, and obvious credential/key files;
- detects Python virtual environments by `pyvenv.cfg`, not only by directory name;
- does not follow directory symlinks;
- accepts file symlinks only when their resolved target stays inside the repository and re-checks that target for sensitive/binary content;
- splits large text files instead of silently dropping them;
- separates the preferred bundle size from a hard per-bundle limit;
- records omissions and excluded directories in the repository index;
- writes to a temporary sibling directory first and commits output only after a successful run;
- refuses to replace a non-empty output directory containing unknown user files.

> [!WARNING]
> Enabling `repoBundle.includeSensitive` may put credentials, private keys, tokens, or other secrets into generated Markdown. RepoBundle asks for explicit confirmation before running with this option enabled.

## Settings

| Setting | Default | Purpose |
| --- | ---: | --- |
| `repoBundle.targetMb` | `2.5` | Preferred size of each Markdown bundle |
| `repoBundle.hardMaxMb` | `3.25` | Hard maximum size of each bundle |
| `repoBundle.maxBundles` | `0` | Soft bundle-count target; `0` means unlimited |
| `repoBundle.lineNumbers` | `false` | Prefix embedded source lines with original line numbers |
| `repoBundle.includeDependencies` | `false` | Include dependency trees and virtual environments |
| `repoBundle.includeSensitive` | `false` | Include obvious credential/key files |
| `repoBundle.respectGitignore` | `false` | Use Git discovery and omit ignored files |
| `repoBundle.excludeDirs` | `[]` | Additional directory basenames to exclude |

## Legacy migration

RepoBundle can recognize clean output created by the previous `py-bundler` implementation, including the legacy `.py_bundler_output` marker and the signed `py-bundler` repository index. The next successful regeneration migrates that output to the new `repobundle` signature and removes the old marker.

Legacy compatibility exists only for safe migration. New snapshots use the RepoBundle identity everywhere.

## Development

Requirements:

- Node.js 22.x (CI is pinned to 22.16.0)
- npm 10+
- VS Code 1.100+

Clone and install:

```bash
git clone https://github.com/GioNN1/RepoBundle.git
cd RepoBundle
npm ci
npm test
```

Open the repository in VS Code and press **F5**, selecting **Run RepoBundle Extension** if prompted. VS Code opens an Extension Development Host where RepoBundle appears in the Activity Bar.

### Continuous integration

The repository runs three checks on pushes to `main` and pull requests:

- build + core tests on Ubuntu;
- build + core tests on Windows;
- a VSIX packaging smoke test on Ubuntu.

Dependencies are installed with the committed `package-lock.json` via `npm ci`. The VSCE CLI is pinned and used only by packaging jobs, not by the cross-platform test matrix.

### Package a VSIX

```bash
npm run package
```

Install the generated `.vsix` from VS Code with:

**Extensions → … → Install from VSIX…**

The extension manifest currently uses `GioNN1` as the publisher ID. If your VS Code Marketplace publisher ID is different, change only the `publisher` field in `package.json` before publishing.

## Project structure

```text
src/
  extension.ts         VS Code commands, progress and configuration
  dashboard.ts         Activity Bar dashboard/webview controller
  bundler/             VS Code-independent bundling core
media/
  dashboard.css        Theme-aware dashboard presentation
  dashboard.js         Dashboard interaction layer
resources/
  repobundle.svg       Monochrome Activity Bar icon
  repobundle.png       Marketplace/package icon
test/
  bundler.test.ts      Core safety and regression tests
docs/
  ARCHITECTURE.md      Design and component boundaries
  PRIVACY.md           Local-data behavior
```

The bundler core does not import the VS Code API. That keeps the core independently testable and leaves room for a future CLI or integrations with other editors.

## Security and privacy

RepoBundle processes repository files locally and writes its output locally. The extension itself does not upload repository contents to an external service.

Generated bundles can contain proprietary source code and, when explicitly enabled, sensitive files. Review generated material before sharing it with a third party or an external AI service.

For security issues, see [SECURITY.md](SECURITY.md). Please avoid publishing exploitable vulnerability details in a public issue.

## Contributing

Issues and pull requests are welcome:

- [Report a bug](https://github.com/GioNN1/RepoBundle/issues/new?template=bug_report.yml)
- [Request a feature](https://github.com/GioNN1/RepoBundle/issues/new?template=feature_request.yml)
- [Open issues](https://github.com/GioNN1/RepoBundle/issues)

See [CONTRIBUTING.md](CONTRIBUTING.md) before submitting substantial changes.

## License and reuse

RepoBundle is released under the **MIT License**.

You may use, copy, modify, merge, publish, distribute, sublicense, and sell copies of the software, including in commercial projects, provided that the copyright notice and MIT permission notice are preserved in copies or substantial portions of the software.

See [LICENSE](LICENSE) for the complete license text.
