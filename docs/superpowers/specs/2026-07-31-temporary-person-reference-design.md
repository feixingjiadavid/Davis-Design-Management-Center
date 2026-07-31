# Davis Video 临时真人参考与版本级素材权利确认设计

日期：2026-07-31  
状态：已确认设计，待实施计划

## 1. 目标

让普通用户上传生活照、合影或活动照片时，获得尽可能接近即梦的单次视频生成体验，同时保留公开 Ark API 的真实安全边界和完整诊断能力。

本设计不通过修改 prompt、修改图片、Base64 重传、切换 URL、在 `first_frame` 与 `reference_image` 间反复重试或自动转入 Asset 来规避安全策略。

## 2. 已确认的产品模式

### 2.1 temporary_reference_person

适用于普通生活照、合影、活动照片等一次性生成。

流程：

1. 用户上传原始素材。
2. 素材分析层记录图片尺寸、真人数量、是否多人合照、是否生活照等诊断特征。
3. 当前项目版本尚无有效权利确认时，前端显示一次简洁确认：
   “我确认已获得该图片/视频素材的合法使用权，并承担由此产生的责任。”
4. 确认后按用户选择的真实生成类型提交：
   - 首帧模式：`first_frame`
   - 参考图模式：`reference_image`
5. 不因为 `contains_real_person=true` 阻断提交。
6. 每个任务只提交一次，不进行角色互换重试。
7. Ark 接受后进入正常生成、回调、Google Drive 同步流程。
8. Ark 返回 `InputImageSensitiveContentDetected.PrivacyInformation` 时进入 `provider_policy_blocked`。

项目版本级权利声明不等于真人身份认证，也不保证 Ark 接受任务。

### 2.2 real_person_asset_video

仅适用于固定人物 IP、数字员工或需要长期复用的真人角色。

流程使用官方授权后的 `asset://<asset_id>`，并以 `reference_image` 提交。该模式与 temporary_reference_person 完全独立，不自动互相转换。

## 3. 项目版本与确认记录

### 3.1 服务端版本身份

为 `video_projects` 增加：

- `version_root_id uuid`：同一项目版本链的根项目。
- `version_number integer`：V-1、V-2、V-3 的数字版本。
- `version_source_project_id uuid`：新版本来源项目，可空。

历史项目按 owner 和项目基础名称分组：解析已有 V-N 名称，将同组最早版本作为 `version_root_id`，保留解析出的 `version_number`；无法识别版本后缀的项目按 V-1 处理。后续 V-2/V-3 克隆时继承根项目并递增版本号。

### 3.2 权利确认表

新增 `video_material_rights_confirmations`：

- `id uuid`
- `project_id uuid`：版本链根项目 ID
- `version_id uuid`：当前 `video_projects.id`
- `user_id uuid`
- `confirmed_at timestamptz`
- `terms_version text`
- `confirmation_type text`，固定为 `temporary_reference_person_material_rights`
- `created_at timestamptz`

唯一约束：`(version_id, user_id, terms_version, confirmation_type)`。

RLS 只允许用户查看和创建自己的确认记录；服务端提交函数仍会再次验证项目归属。

同一版本的 prompt 调整、参数修改、失败重试和重新生成无需重复确认。创建 V-2/V-3 后必须重新确认。

## 4. 任务路由

任务构造器不再根据“只有一张图片”猜测角色。提交请求必须携带显式模式：

- `text_to_video`
- `image_first_frame`
- `first_last_frame_video`
- `reference_image_video`
- `temporary_reference_person`
- `real_person_asset_video`
- `multi_reference_storyboard`

`temporary_reference_person` 还必须包含 `image_role`，枚举为 `first_frame` 或 `reference_image`。后端只按显式值构造一次请求。

后台环境变量 `ENABLE_TEMP_PERSON_REFERENCE=true` 控制该模式是否允许提交。关闭时保留项目和素材，返回可诊断的功能禁用状态，不回退 Asset。

## 5. 状态与错误处理

新增公开状态 `provider_policy_blocked`。

触发条件仅为 Ark 返回：

`InputImageSensitiveContentDetected.PrivacyInformation`

用户提示固定为：

“当前视频模型对该真人参考图片进行了安全限制。素材已保存，你可以：  
① 更换参考图片重新生成  
② 使用真人素材授权模式获得更稳定效果”

前端不得暴露 Ark、请求 ID、模型名或原始响应。后台保留完整原始响应。

