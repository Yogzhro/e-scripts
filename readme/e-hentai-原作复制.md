# E-Hentai 原作标签 Alt+左键复制

## 用途

在 E-Hentai 画廊详情页 Alt+左键点击“原作”标签时，将 E-Hentai 的英文原始主标签按 `出自作品:'标签内容'` 格式写入剪贴板。脚本兼容 EhSyringe 翻译后的标签显示，并优先使用 EhSyringe 保留的原始标签值。

作者：reina  
当前版本：`0.1.3.1`

## 适用页面

脚本仅在以下形式的 E-Hentai 画廊详情页运行：

```text
https://e-hentai.org/g/<画廊 ID>/<画廊令牌>/
```

## 安装方式

1. 在浏览器中安装并启用 Tampermonkey。
2. 将 `e-hentai-原作复制.js` 导入 Tampermonkey 并保存。
3. 安装或更新脚本后，刷新已经打开的 E-Hentai 画廊页面。

## 使用方式

按住 Alt，左键点击画廊标签列表中的“原作”标签。复制成功后，页面底部会显示绿色提示；无法识别标签或写入剪贴板失败时会显示红色提示。

例如，页面原始标签为 `chou kaguya-hime | cosmic princess kaguya` 时，脚本复制：

```text
出自作品:'chou kaguya-hime'
```

## 主要功能

- 在 `document-start` 阶段挂载委托点击监听，避免快速加载的画廊在用户首次点击时尚未完成脚本初始化。
- 从 EhSyringe 的 `ehs-tag` 属性读取翻译前的英文标签，并去除 `|` 后的别名。
- 未安装 EhSyringe 时，从 E-Hentai 原始标签链接或 `title` 属性恢复标签。
- 阻止匹配点击触发标签菜单或浏览器的 Alt+左键默认动作。
- 使用页面提示反馈复制结果，不插入常驻操作按钮。

## 必要权限

- `@match https://e-hentai.org/g/*/*`：仅在 E-Hentai 画廊详情页注入。
- `GM_setClipboard`：把格式化后的原作标签写入系统剪贴板。

脚本不发送网络请求，也不读取账号凭证、Cookie 或其他页面存储。

## 已知限制

- 仅支持 `e-hentai.org`，不在 ExHentai、低保真页面或标签搜索页运行。
- 页面必须存在 E-Hentai 的 `parody` 原作标签；没有原作标签时不会触发复制。
- 使用方式依赖桌面浏览器的 Alt 键，触屏设备需要外接键盘。
- 安装、启用或更新用户脚本后，浏览器不会把脚本自动注入已加载完成的旧页面，必须刷新这些页面。

## 独立测试

测试文件：`test/e_hentai_parody_tag_copy_test.js`

测试目的：在不访问网站、不依赖 Tampermonkey 的环境中验证元数据、初始化时机、事件委托、原始标签解析、剪贴板格式和页面范围判断。

运行命令：

```powershell
node test\e_hentai_parody_tag_copy_test.js
```

测试使用最小 DOM 夹具模拟目标画廊 `4084701/6a82725332` 的原作链接，其中 `ehs-tag` 为 `chou kaguya-hime | cosmic princess kaguya`，并验证 `document.body` 尚未创建时即可安全挂载监听，同时覆盖链接回退解析、嵌套点击目标、非 Alt 点击和非画廊页面。预期结果为 4 个场景全部通过，并输出：

```text
e_hentai_parody_tag_copy_test: 4 scenarios passed
```

## 修改记录

### 0.1.3.1

将脚本注入时机从 `document-end` 提前到 `document-start`，修复快速加载画廊首次 Alt+点击可能早于监听器挂载的问题，补充作者元数据和独立回归测试，并统一错误日志中的脚本名称。
