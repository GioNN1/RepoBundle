import fs from 'node:fs';

for (const directory of ['dist', '.test-dist']) {
  fs.rmSync(directory, { recursive: true, force: true });
}
