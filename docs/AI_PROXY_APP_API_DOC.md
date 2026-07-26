# AI Proxy Service API 文档（手机 App 开发版）

生成时间：2026-07-26 15:40 GMT+8  
目标容器：`ai-proxy-service`  
镜像：`ghcr.io/veildawn/ai-proxy-release:latest`  
宿主端口：

- Web/API 管理端：`http://<host>:18083` → 容器 `8080`
- OpenAI/Anthropic 网关端：`http://<host>:11455` → 容器 `1455`（本次 `/` 空响应，实际业务路径见 `/v1/*`）
- OAuth 回调端：`http://<host>:54546` → 容器 `54545`

> 说明：当前服务未发现 `/openapi.json`、Swagger 或内置 OpenAPI 描述。本文件基于：
> 1. 容器运行态探测；2. React 前端静态资源中的 API 调用；3. Go 二进制中的路由字符串；4. 少量公开接口实测响应。
>
> 字段标注：
> - **实测**：本机已请求拿到响应。
> - **前端推断**：前端代码引用，可用于 App 对接，但建议联调确认。
> - **兼容协议**：遵循 OpenAI / Anthropic 协议返回结构。

---

## 1. 全局约定

### 1.1 Base URL

管理后台 / App API：

```text
http://<host>:18083/api/v1
```

AI 网关兼容接口：

```text
http://<host>:18083/v1
# 或按部署暴露：
http://<host>:11455/v1
```

### 1.2 Content-Type

除文件导入/导出外，默认：

```http
Content-Type: application/json
```

### 1.3 Web 管理 API 鉴权

前端请求使用 Cookie Session：

```http
Cookie: session=...
```

未登录/权限不足常见响应：

```json
{"error":"missing authorization"}
```

前端 API 客户端约定：HTTP 非 2xx 时，若响应 JSON 包含 `error` 字段，会作为错误消息展示。

### 1.4 AI 网关 API 鉴权

兼容 OpenAI/Anthropic API Key：

```http
Authorization: Bearer <API_KEY>
# 或
x-api-key: <API_KEY>
```

实测未携带 key 时 `/v1/models` 返回：

```json
{
  "error": {
    "code": "invalid_api_key",
    "message": "missing api key",
    "param": null,
    "type": "invalid_request_error"
  }
}
```

---

## 2. App 优先对接接口

手机 App 通常只需要以下模块：

1. 认证：登录、注册、退出、找回密码、公开配置。
2. API Key：创建/查看/删除网关 Key。
3. 模型：用户可见模型列表、隐藏模型配置。
4. 用量：概览、趋势、请求日志、额度。
5. 套餐/余额：计划、余额、订阅。
6. AI 调用：`/v1/models`、`/v1/chat/completions`、`/v1/messages`、`/v1/responses`、`/v1/images/generations`。

---

## 3. 公开与认证接口

### 3.1 获取公开配置

```http
GET /api/v1/auth/public-config
```

鉴权：无  
来源：实测

响应字段：

| 字段 | 类型 | 说明 |
|---|---:|---|
| `allow_open_registration` | boolean | 是否允许开放注册 |
| `email_verification_enabled` | boolean | 是否启用邮箱验证码 |
| `require_invite_code` | boolean | 注册是否要求邀请码 |
| `site_name` | string | 站点名称 |

实测响应：

```json
{
  "allow_open_registration": true,
  "email_verification_enabled": false,
  "require_invite_code": false,
  "site_name": "AI Proxy"
}
```

### 3.2 获取初始化状态

```http
GET /api/v1/setup/status
```

鉴权：无  
来源：实测

响应字段：

| 字段 | 类型 | 说明 |
|---|---:|---|
| `initialized` | boolean | 是否已初始化管理员 |

实测响应：

```json
{"initialized": true}
```

### 3.3 初始化管理员

```http
POST /api/v1/setup/admin
```

鉴权：仅初始化阶段  
来源：前端推断

请求字段（前端表单推断）：

| 字段 | 类型 | 说明 |
|---|---:|---|
| `email` | string | 管理员邮箱 |
| `password` | string | 密码，后端提示至少 8 位 |
| `name` | string? | 昵称/名称，若页面要求则传 |

