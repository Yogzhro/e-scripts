'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const workspace = path.resolve(__dirname, '..');
const builderPath = path.join(workspace, 'resource', 'dokidoki', 'build-assets.js');
assert(fs.existsSync(builderPath), 'missing portrait asset builder');
const { RACE_KEYS, loadSharp, buildAssets, buildDevCopy } = require(builderPath);

function gitFiles() {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: workspace,
    encoding: 'utf8',
  }).split('\0').filter(file => file && fs.existsSync(path.join(workspace, file)));
}

(async () => {
  const sharp = loadSharp();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dokidoki-assets-'));
  const assetRoot = path.join(tempRoot, 'resource', 'dokidoki');
  const listSource = path.join(assetRoot, 'source', 'list');
  const detailSource = path.join(assetRoot, 'source', 'detail');
  fs.mkdirSync(listSource, { recursive: true });
  fs.mkdirSync(detailSource, { recursive: true });

  for (const [index, key] of RACE_KEYS.entries()) {
    const color = {
      r: (index * 37 + 30) % 255,
      g: (index * 61 + 50) % 255,
      b: (index * 83 + 70) % 255,
      alpha: 1,
    };
    await sharp({ create: { width: 130, height: 180, channels: 4, background: color } })
      .webp({ quality: 90 }).toFile(path.join(listSource, `${key}.webp`));
    await sharp({ create: { width: 200, height: 300, channels: 4, background: color } })
      .webp({ quality: 90 }).toFile(path.join(detailSource, `${key}.webp`));
  }

  const outputs = await buildAssets(assetRoot);
  assert.equal(outputs.details.length, 13);
  const spriteMeta = await sharp(outputs.sprite).metadata();
  assert.equal(spriteMeta.format, 'webp');
  assert.equal(spriteMeta.width, 2184);
  assert.equal(spriteMeta.height, 252);
  assert(fs.statSync(outputs.sprite).size <= 300 * 1024);
  for (const detail of outputs.details) {
    const metadata = await sharp(detail).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, 600);
    assert.equal(metadata.height, 900);
    assert(fs.statSync(detail).size <= 220 * 1024);
  }

  const production = fs.readFileSync(path.join(workspace, 'dokidoki.js'), 'utf8');
  const localWorkspace = path.join(tempRoot, 'workspace');
  fs.mkdirSync(localWorkspace, { recursive: true });
  const localProduction = path.join(localWorkspace, 'dokidoki.js');
  fs.writeFileSync(localProduction, production);
  const devPath = await buildDevCopy(assetRoot, localProduction);
  const devSource = fs.readFileSync(devPath, 'utf8');
  assert(devSource.includes('// @name         dokidoki (Local Dev)'));
  assert(devSource.includes('data:image/webp;base64,'));
  assert(!devSource.includes('D:\\trans\\scripts'));
  assert(devSource.length > production.length);

  const realRoot = path.join(workspace, 'resource', 'dokidoki');
  const realList = path.join(realRoot, 'source', 'list');
  const realDetail = path.join(realRoot, 'source', 'detail');
  const realDist = path.join(realRoot, 'dist');
  const webps = directory => fs.readdirSync(directory).filter(file => file.endsWith('.webp')).sort();
  const expected = RACE_KEYS.map(key => `${key}.webp`).sort();
  assert.deepEqual(webps(realList), expected, 'production list sources must contain exactly 13 races');
  assert.deepEqual(webps(realDetail), expected, 'production detail sources must contain exactly 13 races');
  for (const directory of [realList, realDetail]) {
    for (const file of expected) {
      const metadata = await sharp(path.join(directory, file)).metadata();
      assert.equal(metadata.format, 'webp');
      assert(metadata.width >= 600 && metadata.height >= 900 && metadata.height > metadata.width,
        `${path.join(directory, file)} is not a high-resolution portrait source`);
    }
  }

  const realSprite = path.join(realDist, 'list-sprite.webp');
  const realSpriteMeta = await sharp(realSprite).metadata();
  assert.deepEqual([realSpriteMeta.format, realSpriteMeta.width, realSpriteMeta.height], ['webp', 2184, 252]);
  assert(fs.statSync(realSprite).size <= 300 * 1024);
  const realDetailDist = path.join(realDist, 'detail');
  assert.deepEqual(webps(realDetailDist), expected, 'production detail dist must contain exactly 13 races');
  for (const file of expected) {
    const fullPath = path.join(realDetailDist, file);
    const metadata = await sharp(fullPath).metadata();
    assert.deepEqual([metadata.format, metadata.width, metadata.height], ['webp', 600, 900]);
    assert(fs.statSync(fullPath).size <= 220 * 1024, `${file} exceeds the detail CDN size cap`);
  }

  const repositoryFiles = gitFiles();
  const normalizedFiles = repositoryFiles.map(file => file.replaceAll('\\', '/'));
  assert(!normalizedFiles.some(file => /(^|\/)(?:reference|\.agents)(?:\/|$)|(^|\/)prompt\.txt$/i.test(file)),
    'private development paths must not be tracked');
  assert(!normalizedFiles.some(file => /HV Monster Portraits|hv_monster_portraits/i.test(file)),
    'old project filenames must be removed');
  assert(!repositoryFiles.some(file => file.replaceAll('\\', '/').includes('resource/dokidoki/.dev/')),
    'local development outputs must remain ignored');
  const sizes = repositoryFiles.map(file => ({ file, size: fs.statSync(path.join(workspace, file)).size }));
  const repositorySize = sizes.reduce((sum, item) => sum + item.size, 0);
  assert(repositorySize < 45 * 1024 * 1024, `repository payload is ${(repositorySize / 1024 / 1024).toFixed(2)} MiB`);
  const largest = sizes.reduce((max, item) => item.size > max.size ? item : max, { file: '', size: 0 });
  assert(largest.size < 20 * 1024 * 1024, `${largest.file} exceeds the 20 MiB file cap`);

  try {
    fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    if (error.code !== 'EPERM') throw error;
  }
  console.log('dokidoki asset tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
