import SwiftUI
import Security

@main
struct PocketBuildApp: App {
    var body: some Scene { WindowGroup { Dashboard() } }
}

private enum Credential {
    static let service = "PocketBuild.control-key"
    static func load() -> String {
        let q: [String: Any] = [kSecClass as String:kSecClassGenericPassword,
            kSecAttrService as String:service, kSecAttrAccount as String:"control",
            kSecReturnData as String:true, kSecMatchLimit as String:kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return "" }
        return String(data:data, encoding:.utf8) ?? ""
    }
    static func save(_ value: String) throws {
        let q: [String: Any] = [kSecClass as String:kSecClassGenericPassword,
            kSecAttrService as String:service, kSecAttrAccount as String:"control"]
        SecItemDelete(q as CFDictionary)
        guard !value.isEmpty else { return }
        var item = q
        item[kSecValueData as String] = Data(value.utf8)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        guard SecItemAdd(item as CFDictionary,nil) == errSecSuccess else {
            throw AppError.message("无法保存 Keychain 凭据")
        }
    }
}
private enum AppError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case let .message(s) = self { return s }; return nil }
}
private struct Run: Decodable, Identifiable {
    var id: Int
    var title: String?
    var status: String
    var conclusion: String?
    var url: String
}
private struct StatusResponse: Decodable { var runs: [Run] }
private struct APIError: Decodable { var error: String }
private struct Accepted: Decodable { var message: String }

