'use strict';

[
  'hv_monster_pl_planner_url_match_test.js',
  'hv_monster_pl_planner_live_target_test.js',
  'hv_monster_pl_planner_batch_rename_test.js',
  'hv_monster_manager_v030_test.js',
  'hv_monster_manager_slim_refactor_test.js',
  'hv_monster_manager_selection_test.js',
  'hv_monster_manager_cache_test.js',
  'hv_monster_manager_layout_test.js',
  'hv_monster_manager_hvutils_addon_test.js',
  'hv_monster_manager_compaction_test.js',
  'hv_monster_manager_v035_test.js',
  'dokidoki_manager_compat_test.js',
].forEach((file) => require(`./${file}`));
