# HVUT 熊猫汉化

## 用途

`HVUT 熊猫汉化-4.2.3.js` 是用于 Hentaiverse 非战斗页面的综合辅助用户脚本，提供中文化顶部导航、装备与物品管理等界面，并保留脚本原有的数据读取和操作逻辑。

当前项目版本为 `0.0.1.0`，作者沿用脚本原有署名 `sssss2`。

## 适用页面

- `*://*.hentaiverse.org/*`
- `*://e-hentai.org/*`
- 排除 Hentaiverse 的 `/equip/` 装备详情页。

本次精力悬浮框汉化主要在 Hentaiverse 非战斗页面顶部生效，包括 Persistent 和 Isekai 的角色页面。

## 安装与使用

1. 在支持用户脚本的浏览器扩展中导入 `HVUT 熊猫汉化-4.2.3.js`。
2. 保存脚本并刷新 Hentaiverse 页面。
3. 将鼠标悬停在顶部“精力”读数上，查看当前精力状态说明。
4. Persistent 模式下首次悬停还会读取物品库存，并显示咖啡因糖果和能量饮料的持有数量。

## 主要功能

- 顶部导航和非战斗页面的中文界面增强。
- 装备、物品、邮件、市场和怪物实验室等原有 HVUT 辅助功能。
- 精力悬浮框显示完整的“充沛”“正常”“耗尽”中文说明。
- 将低谜语回答准确率造成的精力消耗警告显示为中文。
- 将恢复物品显示为“咖啡因糖果”和“能量饮料”，并保留英文库存键供脚本查询。
- 将恢复按钮统一显示为“使用恢复物品”。

## 权限

脚本沿用原有权限：`GM_getValue`、`GM_setValue`、`GM_deleteValue`、`GM_addStyle`、`GM_xmlhttpRequest`、`GM_setClipboard` 和 `unsafeWindow`，并允许连接 `hentaiverse.org` 与 `e-hentai.org`。本次精力汉化没有新增或扩大权限。

## 精力汉化实现限制

- `_player.condition` 和 `_player.accuracy` 保留服务器提供的英文原文，仅在创建显示节点时转换为中文，避免破坏 Great、Exhausted 和低精力警告判断。
- 库存请求仍使用英文 `Caffeinated Candy`、`Energy Drink` 作为 `$item.count` 的查询键；中文只用于视觉显示。
- 当前仅映射已确认的三种完整状态原文和低谜语准确率警告。服务器以后新增或修改原文时，未识别内容会回退显示英文，不会显示为空。
- 浏览器脚本管理器不会自动读取工作区文件；修改后必须重新导入或更新脚本并刷新页面。

## 统一测试入口

当前只有一个测试文件直接针对本脚本，已统一整理为：`test/hvut_all_test.js`。后续新增 HVUT 测试时应继续写入这个入口，并按功能拆分测试函数，不再创建只能单独运行的零散入口文件。

运行命令：

```powershell
node .\test\hvut_all_test.js
```

测试入口直接读取生产脚本，并分为以下测试组：

| 测试组 | 测试方法 | 覆盖场景 |
| --- | --- | --- |
| 精力文案映射 | `testStaminaTranslations()` | Great、Normal、Exhausted 三条完整说明，低谜语回答准确率警告，咖啡因糖果、能量饮料和空库存提示 |
| 回退行为 | `testStaminaTranslations()` | 未知或未来新增的精力状态必须保留英文原文，不能显示为空 |
| 显示与机器数据隔离 | `testStaminaIntegration()` | `_player.condition`、`_player.accuracy` 和 `$item.count(itemName)` 保留英文机器值，仅显示节点使用中文映射 |
| 页面集成约束 | `testStaminaIntegration()` | 顶部“精力”标签、恢复按钮、确认提示、Great/Exhausted 英文逻辑判断和四段版本号 |

测试通过 `vm` 从生产脚本提取 `STAMINA_TEXT` 和 `translateStaminaText` 执行，不复制一份脱离生产代码的测试词典。预期结果为输出 `HVUT 综合测试通过（精力悬浮框）` 并以退出码 `0` 结束。

旧的 `test/hvut_stamina_translation_test.js` 已并入统一入口并删除，避免维护两套重复运行命令。

## 修改日志

### 0.0.1.0

新增顶部精力悬浮框的完整状态说明汉化，覆盖充沛、正常、耗尽和低谜语回答准确率警告，将咖啡因糖果、能量饮料、空库存提示及恢复按钮统一为中文，同时保留英文状态和库存键以兼容原有判断及库存读取逻辑，并将相关回归用例整合到统一的 `hvut_all_test.js` 测试入口。
