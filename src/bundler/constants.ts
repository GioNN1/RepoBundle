export const GENERATOR_ID = 'repobundle';
export const LEGACY_GENERATOR_IDS = new Set(['py-bundler']);
export const FORMAT_VERSION = 1;
export const GENERATOR_VERSION = '0.1.5';

export const DEFAULT_TARGET_MB = 2.5;
export const DEFAULT_HARD_MAX_MB = 3.25;
export const DEFAULT_APPROX_CHARS_PER_TOKEN = 3.0;
export const BUNDLE_HEADER_RESERVE_BYTES = 8192;
export const LARGE_FILE_STREAM_THRESHOLD_BYTES = 32 * 1024 * 1024;
export const STREAM_READ_BYTES = 1024 * 1024;
export const LEGACY_OUTPUT_MARKER_NAME = '.py_bundler_output';
export const BUNDLE_OUTPUT_RE = /^bundle_\d+\.md$/;

export const ALWAYS_EXCLUDED_DIR_NAMES = new Set([
  '.git',
  '.hg',
  '.svn',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.cache',
]);

export const DEPENDENCY_DIR_NAMES = new Set([
  'node_modules',
  'bower_components',
  '.tox',
  '.nox',
]);

export const SENSITIVE_EXACT_NAMES = new Set([
  '.env',
  '.npmrc',
  '.pypirc',
  '.netrc',
  'credentials',
  'credentials.json',
  'secrets.json',
  'secret.json',
  'id_rsa',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
]);

export const SENSITIVE_SUFFIXES = new Set([
  '.pem',
  '.key',
  '.p12',
  '.pfx',
  '.jks',
  '.keystore',
  '.kdbx',
]);

export const SAFE_SENSITIVE_EXAMPLES = new Set([
  '.env.example',
  '.env.sample',
  '.env.template',
  'credentials.example.json',
  'secrets.example.json',
]);

export const KNOWN_BINARY_SUFFIXES = new Set([
  '.7z', '.a', '.avi', '.bin', '.bmp', '.class', '.db', '.dll',
  '.dmg', '.doc', '.docx', '.eot', '.exe', '.flac', '.gif', '.gz',
  '.ico', '.jar', '.jpeg', '.jpg', '.lib', '.lockb', '.m4a', '.mkv',
  '.mov', '.mp3', '.mp4', '.o', '.obj', '.otf', '.parquet', '.pdf',
  '.pkl', '.png', '.ppt', '.pptx', '.pyc', '.rar', '.so', '.sqlite',
  '.sqlite3', '.tar', '.tif', '.tiff', '.ttf', '.wav', '.webm',
  '.webp', '.woff', '.woff2', '.xls', '.xlsx', '.xz', '.zip',
]);

export const IMPORTANT_BASENAMES = new Set([
  'agents.md', 'claude.md', 'gemini.md', 'readme', 'readme.md',
  'readme.rst', 'readme.txt', 'contributing.md', 'contributing.rst',
  'security.md', 'code_of_conduct.md', 'changelog.md', 'changes.md',
  'license', 'license.md', 'license.txt', 'copying', 'notice',
  'package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock',
  'pnpm-lock.yaml', 'bun.lock', 'pyproject.toml', 'poetry.lock', 'pdm.lock',
  'uv.lock', 'requirements.txt', 'requirements-dev.txt', 'setup.py',
  'setup.cfg', 'tox.ini', 'pytest.ini', 'mypy.ini', 'ruff.toml', '.ruff.toml',
  'pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle',
  'settings.gradle.kts', 'gradle.properties', 'go.mod', 'go.sum',
  'cargo.toml', 'cargo.lock', 'composer.json', 'composer.lock', 'gemfile',
  'gemfile.lock', 'dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  'compose.yml', 'compose.yaml', 'makefile', 'justfile', 'taskfile.yml',
  'taskfile.yaml', '.editorconfig', '.gitignore', '.gitattributes',
  '.dockerignore', '.pre-commit-config.yaml', 'tsconfig.json', 'jsconfig.json',
  'vite.config.js', 'vite.config.ts', 'webpack.config.js', 'webpack.config.ts',
  'next.config.js', 'next.config.mjs', 'next.config.ts', 'nuxt.config.js',
  'nuxt.config.ts', 'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs',
  'prettier.config.js', 'prettier.config.cjs', 'prettier.config.mjs',
  'sonar-project.properties', 'renovate.json', 'dependabot.yml',
]);

export const LANGUAGE_BY_SUFFIX: Readonly<Record<string, string>> = {
  '.bat': 'batch', '.c': 'c', '.cc': 'cpp', '.cfg': 'ini', '.cmd': 'batch',
  '.conf': 'ini', '.cpp': 'cpp', '.cs': 'csharp', '.css': 'css', '.csv': 'csv',
  '.dart': 'dart', '.dockerfile': 'dockerfile', '.fs': 'fsharp', '.go': 'go',
  '.gradle': 'groovy', '.graphql': 'graphql', '.gql': 'graphql', '.h': 'c',
  '.hpp': 'cpp', '.htm': 'html', '.html': 'html', '.ini': 'ini', '.ipynb': 'json',
  '.java': 'java', '.js': 'javascript', '.json': 'json', '.jsx': 'jsx', '.kt': 'kotlin',
  '.kts': 'kotlin', '.less': 'less', '.lua': 'lua', '.md': 'markdown', '.mdc': 'markdown',
  '.mjs': 'javascript', '.php': 'php', '.pl': 'perl', '.properties': 'properties',
  '.proto': 'protobuf', '.ps1': 'powershell', '.py': 'python', '.rb': 'ruby', '.rs': 'rust',
  '.rst': 'rst', '.sass': 'sass', '.scala': 'scala', '.scss': 'scss', '.sh': 'bash',
  '.sql': 'sql', '.svelte': 'svelte', '.swift': 'swift', '.toml': 'toml',
  '.ts': 'typescript', '.tsx': 'tsx', '.txt': 'text', '.vue': 'vue', '.xml': 'xml',
  '.yaml': 'yaml', '.yml': 'yaml',
};

export const SPECIAL_LANGUAGES: Readonly<Record<string, string>> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  gemfile: 'ruby',
  rakefile: 'ruby',
};
