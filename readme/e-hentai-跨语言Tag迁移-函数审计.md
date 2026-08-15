# E-Hentai 跨语言 Tag 迁移函数审计

- 审计版本：`0.2.6.7`
- 审计对象：`eh-tag-transfer.js` 中全部具名函数声明；匿名回调随所属函数审计，不作为独立接口重复列出。
- 处置原则：只合并纯别名、单次转发和重复扫描；协议边界、纯规则、四阶段搜索、写后验证、持久化与生命周期入口保持独立。

## 模块入口与配置

| 函数 | 含义 | 审计结论 |
| --- | --- | --- |
| `createEhTagTransferModule` | 建立单文件作用域、导出测试接口并在浏览器初始化。 | 保留；隔离全局变量的唯一模块边界。 |
| `clampNumber` | 把数值限制到给定范围，无效值回退默认值。 | 保留；配置数值规则的公共底层。 |
| `clampInteger` | 在数值范围校验后取整。 | 保留；复用 `clampNumber`，语义不同。 |
| `sanitizeBoolean` | 将可空输入规范为严格布尔值。 | 保留；合并三个布尔参数的重复判断。 |
| `parseScheduleMinutes` | 把本地 `HH:mm` 转成午夜后的分钟数。 | 保留；调度计算多处复用。 |
| `normalizeScheduleTime` | 校验时间字符串，无效时回退默认时间。 | 保留；配置入口专用规则。 |
| `sanitizeConfig` | 按统一规则表清洗全部源码参数并校正随机范围。 | 保留；配置边界和测试接口。 |
| `resolveConfig` | 用固定源码参数生成本轮运行配置。 | 保留；明确源码参数优先级。 |
| `sanitizeGlobalPauseState` | 兼容布尔旧值并规范全局停止对象。 | 保留；跨版本存储边界。 |
| `readGlobalPauseState` | 从 GM 存储安全读取全局停止状态。 | 保留；隔离读取异常。 |
| `writeGlobalPauseState` | 写入带时间戳的全局停止状态。 | 保留；跨站同步写入口。 |
| `planVersionStateReset` | 纯计算版本变化时哪些站点状态需要重建。 | 保留；可独立测试且无副作用。 |
| `applyVersionStateReset` | 执行版本重建、解除停止并保存版本标记。 | 保留；启动阶段唯一副作用入口。 |

## 持久状态、预算与跨标签页协调

