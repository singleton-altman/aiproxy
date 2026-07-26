# AI Proxy 管理 APP

基于 Expo + React Native 的 AI Proxy Service 移动管理端，按照 `docs/AI_PROXY_APP_API_DOC.md` 接入，接口注册表覆盖文档中全部 112 个端点。

已实现：

- 邮箱密码（Cookie Session）与 API Key 快捷登录，公开配置探测、注册、邮箱验证码、重置密码
- 会话失效自动重登（Session / API Key 两种模式）与安全会话存储
- 总览：余额、可用模型、用量概览与趋势（今日/本周/本月）、额度限制、最近请求
- API Key 管理：创建（secret 仅显示一次并可复制）、启停、删除
- 模型列表与用户可见性（隐藏/显示）配置
- 请求日志：游标分页、关键词搜索、明细展开
- 聊天测试页：/v1 网关调用，OpenAI 与 Anthropic 双协议、SSE 流式输出、停止生成
- 管理端：今日全站统计、用户管理（禁用/余额/删除）、系统管理（版本/更新/重启/回滚/应用日志）
- 通用接口浏览器：文档全部模块和端点的注册表、结构化请求表单、高风险操作二次确认、文件上传与二进制下载

接口目录由 `docs/AIProxy_API_Endpoints.json` 自动生成：

```bash
npm run generate:endpoints
npm run check:endpoints
```

完整验证（接口清单同步、TypeScript、依赖漏洞）：

```bash
npm run verify
```

## 开发

```bash
npm ci
npm run start
```

管理端默认地址通常为 `http://<服务器 IP>:18083`。若从公网访问，应先配置 HTTPS 与访问控制；新建 API Key 的 secret 只显示一次，请立即保存。
