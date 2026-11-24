# Windows + iPhone 应用交付：可行性研究

核查日期：2026-11-24。依据优先为 Apple、SideStore、Expo、GitHub 与 OpenAI 的官方资料。平台限制会变化，手机兼容性以实际系统与工具版本为准。

## 结论

可以显著简化“生成代码 → 编译 → 分发 → 更新”，但没有一种对所有普通 iPhone 都成立、免费、永久有效、零首次配对且完全无人值守的原生安装方式。

产品应是**交付控制台**：把云编译和分发统一起来，复用 SideStore 的设备端签名能力，而不是重新开发一套持有用户 Apple 密码的签名平台。

| 方案 | 无本地 Mac | 后续无需反复接电脑 | 无免费账号 7 天续签 | 适用情况 |
|---|---|---|---|---|
| PWA | 是 | 是 | 是，没有原生签名 | 表单、日程、照片拼图等网页能力足够的应用 |
| SideStore + iLoader 首次配置 | 是 | 通常是，故障时可能再配对 | 否，仍需手机刷新 | 免费账号、自用原生应用 |
| 云构建 + TestFlight | 是 | 是 | 是，但 beta 每构建最多 90 天 | 付费开发者、较稳定的原生测试 |
| 付费 Ad Hoc / EAS internal | 是 | 是 | 不受免费 7 天规则，但仍受证书/profile 有效期影响 | 少量已注册 UDID 的测试设备 |
| Expo Go / 开发容器 | 是 | 取决于项目服务端 | 取决于容器分发与 SDK | 快速原型，不等同独立原生 App |
| 正式 App Store 发布 | 是，云 Mac 可编译 | 是 | 是 | 长期分发，需要会员与审核 |

## 1. 为什么“做一个网页装任何 IPA”不可行

