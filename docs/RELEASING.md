# Releasing RepoBundle

This document is for maintainers. User-facing installation and usage belong in the root `README.md`; release engineering does not.

## Prerequisites

- Node.js version from `.nvmrc`
- npm 10+
- access to the `GioNN1/RepoBundle` repository
- access to the `GioNN1` Visual Studio Marketplace publisher

## Validate a release

From a clean checkout:

```bash
npm ci
npm test
npm run package
```

The generated `.vsix` is a local packaging artifact. Do not document maintainer upload steps in the Marketplace README.

## GitHub release flow

1. Update `package.json`, `package-lock.json`, `GENERATOR_VERSION`, and `CHANGELOG.md` together.
2. Run `npm test` locally.
3. Push the release commit and wait for CI to pass on Ubuntu, Windows, and macOS.
4. Tag the commit with the matching version, for example:

   ```bash
   git tag v0.1.7
   git push origin v0.1.7
   ```

5. The **Package VSIX** workflow builds the release package and uploads the `repobundle-vsix` artifact to the GitHub Actions run.

## Visual Studio Marketplace

For a manual Marketplace release:

1. Open the successful **Package VSIX** workflow run for the release tag.
2. Download the `repobundle-vsix` artifact.
3. Open the Visual Studio Marketplace publisher management page for `GioNN1`.
4. Upload the generated `.vsix` as a Visual Studio Code extension update.
5. Confirm the rendered Marketplace page, version, icon, README, changelog, repository links, and license before making the release public.

The `publisher` field in `package.json` must match the Marketplace publisher ID exactly.

## Release checks

Before publishing, verify:

- the root README is user-facing and contains no maintainer publishing instructions;
- `preview` is not set unless the release is intentionally marked Preview;
- the Marketplace icon is the PNG asset;
- `.vscodeignore` excludes source, tests, build metadata, and maintainer-only docs from the VSIX;
- `npm run verify:manifest` passes;
- `vsce ls --tree --no-dependencies` contains only expected runtime and Marketplace files;
- the GitHub Actions package smoke test passes.