| 函数 | 含义 | 审计结论 |
| --- | --- | --- |
| `galleryIdFromUrl` | 从画廊 URL 取得 GID。 | 保留；队列、日志和排序复用。 |
| `getCurrentOrigin` | 安全取得当前 E/Ex 站点来源。 | 保留；Node 测试与浏览器共用。 |
| `sanitizeScheduleWindow` | 校验持久化的绝对时间窗。 | 保留；状态读取和调度复用。 |
| `sanitizeHomeState` | 规范主页基线、队列、游标和调度状态。 | 保留；主页持久化核心边界。 |
| `loadHomeState` | 读取并规范当前站点主页状态。 | 保留；统一异常处理。 |
| `saveHomeState` | 规范并持久化主页状态。 | 保留；唯一主页写入口。 |
| `mergeHomepageResults` | 将新扫描结果按 GID 合入基线和任务队列。 | 保留；纯状态转换并由测试覆盖。 |
| `findReadyHomeJob` | 查找当前可领取且退避已到期的任务。 | 保留；避免每任务复制全队列。 |
| `beginHomeJob` | 标记任务开始并增加尝试次数。 | 保留；任务状态转换。 |
| `retryHomeJob` | 为真实失败写入错误和指数退避。 | 保留；与预算中断语义不同。 |
| `preserveHomeJobAfterBudget` | 预算不足时恢复任务为可重试而不计失败。 | 保留；安全边界独立。 |
| `completeHomeGroup` | 从队列移除已完成关联画廊组。 | 保留；完成路径集中处理。 |
| `getHomeJobDisposition` | 把迁移结果映射为完成、保留或重试。 | 保留；调度决策纯函数。 |
| `selectBadTagRecords` | 排除已知错误标签指纹。 | 保留；过滤职责单一。 |
| `selectBadTagBatch` | 在过滤结果上应用每轮数量上限。 | 保留；分页和已知过滤不可混淆。 |
| `isForeignWorkerLock` | 判断租约是否由其他有效实例持有。 | 保留；协调纯函数。 |
| `getInterruptedRunState` | 根据运行标记和租约判断活跃或中断。 | 保留；刷新恢复纯函数。 |
| `loadRunMarker` | 安全读取当前站点运行标记。 | 保留；隔离损坏存储。 |
| `clearRunMarker` | 仅由匹配持有者清除运行标记。 | 保留；防止误删其他实例状态。 |
| `createRequestBudget` | 创建本轮请求计数器。 | 保留；预算测试接口。 |
| `setRequestBudgetReserve` | 为错误标签阶段预留请求额度。 | 保留；预算阶段切换入口。 |
| `getRequestBudgetRemaining` | 计算普通或含预留额度的剩余请求。 | 保留；多处查询。 |
| `canStartVerifiedTagVote` | 判断是否至少可容纳 POST 和验证 GET。 | 保留；写入安全门槛。 |
| `consumeRequestBudget` | 消耗请求额度并在越界时抛出专用异常。 | 保留；所有请求统一计数。 |
| `loadWorkerLock` | 读取同源 Worker 租约。 | 保留；锁存储适配器。 |
| `saveWorkerLock` | 写入带到期时间的 Worker 租约。 | 保留；锁写入适配器。 |
| `renewWorkerLock` | 校验所有权并续期，失败时中止当前 Worker。 | 保留；请求前续租核心。 |
| `failRenewal` | `renewWorkerLock` 内部统一处理中止和清空所有者。 | 保留为局部函数；消除两条失败分支重复。 |
| `releaseWorkerLock` | 仅释放自身租约并清理内存所有者。 | 保留；finally 清理入口。 |
| `consumeTrackedRequest` | 同时消耗预算并续租 Worker。 | 保留；所有业务请求共同入口。 |

## 标题、标签、候选与列表纯规则

