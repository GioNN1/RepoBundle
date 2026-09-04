(() => {
  const vscode = acquireVsCodeApi();
  const app = document.getElementById('app');

  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const send = (command, extra = {}) => vscode.postMessage({ command, ...extra });

  function switchRow(key, label, note, enabled) {
    return '<div class="setting">' +
      '<div class="setting-copy"><div class="setting-label">' + esc(label) + '</div><div class="setting-note">' + esc(note) + '</div></div>' +
      '<button class="switch ' + (enabled ? 'on' : '') + '" data-toggle="' + esc(key) + '" aria-label="Toggle ' + esc(label) + '" aria-pressed="' + (enabled ? 'true' : 'false') + '"></button>' +
      '</div>';
  }

  function render(state) {
    const s = state.settings;
    const progress = Number.isFinite(state.progressPercent) ? Math.max(0, Math.min(100, state.progressPercent)) : 0;
    const hasWorkspace = state.workspaceCount > 0;
    const run = state.lastRun;
    const maxBundles = s.maxBundles === 0 ? '∞' : s.maxBundles;
    const excludeText = s.excludeDirs.length === 0 ? 'None' : s.excludeDirs.join(', ');
    const repoName = run ? (run.repoDir.split(/[\\/]/).filter(Boolean).pop() || run.repoDir) : '';

    const blocks = [];
    blocks.push(
      '<section class="hero">' +
        '<div class="brand">' +
          '<div class="brand-mark" aria-hidden="true"><span class="sheet a"></span><span class="sheet b"></span></div>' +
          '<div><h1>RepoBundle</h1><p class="tagline">Repository context, packed for analysis.</p></div>' +
        '</div>' +
        '<div class="workspace">' +
          '<div class="workspace-line"><span class="dot ' + (hasWorkspace ? '' : 'off') + '"></span><span class="workspace-name">' + esc(state.workspaceName) + '</span></div>' +
          '<div class="workspace-path" title="' + esc(state.workspacePath) + '">' + esc(state.workspacePath) + '</div>' +
        '</div>' +
        '<div class="primary-row">' +
          '<button class="btn primary" data-action="bundleWorkspace" ' + ((!hasWorkspace || state.running) ? 'disabled' : '') + '>' + (state.running ? 'Bundling…' : 'Bundle workspace') + '</button>' +
          (state.running
            ? '<button class="btn danger" data-action="cancelCurrentRun">Cancel</button>'
            : '<button class="btn secondary" data-action="openSettings" title="Open RepoBundle settings">Settings</button>') +
        '</div>' +
      '</section>',
    );

    if (state.running) {
      blocks.push(
        '<section class="card">' +
          '<div class="card-head"><span class="card-title">Current run</span><span class="card-sub">' + Math.round(progress) + '%</span></div>' +
          '<div class="progress-wrap">' +
            '<div class="progress-track"><div class="progress-fill" style="width:' + progress + '%"></div></div>' +
            '<div class="progress-copy">' + esc(state.progressMessage || 'Preparing repository snapshot…') + '</div>' +
          '</div>' +
        '</section>',
      );
    }

    blocks.push(
      '<section class="card">' +
        '<div class="card-head"><span class="card-title">Bundle profile</span><span class="card-sub">Click values to edit</span></div>' +
        '<div class="settings">' +
          switchRow('respectGitignore', 'Respect .gitignore', 'Use Git discovery instead of a full filesystem scan.', s.respectGitignore) +
          switchRow('lineNumbers', 'Source line numbers', 'Prefix embedded lines with their original line numbers.', s.lineNumbers) +
          switchRow('includeDependencies', 'Include dependencies', 'Traverse dependency and virtual-environment trees.', s.includeDependencies) +
          switchRow('includeSensitive', 'Include sensitive files', 'Can embed credentials and private keys. Keep off for sharing.', s.includeSensitive) +
        '</div>' +
        '<div class="value-row">' +
          '<button class="value" data-number="targetMb"><div class="value-number">' + esc(s.targetMb) + '</div><div class="value-label">Target MB</div></button>' +
          '<button class="value" data-number="hardMaxMb"><div class="value-number">' + esc(s.hardMaxMb) + '</div><div class="value-label">Hard max</div></button>' +
          '<button class="value" data-number="maxBundles"><div class="value-number">' + esc(maxBundles) + '</div><div class="value-label">Max bundles</div></button>' +
        '</div>' +
        '<div class="setting">' +
          '<div class="setting-copy"><div class="setting-label">Excluded directories</div><div class="setting-note" title="' + esc(excludeText) + '">' + esc(excludeText) + '</div></div>' +
          '<button class="btn secondary" data-action="editExcludeDirs">Edit</button>' +
        '</div>' +
        (s.includeSensitive ? '<div class="warning"><strong>Sensitive files are enabled.</strong> Generated Markdown may contain secrets.</div>' : '') +
      '</section>',
    );

    if (run) {
      blocks.push(
        '<section class="card">' +
          '<div class="card-head"><span class="card-title">Last snapshot</span><span class="card-sub">' + esc(new Date(run.finishedAt).toLocaleString()) + '</span></div>' +
          '<div class="metrics">' +
            '<div class="metric"><div class="metric-value">' + esc(run.includedFiles) + '</div><div class="metric-label">Files</div></div>' +
            '<div class="metric"><div class="metric-value">' + esc(run.bundles) + '</div><div class="metric-label">Bundles</div></div>' +
            '<div class="metric"><div class="metric-value">' + esc(run.notEmbedded) + '</div><div class="metric-label">Skipped</div></div>' +
          '</div>' +
          '<div class="last-meta"><strong>' + esc(repoName) + '</strong><br>' + esc(run.discoveryMode) + '</div>' +
          '<div class="actions">' +
            '<button class="btn secondary" data-action="openLastIndex">Open index</button>' +
            '<button class="btn secondary" data-action="openLastOutput">Open folder</button>' +
          '</div>' +
        '</section>',
      );
    } else {
      blocks.push(
        '<section class="card">' +
          '<div class="card-head"><span class="card-title">Last snapshot</span><span class="card-sub">No runs yet</span></div>' +
          '<div class="empty">Create your first snapshot and RepoBundle will keep the latest run summary here.</div>' +
        '</section>',
      );
    }

    blocks.push('<div class="foot"><button class="link-btn" data-action="openSettings">Open all RepoBundle settings</button></div>');
    app.innerHTML = blocks.join('');

    document.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', () => send(button.dataset.action));
    });
    document.querySelectorAll('[data-toggle]').forEach((button) => {
      button.addEventListener('click', () => send('toggleSetting', { key: button.dataset.toggle }));
    });
    document.querySelectorAll('[data-number]').forEach((button) => {
      button.addEventListener('click', () => send('editNumberSetting', { key: button.dataset.number }));
    });
  }

  window.addEventListener('message', (event) => {
    if (event.data?.type === 'state') {
      render(event.data.state);
    }
  });

  send('ready');
})();