返回：创建会话或用户对象（需联调确认）。

### 3.4 登录

```http
POST /api/v1/auth/login
```

鉴权：无  
来源：前端推断

请求字段：

| 字段 | 类型 | 说明 |
|---|---:|---|
| `email` | string | 邮箱 |
| `password` | string | 密码 |

响应：设置 `session` Cookie，并返回当前用户/会话信息（需联调确认）。

### 3.5 注册

```http
POST /api/v1/auth/register
```

鉴权：无  
来源：前端推断

请求字段：

| 字段 | 类型 | 说明 |
|---|---:|---|
| `email` | string | 邮箱 |
| `password` | string | 密码 |
| `name` | string? | 名称 |
| `invite_code` | string? | 邀请码，`require_invite_code=true` 时必填 |
| `code` | string? | 邮箱验证码，启用邮箱验证时必填 |

### 3.6 发送验证码

```http
POST /api/v1/auth/send-code
```

来源：前端推断

请求字段：

| 字段 | 类型 | 说明 |
|---|---:|---|
| `email` | string | 邮箱 |
| `purpose` | string? | 用途，如注册/重置密码；具体枚举需联调 |

### 3.7 重置密码

```http
POST /api/v1/auth/reset-password
```

来源：前端推断

请求字段：

| 字段 | 类型 | 说明 |
|---|---:|---|
| `email` | string | 邮箱 |
| `code` | string | 验证码 |
| `password` | string | 新密码 |

### 3.8 API Key 快捷登录

```http
POST /api/v1/auth/api-key-login
```

来源：前端推断（`key-overview` 页面）

请求字段：

| 字段 | 类型 | 说明 |
|---|---:|---|
| `api_key` | string | 网关 API Key，通常以 `aps_` 开头 |

用途：App 可以支持用户直接输入网关 Key 查看自己的 key overview。

### 3.9 退出登录

```http
POST /api/v1/auth/logout
```

来源：前端推断

响应：通常 `204 No Content` 或简单 JSON。

---

## 4. 用户端 Dashboard API

> 以下接口均需 Cookie Session。路径均以 `/api/v1` 为前缀。

### 4.1 当前用户 / Profile

前端页面：`/dashboard/profile`

可能接口：

```http
GET /api/v1/profile
PUT /api/v1/profile
DELETE /api/v1/profile
```

字段（前端/后端字符串推断）：

| 字段 | 类型 | 说明 |
|---|---:|---|
| `id` | string/int | 用户 ID |
| `email` | string | 邮箱 |
| `name` | string | 名称 |
| `role` | string | `user` / `admin` / `super_admin` |
| `disabled` | boolean | 是否禁用 |
| `created_at` | string | 创建时间 |
| `updated_at` | string | 更新时间 |

### 4.2 Key Overview

```http
GET /api/v1/key-overview/overview
```

来源：前端推断

用途：API Key 登录后的轻量总览页。

可能响应字段：

| 字段 | 类型 | 说明 |
|---|---:|---|
| `key` | object | 当前 Key 信息 |
| `models` | array | 可用模型 |
| `usage` | object | 用量概览 |
| `quota` | object | 额度/余额 |

### 4.3 用户 API Keys

前端页面：`/dashboard/keys`

推断接口：

```http
GET /api/v1/keys
POST /api/v1/keys
DELETE /api/v1/keys/:id
PATCH /api/v1/keys/:id
```

Key 字段（前端/业务推断）：

| 字段 | 类型 | 说明 |
|---|---:|---|
| `id` | string/int | Key ID |
| `name` | string | Key 名称 |
| `prefix` | string | 展示用前缀 |
| `secret` | string? | 新建时一次性返回完整 key |
| `created_at` | string | 创建时间 |
| `last_used_at` | string/null | 最近使用时间 |
| `expires_at` | string/null | 过期时间 |
| `disabled` | boolean | 是否禁用 |
| `scopes` | string[] | 权限范围 |

创建 Key 请求字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---:|---:|---|
| `name` | string | 是 | Key 名称 |
| `expires_at` | string/null | 否 | 过期时间 |
| `scopes` | string[] | 否 | 权限范围 |

### 4.4 用户可见模型

```http
GET /api/v1/models
GET /api/v1/models/visibility
PUT /api/v1/models/visibility
```

