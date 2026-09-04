import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { bundleRepository } from './bundler/bundler';
import { BundlerCancelledError, BundlerOptions, BundlerProgress, BundleResult } from './bundler/types';
import { LastRunRecord, RepoBundleDashboardProvider } from './dashboard';

const OUTPUT_CHANNEL_NAME = 'RepoBundle';
const BOOLEAN_SETTING_KEYS = new Set(['respectGitignore', 'includeDependencies', 'includeSensitive', 'lineNumbers']);
const NUMBER_SETTING_KEYS = new Set(['targetMb', 'hardMaxMb', 'maxBundles']);
let activeCancellationSource: vscode.CancellationTokenSource | undefined;

function configurationFor(root: vscode.Uri): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('repoBundle', root);
}

function buildOptions(root: vscode.Uri): BundlerOptions {
  const config = configurationFor(root);
  return {
    repoDir: root.fsPath,
    targetMb: config.get<number>('targetMb', 2.5),
    hardMaxMb: config.get<number>('hardMaxMb', 3.25),
    maxBundles: config.get<number>('maxBundles', 0),
    lineNumbers: config.get<boolean>('lineNumbers', false),
    includeDependencies: config.get<boolean>('includeDependencies', false),
    includeSensitive: config.get<boolean>('includeSensitive', false),
    respectGitignore: config.get<boolean>('respectGitignore', false),
    excludeDirs: config.get<string[]>('excludeDirs', []),
  };
}

async function pickWorkspaceFolder(): Promise<vscode.Uri | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    void vscode.window.showErrorMessage('RepoBundle: open a local folder or workspace first.');
    return undefined;
  }
  if (folders.length === 1) {
    return folders[0]?.uri;
  }
  return (await vscode.window.showWorkspaceFolderPick({ placeHolder: 'Choose the workspace folder to bundle' }))?.uri;
}

async function ensureDirectory(uri: vscode.Uri): Promise<boolean> {
  try {
    return (await fs.stat(uri.fsPath)).isDirectory();
  } catch {
    return false;
  }
}

async function confirmSensitive(options: BundlerOptions): Promise<boolean> {
  if (!options.includeSensitive) {
    return true;
  }
  const choice = await vscode.window.showWarningMessage(
    'RepoBundle is configured to include sensitive credential/key files. Generated bundles may contain secrets.',
    { modal: true },
    'Continue',
  );
  return choice === 'Continue';
}

function progressPercent(progress: BundlerProgress): number | undefined {
  const ranges = {
    scan: [0, 10],
    load: [10, 45],
    chunk: [45, 80],
    write: [80, 100],
  } as const;
  const range = ranges[progress.stage];
  if (progress.completed === undefined || progress.total === undefined || progress.total <= 0) {
    return undefined;
  }
  const fraction = Math.min(1, Math.max(0, progress.completed / progress.total));
  return range[0] + (range[1] - range[0]) * fraction;
}

async function openIndex(indexPath: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(indexPath));
  await vscode.window.showTextDocument(document, { preview: false });
}

