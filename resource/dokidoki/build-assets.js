'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RACE_KEYS = [
  'arthropod', 'avion', 'beast', 'celestial', 'daimon', 'dragonkin', 'elemental',
  'giant', 'humanoid', 'mechanoid', 'reptilian', 'sprite', 'undead',
];
const PREVIEW_VERSION = '0.2.0.0';
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function storedZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const filename = Buffer.from(name.replaceAll('\\', '/'));
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034B50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(33, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    localParts.push(local, filename, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014B50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(33, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, filename);
    offset += local.length + filename.length + data.length;
  }
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054B50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, central, end]);
}

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
    const frame = await sharp(input).resize(168, 252, {
      fit: 'contain',
      position: 'centre',
      background: '#171418',
    }).png().toBuffer();
    frames.push({ input: frame, left: index * 168, top: 0 });
  }
  const canvas = await sharp({
    create: { width: 2184, height: 252, channels: 4, background: '#171418' },
  }).composite(frames).png().toBuffer();
  const sprite = path.join(dist, 'list-sprite.webp');
  fs.writeFileSync(sprite, await encodeWebp(sharp, canvas, 2184, 252, 300 * 1024));

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

async function buildPreviewPackage(
  workspace = path.resolve(__dirname, '..', '..'),
  output = path.join(__dirname, '.release', `dokidoki-preview-v${PREVIEW_VERSION}.zip`)
) {
  const files = [
    'dokidoki-preview.html',
    'dokidoki.js',
    'resource/dokidoki/dist/list-sprite.webp',
    ...RACE_KEYS.map(key => `resource/dokidoki/dist/detail/${key}.webp`),
  ];
  const missing = files.filter(file => !fs.existsSync(path.join(workspace, file)));
  if (missing.length) throw new Error(`Missing preview files: ${missing.join(', ')}`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, storedZip(files.map(name => ({
    name,
    data: fs.readFileSync(path.join(workspace, name)),
  }))));
  return { output, files };
}

async function main() {
  const command = process.argv[2] || 'all';
  if (!['all', 'dist', 'dev', 'preview'].includes(command)) {
    throw new Error('Usage: node build-assets.js [all|dist|dev|preview]');
  }
  if (command === 'all' || command === 'dist') await buildAssets();
  if (command === 'all' || command === 'dev') await buildDevCopy();
  if (command === 'all' || command === 'preview') await buildPreviewPackage();
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { RACE_KEYS, loadSharp, buildAssets, buildDevCopy, buildPreviewPackage };