来源：前端页面 `/dashboard/models` + 二进制字符串

模型字段：

| 字段 | 类型 | 说明 |
|---|---:|---|
| `id` | string | 模型 ID，调用 AI 接口时使用 |
| `object` | string | 通常 `model` |
| `owned_by` | string | 提供方/所有者 |
| `provider` | string | 上游供应商 |
| `family` | string | `openai` / `anthropic` 等协议族 |
| `modalities` | string[] | 能力，如 `text`、`image` |
| `prompt_price_per_1m` | number | 输入价格/百万 token |
| `completion_price_per_1m` | number | 输出价格/百万 token |
| `hidden` | boolean | 是否对当前用户隐藏 |
| `free` | boolean | 是否免费 |

### 4.5 用户套餐 / 余额

前端页面：`/dashboard/plans`

推断接口：

```http
GET /api/v1/plans
GET /api/v1/users/me/balance
```

Plan 字段：

| 字段 | 类型 | 说明 |
|---|---:|---|
| `id` | string/int | 套餐 ID |
| `name` | string | 套餐名 |
| `description` | string | 描述 |
| `price` | number | 价格 |
| `currency` | string | 币种 |
| `limits` | object | 限额配置 |
| `created_at` | string | 创建时间 |

Balance 字段：

| 字段 | 类型 | 说明 |
|---|---:|---|
| `balance` | number | 当前余额 |
| `currency` | string | 币种 |
| `credit` | number? | 赠送/信用额度 |

### 4.6 用户用量概览与趋势

前端页面：`/dashboard/usage`

推断接口：

```http
GET /api/v1/usage/overview
GET /api/v1/usage/trend
GET /api/v1/usage/analysis
GET /api/v1/usage/quota/limit
```

常见 Query：

| 参数 | 类型 | 说明 |
|---|---:|---|
| `from` / `start` | string | 开始时间/日期 |
| `to` / `end` | string | 结束时间/日期 |
| `range` | string | 时间范围，如 day/week/month |

Overview 字段（推断）：

| 字段 | 类型 | 说明 |
|---|---:|---|
| `request_count` | number | 请求数 |
| `total_tokens` | number | 总 token |
| `prompt_tokens` | number | 输入 token |
| `completion_tokens` | number | 输出 token |
| `cost` | number | 费用 |
| `cache_read_tokens` | number? | 缓存读 token |
| `cache_write_tokens` | number? | 缓存写 token |

Trend item 字段：

| 字段 | 类型 | 说明 |
|---|---:|---|
| `bucket_start` | string | 时间桶起点 |
| `count` / `request_count` | number | 请求数 |
| `total_tokens` | number | token 数 |
| `cost` | number | 费用 |

### 4.7 用户请求日志

前端页面：`/dashboard/requests`

推断接口：

```http
GET /api/v1/requests
```

Query：

| 参数 | 类型 | 说明 |
|---|---:|---|
| `limit` | number | 条数 |
| `cursor` | string | 分页游标 |
| `q` | string | 搜索关键词 |
| `model` | string | 模型过滤 |
| `status` | string | 状态过滤 |

请求日志字段：

| 字段 | 类型 | 说明 |
|---|---:|---|
| `id` | string | 请求 ID / trace ID |
| `created_at` | string | 创建时间 |
| `api_key_id` | string/int | 使用的 Key |
| `model` | string | 模型 |
| `provider` | string | 提供方 |
| `status` | string/int | 状态 |
| `status_code` | number | HTTP 状态码 |
| `latency_ms` | number | 延迟 |
| `prompt_tokens` | number | 输入 token |
| `completion_tokens` | number | 输出 token |
| `total_tokens` | number | 总 token |
| `cost` | number | 成本/计费 |
| `error` | string/null | 错误信息 |

---

## 5. AI 网关兼容接口

> 这些接口面向 App 的 AI 调用能力，鉴权使用网关 API Key。路径不带 `/api/v1`。

### 5.1 模型列表（OpenAI 兼容）

```http
GET /v1/models
Authorization: Bearer <API_KEY>
```

兼容协议：OpenAI

成功响应字段：