private struct Dashboard: View {
    @AppStorage("server") private var server = ""
    @AppStorage("repository") private var repository = "GuangzhiSu/iOS-app-builder"
    @State private var apiKey = Credential.load()
    @AppStorage("credentialOrigin") private var credentialOrigin = ""
    @State private var mode = "sidestore"
    @State private var runs: [Run] = []
    @State private var busy = false
    @State private var showSettings = false
    @State private var confirmBuild = false
    @State private var message = ""
    private let mint = Color(red:0.70,green:0.93,blue:0.79)

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment:.leading,spacing:12) {
                        Text("BUILD WITHOUT A MAC").font(.caption).foregroundStyle(mint)
                        Text("从一个想法，\n到你的 iPhone。").font(.largeTitle.bold())
                        Text("云端构建已提交源码。安装与签名仍由 SideStore 或 TestFlight 完成。")
                            .foregroundStyle(.secondary)
                    }.padding(.vertical,12)
                }
                Section("云端构建") {
                    Text(repository).font(.subheadline.monospaced())
                    Picker("交付方式",selection:$mode) {
                        Text("SideStore · 免费签名").tag("sidestore")
                        Text("TestFlight · 付费会员").tag("testflight")
                    }
                    Button("发起构建") { confirmBuild = true }.disabled(busy)
                    Button("刷新真实构建状态") { Task { await refresh() } }.disabled(busy)
                    if busy { ProgressView() }
                    if !message.isEmpty { Text(message).font(.footnote).foregroundStyle(.secondary) }
                }
                Section("最近构建") {
                    if runs.isEmpty { Text("尚无记录，点击刷新。").foregroundStyle(.secondary) }
                    ForEach(runs) { run in
                        if let url = URL(string:run.url), url.scheme == "https", url.host == "github.com" {
                            Link(destination:url) {
                                VStack(alignment:.leading) {
                                    Text(run.title ?? "Build #\(run.id)")
                                    Text(run.conclusion ?? run.status).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
                Section("手机交付") {
                    if let url = URL(string:"https://github.com/\(repository)/releases") {
                        Link("查看 Release 与 IPA",destination:url)
                    }
                    Link("SideStore 官方安装说明",destination:URL(string:"https://docs.sidestore.io/docs/installation/install.html")!)
                    Text("免费账号仍需每 7 天刷新。首次 USB 配对后可在手机刷新；后台自动化不能保证成功。")
                        .font(.footnote).foregroundStyle(.secondary)
                    Text("PWA 无需签名；如果只需要网页能力，可以直接用 Safari 添加控制台到主屏幕。")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Pocket Build")
            .tint(mint)
            .preferredColorScheme(.dark)
            .toolbar { Button("配置") { showSettings = true } }
            .sheet(isPresented:$showSettings) {
                NavigationStack {
                    Form {
                        Section("你的后端") {
                            TextField("https://your-server.example",text:$server)
                                .textInputAutocapitalization(.never).autocorrectionDisabled()
                                .keyboardType(.URL)
                            TextField("owner/repo",text:$repository)
                                .textInputAutocapitalization(.never).autocorrectionDisabled()
                            SecureField("控制台 API Key",text:$apiKey)
                            Text("仅连接你自己的 HTTPS 后端。密钥保存于本机 Keychain，不上传到 GitHub。修改服务器后请重新输入匹配的新密钥。")
                                .font(.footnote)
                        }
                        Button("保存") {
                            do {
                                _ = try endpoint("/api/config")
                                try Credential.save(apiKey)
                                credentialOrigin = server.trimmingCharacters(in:.whitespaces)
                                showSettings = false
                                message = "配置已保存；尚未验证后端连接。"
                            } catch { message = error.localizedDescription }
                        }
                        Button("清除凭据",role:.destructive) {
                            apiKey = ""
                            try? Credential.save("")
                        }
                        if !message.isEmpty { Text(message).font(.footnote) }
                    }.navigationTitle("连接配置")
                    .onChange(of:server) { _, _ in apiKey = ""; message = "服务器已改变，请重新输入对应密钥。" }
                    .toolbar { Button("关闭") { showSettings = false } }
                }
            }
            .confirmationDialog("构建 \(repository)？macOS CI 可能产生费用。",isPresented:$confirmBuild,titleVisibility:.visible) {
                Button("发起 \(mode) 构建") { Task { await build() } }
                Button("取消",role:.cancel) {}
            }
        }
    }
    private func endpoint(_ path: String) throws -> URL {
        guard repository.range(of:"^[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}$",options:.regularExpression) != nil,
              ![".",".."].contains(repository.components(separatedBy:"/").last ?? "") else {
            throw AppError.message("请输入 owner/repo 仓库名称")
        }
        guard let u = URLComponents(string:server.trimmingCharacters(in:.whitespaces)),
              u.scheme == "https", u.host != nil, u.user == nil, u.password == nil,
              u.query == nil, u.fragment == nil, ["","/"].contains(u.path) else {
            throw AppError.message("请输入不含路径和凭据的 HTTPS 后端地址")
        }
        var target = u
        target.path = path
        if path == "/api/status" {
            target.queryItems = [URLQueryItem(name:"repository",value:repository)]
        }
        guard let url = target.url else { throw AppError.message("地址无效") }
        return url
    }
    private func request(_ path: String, body: Data? = nil) async throws -> Data {
        guard server.trimmingCharacters(in:.whitespaces) == credentialOrigin else { throw AppError.message("服务器已改变，请在配置中保存对应的新密钥") }
        guard apiKey.count >= 32 else { throw AppError.message("请先配置控制台 API Key") }
        var req = URLRequest(url:try endpoint(path))
        req.timeoutInterval = 30
        req.setValue("Bearer \(apiKey)",forHTTPHeaderField:"Authorization")
        if let body {
            req.httpMethod = "POST"
            req.httpBody = body
            req.setValue("application/json",forHTTPHeaderField:"Content-Type")
        }
        let (data,response) = try await URLSession.shared.data(for:req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw AppError.message((try? JSONDecoder().decode(APIError.self,from:data).error) ?? "后端请求失败")
        }
        return data
    }
    @MainActor private func refresh() async {
        busy = true; defer { busy = false }
        do {
            let data = try await request("/api/status")
            runs = try JSONDecoder().decode(StatusResponse.self,from:data).runs
            message = "已更新 GitHub 构建记录；这不是手机安装状态。"
        } catch { message = error.localizedDescription }
    }
    @MainActor private func build() async {
        busy = true; defer { busy = false }
        do {
            let payload = try JSONEncoder().encode(["repository":repository,"mode":mode])
            let data = try await request("/api/build",body:payload)
            message = try JSONDecoder().decode(Accepted.self,from:data).message
        } catch { message = error.localizedDescription }
    }
}
