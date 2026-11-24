# Pocket Build · iOS App Builder

让 Windows + iPhone 用户从代码走到手机应用：**PWA 优先，免费原生用 SideStore，稳定原生测试用 TestFlight。**

> 这是交付工具，不是 iOS 签名限制的绕过器。免费签名仍然 7 天有效；网页不能静默安装 IPA、读取配对文件或保证后台续签。

## 能做什么

- 可添加到 iPhone 主屏幕的 PWA 控制台，适配手机和桌面。
- 选择交付路线、保存项目、读取真实 GitHub 构建记录。
- 配置 Node 后端后，从网页或 ChatGPT Actions 发起云端 iOS 构建。
- 原生源码提交到 main 后，GitHub macOS runner 自动编译 SwiftUI 示例并发布 unsigned IPA，由 SideStore 在手机签名。
- 提供付费 TestFlight 签名和上传流水线，TestFlight 定时任务默认关闭。原生源码提交会自动运行免费路线的 macOS 构建，消耗 GitHub runner 配额。
- 从实际 Release 元数据生成 SideStore 源；手动续签记录、日历检查提醒、快捷指令配置说明。
- 生成手机端 ChatGPT 开发指令。**指令生成不等于代码生成或提交。**

## 最快启动

需要 Node.js 22 或更新，无第三方 npm 依赖。

```powershell
git clone https://github.com/GuangzhiSu/iOS-app-builder.git
cd iOS-app-builder
node prepare.mjs
node server.mjs
```

打开 http://127.0.0.1:8787 。未配置凭据也可使用路线规划、公开构建查询和开发指令。

### 开启一键云构建

将 [.env.example](.env.example) 复制为 .env，配置：

- APP_API_KEY：至少 32 字符随机密钥。
- GITHUB_TOKEN：仅选定仓库的 fine-grained token，Actions read/write、Contents read。
- GITHUB_REPOSITORIES：逗号分隔的仓库白名单。
- PUBLIC_URL：外部部署时的 HTTPS origin。

```powershell
node --env-file=.env server.mjs
```

在同一地址的控制台输入 APP_API_KEY。GitHub Token 永远留在服务器。网页密钥仅保存在当前页面内存。

**仅在 Windows 本机运行不能让手机离线访问它。** 手机端使用需要始终在线的 HTTPS Node 主机；前面放支持 TLS 的反向代理，设置 HOST=0.0.0.0 和 PUBLIC_URL。纯静态托管只提供控制台，发起构建走 GitHub Actions 网页；不能假装拥有后端。

## 三条路线

| 路线 | 首次电脑连接 | 签名期限 | 不能省去的步骤 |
|---|---|---|---|
| PWA | 不需要 | 无原生签名期限 | Safari 添加到主屏幕；浏览器能力限制 |
| SideStore + 免费账号 | 需要一次，异常时可能再次需要 | 7 天 | iLoader 配对、信任、VPN、Apple 登录、手机刷新 |
| TestFlight + 付费会员 | 不需要本地 Mac 或 USB | 每构建最长 90 天 | 开发者注册、签名配置、App Store Connect 应用记录、适用审核与手机首次安装 |

详细依据和其他方案见 [RESEARCH.md](RESEARCH.md)。

## 原生示例与安装

[native/](native/) 是真正 SwiftUI 构建控制台，连接你自己的 HTTPS 后端。不是把任意网页伪装成已签名应用。

1. GitHub Actions → **iOS build** → Run workflow。
2. distribution 选择 sidestore，生成 unsigned IPA 并发布 Release（可能产生 macOS CI 费用）。
3. 首次按 SideStore 官方文档，用 iLoader 在 Windows 上安装并配对 SideStore。
4. iPhone 连 Wi-Fi，开启 LocalDevVPN，下载 Release 中的 IPA，在 SideStore 导入签名。
5. 后续新版本仍需安装新版 IPA；“刷新签名”不会更新源码。

每个 Release 带版本、Bundle ID 和实际文件大小元数据；控制台只为元数据完整的构建生成源。工作流同时发布 sidestore-source.json，稳定地址为 https://github.com/OWNER/REPO/releases/latest/download/sidestore-source.json；手机在 SideStore 添加一次源，之后可发现新版本。控制台提供复制地址与导出 JSON；自定义导出的 JSON 仍需自行 HTTPS 托管。私有仓库的下载需要额外认证，不能直接当公开源使用。

### TestFlight 配置

详见 [TESTFLIGHT.md](TESTFLIGHT.md)。包含可选每两个月构建配置，默认关闭。90 天是每个 beta 构建期限，**不是永久安装**。

## 手机端 ChatGPT

支持的流程：ChatGPT 修改并提交仓库 → 本工具发起 CI → SideStore 或 TestFlight 安装。

- 普通对话：复制控制台的开发指令，交给拥有仓库写入能力的 ChatGPT/Codex 会话。
- API 集成：将 HTTPS 主机上的 /api/openapi.json 接入支持该接口的现有代理，使用 Bearer API Key；自定义 GPT / Actions 当前可用性与迁移安排因账号或工作区而异，不能要求所有用户新建 GPT。
- API 只构建已经提交的源码，不内置 LLM，不承诺普通 ChatGPT 对话会自动调用它。

见 [CHATGPT.md](CHATGPT.md)。

## 验证与边界

```powershell
node --test test/*.test.mjs
node prepare.mjs
```

CI 检查核心逻辑、鉴权、白名单、错误处理、GitHub dispatch、源元数据与静态构建。原生编译由 macOS 工作流验证。没有连接到真实 iPhone 的自动验收；TestFlight 需要用户自己的会员与证书。

## 安全

不收集 Apple 密码、设备配对文件或免费开发证书。服务端只允许白名单仓库和配置的分支；构建 API 有鉴权和请求节流，禁止跨域。API 和 GitHub 返回值不进入离线缓存。勿将 .env、.p12、.p8 或配对文件提交到仓库。