| 函数 | 含义 | 审计结论 |
| --- | --- | --- |
| `normalizeWhitespace` | 合并空白并裁剪字符串。 | 保留；全脚本基础规范化。 |
| `normalizeComparableText` | NFKC、小写并移除标点符号，生成比较文本。 | 保留；标题、署名和审计共用。 |
| `normalizeChapterNumber` | 规范章节数字、小数、范围端点和字母后缀。 | 保留；章节身份规则。 |
| `buildChapterSuffixResult` | 将章节正则命中转成统一章节对象。 | 保留；多种后缀解析共用。 |
| `extractChapterSuffix` | 识别英中日韩章节、卷、集和特殊章节后缀。 | 保留；独立领域规则。 |
| `buildSearchTitle` | 将清洗后的基础标题与原章节后缀重新组合并限长。 | 保留；搜索词规则。 |
| `isTitleMetadataPrefix` | 判断开头方括号是语言/版本元数据而非作者。 | 保留；作者前缀安全规则。 |
| `parseTitlePart` | 反复移除尾部方括号并提取章节和原作段。 | 保留；单个 `|` 分段解析器。 |
| `parseTitleIdentity` | 解析活动、署名、别名、章节、原作和核心编号。 | 保留；标题身份主入口。 |
| `levenshteinDistance` | 计算两个规范字符串的编辑距离。 | 保留；通用距离算法。 |
| `titleDistanceRatio` | 把编辑距离归一化为标题差异比例，规范化后相等时直接返回零。 | 保留；相等快路径避免建立 Levenshtein 矩阵。 |
| `countSetOverlap` | 计算两个集合的交集数量。 | 保留；署名和标签证据复用。 |
| `analyzeTitleSet` | 分析 GN/GJ 标题集合并用 WeakMap 缓存。 | 保留；字段级标题模型。 |
| `findClosestTitlePair` | 使用可复用距离读取器在两组核心标题中寻找最小距离组合。 | 保留；跨字段比较核心。 |
| `compareChapterSets` | 判断章节相同、冲突或未知并给分。 | 保留；硬门槛独立。 |
| `compareTitleContext` | 比较尾部原作段并提供辅助分。 | 保留；非标题距离证据。 |
| `creatorTagSets` | 提取并缓存实线或全部 artist/group 标签。 | 保留；候选身份复用。 |
| `compareTitleSets` | 综合 GN/GJ、署名、编号和距离产生标题结论。 | 保留；单次调用缓存规范标题对距离，供全局与同字段比较复用。 |
| `getCachedTitleDistance` | `compareTitleSets` 内按无方向规范标题对读取或计算距离。 | 保留为局部函数；全局与同字段扫描共用同一缓存入口。 |
| `canonicalGalleryUrl` | 将画廊链接规范为同源标准 URL。 | 保留；安全链接和去重共用。 |
| `parsePageCount` | 从 Length 文本的 `pages` 字段读取画廊页数。 | 保留；领域解析规则。 |
| `readSearchResultPageCount` | 从列表项最深层完整“数字 + pages”字段读取页数。 | 保留；避免相邻统计数字粘连。 |
| `parseGalleryPostedAt` | 将画廊 UTC 发布时间解析为时间戳。 | 保留；新旧画廊排序规则。 |
| `normalizeTag` | NFKC、小写并补齐缺失命名空间。 | 保留；标签安全边界。 |
| `readTagFromAnchor` | 从 onclick 或 tag URL 提取规范标签。 | 保留；兼容两种站点 DOM。 |
| `parseGalleryTags` | 读取标签强度、赞成票和人工踩票状态。 | 保留；详情标签主解析器。 |
| `readGalleryDetails` | 一次扫描 `#gdd` 同时读取页数与发布时间。 | 保留；由两个重复扫描函数合并而来。 |
| `getExplicitLanguage` | 从 `language:*` 标签取得明确语言。 | 保留；列表与详情共用。 |
| `classifyLanguage` | 按标签优先、标题后备判断画廊语言。 | 保留；候选过滤需要统一语义。 |
| `parseGalleryDocument` | 将完整画廊 DOM 规范为任务快照数据。 | 保留；详情读取边界。 |
| `compareGalleryRecency` | 按 Posted、GID、URL 依次比较新旧。 | 保留；稳定排序比较器。 |
| `selectNewestGallery` | 从关联画廊中选择最新目标。 | 保留；迁移计划和测试接口。 |
| `buildTransferPlan` | 根据 newest/all 生成来源和目标集合。 | 保留；方向规则纯函数。 |
| `hasSameExplicitLanguage` | 判断双方明确语言是否相同。 | 保留；预览提前过滤。 |
| `assessCandidate` | 执行页数、标题、章节、作者和独立证据门槛并评分。 | 保留；匹配核心，禁止为缩短而拆坏语义。 |
| `selectBestLanguageCandidates` | 在 all 模式按语言和分差选择明显首选。 | 保留；分差策略独立。 |
| `selectTransferCandidates` | 根据迁移方向调用相应最终选择策略。 | 保留；阶段接口。 |
| `escapeRegex` | 转义黑名单和修正状态动态正则文本。 | 保留；两类规则复用。 |
| `compileBlacklist` | 把文本黑名单编译为命名空间感知正则。 | 保留；配置到执行的边界。 |
| `isBlacklisted` | 检查完整标签或裸标签名是否命中规则。 | 保留；所有标签规划共用。 |
| `extractCorrectionMetadata` | 只提取 GN/GJ 三类括号内的修正元数据。 | 保留；uncensored 安全边界。 |
| `maskMatches` | 记录并遮蔽否定短语，防止再次命中。 | 保留；修正分类内部复用。 |
| `consumeLongestMarkers` | 按最长词优先消费修正状态标记。 | 保留；避免 uncensored 内部误判 censored。 |
| `classifyCorrectionState` | 合并 GN/GJ 正负和否定证据，输出修正状态。 | 保留；敏感标签核心纯函数。 |
| `collectTagSourceUrls` | 收集某标签的实际来源画廊 URL。 | 保留；修正审计需要。 |
| `buildTargetTagSet` | 对单个目标应用修正状态、黑名单和标题派生。 | 保留；目标专属策略。 |
| `buildTransferTagUnion` | 汇总来源画廊中允许迁移的标签。 | 保留；普通标签并集。 |
| `planTargetTags` | 排除目标已有实线、赞成票和踩票标签。 | 保留；提交前状态规划。 |
| `planRandomTagSkip` | 从真正待提交的唯一标签中无偏抽样省略。 | 保留；可注入随机源的纯函数。 |
| `buildTagBatches` | 按站点字段长度拆分标签 POST 批次。 | 保留；协议限制独立。 |
| `parseGalleryList` | 用 `.itg tr,.gl1t` 与宽泛链接选择器统一解析列表画廊、页数和标签。 | 保留；主页和搜索共用，损坏项与空结果直接跳过。 |
| `randomInteger` | 在给定闭区间生成现有语义的随机整数。 | 保留；重试、动作和调度抖动共用。 |