```json
{
  "object": "list",
  "data": [
    {
      "id": "model-id",
      "object": "model",
      "created": 0,
      "owned_by": "provider"
    }
  ]
}
```

错误响应实测：见 1.4。

### 5.2 Chat Completions（OpenAI 兼容）

```http
POST /v1/chat/completions
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

请求字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---:|---:|---|
| `model` | string | 是 | 模型 ID |
| `messages` | array | 是 | 对话消息 |
| `stream` | boolean | 否 | 是否流式 |
| `temperature` | number | 否 | 温度 |
| `max_tokens` | number | 否 | 最大输出 |
| `tools` | array | 否 | 工具调用 |
| `tool_choice` | string/object | 否 | 工具选择 |

非流式响应（OpenAI 兼容）：

```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "created": 0,
  "model": "model-id",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "...",
        "tool_calls": []
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
  }
}
```

流式响应：`text/event-stream`，事件 data 为 `chat.completion.chunk`。

### 5.3 Anthropic Messages 兼容

```http
POST /v1/messages
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

请求字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---:|---:|---|
| `model` | string | 是 | 模型 ID |
| `messages` | array | 是 | Anthropic 消息数组 |
| `max_tokens` | number | 是 | 最大输出 |
| `system` | string/array | 否 | 系统提示 |
| `stream` | boolean | 否 | 是否流式 |
| `tools` | array | 否 | 工具定义 |

响应遵循 Anthropic `/v1/messages`：

```json
{
  "id": "msg_...",
  "type": "message",
  "role": "assistant",
  "model": "model-id",
  "content": [
    {"type":"text","text":"..."}
  ],
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 0,
    "output_tokens": 0
  }
}
```

### 5.4 Anthropic Token 计数

```http
POST /v1/messages/count_tokens
```

请求：同 Anthropic count tokens。  
响应：

```json
{"input_tokens": 0}
```

### 5.5 OpenAI Responses API

```http
POST /v1/responses
```

二进制确认存在。返回遵循 OpenAI Responses API，支持流式事件（字符串中出现 `response.completed`、`response.function_call_arguments.delta/done`、`response.reasoning_summary_*` 等）。

### 5.6 Images Generations

```http
POST /v1/images/generations
```

请求字段（OpenAI 兼容）：

| 字段 | 类型 | 必填 | 说明 |
|---|---:|---:|---|
| `model` | string | 是 | 图像模型 |
| `prompt` | string | 是 | 提示词 |
| `n` | number | 否 | 数量 |
| `size` | string | 否 | 尺寸 |
| `response_format` | string | 否 | `url` / `b64_json` |

---

## 6. 管理端 API（Admin/Super Admin）

> App 如果做管理员端，需要对接本节。均需管理员 Cookie Session，且路径以 `/api/v1` 为前缀。

### 6.1 用户管理

```http
GET    /api/v1/admin/users
GET    /api/v1/admin/users/:id
PATCH  /api/v1/admin/users/:id
DELETE /api/v1/admin/users/:id
POST   /api/v1/admin/users/:id/balance
POST   /api/v1/admin/users/:id/subscriptions
```

用户字段：

| 字段 | 类型 | 说明 |
|---|---:|---|
| `id` | string/int | 用户 ID |
| `email` | string | 邮箱 |
| `name` | string | 名称 |
| `role` | string | 角色 |
| `disabled` | boolean | 是否禁用 |
| `balance` | number | 余额 |
| `created_at` | string | 创建时间 |
| `last_login_at` | string/null | 最近登录 |

### 6.2 邀请码

```http
GET    /api/v1/admin/invites
POST   /api/v1/admin/invites
PATCH  /api/v1/admin/invites/:id
DELETE /api/v1/admin/invites/:id
GET    /api/v1/admin/invites/:id/redemptions
```

字段：

| 字段 | 类型 | 说明 |
|---|---:|---|
| `id` | string/int | 邀请码 ID |
| `code` | string | 邀请码 |
| `max_redemptions` | number/null | 最大使用次数 |
| `redemptions` | number | 已使用次数 |
| `expires_at` | string/null | 过期时间 |
| `disabled` | boolean | 是否禁用 |

### 6.3 套餐计划

