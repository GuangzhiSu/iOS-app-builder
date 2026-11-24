import SwiftUI
import Security

@main struct PocketBuildApp: App { var body: some Scene { WindowGroup { Dashboard() } } }
private enum AppError: LocalizedError {
    case message(String)
    var errorDescription: String? { switch self { case .message(let text): return text } }
}
private enum Credential {
    static let service = "PocketBuild.github-token"
    static var query: [String:Any] { [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:"github"] }
    static func load() -> String {
        var q=query; q[kSecReturnData as String]=true; q[kSecMatchLimit as String]=kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary,&result)==errSecSuccess,let data=result as? Data else {return ""}
        return String(data:data,encoding:.utf8) ?? ""
    }
    static func save(_ token:String) throws {
        if token.isEmpty { SecItemDelete(query as CFDictionary);return }
        let data=Data(token.utf8)
        let updated=SecItemUpdate(query as CFDictionary,[kSecValueData as String:data] as CFDictionary)
        if updated==errSecSuccess {return}
        guard updated==errSecItemNotFound else {throw AppError.message("无法更新 Keychain 凭据")}
        var item=query;item[kSecValueData as String]=data;item[kSecAttrAccessible as String]=kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        guard SecItemAdd(item as CFDictionary,nil)==errSecSuccess else {throw AppError.message("无法保存 Keychain 凭据")}
    }
}
private final class NoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session:URLSession,task:URLSessionTask,willPerformHTTPRedirection response:HTTPURLResponse,newRequest request:URLRequest,completionHandler:@escaping(URLRequest?)->Void){completionHandler(nil)}
}
private struct Run: Decodable,Identifiable {
    let id:Int
    let display_title:String?
    let status:String
    let conclusion:String?
    let html_url:String
}
private struct Runs: Decodable {let workflow_runs:[Run]}
private struct DispatchResult: Decodable {let workflow_run_id:Int?}
private struct Repository: Decodable {let default_branch:String}
private struct DispatchBody: Encodable {
    let ref:String
    let inputs:[String:String]
}
private struct Dashboard: View {
    @AppStorage("repository") private var repository="GuangzhiSu/iOS-app-builder"
    @AppStorage("shortcutName") private var shortcutName="Pocket Build Refresh"
    @AppStorage("lastVerifiedRefresh") private var lastVerifiedRefresh=0.0
    @State private var token=Credential.load()
    @State private var distribution="sidestore"
    @State private var branch="main"
    @State private var runs:[Run]=[]
    @State private var pendingID=""
    @State private var pendingRun:Int?
    @State private var busy=false
    @State private var message=""
    @State private var settings=false
    @State private var confirmBuild=false
    @State private var confirmRefresh=false
    @Environment(\.openURL) private var openURL
    private let mint=Color(red:0.70,green:0.93,blue:0.79)

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment:.leading,spacing:12){
                        Text("NO EXTRA SERVER").font(.caption).foregroundStyle(mint)
                        Text("想法在手上，\n构建在云端。").font(.largeTitle.bold())
                        Text("直接连接 GitHub，不需要 Windows 常开或另建后端。安装由 SideStore 或 TestFlight 完成。").foregroundStyle(.secondary)
                    }.padding(.vertical,10)
                }
                Section("云端构建") {
                    Text(repository).font(.subheadline.monospaced())
                    Picker("交付方式",selection:$distribution){Text("SideStore · 免费签名").tag("sidestore");Text("TestFlight · 付费会员").tag("testflight")}
                    Button("一键云端构建"){confirmBuild=true}.disabled(busy)
                    Button("刷新真实构建状态"){Task{await refresh()}}.disabled(busy)
                    if busy {ProgressView()}
                    if !message.isEmpty {Text(message).font(.footnote).foregroundStyle(.secondary)}
                    if !pendingID.isEmpty {Text("本次请求：\(pendingID)").font(.caption.monospaced()).textSelection(.enabled)}
                }
                Section("最近构建") {
                    if runs.isEmpty {Text("点击刷新读取 GitHub 状态。").foregroundStyle(.secondary)}
                    ForEach(runs){run in
                        if let url=safeRunURL(run.html_url){
                            Link(destination:url){VStack(alignment:.leading){Text((run.id==pendingRun ? "本次 · ":"")+(run.display_title ?? "Build #\(run.id)"));Text(run.conclusion ?? run.status).font(.caption).foregroundStyle(.secondary)}}
                        }
                    }
                }
                Section("手机续签") {
                    TextField("续签快捷指令名称",text:$shortcutName)
                    Button("运行已配置的续签指令") {runShortcut()}
                    Button("我已在 SideStore 确认刷新成功") {confirmRefresh=true}
                    if lastVerifiedRefresh>0 {
                        Text("手动确认的估计到期：\(Date(timeIntervalSince1970:lastVerifiedRefresh+7*86400).formatted())").font(.footnote)
                    }
                    Text("首次需创建该快捷指令并配置每天的个人自动化。打开指令或返回完成不证明证书已刷新；核对 SideStore 到期日后再记录。").font(.footnote).foregroundStyle(.secondary)
                    Link("手机自动化设置",destination:URL(string:"https://guangzhisu.github.io/iOS-app-builder/#automation")!)
                }
                Section("交付与配置") {
                    if let release=URL(string:"https://github.com/\(repository)/releases"){Link("下载 IPA 与订阅源",destination:release)}
                    Link("TestFlight 配置说明",destination:URL(string:"https://github.com/GuangzhiSu/iOS-app-builder/blob/main/TESTFLIGHT.md")!)
                    Text("免费签名仍需每 7 天刷新。TestFlight 需要自己的会员与签名配置；构建成功不代表手机已安装。").font(.footnote).foregroundStyle(.secondary)
                }
            }.navigationTitle("Pocket Build").tint(mint).preferredColorScheme(.dark)
            .toolbar{Button("连接 GitHub"){settings=true}}
            .sheet(isPresented:$settings){
                NavigationStack {
                    Form {
                        Section("GitHub 直连") {
                            TextField("owner/repo",text:$repository).textInputAutocapitalization(.never).autocorrectionDisabled()
                            SecureField("GitHub fine-grained token",text:$token)
                            Text("只授权目标仓库：Actions 读写、Contents 只读。令牌仅发往 api.github.com，保存于本机 Keychain，不需要粘贴到聊天里。").font(.footnote)
                            Link("到 GitHub 创建受限令牌",destination:URL(string:"https://github.com/settings/personal-access-tokens/new")!)
                        }
                        Button("保存并检查连接"){Task{await connect()}}.disabled(busy)
                        Button("清除令牌",role:.destructive){token="";try? Credential.save("");message="凭据已清除"}
                        if !message.isEmpty {Text(message).font(.footnote)}
                    }.navigationTitle("GitHub 连接").toolbar{Button("关闭"){settings=false}}
                }
            }
            .confirmationDialog("为 \(repository) 构建？将使用 macOS runner 配额。",isPresented:$confirmBuild,titleVisibility:.visible){Button("发起 \(distribution) 构建"){Task{await build()}};Button("取消",role:.cancel){}}
            .confirmationDialog("已在 SideStore 看到新的签名到期时间？",isPresented:$confirmRefresh,titleVisibility:.visible){Button("是，记录现在"){lastVerifiedRefresh=Date().timeIntervalSince1970};Button("尚未确认",role:.cancel){}}
            .onChange(of:repository){_,_ in runs=[];pendingID="";pendingRun=nil;branch="main"}
        }
    }
    private func validRepository() throws {
        guard repository.range(of:"^[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}$",options:.regularExpression) != nil,
              ![".",".."].contains(repository.components(separatedBy:"/").last ?? "") else {throw AppError.message("仓库格式应为 owner/repo")}
    }
    private func safeRunURL(_ text:String)->URL? {
        guard let u=URL(string:text),u.scheme=="https",u.host=="github.com",u.path.hasPrefix("/\(repository)/actions/runs/") else {return nil};return u
    }
    private func request(_ suffix:String,body:Data?=nil) async throws -> Data {
        try validRepository()
        guard let url=URL(string:"https://api.github.com/repos/\(repository)\(suffix)") else {throw AppError.message("GitHub 地址无效")}
        var req=URLRequest(url:url);req.timeoutInterval=30;req.cachePolicy = .reloadIgnoringLocalCacheData
        req.setValue("application/vnd.github+json",forHTTPHeaderField:"Accept");req.setValue("2026-03-10",forHTTPHeaderField:"X-GitHub-Api-Version")
        if !token.isEmpty {req.setValue("Bearer \(token)",forHTTPHeaderField:"Authorization")}
        if let body {req.httpMethod="POST";req.httpBody=body;req.setValue("application/json",forHTTPHeaderField:"Content-Type")}
        let session=URLSession(configuration:.ephemeral,delegate:NoRedirect(),delegateQueue:nil)
        defer{session.invalidateAndCancel()}
        let(data,response)=try await session.data(for:req)
        guard let http=response as? HTTPURLResponse else {throw AppError.message("GitHub 未返回有效响应")}
        guard (200..<300).contains(http.statusCode) else {throw AppError.message("GitHub 返回 \(http.statusCode)，请检查令牌、仓库权限或工作流。请求不确定时先刷新，避免重复构建。")}
        return data
    }
    @MainActor private func connect() async {
        busy=true;defer{busy=false}
        do{guard token.count>=20 else{throw AppError.message("请配置受限 GitHub token")};let data=try await request("");branch=try JSONDecoder().decode(Repository.self,from:data).default_branch;_ = try await request("/actions/workflows/ios-build.yml");try Credential.save(token);settings=false;message="读取已验证；构建写权限将由 GitHub 检查。"}catch{message=error.localizedDescription}
    }
    @MainActor private func refresh() async {
        busy=true;defer{busy=false}
        do{let data=try await request("/actions/workflows/ios-build.yml/runs?per_page=30");runs=try JSONDecoder().decode(Runs.self,from:data).workflow_runs
            if pendingRun == nil && !pendingID.isEmpty {pendingRun=runs.first(where:{$0.display_title?.contains(pendingID)==true})?.id}
            message="已更新 GitHub 记录；这不是手机安装状态。"
        }catch{message=error.localizedDescription}
    }
    @MainActor private func build() async {
        busy=true;defer{busy=false}
        do{guard token.count>=20 else{throw AppError.message("先点右上角连接 GitHub")};let repoData=try await request("");branch=try JSONDecoder().decode(Repository.self,from:repoData).default_branch
            let id="pb-"+UUID().uuidString.lowercased()
            let body=try JSONEncoder().encode(DispatchBody(ref:branch,inputs:["distribution":distribution,"request_id":id]))
            let data=try await request("/actions/workflows/ios-build.yml/dispatches",body:body)
            pendingID=id;pendingRun=(try? JSONDecoder().decode(DispatchResult.self,from:data))?.workflow_run_id
            message="GitHub 已接受本次构建，请刷新状态。安装尚未完成。"
        }catch{message=error.localizedDescription}
    }
    private func runShortcut(){
        var u=URLComponents();u.scheme="shortcuts";u.host="run-shortcut";u.queryItems=[URLQueryItem(name:"name",value:shortcutName)]
        if let url=u.url {openURL(url);message="已请求打开续签指令，请核对 SideStore 到期日。"}
    }
}