## 请求生命周期、读取客户端与解析适配

| 函数 | 含义 | 审计结论 |
| --- | --- | --- |
| `createAbortError` | 创建统一 AbortError。 | 保留；所有取消路径共用。 |
| `createTimeoutError` | 创建统一 TimeoutError。 | 保留；各适配器可附带不同信息。 |
| `runRequestLifecycle` | 统一超时、取消、底层中止和 settle-once。 | 保留；请求安全核心，不与业务请求合并。 |
| `settle` | 请求生命周期内部只结算一次并清理监听和超时。 | 保留为局部函数；竞态正确性核心。 |
| `abortTransportOnce` | 请求生命周期内部只中止底层传输一次。 | 保留为局部函数；防止重复 abort。 |
| `cancel` | 请求生命周期内部按错误结算并中止传输。 | 保留为局部函数；超时和用户取消共用。 |
| `handleAbort` | 将 AbortSignal 事件转成统一取消。 | 保留为局部函数；事件监听需要稳定引用。 |
| `delay` | 提供可由 AbortSignal 中止的延时。 | 保留；动作、重试和调度复用。 |
| `settle` | `delay` 内部单次完成/拒绝并移除 abort 监听。 | 保留为局部函数；防止监听泄漏。 |
| `randomDelay` | 使用共享随机整数执行可中止抖动延时。 | 保留；调用点众多。 |
| `waitForSearchThrottle` | 等待剩余搜索间隔并记录最新请求时间。 | 保留；已吸收旧的等待毫秒包装。 |
| `isRetryableFetchError` | 只允许网络、超时、429 和临时 HTTP 状态重试。 | 保留；读取安全策略。 |
| `withReadRetry` | 执行有限次数读取重试和抖动退避。 | 保留；已吸收旧的重试延时包装。 |
| `fetchHtml` | 用同源 fetch 读取 HTML 并接入生命周期、预算和重试。 | 保留；HTML 传输适配器。 |
| `fetchDocument` | 把 HTML 响应解析为 DOM。 | 保留；调用点避免重复 DOMParser。 |
| `readInlineScriptAssignment` | 从内联脚本读取站点提供的写入变量。 | 保留；写入上下文字段复用。 |
| `isTrustedTagApiUrl` | 限制写入 API 到官方 E-Hentai 地址。 | 保留；安全边界和测试接口。 |
| `parseGalleryWriteContext` | 校验并组装 api URL、凭据、GID 和 token。 | 保留；敏感写入上下文边界。 |
| `buildTagGalleryPayload` | 生成官方 taggallery JSON 请求字段。 | 保留；协议纯函数。 |
| `isUsableGalleryDocument` | 判断详情页是否具备标题和标签列表。 | 保留；结构有效性测试接口。 |
| `isUnavailableGalleryDocument` | 结合状态码和页面文本识别失效画廊。 | 保留；404 页面误判修复核心。 |
| `fetchGallerySnapshot` | 读取详情、验证结构、解析画廊和写入上下文并缓存快照。 | 保留；已吸收旧缓存转发函数。 |
| `isRedBadTagAnchor` | 判断 Repository 标签链接是否为红色错误记录。 | 保留；DOM 判定集中。 |
| `buildBadTagAudit` | 汇总错误画廊、全部标签、标题长度和频次。 | 保留；隐藏审计纯函数。 |
| `parseBadTagReport` | 解析 Repository DOM 为记录列表和审计快照。 | 保留；Repository 主解析器。 |
| `badTagRecordFingerprint` | 为错误标签记录生成稳定指纹。 | 保留；终态去重共用。 |
| `sanitizeBadTagState` | 规范 UID 和最多 2000 个历史指纹。 | 保留；错误标签存储边界。 |
| `loadBadTagState` | 读取匹配 UID 的错误标签状态。 | 保留；异常隔离。 |
| `saveBadTagState` | 规范并持久化错误标签状态。 | 保留；唯一写入口。 |
| `buildSearchUrl` | 构造覆盖语言、上传者和 My Tags 过滤的搜索 URL。 | 保留；搜索接口和测试入口。 |
| `buildSearchQueries` | 从固定 GN/GJ 字段生成最多两个标题查询。 | 保留；查询计划主入口。 |
| `addQuery` | `buildSearchQueries` 内部去重并添加单字段查询。 | 保留为局部函数；英文和日文共用。 |
| `canContinueSearchPages` | 只用页数上限、下一页和新结果判断是否值得继续翻页。 | 保留；在昂贵强候选计算前执行廉价门槛。 |
| `createTaskCandidateAssessor` | 为当前画廊和配置建立 WeakMap 预览候选评估缓存。 | 保留；发现阶段和同步预筛共享。 |
| `isStrongPreviewCandidate` | 复用任务缓存的候选结论判断预览是否足够强。 | 保留；只在确实可翻页时调用。 |
| `fetchSearchQueryResults` | 节流读取搜索页、统一解析列表、去重并惰性控制翻页。 | 保留；单查询执行器。 |
| `canonicalHomepageUrl` | 限制主页游标到当前站点未过滤根路径。 | 保留；扫描安全边界。 |
| `isUnavailableGalleryStatus` | 判断 404/410 状态。 | 保留；读取和失效判断复用。 |