```http
GET    /api/v1/admin/plans
POST   /api/v1/admin/plans
PATCH  /api/v1/admin/plans/:id
DELETE /api/v1/admin/plans/:id
```

字段见 4.5，管理员额外可配置 `limits`、`quota`、`price`、`enabled`。

### 6.4 上游账号 Accounts

```http
GET    /api/v1/admin/accounts
POST   /api/v1/admin/accounts
PATCH  /api/v1/admin/accounts/:id
DELETE /api/v1/admin/accounts/:id
POST   /api/v1/admin/accounts/bulk
GET    /api/v1/admin/accounts/health
POST   /api/v1/admin/accounts/import
GET    /api/v1/admin/accounts/export
POST   /api/v1/admin/accounts/recover
POST   /api/v1/admin/accounts/:id/recover
GET    /api/v1/admin/accounts/:id/models
POST   /api/v1/admin/accounts/:id/models/test
POST   /api/v1/admin/accounts/:id/quota/reset
```

Account 字段（前端/业务推断）：

| 字段 | 类型 | 说明 |
|---|---:|---|
| `id` | string/int | 账号 ID |
| `provider` | string | 提供方，如 openai/anthropic/gemini/cursor/kiro 等 |
| `label` / `name` | string | 标签 |
| `status` | string | 状态 |
| `status_reason` | string | 状态原因 |
| `enabled` | boolean | 是否启用 |
| `priority` | number | 优先级 |
| `quota` | object | 额度信息 |
| `models` | string[] | 模型列表 |
| `proxy_id` | string/int/null | 代理 ID |
| `created_at` | string | 创建时间 |
| `updated_at` | string | 更新时间 |

### 6.5 OAuth / Kiro 导入流程

```http
POST /api/v1/admin/accounts/oauth/:provider/start
GET  /api/v1/admin/accounts/oauth/:provider/poll
POST /api/v1/admin/accounts/oauth/:provider/submit

POST /api/v1/admin/accounts/kiro/sso/start
GET  /api/v1/admin/accounts/kiro/sso/poll
POST /api/v1/admin/accounts/kiro/sso/submit
POST /api/v1/admin/accounts/kiro/sso/cancel
POST /api/v1/admin/accounts/kiro/sso/select-profile
POST /api/v1/admin/accounts/kiro/sso-token
POST /api/v1/admin/accounts/kiro/api-key
POST /api/v1/admin/accounts/kiro/iam-sso/start
POST /api/v1/admin/accounts/kiro/iam-sso/complete
GET  /api/v1/admin/accounts/oauth/kiro/start
GET  /api/v1/admin/accounts/oauth/kiro/poll
```

### 6.6 Providers

```http
GET    /api/v1/admin/providers
POST   /api/v1/admin/providers
GET    /api/v1/admin/providers/:id
PATCH  /api/v1/admin/providers/:id
DELETE /api/v1/admin/providers/:id
GET    /api/v1/admin/providers/builtin
GET    /api/v1/admin/providers/builtin/:name/models
PUT    /api/v1/admin/providers/builtin/:name/route-prefix
POST   /api/v1/admin/providers/:id/quota-test
```

Provider 字段：

| 字段 | 类型 | 说明 |
|---|---:|---|
| `id` | string/int | Provider ID |
| `name` | string | 名称 |
| `family` | string | `openai` / `anthropic` |
| `base_url` | string | 上游地址 |
| `route_prefix` | string | 路由前缀 |
| `models` | array/string[] | 模型 |
| `enabled` | boolean | 启用状态 |
| `quota_query` | object | 额度查询配置 |

### 6.7 Proxies

```http
GET    /api/v1/admin/proxies
POST   /api/v1/admin/proxies
PATCH  /api/v1/admin/proxies/:id
DELETE /api/v1/admin/proxies/:id
GET    /api/v1/admin/proxies/:id/impact
POST   /api/v1/admin/proxies/:id/test
PUT    /api/v1/admin/proxies/system
```

Proxy 字段：

| 字段 | 类型 | 说明 |
|---|---:|---|
| `id` | string/int | 代理 ID |
| `name` | string | 名称 |
| `scheme` | string | `http` / `https` / `socks5` |
| `host` | string | 主机 |
| `port` | number | 端口 |
| `username` | string/null | 用户名 |
| `enabled` | boolean | 是否启用 |
| `account_count` | number | 关联账号数量 |

