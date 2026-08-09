'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const fixturePath = path.join(__dirname, '_eh_tag_transfer_fixture_server.js');
const scriptPath = path.join(projectRoot, 'eh-tag-transfer.js');
const documentationPath = path.join(projectRoot, 'readme', 'e-hentai-跨语言Tag迁移-开发说明.md');
const syntaxFiles = [
    'eh-tag-transfer.js',
    'test/_eh_tag_transfer_all_test.js',
    'test/_eh_tag_transfer_core_test.js',
    'test/_eh_tag_transfer_home_30min_simulation_test.js',
    'test/_eh_tag_transfer_live_mode_test.js',
    'test/_eh_tag_transfer_semantic_names_test.js',
    'test/_eh_tag_transfer_fixture_server.js'
];
const automatedSuites = [
    ['核心测试', 'test/_eh_tag_transfer_core_test.js'],
    ['主页 30 分钟模拟', 'test/_eh_tag_transfer_home_30min_simulation_test.js'],
    ['正式模式与源码排版审计', 'test/_eh_tag_transfer_live_mode_test.js'],
    ['语义命名审计', 'test/_eh_tag_transfer_semantic_names_test.js']
];

function readScriptVersion(source) {
    const version = source.match(/\/\/ @version\s+(\d+\.\d+\.\d+\.\d+)/)?.[1];
    assert.ok(version, '主脚本缺少四段 @version');
    return version;
}

function runNode(args, label) {
    console.log(`\n=== ${label} ===`);
    const result = childProcess.spawnSync(process.execPath, args, {
        cwd: projectRoot,
        stdio: 'inherit'
    });
    if (result.error) throw result.error;
    assert.equal(
        result.status,
        0,
        `${label} 失败${result.signal ? `（${result.signal}）` : ''}`
    );
}

function requestText(url) {
    return new Promise((resolve, reject) => {
        const request = http.get(url, {timeout: 2000}, response => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => {
                body += chunk;
            });
            response.on('end', () => {
                resolve({statusCode: response.statusCode, body});
            });
        });
        request.on('timeout', () => request.destroy(new Error(`请求超时：${url}`)));
        request.on('error', reject);
    });
}

function delay(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close(error => {
                if (error) reject(error);
                else resolve(address.port);
            });
        });
    });
}

async function waitForFixture(baseUrl, child, readOutput) {
    for (let attempt = 0; attempt < 50; attempt++) {
        if (child.exitCode !== null) {
            throw new Error(`夹具服务器提前退出：${readOutput()}`);
        }
        try {
            return await requestText(`${baseUrl}/?reset=1`);
        } catch {
            await delay(100);
        }
    }
    throw new Error(`夹具服务器启动超时：${readOutput()}`);
}

async function stopChild(child) {
    if (child.exitCode !== null) return;
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await Promise.race([exited, delay(2000)]);
    if (child.exitCode === null) {
        child.kill('SIGKILL');
        await exited;
    }
}

async function runFixtureSmokeTest() {
    console.log('\n=== 本地浏览器夹具 HTTP 烟测 ===');
    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    let stdout = '';
    let stderr = '';
    const child = childProcess.spawn(process.execPath, [fixturePath], {
        cwd: projectRoot,
        env: {...process.env, EH_TAG_TRANSFER_FIXTURE_PORT: String(port)},
        stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', chunk => {
        stdout += chunk;
    });
    child.stderr.on('data', chunk => {
        stderr += chunk;
    });

    try {
        const homepage = await waitForFixture(baseUrl, child, () => `${stdout}\n${stderr}`.trim());
        assert.equal(homepage.statusCode, 200);
        assert.match(homepage.body, /tag-transfer\.user\.js/);

        const userScript = await requestText(`${baseUrl}/tag-transfer.user.js`);
        assert.equal(userScript.statusCode, 200);
        const fixtureVersion = readScriptVersion(userScript.body);
        assert.equal(fixtureVersion, readScriptVersion(fs.readFileSync(scriptPath, 'utf8')));
        assert.match(userScript.body, /const SCRIPT_PARAMETERS = Object\.freeze\(/);

        const transientFailure = await requestText(`${baseUrl}/bad-tags`);
        assert.equal(transientFailure.statusCode, 503);
        const badTags = await requestText(`${baseUrl}/bad-tags`);
        assert.equal(badTags.statusCode, 200);
        assert.match(badTags.body, /female:lactation/);

        const auditResponse = await requestText(`${baseUrl}/fixture/requests`);
        assert.equal(auditResponse.statusCode, 200);
        const audit = JSON.parse(auditResponse.body);
        assert.ok(audit['/'] >= 1);
        assert.equal(audit['/tag-transfer.user.js'], 1);
        assert.equal(audit['/bad-tags'], 2);
        assert.deepEqual(audit.__searchRequests, []);
        assert.deepEqual(audit.__tagVotes, []);
        console.log('E-Hentai fixture HTTP smoke test passed');
    } finally {
        await stopChild(child);
    }
}

function runDocumentationAudit() {
    console.log('\n=== 测试文档一致性审计 ===');
    const source = fs.readFileSync(scriptPath, 'utf8');
    const documentation = fs.readFileSync(documentationPath, 'utf8');
    const version = readScriptVersion(source);
    const versionLine = `- 当前版本：` + '`' + version + '`';
    assert.ok(documentation.includes(versionLine), `开发说明版本未同步：${version}`);
    for (const file of syntaxFiles.filter(file => file.startsWith('test/'))) {
        assert.ok(documentation.includes(file), `开发说明缺少测试文件：${file}`);
    }
    assert.match(documentation, /node test\/_eh_tag_transfer_all_test\.js\s*\n/);
    assert.match(documentation, /node test\/_eh_tag_transfer_all_test\.js --fixture/);
    console.log('E-Hentai test documentation audit passed');
}

async function runAutomatedTests() {
    console.log('E-Hentai Tag Transfer unified test runner');
    for (const file of syntaxFiles) {
        runNode(['--check', file], `语法检查：${file}`);
    }
    for (const [label, file] of automatedSuites) {
        runNode([file], label);
    }
    await runFixtureSmokeTest();
    runDocumentationAudit();
    console.log('\nE-Hentai Tag Transfer all automated tests passed');
}

function printHelp() {
    console.log(`用法：
  node test/_eh_tag_transfer_all_test.js            运行全部自动测试
  node test/_eh_tag_transfer_all_test.js --fixture  启动本地 Chrome 浏览器夹具
  node test/_eh_tag_transfer_all_test.js --help     显示本帮助`);
}

const options = new Set(process.argv.slice(2));
if (options.has('--help')) {
    printHelp();
} else if (options.has('--fixture')) {
    console.log('启动本地浏览器夹具；按 Ctrl+C 停止。');
    require(fixturePath);
} else if (options.size) {
    console.error(`未知参数：${[...options].join(' ')}`);
    printHelp();
    process.exitCode = 1;
} else {
    runAutomatedTests().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
