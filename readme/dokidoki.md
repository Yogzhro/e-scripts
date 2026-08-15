# dokidoki

- 当前版本：0.2.1.0
- 作者：reina
- 发布标签：`dokidoki-v0.2.0.0`

## 用途与适用页面

脚本根据怪物种族，为 HentaiVerse Monster Lab 列表、怪物属性页和技能页显示原创女性拟人立绘。支持：

- `https://hentaiverse.org/?s=Bazaar&ss=ml`
- `https://alt.hentaiverse.org/?s=Bazaar&ss=ml`
- 上述站点带正整数 `slot` 的怪物属性页，以及额外带 `pane=skills` 的技能页

其他 Bazaar 页面、`ss=ar`、创建怪物页和带额外参数的 URL 均不会执行。

## 主要功能

- 识别 Arthropod、Avion、Beast、Celestial、Daimon、Dragonkin、Elemental、Giant、Humanoid、Mechanoid、Reptilian、Sprite、Undead 及综合汉化对应的 13 个中文种族名。
- 列表采用低饱和羊皮纸、深棕、琥珀和黄铜角色卡；1180px 以上按当前可见结果连续分半为双列，共用一个滚动区，较窄时恢复单列。卡片高 86px、立绘显示为 48×72，怪物行仍是 `#slot_pane` 的直接子节点且保留原有 9 个属性节点。
- 建立 `#dokidoki-shell`、顶部真实工具栏、列表视图和附属面板工作区；HV Utils 与 HV Monster Manager 的原始按钮和面板节点直接迁移，事件与状态不复制。
- 属性页和技能页共用档案外壳；宽屏显示 280×420 立绘，900px 以下缩为 240×360 并改为单列。技能表单默认折叠，首次展开或访问 `#skills` 时只同源读取一次，导入真实 `#skillform` 并移除抓取页脚本；失败时可重试或打开原生技能页。
- 监听列表排序、异步更新和中英文切换，刷新过程幂等。
- 未知种族会移除旧画像，种族未知或图片加载失败时各仅记录一次控制台警告。
- 没有设置、存储和站内写请求；正式版仅从带固定标签的 jsDelivr URL 加载 WebP。

## 权限与安装

正式脚本使用 `@grant none`，仅匹配主站与 alt 站。仓库根目录的 `dokidoki.js` 当前代码版本为 0.2.1.0，但图片继续使用固定的 `dokidoki-v0.2.0.0` jsDelivr 地址；本轮仅本地修改，没有新标签或发布。

开发资源位于 `resource/dokidoki/`。`build-assets.js` 使用 Sharp 将 13 张列表母图合成为 2184×252 精灵图，将 13 张详情母图输出为 600×900 WebP，并可生成包含本地 data URI 的 `.dev/dokidoki.dev.user.js`；该开发副本不会被 Git 跟踪。它还可在 `.release/` 生成不进入 Git 历史的离线审核包。

## 离线界面预览

直接双击仓库根目录的 [`dokidoki-preview.html`](../dokidoki-preview.html) 即可通过 `file://` 打开，不需要 Node、本地服务器或安装 userscript。页面只保留小型“离线预览”徽标，使用 200 只虚构怪物和相对路径资源，不读取登录态、不发送网络请求，也不执行升级、购买或重命名。

预览器用 URL Hash 切换 `#list`、`#monster/<slot>`、`#planner` 和 `#rename`，并提供中英文、1536／1280／1024／900／640／375 宽度与隐藏图片模拟。当前审核原型采用“220px 可折叠筛选栏＋双滚动名册”；1536／1280 按当前结果中点连续分为两个独立滚动区，1024 及以下自动合并为单区。主页使用 86px 档案卡和 48×72 缩略图；双击或 Enter 进入合并属性与技能的怪物档案。PL 计划器与重命名保持可选的 280px 选择栏＋真实栏目工作区，全部写操作永久禁用。

审核后的工作台已同步到 0.2.1.0 生产 userscript。生产名册为兼容 HV Utils 的“连续分半双列＋单滚动区”，离线预览仍保留双滚动原型便于比较密度；两者共享纸面、深棕、琥珀和黄铜规则，酒红只用于极小标识或危险状态。实测尺寸、兼容边界与实施记录见 [`dokidoki UI 重构评估.md`](dokidoki%20UI%20重构评估.md)。

生成 Release 附件：

```powershell
node .\resource\dokidoki\build-assets.js preview
```

输出为 `resource/dokidoki/.release/dokidoki-preview-v0.2.0.0.zip`，包内只有 `dokidoki-preview.html`、`dokidoki.js` 和 `resource/dokidoki/dist/`。

## 资源状态与已知限制

