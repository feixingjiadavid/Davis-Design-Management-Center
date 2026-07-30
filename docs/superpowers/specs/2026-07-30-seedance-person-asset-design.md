# Seedance 真人素材资产化设计

日期：2026-07-30

## 目标

Davis Video 不修改用户生成提示词、不更换 Seedance 2.0 Mini。普通图片继续使用原图 URL；可能包含真人的图片优先复用已授权的火山 Asset ID，并用 `asset://<asset_id>` 作为 `reference_image`。没有可用授权资产时，任务进入 `asset_auth_required`，不记录为模型失败，也不向前端暴露 Ark 原始错误。

## 已确认根因

当前 `seedance-submit` 将 Supabase 原图签名 URL 写入 Ark `content[].image_url.url`。单图第一次使用 `first_frame`；Ark 返回 `InputImageSensitiveContentDetected.PrivacyInformation` 后，worker 仅把 role 改成 `reference_image` 再提交。该重试仍是普通 URL，不具备真人肖像授权语义。

Ark 能返回真人检测结果，说明 URL 已被成功读取；URL 与 Base64 只是传输形式，不能替代可信素材授权。火山官方真人链路要求真人认证后取得 Asset ID，并使用 `asset://...`。

## 数据模型

新增 `video_provider_assets`：

- `id uuid`
- `owner_id uuid`
- `video_asset_id uuid`
- `provider text`，固定 `volcengine_ark`
- `asset_group_id text`
- `asset_id text`
- `authorization_status text`：`pending_auth | active | rejected | expired`
- `source_fingerprint text`
- `provider_response jsonb`
- `created_at/updated_at timestamptz`

表启用 RLS；用户只能读取自己的映射，写入仅由服务端执行。

## 后端数据流

1. `seedance-submit` 收集任务引用图片。
2. 按 `video_asset_id` 查询 `video_provider_assets`。
3. 存在 `active` Asset ID：请求内容改为 `asset://<asset_id>`，role 为 `reference_image`。
4. 不存在映射：普通非真人图片仍按当前 URL 请求。
5. Ark 返回真人隐私错误：停止 role 变换重试，将任务更新为 `asset_auth_required`，保存 request id 和引用图片编号，但不保存/展示原始错误正文。
6. Assets API 权限可用时，由独立适配器创建/查询素材；权限不可用或首次授权尚未完成时，保持 `asset_auth_required`。
7. 授权完成并写入 Asset ID 后，重新提交同一段时自动走 `asset://`。

## 前端状态

新增 `asset_auth_required`，文案为“检测到真人参考素材，需要完成真人素材认证后才能生成。”该状态不归类为 `provider_failed`，允许用户重新编辑或授权后重试。

## 权限探测

后端记录三项结果：

- Seedance 2.0 Mini 创建任务权限；
- Assets API 调用权限；
- 真人 Asset Group/Asset 管理权限。

探测不得输出密钥；仅记录 HTTP 状态、provider code、request id 和能力布尔值。

## 测试

- 请求形状：active Asset ID 必须生成 `asset://...` + `reference_image`。
- 普通图片：仍生成原始签名 URL。
- 真人拒绝：状态为 `asset_auth_required`，不执行第二次普通 URL 请求。
- 前端：状态与用户文案正确，原始 Ark 错误不显示。
- 权限探测：输出能力矩阵，不泄露凭据。
