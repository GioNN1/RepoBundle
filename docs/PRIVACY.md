# Privacy notes

RepoBundle reads repository files on the VS Code extension host that owns the workspace and writes Markdown output on that same host. The extension itself does not upload repository contents to an external service.

RepoBundle may execute Git commands on the VS Code extension host when Git-backed discovery or snapshot metadata is requested by its normal operation.

The generated output can contain source code, configuration, documentation, logs, and other repository text. Sensitive credential/key files are excluded by default, but no filename-based filter can guarantee that arbitrary secrets are absent from otherwise ordinary text files. Review generated bundles before sharing them outside your trusted environment.