Apple 的 Personal Team provisioning profile 自签发起 7 天过期，免费账号每台设备最多 3 个应用。期限是 provisioning 的约束，改变下载页面、二维码或云编译服务不会改变它。[Apple 账号说明](https://developer.apple.com/help/account/basics/about-your-developer-account/)

因此把构建放到 GitHub 并不等于签名完成；一个 unsigned IPA 下载后也不意味着可直接安装。网页不是 iPhone 的受信任配对服务，不能仅凭点击就授予开发者信任、操作设备安装服务、打开 VPN 权限或撤销签名期限。本项目不实现这种承诺。

## 2. 你现在的流程，哪里可以省掉

SideStore 官方说明首次需要电脑；首次用 USB、iLoader、Apple 账号完成安装，并在手机信任和启用所需设置。此后 SideStore 使用手机自己的证书签名，并通过本地 VPN 与设备服务交互。官方要求 Wi-Fi，不应把“任何网络都能刷新”作为保证。

官方还指出，升级或重置设备、甚至随机情况可能使 pairing file 失效，此时仍可能需要电脑处理。已过期的 SideStore 也可能需要恢复安装。

- [安装前提](https://docs.sidestore.io/docs/installation/prerequisites.html)
- [安装步骤与 pairing file 失效说明](https://docs.sidestore.io/docs/installation/install.html)
- [SideStore FAQ](https://docs.sidestore.io/docs/faq.html)

可以把每周接电脑，缩减为“首次一次配置 + 手机端周期刷新 + 异常恢复”。不能承诺终身只连接一次。

### 快捷指令能做到什么

可以在用户手机上配置“连接 LocalDevVPN → SideStore Refresh All Apps”的个人自动化，每天尝试，留出多天重试余量。动作名称与可用性随版本而异；锁屏、系统后台调度、Wi-Fi、VPN 冲突、Apple 登录和工具 bug 都可能导致失败。

本项目给出步骤，并允许记录**用户确认成功**的时间；它不会把网页按钮点击或云端 cron 完成误认为续签成功。日历导出只是第 5 天的检查提醒。

SideStore 项目本身也讨论过自动刷新与后台调度的不确定性：[官方项目讨论](https://github.com/orgs/SideStore/discussions/1303)。

## 3. 更稳定的原生路径：TestFlight

Apple Developer Program 通常为 $99/年。GitHub macOS runner 能代替本地 Mac 编译，证书与 provisioning profile 配置好后，可通过 CI 签名上传 App Store Connect。

TestFlight 每个构建最长 90 天；可开启新版自动更新，但仍需要处理 Apple 的构建处理、适用测试审核、测试组分配和首次接受邀请。定期重新上传构建能减少到期风险，却不是永久签名保证。

本仓库提供每两个月构建一次的可选任务，默认跳过；它不自动完成审核或手机安装。已发行正式 App Store 应用是另一条长期路线，需满足审核。

- [会员费用](https://developer.apple.com/help/account/membership/program-enrollment/)
- [TestFlight 规则](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)
- [TestFlight 用户自动更新](https://testflight.apple.com/)
- [Apple 支持的构建上传方法](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)

## 4. PWA 是最低摩擦方案

若用户要做的是照片拼图、清单或轻量工具，先判断浏览器能力能否覆盖需求。PWA 可从 Safari 添加到主屏幕，不生成原生 IPA，因此没有免费开发者签名的 7 天问题。网站发布新版，联网打开时获取更新。

这不意味着原生 API 全部可用。HealthKit、某些蓝牙用法、系统扩展、复杂后台执行等应逐项验证；需要它们时选择原生路线。离线能力需明确缓存和数据存储策略，本项目仅缓存静态控制台，不缓存 API、GitHub 状态或凭据。

[Apple：将网站变成主屏幕应用](https://support.apple.com/guide/iphone/iphea86e5236/ios)

## 5. 其他方案为什么没有作为本版主线

**Expo / EAS**：可以在 Windows 开发并用云端 iOS build。Ad Hoc internal distribution 需要付费会员、注册设备 UDID；新增设备可能要重签。Expo Go 是受 SDK 和预置原生模块限制的容器，不是任意 SwiftUI 应用的运行时。当前官方文档还区分 App Store 中的旧 SDK 容器与需自行通过 TestFlight 分发的新版本，不能笼统承诺“装 Expo Go 就永久免费运行所有应用”。

- [Windows/iOS 与 Expo Go 限制](https://docs.expo.dev/faq/)
- [Expo Go SDK 兼容性](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/)
- [EAS internal / Ad Hoc](https://docs.expo.dev/build/internal-distribution/)
- [Apple Ad Hoc profile](https://developer.apple.com/help/account/provisioning-profiles/create-an-ad-hoc-provisioning-profile/)

**AltServer 无线刷新**：仍依赖运行中的电脑服务，无法满足“电脑关闭也能完成”的完整目标。SideStore 更贴近该免费场景。

**企业证书/MDM**：Apple Enterprise 是面向符合条件组织的员工内部应用，不是给大众分发自用应用的通用办法。[Apple 项目说明](https://developer.apple.com/help/account/membership/programs-overview)

**EU Web Distribution**：受地区、开发者资格、协议与 Apple 授权约束，不是美国普通 iPhone 用户的任意 IPA 网页安装接口。[Apple EU Web Distribution](https://developer.apple.com/support/web-distribution-eu/)

**越狱、漏洞、租赁共享证书**：不是兼容普通用户设备的可持续基础；本版不依赖。

## 6. 手机 ChatGPT 发起的完整链路

目标链路是：用户描述需求 → 有仓库权限的开发代理修改并提交源码 → 云端 CI → 分发 → 手机上用户完成必要安装动作。

本版完成交付侧接口，没有内置代码生成模型。复制开发指令适用于已有仓库编辑能力的 ChatGPT/Codex 会话；普通对话不会因打开此网页而获得写入仓库或安装手机应用的权限。

提供 OpenAPI / Bearer API，可供支持该机制的代理调用。OpenAI 当前对新建自定义 GPT 与插件迁移的说明因账号/工作区而不同，不能要求所有用户都新建一个 GPT。本版不创建或安装插件、不自动接入普通 ChatGPT。现有兼容 Actions 的集成可复用接口，其他代理也可调用相同 HTTPS API。

- [OpenAI：GPT 与当前可用性](https://help.openai.com/en/articles/8554407-gpts-in-chatgpt)
- [OpenAI Actions 接口原理](https://developers.openai.com/api/docs/actions/introduction)
- [GitHub workflow dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)

## 7. 自动化与完成标准

| 阶段 | 本版状态 | 完成证据 |
|---|---|---|
| 需求 → 代码 | 提供 handoff 指令，代理另行实现 | 实际源码 commit |
| 原生编译 | 提供 macOS CI | xcodebuild 成功 |
| 免费签名 | 委托设备 SideStore | 手机真实签名到期时间 |
| TestFlight 签名上传 | 提供需凭据的脚本 | Apple 接受上传，后续处理完成 |
| 安装 | 用户在手机操作 | iPhone 实际启动应用 |
| 刷新签名 | SideStore + 用户配置的个人自动化 | SideStore 显示新到期时间 |
| 更新代码 | 构建新版本并安装 | 手机运行新版 build number |

源码与测试通过并不能证明真实设备端已经安装。本项目只报告能验证的阶段。