## 直连写入与错误标签处理

| 函数 | 含义 | 审计结论 |
| --- | --- | --- |
| `getBadTagCorrectionStrategy` | 根据存在、赞成和踩票状态决定纠正动作。 | 保留；纯策略测试入口。 |
| `getTagVoteState` | 在最新 DOM 中读取指定标签的当前投票状态。 | 保留；每步纠正前后复核。 |
| `createTagVoteResponseError` | 创建“响应不明”专用异常并保留状态码。 | 保留；禁止不明响应重复投票。 |
| `submitTagVoteRequest` | 发送单次官方 taggallery POST 并解析业务错误。 | 保留；写入传输适配器。 |
| `submitTagVoteAndVerify` | 提交后延时并重新读取目标快照。 | 保留；POST+GET 验证原子流程。 |
| `correctBadTagRecord` | 按最新状态完成撤赞、回踩或安全终止。 | 保留；错误标签状态机。 |
| `logBadTagResult` | 统一错误标签日志格式和完整 URL。 | 保留；多结果分支复用。 |
| `fetchRepositoryText` | 用 GM 请求读取跨域 Repository 并接入统一生命周期。 | 保留；跨域传输适配器。 |
| `processBadTags` | 读取报告、选择批次、执行纠正、保存终态并安排后续。 | 保留；错误标签编排入口。 |
| `markKnown` | `processBadTags` 内部保存单条终态指纹。 | 保留为局部函数；正常与锁定分支共用。 |
| `findTagsNeedingUpvote` | 从最新 DOM 排除已有、赞成和受保护踩票标签。 | 保留；提交前最终检查。 |
| `reconcileTagVoteBatch` | 写后判断已确认标签和未确认标签。 | 保留；验证纯函数和测试入口。 |
| `logCorrectionAudit` | 对修正状态关键日志进行会话去重。 | 保留；结构化审计入口。 |
| `logTargetCorrectionPolicy` | 只记录需要可见说明的修正阻断或派生策略。 | 保留；过滤日志噪声。 |
| `logDownvotedTags` | 记录普通和 uncensored 人工踩票保护。 | 保留；两种审计格式不同。 |
| `logDerivedTagResult` | 记录标题派生标签写后成功或失败。 | 保留；派生失败不重试语义。 |
| `transferTagsToTarget` | 复用快照、复核目标、规划批次、写入并验证单个目标。 | 保留；单目标写入主状态机。 |

