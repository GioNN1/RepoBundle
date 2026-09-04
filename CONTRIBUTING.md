# Contributing to RepoBundle

Thanks for helping improve RepoBundle.

Repository: https://github.com/GioNN1/RepoBundle

## Before opening a pull request

1. Search existing issues and pull requests first.
2. For substantial behavior changes, open an issue so the design can be discussed before implementation.
3. Keep the VS Code integration separate from the bundling core where possible.
4. Add regression coverage for bug fixes and safety-sensitive behavior.
5. Update the README or changelog when a change affects users.

## Local development

Requirements:

- Node.js 22+
- npm
- VS Code 1.100+

```bash
git clone https://github.com/GioNN1/RepoBundle.git
cd RepoBundle
npm install
npm test
```

Open the repository in VS Code and press **F5** to launch the Extension Development Host.

## Pull-request checklist

- `npm test` passes.
- New behavior has focused tests where practical.
- Safety-sensitive changes have regression coverage.
- Sidebar/UI changes work in both light and dark themes.
- Documentation and `CHANGELOG.md` are updated when appropriate.
- Generated output does not silently omit readable project text without recording the omission.

## Safety invariants

RepoBundle should avoid silently dropping readable project text. Omissions must remain explicit in the generated index.

Protections that prevent destructive output replacement, path escape, or accidental secret inclusion should not be weakened without a clear reason, migration plan, and tests.

## Issues

- Bugs: https://github.com/GioNN1/RepoBundle/issues/new?template=bug_report.yml
- Features: https://github.com/GioNN1/RepoBundle/issues/new?template=feature_request.yml