- 已完成 13 张列表母图和 13 张详情母图；生产资源包括一张 2184×252 列表精灵图与 13 张 600×900 详情 WebP，本地 data-URI 开发副本也已生成。
- 所有人物均明确为 21 岁以上；不同种族使用独立配色和标志物。Dragonkin 的列表与详情图均保留清晰完整的龙翼。
- 外部 CDN 不可用时画像会保持空卡状态并记录一次控制台警告，不会改用其他种族或内嵌正式资源。
- 画像布局以当前 Monster Lab DOM 及 HV Utils 4.2.4 为兼容基准；页面结构变化后需重新验证。
- 发布验收时 alt 站列表与属性页可达并通过实页验证；主站在当时的测试网络返回 `ERR_CONNECTION_CLOSED`，因此主站功能由相同 URL／DOM 单元测试覆盖，未声称完成该网络环境下的实页验证。

## 测试

### `test/dokidoki_test.js`

运行命令：

```powershell
node .\test\dokidoki_test.js
```

测试严格 URL 匹配、13 组中英种族映射、原生 6 列与 HV Utils 4.2.4 九列夹具、直接子节点保持、重复同步、详情画像更新、双列／单列 CSS 尺寸、共享工作区标识和固定 CDN 路径。预期输出为 `dokidoki tests passed.`。

### `test/dokidoki_assets_test.js`

运行命令：

```powershell
& '<包含 Sharp 的 Node 路径>' .\test\dokidoki_assets_test.js
```

测试在系统临时目录生成 13 组纯色 WebP 夹具，并验证实际 26 张母图、2184×252 精灵图、13 张 600×900 详情图、WebP 格式、压缩上限、仓库体积和 data-URI 开发副本忽略规则。预期输出为 `dokidoki asset tests passed.`，测试不使用 Hentaiverse 数据。

### `test/_dokidoki_browser_fixture_server.js`

该本地服务器加载被忽略的 data-URI 开发副本，提供原生六列、HV Utils 4.2.4 九列、英文、中文、排序和详情页夹具，用于 Chrome 可见布局与幂等刷新验证。它只监听 `127.0.0.1`，不会连接或修改 Hentaiverse 数据。

### `test/dokidoki_preview_test.js`

运行命令：

```powershell
node .\test\dokidoki_preview_test.js
```

测试本地预览入口、200 行和 13 种族夹具、`#monster/<slot>` 合并档案、六种宽度、折叠筛选、双区连续分半、86px 名册卡、48×72 缩略图、键盘与双击入口、每行 9 个直接子节点、管理器两栏、减酒红色彩约束、永久禁用账号操作，以及无 Fetch、XHR、表单、PWA、Service Worker 和持久存储。完整 UI 的真实页面尺寸基线和实施记录见 [`dokidoki UI 重构评估.md`](dokidoki%20UI%20重构评估.md)。

## 版本记录

### 0.2.1.0

将已审核的紧凑工作台同步到生产：真实 `.msl` 保持为 `#slot_pane` 直接子节点，宽屏使用单滚动区连续分半双列；加入筛选、双击／键盘档案入口、响应式工具抽屉、合并档案和按需技能表单。保留 dokidoki 挂载契约与 HV Monster Manager 兼容，图片 CDN 仍固定在 `dokidoki-v0.2.0.0`；本版本只在本地完成，未发布或创建标签。

### 0.2.0.0

生产界面从独立暗色主题调整为贴合 Hentaiverse 的羊皮纸、酒红和琥珀主题，列表断点改为 1440／980px 并用 CSS 变量统一立绘尺寸；修复 HV Utils 固定行宽在双列和窄屏下的重叠、页面级横向溢出及动态汇总覆盖。新增可直接以 `file://` 打开的 DoL 式离线预览器，使用 200 只虚构怪物模拟列表、详情、技能、PL 计划器和重命名视图，所有账号操作永久禁用，并新增无依赖 ZIP 构建和专项安全测试。

### 0.1.1.0

属性页和技能页统一改为暗色哥特响应式详情网格，宽屏使用保留全部原生内容的左栏与 360×540 右侧立绘，较窄窗口自动改为单列和 280×420 立绘；原生表单、输入和事件节点均不搬移或复制，未知种族与图片失败安全保持文字内容及页面结构。

### 0.1.0.0

Monster Lab 列表重构为暗色哥特响应式角色卡，宽屏双列、中窄屏单列并使用重新生成的 2×精灵图；新增稳定的顶部工具栏、列表视图与附属面板工作区，直接迁移 HV Utils 和 HV Monster Manager 的真实节点，保留排序、按钮事件和面板状态，并提供初始化异常恢复及脚本加载顺序兼容。

### 0.0.2.0

项目统一更名为 dokidoki，脚本、资源、文档、测试、开发副本、内部样式标识与固定 CDN 路径同步更新，页面匹配、13 种族识别、列表及详情立绘行为保持不变；新增完整 Monster Lab UI 重构评估，并清理公开仓库中的开发提示文件与旧发布引用。

### 0.0.1.0

建立独立脚本、严格页面匹配、13 种中英映射、兼容 HV Utils 的无新增列画像方案、响应式详情面板、Sharp 资源构建器和两组独立测试；完成列表原型、详情原型及全量立绘三阶段审核，并生成全部生产与本地开发资源。