### 6.8 模型目录 / 定价

```http
GET    /api/v1/admin/models
POST   /api/v1/admin/models
PATCH  /api/v1/admin/models/:id
DELETE /api/v1/admin/models/:id
POST   /api/v1/admin/models/sync
POST   /api/v1/admin/models/probe
POST   /api/v1/admin/models/cleanup
PUT    /api/v1/admin/models/enabled
GET    /api/v1/admin/snapshot/warnings
GET    /api/v1/admin/snapshot
```

Model 字段见 4.4，管理员额外可配置：

| 字段 | 类型 | 说明 |
|---|---:|---|
| `input_price_per_1m` | number | 输入价格 |
| `output_price_per_1m` | number | 输出价格 |
| `cache_read_per_1m` | number | 缓存读价格 |
| `cache_write_per_1m` | number | 缓存写价格 |
| `registry_hidden` | boolean | 注册表隐藏 |
| `user_hidden` | boolean | 用户隐藏 |

### 6.9 管理端用量 / 统计 / 日志

```http
GET /api/v1/admin/stats
GET /api/v1/admin/stats/overview
GET /api/v1/admin/stats/trend
GET /api/v1/admin/stats/analysis
GET /api/v1/admin/stats/models
GET /api/v1/admin/stats/users
GET /api/v1/admin/usage/overview/realtime
GET /api/v1/admin/usage/events
GET /api/v1/admin/usage/events/export
GET /api/v1/admin/logs/app
GET /api/v1/admin/logs/app?stream=true
GET /api/v1/admin/logs/requests
GET /api/v1/admin/traces
GET /api/v1/admin/traces/:id
```

统计字段同 4.6/4.7，管理员范围包含全站、模型、用户、供应商维度。

### 6.10 配置 / 邮件 / GitHub / 系统

```http
GET /api/v1/admin/config
PUT /api/v1/admin/config
POST /api/v1/admin/config/validate

GET /api/v1/admin/email/settings
PUT /api/v1/admin/email/settings
POST /api/v1/admin/email/test
POST /api/v1/admin/email/preview
GET /api/v1/admin/email/templates/defaults

GET /api/v1/admin/github/settings
PUT /api/v1/admin/github/settings

GET  /api/v1/admin/system/info
GET  /api/v1/admin/system/check-updates?force=true|false
GET  /api/v1/admin/system/update-settings
PUT  /api/v1/admin/system/update-settings
POST /api/v1/admin/system/update
POST /api/v1/admin/system/restart
POST /api/v1/admin/system/rollback
```

系统字段（推断）：

| 字段 | 类型 | 说明 |
|---|---:|---|
| `version` | string | 当前版本 |
| `image_version` | string | 镜像版本 |
| `update_available` | boolean | 是否有更新 |
| `latest_version` | string | 最新版本 |
| `app_env` | string | 运行环境 |
| `database` | object | 数据库状态 |

### 6.11 Management Tokens

```http
GET    /api/v1/admin/management-tokens
POST   /api/v1/admin/management-tokens
DELETE /api/v1/admin/management-tokens/:id
POST   /api/v1/admin/management-tokens/:id/revoke
```

字段：

| 字段 | 类型 | 说明 |
|---|---:|---|
| `id` | string/int | Token ID |
| `name` | string | 名称 |
| `token` | string? | 新建时一次性返回 |
| `scopes` | string[] | 权限 |
| `revoked_at` | string/null | 撤销时间 |
| `created_at` | string | 创建时间 |

---

## 7. 完整路由清单（前端确认）

以下 110 条来自前端静态资源调用点，App 开发可作为接口覆盖清单。实际 HTTP Method 需要按页面动作联调确认。

