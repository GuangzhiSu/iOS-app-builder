# Pocket Build · iOS App Builder

[打开网页控制台](https://guangzhisu.github.io/iOS-app-builder/) · [下载原生 IPA](https://github.com/GuangzhiSu/iOS-app-builder/releases/latest) · [SideStore 稳定订阅源](https://github.com/GuangzhiSu/iOS-app-builder/releases/latest/download/sidestore-source.json)

从 Windows 或 iPhone 管理应用构建和交付。**网页与原生 App 直接连接 GitHub；不需要另租后端，不需要 Windows 常开。**

## 已实现的链路

- 连接受限 GitHub token 后，网页与 SwiftUI App 可直接发起云构建、读取真实状态。
- 有 GitHub 写权限的手机 ChatGPT/Codex 可通过 `.pocketbuild/request.json` 触发构建，无需自定义 GPT、额外后端或另交 token。
- 构建请求有唯一 ID、实际提交 SHA 和 GitHub run ID，避免把旧构建误判为本次成功。
- 原生源码提交后，macOS runner 编译并发布 unsigned IPA 与 SideStore 源；网页源码修改后自动发布 PWA。
- TestFlight 在编译前检查签名配置，缺少材料会列出字段名，不输出私钥或证书内容。
- 手机续签快捷入口支持 Apple x-callback-url，分别记录完成、失败、取消。回调只代表指令执行情况，**不会自动宣称证书已续签**。

## 网页或原生 App：首次连接

1. 在 GitHub 创建 fine-grained personal access token，只授权你要构建的仓库。
2. 选择 Actions 读写、Contents 只读权限。
3. 在 Pocket Build 选择“GitHub 直连”，输入 token 并连接。不要将 token 发到聊天中。
4. 选择 SideStore 或 TestFlight，点击“一键云端构建”。

网页 token 只保留在当前页面内存，只发送到 api.github.com，不存入 localStorage、URL 或缓存。页面刷新后重新连接。原生 App 使用本机 Keychain。

未连接也能查看公开构建、下载 IPA、复制订阅源，或把“仅构建请求”交给已授权 GitHub 的 ChatGPT。读取连接成功只证明读取权限，写权限由 GitHub 在构建请求时检查。

## 手机 ChatGPT

对有仓库写权限的会话说：

> 为 GuangzhiSu/iOS-app-builder 发起一次 SideStore 构建，按仓库 AGENTS.md 写入新的构建请求，检查本次运行并返回安装包。

代理创建/更新 `.pocketbuild/request.json`，工作流会自动验证并执行。请求包含 id、mode、createdAt，24 小时后失效。详见 [CHATGPT.md](CHATGPT.md) 和 [AGENTS.md](AGENTS.md)。

## 手机续签：一次配置

1. 按 [SideStore 官方说明](https://docs.sidestore.io/docs/installation/install.html) 完成首次 iLoader 配对安装，在手机信任开发者并按需启用开发者模式。
2. 在 iPhone 快捷指令创建“Pocket Build Refresh”：连接 LocalDevVPN，稍等，再调用 SideStore 的 Refresh All Apps。动作可能因工具版本或签名变化而需要重新选择。
3. 手动运行并授权，去 SideStore 核对实际到期日。
4. 创建每天运行该指令的个人自动化，选择系统提供的立即运行；通常充电并连接 Wi-Fi 时执行。
5. 本网页或 App 可直接打开已配置指令。回到网页后会显示完成、失败或取消；核对证书后再记录成功时间。

网页不能静默创建 iPhone 的个人自动化、授予 VPN 权限或读取真实证书。后台执行仍可能失败，配对或应用过期时可能需要电脑恢复。日历导出只是续签后第 5 天的检查提醒。

## 交付路线

| 路线 | 电脑连接 | 签名有效期 | 前提 |
|---|---|---|---|
| PWA | 不需要 | 没有原生签名期限 | 浏览器能力足够；Safari 添加到主屏幕 |
| SideStore | 首次需要，异常时可能再次需要 | 免费账号 7 天，手机刷新 | Wi-Fi、LocalDevVPN、本人 Apple 登录 |
| TestFlight | 不需要本地 Mac 或 USB | 每个 beta 构建最长 90 天 | 付费会员、自己的签名材料、应用记录及适用审核 |

TestFlight 设置见 [TESTFLIGHT.md](TESTFLIGHT.md)。可选每两个月的构建任务默认关闭，只有设置 ENABLE_TESTFLIGHT_RENEWAL=true 才会执行。它不会自动完成 Apple 审核或保证手机安装。

## 本地运行与可选 API

需要 Node.js 22+，无第三方 npm 依赖：

```powershell
git clone https://github.com/GuangzhiSu/iOS-app-builder.git
cd iOS-app-builder
node prepare.mjs
node server.mjs
```

打开 http://127.0.0.1:8787。默认使用 GitHub 直连，无需 .env。

原有自建后端仍可选：复制 .env.example 为 .env，配置 APP_API_KEY、GITHUB_TOKEN、仓库白名单及 PUBLIC_URL，再运行 `node --env-file=.env server.mjs`。它不是手机云构建的必要依赖。

## 检查与验证范围

```powershell
node --test test/*.test.mjs
node prepare.mjs
```

检查包含 GitHub 请求、构建追踪、请求过期与模式选择、权限错误、快捷指令回调和签名配置。CI 另检查真实 HTTP、Windows/Linux 与 iOS 模拟器编译。云端实际构建和 Release 可以核对；真机安装、快捷指令权限、实际续签及 TestFlight 上传需要自己的设备/会员材料，不能由测试结果冒充。

详细平台依据见 [RESEARCH.md](RESEARCH.md)。本项目不取消 Apple 的免费 7 天规则，不收集 Apple 密码或配对文件，不将 .p12、.p8、profile 或 token 发布到仓库。