不自动执行：

- 转为 Asset
- 修改 prompt
- 修改或重新编码图片
- Base64 重传
- 更换图片 URL
- `first_frame` / `reference_image` 互换
- 自动再次提交

## 6. 任务诊断数据

为 `video_tasks` 增加 `metadata jsonb not null default '{}'`。

发生策略拦截时至少保存：

```json
{
  "error_type": "InputImageSensitiveContentDetected.PrivacyInformation",
  "provider": "ark",
  "model": "doubao-seedance-2-0-mini-260615",
  "submit_mode": "temporary_reference_person",
  "image_role": "first_frame",
  "request_id": "...",
  "retry_count": 0
}
```

模型字段保存实际请求模型 ID，不使用模糊别名。原始 provider response 继续保存在 `provider_response`。

## 7. 调查日志

新增 `video_provider_policy_events`：

- `id uuid`
- `task_id uuid`
- `owner_id uuid`
- `provider text`
- `model text`
- `submit_mode text`
- `image_role text`
- `error_type text`
- `outcome text`，枚举为 `submitted`、`accepted`、`policy_blocked`、`provider_failed`、`succeeded`
- `request_id text`
- `retry_count integer`
- `image_kind text`
- `real_person_count integer`
- `is_group_photo boolean`
- `is_lifestyle_photo boolean`
- `image_width integer`
- `image_height integer`
- `analysis_confidence numeric`
- `created_at timestamptz`

日志只保存分类和尺寸，不复制人脸特征、图像内容或生物识别模板。后台可按模型、角色、图片类型和日期统计拒绝率。

为避免选择性偏差，所有 temporary_reference_person 提交都记录一次调查事件；成功与拒绝通过 `outcome` 字段区分，允许计算真实拒绝率。

## 8. 回调与 Google Drive

Ark 请求继续增加：

- `callback_url`
- `safety_identifier`

`safety_identifier` 使用服务端 HMAC 生成的稳定匿名用户标识，不包含邮箱或用户名。

新增 `seedance-callback`：

1. 验证回调令牌并按 provider task ID 去重。
2. 快速保存状态和 provider 响应。
3. 成功时保存 Seedance 临时 `video_url` 历史。
4. 返回 2xx。
5. Worker 异步下载视频并上传 Google Drive。
6. 前端只在 Google Drive 状态完成后展示最终视频。

保留低频超时兜底查询，不再由前端刷新触发长期高频轮询。

## 9. 安全与权限

- 权利确认只能由当前登录用户为自己的项目版本创建。
- 服务端提交时验证确认记录、项目归属和版本匹配。
- 超级管理员可查看调查统计，不可代替用户确认素材使用权。
- `real_person_asset_video` 必须验证对应 Asset 映射处于官方可用状态。
- callback 使用不可猜测的服务端令牌并保证幂等。

## 10. 测试与验收

至少覆盖：

1. 纯文字任务无需权利确认。
2. 非真人首帧按 `first_frame` 提交。
3. 非真人参考图按 `reference_image` 提交。
4. 真人生活照首次提交出现一次权利确认。
5. 同版本修改 prompt、参数、失败重试不重复确认。
6. V-2/V-3 必须重新确认。
7. temporary_reference_person 不因分析结果而自动阻断。
8. PrivacyInformation 映射为 `provider_policy_blocked`，只提交一次。
9. 用户提示不包含 Ark 技术细节。
10. 诊断 metadata 与调查事件字段完整。
11. real_person_asset_video 使用 `asset://` 且不由临时模式自动进入。
12. callback 幂等处理成功、失败和重复投递。
13. Seedance 成功后保存临时 URL 历史，Google Drive 上传完成后前端从 Drive 恢复播放。
14. 页面刷新、换电脑后可从数据库和 Google Drive 恢复项目结果。

## 11. 备选方案与决策

已拒绝方案：

- 检测到真人即强制 Asset：降低普通用户体验，并把使用权声明错误等同于官方真人认证。
- PrivacyInformation 后自动切换角色或重新提交：缺乏官方依据，可能重复扣费。
- 把拒绝定义为 `provider_capability_gap`：目前无法证明即梦与公开 Ark 的内部能力差异。

采用方案：

Davis 提供一次性 `temporary_reference_person` 产品模式，正常提交一次；官方接受则生成，官方拒绝则准确记录为 `provider_policy_blocked`。长期真人复用继续使用独立官方 Asset 模式。
