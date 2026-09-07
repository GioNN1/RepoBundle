import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { BundleResult } from './bundler/types';

export interface LastRunRecord extends BundleResult {
  finishedAt: string;
}

interface DashboardSettings {
  respectGitignore: boolean;
  includeDependencies: boolean;
  includeSensitive: boolean;
  lineNumbers: boolean;
  targetMb: number;
  hardMaxMb: number;
  maxBundles: number;
  excludeDirs: string[];
}

interface DashboardState {
  workspaceName: string;
  workspacePath: string;
  workspaceCount: number;
  running: boolean;
  progressPercent: number | undefined;
  progressMessage: string;
  settings: DashboardSettings;
  lastRun: LastRunRecord | undefined;
}

interface DashboardMessage {
  command?: unknown;
  key?: unknown;
}

const BOOLEAN_SETTING_KEYS = new Set([
  'respectGitignore',
  'includeDependencies',
  'lineNumbers',
]);

const NUMBER_SETTING_KEYS = new Set([
  'targetMb',
  'hardMaxMb',
  'maxBundles',
]);

export class RepoBundleDashboardProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private lastRun: LastRunRecord | undefined;
  private running = false;
  private progressPercent: number | undefined;
  private progressMessage = '';
  private includeSensitiveForNextRun = false;

  public constructor(private readonly context: vscode.ExtensionContext) {
    this.lastRun = context.workspaceState.get<LastRunRecord>('repoBundle.lastRun');
  }

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
    };
    webviewView.webview.html = this.html(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      async (raw: DashboardMessage) => this.handleMessage(raw),
      undefined,
      this.context.subscriptions,
    );

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.refresh();
      }
    }, undefined, this.context.subscriptions);

    this.refresh();
  }

  public refresh(): void {
    void this.postState();
  }

  public setRunning(running: boolean): void {
    this.running = running;
    if (!running) {
      this.progressPercent = undefined;
      this.progressMessage = '';
    }
    this.refresh();
  }

  public setProgress(percent: number | undefined, message: string): void {
    this.progressPercent = percent;
    this.progressMessage = message;
    this.refresh();
  }

  public async setLastRun(result: BundleResult): Promise<void> {
    this.lastRun = { ...result, finishedAt: new Date().toISOString() };
    await this.context.workspaceState.update('repoBundle.lastRun', this.lastRun);
    this.refresh();
  }

  public getLastRun(): LastRunRecord | undefined {
    return this.lastRun;
  }

  public consumeIncludeSensitiveForNextRun(): boolean {
    const enabled = this.includeSensitiveForNextRun;
    this.includeSensitiveForNextRun = false;
    this.refresh();
    return enabled;
  }

  private currentState(): DashboardState {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const primary = folders[0];
    const resource = primary?.uri;
    const config = vscode.workspace.getConfiguration('repoBundle', resource);

    return {
      workspaceName: folders.length === 0
        ? 'No workspace open'
        : folders.length === 1
          ? primary?.name ?? 'Workspace'
          : `${primary?.name ?? 'Workspace'} +${folders.length - 1}`,
      workspacePath: resource?.fsPath ?? 'Open a local folder to create a bundle.',
      workspaceCount: folders.length,
      running: this.running,
      progressPercent: this.progressPercent,
      progressMessage: this.progressMessage,
      settings: {
        respectGitignore: config.get<boolean>('respectGitignore', true),
        includeDependencies: config.get<boolean>('includeDependencies', false),
        includeSensitive: this.includeSensitiveForNextRun,
        lineNumbers: config.get<boolean>('lineNumbers', false),
        targetMb: config.get<number>('targetMb', 2.5),
        hardMaxMb: config.get<number>('hardMaxMb', 3.25),
        maxBundles: config.get<number>('maxBundles', 0),
        excludeDirs: config.get<string[]>('excludeDirs', []),
      },
      lastRun: this.lastRun,
    };
  }

  private async postState(): Promise<void> {
    if (this.view === undefined) {
      return;
    }
    await this.view.webview.postMessage({ type: 'state', state: this.currentState() });
  }

  private async handleMessage(message: DashboardMessage): Promise<void> {
    if (typeof message.command !== 'string') {
      return;
    }

    switch (message.command) {
      case 'ready':
        this.refresh();
        break;
      case 'bundleWorkspace':
        await vscode.commands.executeCommand('repoBundle.bundleWorkspace');
        break;
      case 'cancelCurrentRun':
        await vscode.commands.executeCommand('repoBundle.cancelCurrentRun');
        break;
      case 'openLastIndex':
        await vscode.commands.executeCommand('repoBundle.openLastIndex');
        break;
      case 'openLastOutput':
        await vscode.commands.executeCommand('repoBundle.openLastOutput');
        break;
      case 'openSettings':
        await vscode.commands.executeCommand('repoBundle.openSettings');
        break;
      case 'editExcludeDirs':
        await vscode.commands.executeCommand('repoBundle.editExcludeDirs');
        break;
      case 'toggleSetting':
        if (message.key === 'includeSensitive') {
          this.includeSensitiveForNextRun = !this.includeSensitiveForNextRun;
          this.refresh();
        } else if (typeof message.key === 'string' && BOOLEAN_SETTING_KEYS.has(message.key)) {
          await vscode.commands.executeCommand('repoBundle.toggleBooleanSetting', message.key);
        }
        break;
      case 'editNumberSetting':
        if (typeof message.key === 'string' && NUMBER_SETTING_KEYS.has(message.key)) {
          await vscode.commands.executeCommand('repoBundle.editNumberSetting', message.key);
        }
        break;
      default:
        break;
    }
  }

  private html(webview: vscode.Webview): string {
    const nonce = getNonce();
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'dashboard.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'dashboard.js'));
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" href="${styleUri}">
  <title>RepoBundle</title>
</head>
<body>
  <main id="app" class="shell" aria-live="polite"></main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  return randomBytes(24).toString('base64url');
}
