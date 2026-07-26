# Seedance 任务状态闭环设计

## 目标

在不修改 UI、不改变现有表结构的前提下，让 Ark 创建后的 video_tasks 自动从 queued 推进到运行、成功或失败，并将审核失败原因写入 error_message，成功时写入 video_outputs。

## 已确认根因

1. 线上 pg_cron 没有 Seedance 任务；前端 5 秒轮询只读取 Supabase 表，不查询 Ark。
2. seedance-status 仅把 failed/error/cancelled 归为失败，遗漏 rejected、content_policy 和审核错误文案。
3. 线上 Edge Functions 没有纳入 GitHub main，仓库与部署版本漂移。

## 方案

新增纯函数状态模块，统一解析 Ark 的顶层/嵌套状态、错误消息和视频 URL。seedance-status 与后台 seedance-worker 复用同一映射：

- queued -> queued, progress 至少 20
- processing/running -> running, progress 至少 60
- succeeded/completed -> succeeded, progress 100
- failed/rejected/cancelled/content_policy -> failed, progress 100，并保存 Ark 错误
- 状态字段未知但错误文本包含 sensitive、content policy、safety check、审核/敏感/安全检查时 -> failed

worker 每分钟扫描 queued/running/processing/submitting 且存在 provider_task_id 的任务，逐一查询 Ark；更新 video_tasks 和关联 video_segments。成功且存在视频 URL 时，幂等写入 video_outputs，以 task_id 查重，保存 Ark URL 到 metadata。

worker 使用 verify_jwt=true，只接受 service-role JWT。cron 通过 Vault 中的 service role key 调用，避免公开可触发的 service-role 处理入口。

## 测试与验证

用 Node 内置测试运行纯函数与持久化编排测试，先验证现有实现缺失时失败，再实现。部署后手动触发 worker，查询 cgt-20260726165717-jgtns，断言状态不再是 queued；若 Ark 返回审核失败，断言 status=failed 且 error_message 非空。

## 范围

不修改 seedance/app.js、seedance/app-v46.js、ai-assistant.html，不新增或重建业务表。
