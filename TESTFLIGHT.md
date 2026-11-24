# TestFlight 设置

这是可配置的签名上传流水线，不代表已经为你的账号开通 TestFlight。

1. 加入 Apple Developer Program（通常 $99/年）；注册你自己的 Bundle ID。
2. 在 App Store Connect 创建同 Bundle ID 的 iOS 应用记录，完成协议及应用信息。
3. 创建 Apple Distribution 证书（含私钥导出为 .p12）与 App Store Connect distribution provisioning profile。
4. 获取有上传权限的 App Store Connect **团队 API Key**（.p8、Key ID、Issuer ID）。
5. GitHub Settings → Environments 新建 apple-signing，建议设置 required reviewers。
6. 在环境中添加 Secrets：

| 名称 | 内容 |
|---|---|
| IOS_P12_BASE64 | .p12 文件的标准 Base64，单行 |
| IOS_P12_PASSWORD | .p12 导出密码 |
| IOS_PROFILE_BASE64 | .mobileprovision 的标准 Base64，单行 |
| ASC_KEY_BASE64 | .p8 私钥的标准 Base64，单行 |
| ASC_KEY_ID | Key ID |
| ASC_ISSUER_ID | Issuer ID |

PowerShell 编码方法（在你自己的终端执行，不要把输出提交仓库）：

~~~powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\your\certificate.p12"))
~~~

设置仓库变量 BUNDLE_ID 为自己的 Bundle ID，需与 profile 及 App Store Connect 记录一致。默认 com.allen.pocketbuild 只是示例。

Actions → iOS build 选择 testflight 运行。脚本验证 profile 类型、Bundle ID 和有效期，临时 keychain 签名、导出并通过 Apple altool 上传，最后清理签名材料。不将证书或已签名 IPA 发布到公开 Release。

上传后等待 Apple 处理，再完成测试/出口合规信息、测试组分配和适用的 beta review。内部与外部测试要求不同，外部测试不能假定自动通过。TestFlight 可以开启自动更新，但不能保证某时刻一定安装，也不能略过首次接受邀请。

## 可选定期构建

ios-build.yml 包含每两个月一次的计划任务。**默认跳过**；明确设置仓库变量 ENABLE_TESTFLIGHT_RENEWAL=true 后才执行 TestFlight 任务。

这只定期上传已有源码，不自动完成测试审核、分组分发或手机安装。先跑通手动流程；留意证书过期、公共仓库计划任务因长期无活动而禁用、CI 费用和平台故障。每个 beta 构建最长测试 90 天，长期使用考虑 App Store 正式发布或 PWA。

## 验证范围

无签名 simulator 编译由 CI 验证。签名上传需要真实凭据，无法在没有你的会员材料时验证；unsigned 构建通过不等于 TestFlight 上传通过。