## 搜索、迁移、日志与导出编排

| 函数 | 含义 | 审计结论 |
| --- | --- | --- |
| `discoverSearchCandidates` | 执行 GN 优先、GJ 回退搜索并合并查询命中。 | 保留；四阶段“发现”。 |
| `runQueryStage` | `discoverSearchCandidates` 内部执行指定语言阶段。 | 保留为局部函数；英文和日文共用。 |
| `prefilterSearchCandidates` | 只用列表标题、页数和标签同步排除未通过候选。 | 保留；四阶段“预筛”，直接复用任务预览评估且不产生请求。 |
| `chooseProgressiveDetailCandidates` | newest 读取全部，all 按语言限制详情数量。 | 保留；详情请求控制规则。 |
| `loadProgressiveCandidateDetails` | 读取完整候选并再次复核标题、页数和语言。 | 保留；候选之间继续随机等待，最后一个完成后不再空等。 |
| `selectFinalSearchCandidates` | 应用迁移方向和分差得到最终候选。 | 保留；四阶段“最终选择”。 |
| `runSearchPipeline` | 按四个命名阶段传递候选快照。 | 保留；稳定管线接口。 |
| `executeTransferPlan` | 构造来源/目标、普通并集、敏感策略和随机省略后逐目标迁移。 | 保留；单任务迁移编排。 |
| `validateGallery` | 确认画廊 URL、标题、页数和标签结构完整。 | 保留；主页与详情共用。 |
| `processCurrentGallery` | 读取当前详情页并运行迁移任务。 | 保留；详情页入口。 |
| `scanHomepage` | 按布局和游标扫描主页增量并保存结果。 | 保留；主页发现入口。 |
| `processHomepage` | 在预算内领取任务、迁移并保存完成或失败。 | 保留；主页队列执行器。 |
| `setStatus` | 更新面板瞬时三行状态。 | 保留；高频状态不进入日志。 |
| `sanitizeLogUrl` | 只允许 HTTP(S) 日志链接。 | 保留；面板与 TXT 安全边界。 |
| `sanitizeCorrectionLogDetails` | 规范修正状态结构化日志。 | 保留；导出数据边界。 |
| `sanitizeRandomSkipLogDetails` | 规范随机省略结构化日志。 | 保留；导出数据边界。 |
| `createLogEntry` | 创建统一时间、级别、URL 和可选审计的日志记录。 | 保留；日志模型入口。 |
| `trimLogEntries` | 原地限制日志数量。 | 保留；内存上限和测试接口。 |
| `formatLogEntry` | 将普通日志格式化为 TXT 行。 | 保留；导出复用。 |
| `buildBadTagAuditExportText` | 生成错误标签频次、候选和画廊明细。 | 保留；独立导出段。 |
| `buildCorrectionAuditExportText` | 生成修正状态证据段。 | 保留；独立导出段。 |
| `buildRandomSkipAuditExportText` | 生成随机省略完整标签段。 | 保留；独立导出段。 |
| `buildLogExportText` | 合并普通日志和三类结构化审计并加 BOM/CRLF。 | 保留；TXT 主构建器。 |
| `buildLogExportFilename` | 生成安全时间戳文件名。 | 保留；导出和测试接口。 |
| `exportLog` | 创建 Blob、触发下载并释放 URL。 | 保留；UI 下载入口。 |
| `shouldDeferLogRender` | 判断页面隐藏时是否暂停日志 DOM 更新。 | 保留；后台性能测试接口。 |
| `createLogElement` | 创建安全文本和链接日志节点。 | 保留；不使用 innerHTML。 |
| `canRenderLogs` | 同时检查面板存在和页面可见。 | 保留；追加与重绘共用。 |
| `renderLogEntries` | 一次重绘最近 20 条日志。 | 保留；后台恢复入口。 |
| `appendLog` | 过滤关键日志、维护 1000 条内存并按需更新面板/控制台。 | 保留；统一日志写入口。 |