async function runBundle(
  root: vscode.Uri,
  output: vscode.OutputChannel,
  dashboard: RepoBundleDashboardProvider,
): Promise<BundleResult | undefined> {
  if (activeCancellationSource !== undefined) {
    void vscode.window.showInformationMessage('RepoBundle: a bundle is already running.');
    return undefined;
  }
  if (root.scheme !== 'file' || !(await ensureDirectory(root))) {
    void vscode.window.showErrorMessage('RepoBundle currently supports local filesystem folders only.');
    return undefined;
  }

  const options = buildOptions(root);
  if (!(await confirmSensitive(options))) {
    return undefined;
  }

  const cancellationSource = new vscode.CancellationTokenSource();
  activeCancellationSource = cancellationSource;
  output.appendLine('');
  output.appendLine(`=== RepoBundle ${new Date().toISOString()} ===`);
  output.appendLine(`Repository: ${root.fsPath}`);
  dashboard.setRunning(true);
  dashboard.setProgress(0, 'Preparing repository snapshot…');

  try {
    let lastPercent = 0;
    let lastDashboardUpdate = 0;
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `RepoBundle: ${path.basename(root.fsPath)}`,
        cancellable: true,
      },
      async (uiProgress, token) => bundleRepository(options, {
        isCancellationRequested: () => token.isCancellationRequested || cancellationSource.token.isCancellationRequested,
        log: (message) => output.appendLine(message),
        onProgress: (progress) => {
          const percent = progressPercent(progress);
          if (percent !== undefined) {
            const increment = Math.max(0, percent - lastPercent);
            lastPercent = Math.max(lastPercent, percent);
            uiProgress.report({ increment, message: progress.message });
          } else {
            uiProgress.report({ message: progress.message });
          }

          const now = Date.now();
          if (now - lastDashboardUpdate >= 75 || percent === 100) {
            dashboard.setProgress(percent ?? lastPercent, progress.message);
            lastDashboardUpdate = now;
          }
        },
      }),
    );

    await dashboard.setLastRun(result);
    dashboard.setProgress(100, 'Snapshot complete.');
    output.appendLine(`Completed: ${result.bundles} bundles, ${result.includedFiles} files included.`);
    await openIndex(result.indexPath);
    void vscode.window.showInformationMessage(
      `RepoBundle: created ${result.bundles} bundle${result.bundles === 1 ? '' : 's'} from ${result.includedFiles} text files.`,
    );
    return result;
  } catch (error) {
    if (error instanceof BundlerCancelledError) {
      output.appendLine('Cancelled by user. Existing output was left untouched.');
      void vscode.window.showInformationMessage('RepoBundle: operation cancelled.');
      return undefined;
    }
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`ERROR: ${message}`);
    output.show(true);
    void vscode.window.showErrorMessage(`RepoBundle: ${message}`);
    return undefined;
  } finally {
    dashboard.setRunning(false);
    if (activeCancellationSource === cancellationSource) {
      activeCancellationSource = undefined;
    }
    cancellationSource.dispose();
  }
}

function configurationResource(): vscode.Uri | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri;
}

async function toggleBooleanSetting(key: string): Promise<void> {
  if (!BOOLEAN_SETTING_KEYS.has(key)) {
    return;
  }
  const resource = configurationResource();
  const config = vscode.workspace.getConfiguration('repoBundle', resource);
  const current = config.get<boolean>(key, false);
  if (key === 'includeSensitive' && !current) {
    const choice = await vscode.window.showWarningMessage(
      'Enabling this setting allows obvious credential/key files to be embedded in generated bundles.',
      { modal: true },
      'Enable',
    );
    if (choice !== 'Enable') {
      return;
    }
  }
  const target = resource === undefined ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.WorkspaceFolder;
  await config.update(key, !current, target);
}

async function editNumberSetting(key: string): Promise<void> {
  if (!NUMBER_SETTING_KEYS.has(key)) {
    return;
  }
  const resource = configurationResource();
  const config = vscode.workspace.getConfiguration('repoBundle', resource);
  const current = config.get<number>(key, key === 'targetMb' ? 2.5 : key === 'hardMaxMb' ? 3.25 : 0);
  const label = key === 'targetMb' ? 'Target size' : key === 'hardMaxMb' ? 'Hard maximum' : 'Maximum bundles';
  const value = await vscode.window.showInputBox({
    title: `RepoBundle: ${label}`,
    value: String(current),
    prompt: key === 'maxBundles' ? '0 means unlimited.' : 'Value in MB.',
    validateInput: (raw) => {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        return 'Enter a number.';
      }
      if (key === 'maxBundles') {
        return parsed < 0 || !Number.isInteger(parsed) ? 'Enter an integer greater than or equal to 0.' : undefined;
      }
      if (parsed <= 0.02) {
        return 'Enter a value greater than 0.02 MB.';
      }
      if (key === 'targetMb') {
        const hardMax = config.get<number>('hardMaxMb', 3.25);
        if (parsed > hardMax) {
          return `Target size must be less than or equal to the hard max (${hardMax} MB).`;
        }
      }
      if (key === 'hardMaxMb') {
        const targetMb = config.get<number>('targetMb', 2.5);
        if (parsed < targetMb) {
          return `Hard max must be greater than or equal to the target size (${targetMb} MB).`;
        }
      }
      return undefined;
    },
  });
  if (value === undefined) {
    return;
  }
  const parsed = Number(value);
  const target = resource === undefined ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.WorkspaceFolder;
  await config.update(key, parsed, target);
}

