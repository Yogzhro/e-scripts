'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const workspace = path.resolve(__dirname, '..');
const builderPath = path.join(workspace, 'resource', 'HV Monster Portraits', 'build-assets.js');
assert(fs.existsSync(builderPath), 'missing portrait asset builder');
const { RACE_KEYS, loadSharp, buildAssets, buildDevCopy } = require(builderPath);

(async () => {
  const sharp = loadSharp();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hvmp-assets-'));
  const assetRoot = path.join(tempRoot, 'resource', 'HV Monster Portraits');
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
  assert.equal(spriteMeta.width, 1352);
  assert.equal(spriteMeta.height, 144);
  assert(fs.statSync(outputs.sprite).size <= 300 * 1024);
  for (const detail of outputs.details) {
    const metadata = await sharp(detail).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, 600);
    assert.equal(metadata.height, 900);
    assert(fs.statSync(detail).size <= 220 * 1024);
  }

  const production = fs.readFileSync(path.join(workspace, 'HV Monster Portraits.js'), 'utf8');
  const localWorkspace = path.join(tempRoot, 'workspace');
  fs.mkdirSync(localWorkspace, { recursive: true });
  const localProduction = path.join(localWorkspace, 'HV Monster Portraits.js');
  fs.writeFileSync(localProduction, production);
  const devPath = await buildDevCopy(assetRoot, localProduction);
  const devSource = fs.readFileSync(devPath, 'utf8');
  assert(devSource.includes('// @name         HV Monster Portraits (Local Dev)'));
  assert(devSource.includes('data:image/webp;base64,'));
  assert(!devSource.includes('D:\\trans\\scripts'));
  assert(devSource.length > production.length);

  try {
    fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    if (error.code !== 'EPERM') throw error;
  }
  console.log('HV Monster Portraits asset tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