## 调度、生命周期、Worker 与 UI

| 函数 | 含义 | 审计结论 |
| --- | --- | --- |
| `clearRuntimeTimer` | 按字段名清除 schedule/lifecycle 定时器。 | 保留；由两个重复清理函数合并而来。 |
| `persistScheduleState` | 保存绝对下次运行时间和随机窗口。 | 保留；主页状态写入口。 |
| `getScheduleState` | 把绝对时间归类为无计划、等待或到期。 | 保留；生命周期纯规则。 |
| `getScheduleSignature` | 为起止时间和波动生成配置签名。 | 保留；窗口复用判断。 |
| `getLocalDayStart` | 取得本地逻辑日零点并支持日偏移。 | 保留；普通和跨午夜共用。 |
| `getScheduleDayKey` | 将逻辑日生成稳定日期键。 | 保留；窗口持久键。 |
| `getScheduleWindowDayStart` | 从窗口键安全恢复本地逻辑日。 | 保留；持久窗口校验。 |
| `getEffectiveScheduleJitter` | 将配置波动限制在不反转窗口的范围。 | 保留；窄窗口安全规则。 |
| `createDailyScheduleWindow` | 为逻辑日生成并固定随机绝对起止时间。 | 保留；调度核心纯函数。 |
| `resolveDailyScheduleWindow` | 复用兼容窗口或创建当前/下一逻辑日窗口。 | 保留；跨午夜和刷新核心。 |
| `isWithinDailyScheduleWindow` | 判断时间是否位于实际自动窗口内。 | 保留；运行门槛和测试接口。 |
| `alignScheduledRunAt` | 把周期时间对齐到当前或下一窗口开始。 | 保留；单定时器调度纯函数。 |
| `getPersistedScheduleState` | 按主页/详情模式取得当前调度快照。 | 保留；两种页面共用。 |
| `logScheduleWindow` | 每个窗口只显示一次实际起止时间。 | 保留；日志去重。 |
| `scheduleNextRun` | 计算周期抖动、对齐窗口并设置唯一 schedule 定时器。 | 保留；调度主入口。 |
| `getCurrentScheduleWindow` | 为本轮解析、记录并持久化实际窗口。 | 保留；运行前副作用集中。 |
| `shouldStopAutomaticWork` | 到达结束边界后设置安全软停止。 | 保留；扫描、迁移和错误标签共用。 |
| `reconcileLifecycleState` | 页面恢复时判断续租、等待、补跑或重新调度。 | 保留；冻结恢复状态机。 |
| `scheduleLifecycleHeartbeat` | 使用唯一 lifecycle 定时器周期协调页面状态。 | 保留；后台恢复机制。 |
| `applyGlobalPauseState` | 应用本地或远端全局停止变化。 | 保留；跨站同步状态机。 |
| `setupGlobalPauseSync` | 注册 GM 值变化监听。 | 保留；初始化一次。 |
| `pauseAllPages` | 写入全局停止并立即终止当前页。 | 保留；停止按钮入口。 |
| `resumeAllPages` | 解除全局停止并按选项手动运行。 | 保留；重新开始按钮入口。 |
| `stopWorker` | 中止请求、清理运行状态并按需暂停调度。 | 保留；统一停止入口。 |
| `acquireWorkerLock` | 尝试取得并复核同源 Worker 租约。 | 保留；竞争安全边界。 |
| `saveRunMarker` | 保存本轮所有者和开始时间。 | 保留；刷新恢复证据。 |
| `resetWorkerAfterLockFailure` | 失去租约时恢复 UI 和调度状态。 | 保留；锁失败清理集中。 |
| `runWorker` | 串行执行主页/详情迁移、错误标签和 finally 调度。 | 保留；唯一 Worker 主入口。 |
| `updateControlState` | 根据运行、停止和定时状态更新四个按钮。 | 保留；UI 状态集中。 |
| `handleLifecycleSuspend` | 页面隐藏/卸载时清理定时器并记录恢复意图。 | 保留；生命周期事件入口。 |
| `shouldHandleLifecycleResume` | 判断哪些恢复事件应在当前可见性下处理。 | 保留；防止重复恢复。 |
| `handleLifecycleResume` | 恢复日志、续租并协调待执行周期。 | 保留；多个浏览器恢复事件共用。 |
| `detectPageMode` | 识别未过滤主页或有效画廊详情页。 | 保留；初始化路由。 |
| `initialize` | 幂等创建样式/面板、注册事件并启动或等待调度。 | 保留；浏览器唯一启动入口。 |

