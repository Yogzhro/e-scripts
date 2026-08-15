# e-scripts

面向 E-Hentai、ExHentai 与 HentaiVerse 的 userscript 工作区。可安装脚本位于仓库根目录，详细功能、权限、测试方法和版本记录位于 [`readme/`](readme/)；独立测试位于 [`test/`](test/)，项目资源位于 [`resource/`](resource/)。

`reference/` 中的第三方参考脚本、`.agents/` 本地开发规范与任意目录下的 `prompt.txt` 不会上传到公开仓库。本仓库暂不附加统一开源许可证。

## 脚本

- [`dokidoki.js`](dokidoki.js) 0.2.1.0：以贴合 Hentaiverse 的低饱和羊皮纸、深棕、琥珀配色重构 Monster Lab，并与可直接双击打开的 [`dokidoki-preview.html`](dokidoki-preview.html) 共用关键界面规则；图片仍固定读取 `dokidoki-v0.2.0.0` 标签，本轮未发布，说明见 [`readme/dokidoki.md`](readme/dokidoki.md)。
- [`HV Monster Manager.js`](HV%20Monster%20Manager.js) 0.3.6.7：提供共享怪物选择、HV Utils 式双带固定表格的可折叠24项升级编辑器、订单簿完整花费／覆盖范围、按水晶收购价汇总的日志总成本、独立混沌令牌摘要、精确／仅混沌／混合草案、实时安全执行、水晶采购和怪物重命名；可独立使用 HV Utils 原布局，也可无状态迁移到 dokidoki 羊皮纸工作区，说明见 [`readme/HV Monster Manager.md`](readme/HV%20Monster%20Manager.md)。
