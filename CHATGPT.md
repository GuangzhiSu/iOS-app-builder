# 从手机 ChatGPT 发起开发和交付

最通用的方式是使用已经具有 GitHub 仓库编辑权限的开发会话。网页里描述需求并复制开发指令，交给该会话修改和提交代码；然后从本控制台或 GitHub Actions 发起构建。

## 支持 HTTPS API 的代理

后端提供：

- GET /api/config：可用仓库和固定构建分支。
- GET /api/status?repository=owner/repo：真实 GitHub 构建状态。
- POST /api/build，JSON 为 {"repository":"owner/repo","mode":"sidestore"} 或 testflight。
- GET /api/openapi.json：OpenAPI 3.1 定义，配置 PUBLIC_URL 后返回真实服务器地址。

API Key 是你的 Pocket Build 控制密钥，不是 OpenAI API Key。调用使用 Authorization: Bearer。GitHub Token 放在后端环境变量，不能放进网页、指令或仓库。

202 返回 accepted 只表示 GitHub 接受了 workflow dispatch，不含可靠 run ID，也不代表构建、上传、签名或安装完成。之后查询 status，并核对时间、分支和 commit；并行构建时不要把别人的成功记录当作本次结果。

## 兼容 Actions 的现有集成

若你的账号或现有 GPT 仍有 Actions 配置界面，可导入上述 schema，设定 Bearer API Key，测试只读操作后再测试 build。不要分享持有此控制密钥的 GPT 给不应具有构建权限的人。

当前 OpenAI 的 GPT 新建限制及向插件迁移的安排因账号/工作区而异。此步骤不是所有用户都可用的前提；不要求新建 GPT，也没有为你自动创建或安装插件。

参考：[OpenAI 当前 GPT 可用性](https://help.openai.com/en/articles/8554407-gpts-in-chatgpt)、[Actions 原理](https://developers.openai.com/api/docs/actions/introduction)。

## 给代理的操作约束

只构建已提交的源码。先确认仓库与模式；构建可能消耗 macOS runner 额度。不要承诺免费签名永久有效，不要索取 Apple 密码或 pairing file。TestFlight 没有配置签名材料时应返回配置需求，不能改成公开发布证书。

此版本不包含从自然语言自主生成任意应用的模型服务、仓库创建服务或多用户 OAuth。要扩展为开放平台，需要独立用户认证、每用户 GitHub App 授权、队列、审计与隔离的构建资源；不能把单用户共享 API Key 直接用于多租户服务。