## 本轮已合并或删除的函数

`0.2.6.4` 彻底撤销批量元数据预筛，删除 `parseGalleryIdentity`、`decodeHtmlEntities`、`buildGdataBatches`、`normalizeGdataMetadata`、`mergeGdataCandidates`、`fetchGdataBatch` 与 `enrichCandidatesWithGdata`；预筛恢复为直接使用列表快照的同步纯函数。

| 原函数 | 合并去向 |
| --- | --- |
| `normalizeComparableTitle` | 纯别名，全部调用直接使用 `normalizeComparableText`。 |
| `findSearchResultPageCount` | 合入 `readSearchResultPageCount`，不再来回转换文本数组。 |
| `getSearchWaitMs` | 合入 `waitForSearchThrottle`。 |
| `getRetryDelay` | 合入 `withReadRetry`，退避公式保持不变。 |
| `rememberGallerySnapshot` | 合入 `fetchGallerySnapshot`。 |
| `getTitleFieldLabel` | 合入 `compareTitleSets` 的字段结果构造。 |
| `isTerminalBadTagStatus` | 直接读取 `BAD_TAG_OUTCOME_META` 已有的 `terminal` 字段。 |
| `isBadTagVoteLockedMessage` | 合入 `submitTagVoteRequest` 的 API 错误分类。 |

`0.2.6.2` 已先行合并 `readGalleryPageCount`／`readGalleryPostedAt`、`clearScheduleTimer`／`clearLifecycleTimer`，并删除 `getGalleryListLayout` 与 `announceSearchPhase`；它们的现行归宿分别是 `readGalleryDetails`、`clearRuntimeTimer`、`parseGalleryList` 和 `runSearchPipeline`。

## 结论

当前剩余函数都对应至少一种不可互换职责：纯规则、存储边界、网络适配、状态机阶段、浏览器事件入口或稳定测试接口。继续仅按“函数数量”合并会把取消竞态、四阶段搜索、写后验证或跨标签页协调重新塞回大型函数，降低可审计性，因此本轮停止在上述安全边界。
