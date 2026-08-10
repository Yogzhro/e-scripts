'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RACE_KEYS = [
  'arthropod', 'avion', 'beast', 'celestial', 'daimon', 'dragonkin', 'elemental',
  'giant', 'humanoid', 'mechanoid', 'reptilian', 'sprite', 'undead',
];

function loadSharp() {
  try {
    return require('sharp');
  } catch (error) {
    const bundled = path.resolve(path.dirname(process.execPath), '..', 'node_modules', 'sharp');
    if (fs.existsSync(bundled)) return require(bundled);
    throw new Error(`Sharp is required to build portraits: ${error.message}`);
  }
}

async function encodeWebp(sharp, input, width, height, maxBytes) {
  for (const quality of [86, 82, 78, 74, 70]) {
    const output = await sharp(input).resize(width, height, { fit: 'cover', position: 'attention' })
      .webp({ quality, effort: 6, smartSubsample: true }).toBuffer();
    if (output.length <= maxBytes) return output;
  }
  throw new Error(`Unable to compress ${width}x${height} WebP below ${maxBytes} bytes`);
}

function requireSources(directory) {
  const missing = RACE_KEYS.filter(key => !fs.existsSync(path.join(directory, `${key}.webp`)));
  if (missing.length) throw new Error(`Missing portrait sources in ${directory}: ${missing.join(', ')}`);
}

async function buildAssets(assetRoot = __dirname) {
  const sharp = loadSharp();
  const listSource = path.join(assetRoot, 'source', 'list');
  const detailSource = path.join(assetRoot, 'source', 'detail');
  requireSources(listSource);
  requireSources(detailSource);

  const dist = path.join(assetRoot, 'dist');
  const detailDist = path.join(dist, 'detail');
  fs.mkdirSync(detailDist, { recursive: true });
  const frames = [];
  for (const [index, key] of RACE_KEYS.entries()) {
    const input = path.join(listSource, `${key}.webp`);
    const frame = await sharp(input).resize(104, 144, {
      fit: 'contain',
      position: 'centre',
      background: '#171418',
    }).png().toBuffer();
    frames.push({ input: frame, left: index * 104, top: 0 });
  }
  const canvas = await sharp({
    create: { width: 1352, height: 144, channels: 4, background: '#171418' },
  }).composite(frames).png().toBuffer();
  const sprite = path.join(dist, 'list-sprite.webp');
  fs.writeFileSync(sprite, await encodeWebp(sharp, canvas, 1352, 144, 300 * 1024));

  const details = [];
  for (const key of RACE_KEYS) {
    const output = path.join(detailDist, `${key}.webp`);
    fs.writeFileSync(output, await encodeWebp(
      sharp,
      path.join(detailSource, `${key}.webp`),
      600,
      900,
      220 * 1024
    ));
    details.push(output);
  }
  return { sprite, details };
}

async function buildDevCopy(assetRoot = __dirname, productionPath = path.resolve(assetRoot, '..', '..', 'dokidoki.js')) {
  const dist = path.join(assetRoot, 'dist');
  const files = [['list', path.join(dist, 'list-sprite.webp')], ...RACE_KEYS.map(key => [key, path.join(dist, 'detail', `${key}.webp`)])];
  const missing = files.filter(([, file]) => !fs.existsSync(file)).map(([key]) => key);
  if (missing.length) throw new Error(`Missing built portrait assets: ${missing.join(', ')}`);
  const assets = Object.fromEntries(files.map(([key, file]) => [
    key,
    `data:image/webp;base64,${fs.readFileSync(file).toString('base64')}`,
  ]));
  const marker = 'const DEV_ASSETS = null;';
  const production = fs.readFileSync(productionPath, 'utf8');
  if (!production.includes(marker)) throw new Error('Production DEV_ASSETS marker was not found');
  const output = production
    .replace('// @name         dokidoki', '// @name         dokidoki (Local Dev)')
    .replace(marker, `const DEV_ASSETS = ${JSON.stringify(assets)};`);
  const devDirectory = path.join(assetRoot, '.dev');
  fs.mkdirSync(devDirectory, { recursive: true });
  const devPath = path.join(devDirectory, 'dokidoki.dev.user.js');
  fs.writeFileSync(devPath, output);
  return devPath;
}

async function main() {
  const command = process.argv[2] || 'all';
  if (!['all', 'dist', 'dev'].includes(command)) throw new Error('Usage: node build-assets.js [all|dist|dev]');
  if (command !== 'dev') await buildAssets();
  if (command !== 'dist') await buildDevCopy();
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { RACE_KEYS, loadSharp, buildAssets, buildDevCopy };
