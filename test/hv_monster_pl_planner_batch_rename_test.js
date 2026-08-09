'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const scriptPath = path.resolve(__dirname, '..', 'HV Monster Manager.js');
const source = fs.readFileSync(scriptPath, 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing production function: ${name}`);

  const braceStart = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (let index = braceStart; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }

  throw new Error(`Unterminated production function: ${name}`);
}

function loadFunction(name, dependencies = {}) {
  return Function(
    ...Object.keys(dependencies),
    `"use strict"; return (${extractFunction(name)});`
  )(...Object.values(dependencies));
}

const canonicalMonsterName = loadFunction('canonicalMonsterName');
const parseRenameMappings = loadFunction('parseRenameMappings', { canonicalMonsterName });

const validMappings = parseRenameMappings(
  '\uFEFF1,Alpha,New Alpha\r\n\r\n2,Beta,New Beta\n'
);
assert.deepEqual(validMappings, {
  entries: [
    { line: 1, slot: '1', sourceName: 'Alpha', targetName: 'New Alpha' },
    { line: 3, slot: '2', sourceName: 'Beta', targetName: 'New Beta' },
  ],
  errors: [],
});

const invalidMappings = parseRenameMappings([
  'Missing comma',
  'x,Alpha,New Alpha',
  '1,Alpha,',
  '1,Alpha,New Alpha',
  '1,alpha,Another',
  '2,Alpha,Other',
  '3,Beta,NEW ALPHA',
  '4,Too,many,commas',
].join('\n'));
assert.deepEqual(
  invalidMappings.errors.map(({ line, code }) => ({ line, code })),
  [
    { line: 1, code: 'format' },
    { line: 2, code: 'invalid-slot' },
    { line: 3, code: 'empty-name' },
    { line: 5, code: 'duplicate-slot' },
    { line: 6, code: 'duplicate-source' },
    { line: 7, code: 'duplicate-target' },
    { line: 8, code: 'format' },
  ]
);

const serializeRenameMappings = loadFunction('serializeRenameMappings');
assert.equal(
  serializeRenameMappings([
    { index: '10', name: 'Ten' },
    { index: '2', name: 'Beta' },
    { index: '1', name: 'Alpha' },
  ]),
  '1,Alpha,\n2,Beta,\n10,Ten,\n'
);

const buildTextRenameTargets = loadFunction('buildTextRenameTargets', {
  canonicalMonsterName,
});
assert.deepEqual(
  buildTextRenameTargets([
    { index: '1', name: 'Alpha' },
    { index: '2', name: 'Beta' },
  ], validMappings.entries),
  {
    targets: [
      {
        slot: '1',
        currentName: 'Alpha',
        targetName: 'New Alpha',
        mode: 'text',
      },
      {
        slot: '2',
        currentName: 'Beta',
        targetName: 'New Beta',
        mode: 'text',
      },
    ],
    issues: [],
  }
);
assert.deepEqual(
  buildTextRenameTargets(
    [{ index: '1', name: 'Alpha' }],
    [{ line: 7, slot: '9', sourceName: 'Unknown', targetName: 'New Name' }]
  ).issues,
  [{
    line: 7,
    code: 'slot-not-found',
    slot: '9',
    sourceName: 'Unknown',
    targetName: 'New Name',
  }]
);
assert.deepEqual(
  buildTextRenameTargets(
    [{ index: '1', name: 'Alpha' }],
    [{ line: 8, slot: '1', sourceName: 'Stale Name', targetName: 'New Name' }]
  ).issues,
  [{
    line: 8,
    code: 'source-mismatch',
    slot: '1',
    sourceName: 'Stale Name',
    targetName: 'New Name',
    actualName: 'Alpha',
  }]
);

const createRandomRenameCandidate = loadFunction('createRandomRenameCandidate', {
  canonicalMonsterName,
  RANDOM_RENAME_DIGITS: 6,
  RANDOM_RENAME_CANDIDATE_ATTEMPTS: 100,
});
const randomValues = [0.123456, 0.654321];
const candidate = createRandomRenameCandidate(
  'Monster',
  new Set(['monster123456']),
  () => randomValues.shift()
);
assert.equal(candidate, 'Monster654321');
assert.equal(createRandomRenameCandidate('  ', new Set(), () => 0.5), '');

const parseMonsterRenameResult = loadFunction('parseMonsterRenameResult', {
  canonicalMonsterName,
});
const fakeDoc = (name) => ({
  querySelector() {
    return name === null ? null : { textContent: name };
  },
});
assert.deepEqual(
  parseMonsterRenameResult(fakeDoc('New Alpha'), 'Alpha', 'New Alpha'),
  { status: 'success', actualName: 'New Alpha' }
);
assert.deepEqual(
  parseMonsterRenameResult(fakeDoc('Alpha'), 'Alpha', 'New Alpha'),
  { status: 'occupied', actualName: 'Alpha' }
);
assert.deepEqual(
  parseMonsterRenameResult(fakeDoc('Concurrent Name'), 'Alpha', 'New Alpha'),
  { status: 'unexpected', actualName: 'Concurrent Name' }
);
assert.deepEqual(
  parseMonsterRenameResult(fakeDoc(null), 'Alpha', 'New Alpha'),
  { status: 'invalid', actualName: '' }
);

const renameWithCollisionHandling = loadFunction('renameWithCollisionHandling', {
  canonicalMonsterName,
  createRandomRenameCandidate,
  RANDOM_RENAME_MAX_ATTEMPTS: 8,
});

(async () => {
  const requestedNames = [];
  const retryValues = [0.111111, 0.222222];
  const randomResult = await renameWithCollisionHandling(
    {
      slot: '9',
      currentName: 'Old Name',
      prefix: 'Monster',
      mode: 'random',
    },
    new Set(),
    async (_slot, previousName, requestedName) => {
      requestedNames.push(requestedName);
      return requestedNames.length === 1
        ? { status: 'occupied', actualName: previousName }
        : { status: 'success', actualName: requestedName };
    },
    () => retryValues.shift()
  );
  assert.deepEqual(requestedNames, ['Monster111111', 'Monster222222']);
  assert.deepEqual(randomResult, {
    status: 'success',
    actualName: 'Monster222222',
    requestedName: 'Monster222222',
    attempts: 2,
  });

  let textRequests = 0;
  const textResult = await renameWithCollisionHandling(
    {
      slot: '10',
      currentName: 'Alpha',
      targetName: 'Taken Name',
      mode: 'text',
    },
    new Set(),
    async (_slot, previousName) => {
      textRequests++;
      return { status: 'occupied', actualName: previousName };
    }
  );
  assert.equal(textRequests, 1);
  assert.deepEqual(textResult, {
    status: 'occupied',
    actualName: 'Alpha',
    requestedName: 'Taken Name',
    attempts: 1,
  });

  console.log('HV Monster PL Planner batch rename tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