```text
/admin/accounts
/admin/accounts/:id
/admin/accounts/:id/models
/admin/accounts/:id/models/test
/admin/accounts/:id/quota/reset
/admin/accounts/:id/recover
/admin/accounts/bulk
/admin/accounts/export
/admin/accounts/import
/admin/accounts/import?dry_run=1
/admin/accounts/kiro/api-key
/admin/accounts/kiro/iam-sso/complete
/admin/accounts/kiro/iam-sso/start
/admin/accounts/kiro/sso-token
/admin/accounts/kiro/sso/cancel
/admin/accounts/kiro/sso/poll
/admin/accounts/kiro/sso/select-profile
/admin/accounts/kiro/sso/start
/admin/accounts/kiro/sso/submit
/admin/accounts/oauth/:provider/poll
/admin/accounts/oauth/:provider/start
/admin/accounts/oauth/:provider/submit
/admin/accounts/recover
/admin/config
/admin/config/validate
/admin/email/preview
/admin/email/settings
/admin/email/templates/defaults
/admin/email/test
/admin/github/settings
/admin/invites
/admin/invites/:id
/admin/logs/app
/admin/management-tokens
/admin/management-tokens/:id
/admin/management-tokens/:id/revoke
/admin/models
/admin/models/cleanup
/admin/models/enabled
/admin/models/probe
/admin/models/sync
/admin/plans
/admin/plans/:id
/admin/providers
/admin/providers/:id
/admin/providers/:id/quota-test
/admin/providers/builtin
/admin/providers/builtin/:name/models
/admin/providers/builtin/:name/route-prefix
/admin/proxies
/admin/proxies/:id
/admin/proxies/:id/impact
/admin/proxies/:id/test
/admin/proxies/system
/admin/quota
/admin/quota/refresh
/admin/snapshot/warnings
/admin/stats/analysis
/admin/stats/overview
/admin/stats/trend
/admin/system/check-updates
/admin/system/info
/admin/system/restart
/admin/system/rollback
/admin/system/update
/admin/system/update-settings
/admin/traces/:id
/admin/traces
/admin/usage/events/export
/admin/usage/events
/admin/usage/overview/realtime
/admin/users
/admin/users/:id
/admin/users/:id/balance
/admin/users/:id/subscriptions
/auth/api-key-login
/auth/login
/auth/logout
/auth/public-config
/auth/register
/auth/reset-password
/auth/send-code
/key-overview/overview
/setup/admin
/setup/status
```

补充：前端还存在页面路由 `/dashboard/*`、`/admin/*`、`/home`、`/login`、`/register`，这些不是 API。

---

## 8. 错误响应规范

### 8.1 管理 API 错误

常见格式：

```json
{"error":"missing authorization"}
```

前端客户端也兼容：

```json
{"error":"具体错误信息"}
```

### 8.2 AI 网关错误（OpenAI 风格）

```json
{
  "error": {
    "code": "invalid_api_key",
    "message": "missing api key",
    "param": null,
    "type": "invalid_request_error"
  }
}
```

---

## 9. App 开发建议

### 9.1 推荐 App 首页数据流

1. `GET /api/v1/auth/public-config`：拿站点配置、注册开关。
2. `POST /api/v1/auth/login` 或 `POST /api/v1/auth/api-key-login`。
3. 登录后并行请求：
   - `GET /api/v1/key-overview/overview`
   - `GET /api/v1/models`
   - `GET /api/v1/usage/overview`
   - `GET /api/v1/requests?limit=20`

### 9.2 AI 调用模式

如果 App 内置聊天：

- 用户登录系统账号：App 后端应向 AI Proxy 换取/管理用户 API Key，避免把管理员 Cookie 暴露给客户端。
- 用户直接填 API Key：直接调用 `/v1/chat/completions`，Header 用 `Authorization: Bearer aps_xxx`。

### 9.3 安全建议

- 手机端不要保存管理员 Session；管理员功能建议二次验证。
- 新建 API Key 的 `secret` 只展示一次，App 必须立即提示用户保存。
- 流式请求要支持 SSE 断线重连/取消。
- 请求日志、Trace 可能包含敏感 prompt，App 默认应做隐私遮罩。

---

## 10. 待联调确认项

由于服务未提供 OpenAPI，以下需要用真实账号登录后抓包确认：

1. 用户端 `/keys`、`/profile`、`/usage/*` 的精确路径和 HTTP Method。
2. 各 POST/PATCH 请求体字段的必填约束。
3. 分页结构是 `{items,next_cursor}` 还是 `{data,total}`。
4. 管理端批量导入/导出格式。
5. OAuth/Kiro 流程的中间状态枚举。

