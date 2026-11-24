# 手机端 ChatGPT → 云端构建 → iPhone

本版无需额外后端或自定义 GPT。只要当前 ChatGPT/Codex 会话有此仓库的 GitHub 写权限，就可提交标准构建请求。网页的“复制仅构建请求”会生成带唯一编号和时间的指令。

## 已有代码，直接构建

让代理读取并创建/更新 main 分支的 `.pocketbuild/request.json`：

```json
{"id":"pb-REPLACE-WITH-UNIQUE-ID","mode":"sidestore","createdAt":"CURRENT-ISO-UTC-TIME"}
```

字段只能是 id、mode、createdAt。模式为 sidestore 或 testflight；时间应为现在，超过 24 小时的请求会被拒绝。提交信息应包含 id。不要修改无关源码来人为触发构建。

提交后 `ios-build.yml` 自动启动。plan job 验证 JSON 并确定签名路线，build job 编译。按提交 SHA 匹配本次运行，不能把上一条成功构建当作当前结果。

构建成功后返回真实 Release 与以下稳定源地址：

https://github.com/GuangzhiSu/iOS-app-builder/releases/latest/download/sidestore-source.json

在手机 SideStore 添加一次该源后，可发现后续新版。发现新版、安装新版和刷新签名是不同动作。

## 需要先开发应用

让有仓库权限的会话修改 native/ 或网页源码并提交。原生代码修改自动启动 SideStore 构建；网页代码修改自动部署 PWA。不要在已经自动触发后立即重复提交构建请求，除非用户要求另一种路线。

## 网页或原生 App 直接构建

在 GitHub 创建 fine-grained token，只授权目标仓库：Actions 读写，Contents 只读。在应用的连接设置中输入，不要发送到聊天。

网页只将令牌留在当前页面内存，且只发往 api.github.com；关闭或刷新后需重新连接。原生 App 可把令牌存入本机 Keychain。两者都无需 Windows 常开或另建服务器。

访问令牌的首次授权不能由普通网页凭空获得。拥有仓库写工具的 ChatGPT 走上述请求文件路线，不需要用户另交令牌。

## 可选自建 API

原有 Node API 继续支持，适合已经有自己后端的用户：GET /api/config、GET /api/status、POST /api/build。OpenAPI 为 /api/openapi.json。服务器自行为请求生成编号，并返回 GitHub run ID（服务版本支持时）。202/accepted 不是构建或安装成功。

OpenAI 的自定义 GPT、Actions 与插件可用性因账户和工作区而异，因此本项目的必要流程不依赖新建 GPT。普通 ChatGPT 对话只有在具备并授权仓库工具时才能修改请求文件。

## 无法代替用户的手机步骤

首次 iLoader 配对、信任开发者、VPN 权限、Apple 登录、创建个人自动化、核对真实证书到期时间，需要用户在自己的 iPhone 操作。TestFlight 还需要用户自己的付费会员和签名材料。不得把密码、配对文件、证书私钥粘贴到聊天或提交仓库。
