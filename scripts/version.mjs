import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = {
  app: resolve(root, 'app.json'),
  changelog: resolve(root, 'CHANGELOG.md'),
  package: resolve(root, 'package.json'),
  lock: resolve(root, 'package-lock.json'),
};

const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

async function readJson(path) {
  const source = await readFile(path, 'utf8');
  return { data: JSON.parse(source), newline: source.includes('\r\n') ? '\r\n' : '\n' };
}

async function writeJson(path, data, newline) {
  const content = `${JSON.stringify(data, null, 2)}\n`.replaceAll('\n', newline);
  await writeFile(path, content, 'utf8');
}

function parseVersion(value, label) {
  const match = semverPattern.exec(String(value ?? ''));
  if (!match) throw new Error(`${label} must use MAJOR.MINOR.PATCH format.`);
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function nextVersion(current, release) {
  const [major, minor, patch] = parseVersion(current, 'Current version');
  if (release === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (release === 'minor') return `${major}.${minor + 1}.0`;
  if (release === 'major') return `${major + 1}.0.0`;
  parseVersion(release, 'Target version');
  if (compareVersions(parseVersion(release, 'Target version'), [major, minor, patch]) <= 0) {
    throw new Error(`Target version ${release} must be greater than ${current}.`);
  }
  return release;
}

function validateVersions(app, pkg, lock, changelog) {
  const packageVersion = String(pkg.version ?? '');
  const versions = new Map([
    ['package.json', packageVersion],
    ['package-lock.json', String(lock.version ?? '')],
    ['package-lock.json workspace', String(lock.packages?.['']?.version ?? '')],
    ['app.json', String(app.expo?.version ?? '')],
  ]);

  parseVersion(packageVersion, 'package.json version');
  const mismatches = [...versions].filter(([, version]) => version !== packageVersion);
  if (mismatches.length) {
    const details = [...versions].map(([label, version]) => `${label}: ${version || '<missing>'}`).join(', ');
    throw new Error(`App versions are not synchronized. ${details}`);
  }

  const iosBuild = String(app.expo?.ios?.buildNumber ?? '');
  const androidBuild = app.expo?.android?.versionCode;
  if (!/^[1-9]\d*$/.test(iosBuild)) throw new Error('ios.buildNumber must be a positive integer string.');
  if (!Number.isInteger(androidBuild) || androidBuild < 1) throw new Error('android.versionCode must be a positive integer.');
  if (Number(iosBuild) !== androidBuild) {
    throw new Error(`Native build numbers are not synchronized. iOS: ${iosBuild}, Android: ${androidBuild}`);
  }
  if (!changelog.includes(`## [${packageVersion}]`)) {
    throw new Error(`CHANGELOG.md does not contain an entry for ${packageVersion}.`);
  }

  return { version: packageVersion, build: androidBuild };
}

const [appFile, packageFile, lockFile, changelog] = await Promise.all([
  readJson(files.app),
  readJson(files.package),
  readJson(files.lock),
  readFile(files.changelog, 'utf8'),
]);

const current = validateVersions(appFile.data, packageFile.data, lockFile.data, changelog);
const command = process.argv[2] ?? 'patch';

if (command === '--check') {
  console.log(`Version OK: ${current.version} (build ${current.build}).`);
  process.exit(0);
}

const version = nextVersion(current.version, command);
const build = current.build + 1;

packageFile.data.version = version;
lockFile.data.version = version;
lockFile.data.packages[''].version = version;
appFile.data.expo.version = version;
appFile.data.expo.ios.buildNumber = String(build);
appFile.data.expo.android.versionCode = build;

await Promise.all([
  writeJson(files.app, appFile.data, appFile.newline),
  writeJson(files.package, packageFile.data, packageFile.newline),
  writeJson(files.lock, lockFile.data, lockFile.newline),
]);

console.log(`Version bumped: ${current.version} -> ${version} (build ${build}).`);
console.log('Update CHANGELOG.md before committing the release.');
