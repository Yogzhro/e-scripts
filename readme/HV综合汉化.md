# HV综合汉化

- 当前版本：`1.6.7`（按用户要求，本次修复不调整版本号）
- 脚本作者：DDD
- 说明维护：reina

## 用途与适用页面

该用户脚本为 HentaiVerse 页面提供可实时开关的中文视觉翻译，覆盖战斗、装备、物品商店、怪物实验室等区域，并兼容脚本动态插入的页面内容。适用于脚本元数据中列出的 HentaiVerse、E-Hentai Forums 和相关页面。

## 安装与使用

在 Tampermonkey 中安装 `HV综合汉化.js`。进入适用页面后，使用页面右上角的“中/英”按钮切换翻译；选择会在刷新后继续生效。

## 主要功能

- 按页面区域组合词典并翻译文本、按钮和提示属性。
- 使用 `MutationObserver` 处理动态内容。
- 在怪物实验室中保留 HV Utils 读取的英文机器文本，同时通过 CSS 伪元素显示中文，避免食物和药丸库存被误判为 `0`。
- 兼容 HV Utils 4.2.4：装备品质 `Ultimate` 显示为“𖣔终极𖣔”，`Mace` 与 `Great Mace` 统一显示为“巨锤”，独立的 `Mage Stats` 面板及六系、减益魔法反抵抗和治疗加成均可翻译。
- HV Utils 装备分组使用专用短标签；常规装备类型复用装备名词典，减少重复词条，并支持动态分类标题实时切回英文。
- 装备一览弹窗会解析护符名称后的 `G/L` 等级缩写，其中 `G` 显示为“高级”、`L` 显示为“次级”，并复用装备详情中的完整护符译名。
- 有效主属性使用原始独立 `span` 包装方案：包装内保留英文 `textContent` 供 HV Utils 查询，仅通过 CSS 伪元素显示中文；每次重复汉化会先把旧包装还原为文本节点，再从未隐藏的父元素重新取得字号并包装，避免标签消失。
- 保留 `Cost`、`Stock` 等既有机器文本兼容处理。

## 权限与限制

脚本使用 `@grant none`，不新增网络或扩展权限。怪物实验室库存数量仍由 HV Utils 请求并计算；本脚本只保证其读取的物品名称不被真实 DOM 翻译破坏。HV Utils 4.2.4 的 `{$avg}` 由 HV Utils 自行计算，旧用户需要在其设置中恢复默认 `equipCode` 才会显示。若 HV Utils 将来更改怪物需求或有效主属性的读取选择器，需要同步复核兼容边界。

## 统一自动化测试

- 入口：`test/hv_integrated_translation_all_test.js`
- 运行：`node .\test\hv_integrated_translation_all_test.js`
- 语法检查：`node --check .\test\hv_integrated_translation_all_test.js`
- 预期：先输出“HV Ultimate 品质颜色测试脚本自检通过”，再输出“HV 综合汉化统一测试通过”，进程退出码为 `0`。

统一入口只读取当前的 `HV综合汉化.js`，不再在运行时读取 `reference/`。原有三份 Node 回归测试已经合并并删除，公共的源码提取、词典读取和 DOM 夹具不再重复。当前覆盖范围如下：

- 怪物实验室库存兼容：验证 HV Utils 消费的需求 span 保留英文机器文本，`Monster Edibles`、`Happy Pills`、`Cost` 和 `Stock` 只通过视觉层显示中文；夹具使用最小 `closest()` 结构模拟 `#monster_actions`，不访问网站或账号数据。
- HV Utils 4.2.4：验证 Ultimate、Mage Stats、六系与减益魔法反抵抗、Cure Bonus、Mace/Great Mace 合并、装备分组标题、护符 `G/L` 翻译和动态中英文切换。
- 有效主属性：用含英文 `[565] Strength` 的最小 DOM 模拟真实表格，覆盖首次包装、连续应用、切回英文和旧包装字号为 `0px` 后重新包装；英文 `textContent` 必须保留，中文只写入视觉属性，字号必须恢复为 `10px`。
- Ultimate 配色夹具自检：统一入口会在无 DOM 环境中加载 `hv_ultimate_color_preview.user.js`，验证页面识别、配置色和 HV Utils Ultimate 背景色常量。
- 元数据：确认生产脚本版本仍为 `1.6.7`。

### Ultimate 浏览器配色夹具

`test/hv_ultimate_color_preview.user.js` 仍保留为独立用户脚本，因为它必须能单独安装到 Tampermonkey，才能读取论坛、角色装备页和装备详情页的真实计算色；它不是第二个自动化测试入口。

- 配色：直接修改文件顶部的 `.hv-eq-q-ultimate { background:#2b2b35; color:#f5f5f5;}` 后重新运行或刷新。品质块使用该配置；整件装备预览按照 HV Utils 4.2.4 的 `.hvut-equip-Ultimate` 和 `--color-equip-Ultimate: #dcf` 显示。
- 页面：论坛中读取真实装备链接，`?s=Character&ss=eq` 显示装备 `311306864/4ec56057d3` 的可调预览，`/equip/311306864/4ec56057d3` 与 `/equip/284768906/385649fcd5` 读取真实装备详情标题。
- 浏览器运行：在 Tampermonkey 中单独安装该文件。脚本使用 `@grant none`，不发送请求；预览夹具仅在角色装备页生成，并提供“重新读取计算色”和“关闭面板”按钮。
- 单文件诊断：必要时仍可运行 `node .\test\hv_ultimate_color_preview.user.js` 或 `node --check .\test\hv_ultimate_color_preview.user.js`，但日常回归只需运行统一入口。

## 修改记录

### 1.6.7

修复启用汉化后刷新怪物实验室会把食物和药丸库存误判为零的问题，HV Utils 读取的需求文本现在保持英文机器值，用户界面继续以中文视觉呈现；同步兼容 HV Utils 4.2.4，新增“𖣔终极𖣔”装备品质、法师面板及反抵抗翻译，统一 Mace 与 Great Mace 为“巨锤”，精简并补全 HV Utils 装备分组专用翻译且支持分类标题实时切换，支持装备一览弹窗的护符 G/L 等级翻译；有效主属性恢复参考脚本原始 `span` 包装方案，每次应用前先拆除旧包装并从未隐藏父元素重新取得字号，从而避免只剩数字或标签消失；相关 Node 回归已整合为单一自动化入口，Ultimate 浏览器配色夹具继续独立保留，版本号按用户要求保持不变。
