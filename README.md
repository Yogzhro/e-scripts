# e-scripts

面向 E-Hentai、ExHentai 与 HentaiVerse 的 userscript 工作区。可安装脚本位于仓库根目录，详细功能、权限、测试方法和版本记录位于 [`readme/`](readme/)；独立测试位于 [`test/`](test/)，项目资源位于 [`resource/`](resource/)。

`reference/` 中的第三方参考脚本、`.agents/` 本地开发规范与任意目录下的 `prompt.txt` 不会上传到公开仓库。本仓库暂不附加统一开源许可证。

## 脚本

- [`dokidoki.js`](dokidoki.js) 0.1.0.0：以暗色哥特双列角色卡重构 Monster Lab 列表，提供可供 HV Utils 与怪物管理器复用的顶部工具栏和附属工作区，并继续显示 13 种族立绘；使用不可变标签 `dokidoki-v0.1.0.0`，说明见 [`readme/dokidoki.md`](readme/dokidoki.md)。
- [`HV Monster Manager.js`](HV%20Monster%20Manager.js) 0.3.3.0：提供共享怪物选择、精确 PL 规划、实时目标升级、水晶采购和怪物重命名；可独立使用 HV Utils 原布局，也可无状态迁移到 dokidoki 工作区，说明见 [`readme/HV Monster PL Planner.md`](readme/HV%20Monster%20PL%20Planner.md)。