async function editExcludeDirs(): Promise<void> {
  const resource = configurationResource();
  const config = vscode.workspace.getConfiguration('repoBundle', resource);
  const current = config.get<string[]>('excludeDirs', []);
  const value = await vscode.window.showInputBox({
    title: 'RepoBundle: Exclude directories',
    value: current.join(', '),
    prompt: 'Comma-separated directory basenames, for example: generated, coverage, fixtures',
  });
  if (value === undefined) {
    return;
  }
  const dirs = [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
  const target = resource === undefined ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.WorkspaceFolder;
  await config.update('excludeDirs', dirs, target);
}

async function openLastIndex(lastRun: LastRunRecord | undefined): Promise<void> {
  if (lastRun === undefined) {
    void vscode.window.showInformationMessage('RepoBundle: no previous run in this workspace.');
    return;
  }
  try {
    await openIndex(lastRun.indexPath);
  } catch {
    void vscode.window.showErrorMessage('RepoBundle: the last repository index no longer exists.');
  }
}

async function openLastOutput(lastRun: LastRunRecord | undefined): Promise<void> {
  if (lastRun === undefined) {
    void vscode.window.showInformationMessage('RepoBundle: no previous run in this workspace.');
    return;
  }
  await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(lastRun.outputDir));
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  const dashboard = new RepoBundleDashboardProvider(context);

  context.subscriptions.push(
    output,
    vscode.window.registerWebviewViewProvider('repoBundle.dashboard', dashboard, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('repoBundle.bundleWorkspace', async () => {
      const root = await pickWorkspaceFolder();
      if (root !== undefined) {
        await runBundle(root, output, dashboard);
      }
    }),
    vscode.commands.registerCommand('repoBundle.bundleFolder', async (uri?: vscode.Uri) => {
      let root = uri;
      if (root === undefined) {
        const picked = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          title: 'Choose a folder to bundle',
        });
        root = picked?.[0];
      }
      if (root !== undefined) {
        await runBundle(root, output, dashboard);
      }
    }),
    vscode.commands.registerCommand('repoBundle.cancelCurrentRun', () => activeCancellationSource?.cancel()),
    vscode.commands.registerCommand('repoBundle.openLastIndex', async () => openLastIndex(dashboard.getLastRun())),
    vscode.commands.registerCommand('repoBundle.openLastOutput', async () => openLastOutput(dashboard.getLastRun())),
    vscode.commands.registerCommand('repoBundle.openSettings', async () => {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'RepoBundle');
    }),
    vscode.commands.registerCommand('repoBundle.refresh', () => dashboard.refresh()),
    vscode.commands.registerCommand('repoBundle.toggleBooleanSetting', async (key: string) => toggleBooleanSetting(key)),
    vscode.commands.registerCommand('repoBundle.editNumberSetting', async (key: string) => editNumberSetting(key)),
    vscode.commands.registerCommand('repoBundle.editExcludeDirs', async () => editExcludeDirs()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('repoBundle')) {
        dashboard.refresh();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => dashboard.refresh()),
  );
}

export function deactivate(): void {
  activeCancellationSource?.dispose();
  activeCancellationSource = undefined;
}
