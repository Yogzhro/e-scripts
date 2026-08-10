# HV Monster Portraits

- 当前版本：0.0.1.0
- 作者：Reina
- 状态：13 种族立绘与生产资源已完成，等待仓库发布和真实页面验收

## 用途与适用页面

脚本根据怪物种族，为 HentaiVerse Monster Lab 列表、怪物属性页和技能页显示原创女性拟人立绘。支持：

- `https://hentaiverse.org/?s=Bazaar&ss=ml`
- `https://alt.hentaiverse.org/?s=Bazaar&ss=ml`
- 上述站点带正整数 `slot` 的怪物属性页，以及额外带 `pane=skills` 的技能页

其他 Bazaar 页面、`ss=ar`、创建怪物页和带额外参数的 URL 均不会执行。

## 主要功能

- 识别 Arthropod、Avion、Beast、Celestial、Daimon、Dragonkin、Elemental、Giant、Humanoid、Mechanoid、Reptilian、Sprite、Undead 及综合汉化对应的 13 个中文种族名。
- 列表通过编号单元格伪元素显示 52×72 画像，将行高调整为 80px，不增加怪物行的直接子节点，兼容 HV Utils 4.2.4 的排序与附加列。
- 属性页和技能页共用详情画像；宽度不小于 1480px 时显示在右侧，较窄窗口显示在内容下方。
- 监听列表排序、异步更新和中英文切换，刷新过程幂等。
- 未知种族会移除旧画像，种族未知或图片加载失败时各仅记录一次控制台警告。
- 没有设置、存储和站内写请求；正式版仅从带固定标签的 jsDelivr URL 加载 WebP。

## 权限与安装

正式脚本使用 `@grant none`，仅匹配主站与 alt 站。仓库根目录的 `HV Monster Portraits.js` 使用固定版本的 jsDelivr 地址；`hvmp-v0.0.1.0` 标签及 CDN 文件验证完成后即可安装，标签发布前不应作为正式版安装。

开发资源位于 `resource/HV Monster Portraits/`。`build-assets.js` 使用 Sharp 将 13 张列表母图合成为 1352×144 精灵图，将 13 张详情母图输出为 600×900 WebP，并可生成包含本地 data URI 的 `.dev/HV Monster Portraits.dev.user.js`；该开发副本不会被 Git 跟踪。

## 资源状态与已知限制

- 已完成 13 张列表母图和 13 张详情母图；生产资源包括一张 1352×144 列表精灵图与 13 张 600×900 详情 WebP，本地 data-URI 开发副本也已生成。
- 所有人物均明确为 21 岁以上；不同种族使用独立配色和标志物。Dragonkin 的列表与详情图均保留清晰完整的龙翼。
- 外部 CDN 不可用时画像会保持空卡状态并记录一次控制台警告，不会改用其他种族或内嵌正式资源。
- 画像布局以当前 Monster Lab DOM 及 HV Utils 4.2.4 为兼容基准；页面结构变化后需重新验证。

## 测试

### `test/hv_monster_portraits_test.js`

运行命令：

```powershell
node .\test\hv_monster_portraits_test.js
```

测试严格 URL 匹配、13 组中英种族映射、原生 6 列与 HV Utils 9 列夹具、直接子节点保持、重复同步、详情画像更新、CSS 尺寸和响应式断点。预期输出为 `HV Monster Portraits tests passed.`。

### `test/hv_monster_portraits_assets_test.js`

运行命令：

```powershell
& '<包含 Sharp 的 Node 路径>' .\test\hv_monster_portraits_assets_test.js
```

测试在系统临时目录生成 13 组纯色 WebP 夹具，并验证实际 26 张母图、1352×144 精灵图、13 张 600×900 详情图、WebP 格式、压缩上限、仓库体积和 data-URI 开发副本忽略规则。预期输出为 `HV Monster Portraits asset tests passed.`，测试不使用 Hentaiverse 数据。

## 版本记录

### 0.0.1.0

建立独立脚本、严格页面匹配、13 种中英映射、兼容 HV Utils 的无新增列画像方案、响应式详情面板、Sharp 资源构建器和两组独立测试；完成列表原型、详情原型及全量立绘三阶段审核，并生成全部生产与本地开发资源。
