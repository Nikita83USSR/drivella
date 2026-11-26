#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <algorithm>
#include <atomic>
#include <cctype>
#include <cstdint>
#include <utility>
#include <cwctype>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>
#include <thread>
#include "include/cef_app.h"
#include "include/cef_browser.h"
#include "include/cef_command_line.h"
#include "include/cef_client.h"
#include "include/cef_display_handler.h"
#include "include/cef_life_span_handler.h"
#include "include/cef_load_handler.h"
#include "include/cef_parser.h"
#include "include/wrapper/cef_helpers.h"
#pragma comment(lib, "ws2_32.lib")
#pragma comment(lib, "shell32.lib")

extern "C" {
__declspec(dllexport) DWORD NvOptimusEnablement = 0x00000001;
__declspec(dllexport) int AmdPowerXpressRequestHighPerformance = 1;
}
namespace fs = std::filesystem;
namespace {
std::string DecodePath(const std::string& s) {
  std::string o;
  for (size_t i=0;i<s.size();++i) {
    if (s[i]=='%' && i+2<s.size()) {
      auto h=[](char c)->int { if(c>='0'&&c<='9')return c-'0'; if(c>='a'&&c<='f')return c-'a'+10; if(c>='A'&&c<='F')return c-'A'+10; return -1; };
      int a=h(s[i+1]),b=h(s[i+2]); if(a>=0&&b>=0){o.push_back(char((a<<4)|b));i+=2;continue;}
    }
    o.push_back(s[i]=='+'?' ':s[i]);
  }
  return o;
}
bool SendAll(SOCKET s,const char* p,size_t n) {
  while(n){int k=send(s,p,int(std::min<size_t>(n,1<<20)),0);if(k<=0)return false;p+=k;n-=size_t(k);}return true;
}
std::string ContentType(const fs::path& p) {
  std::wstring e=p.extension().wstring();std::transform(e.begin(),e.end(),e.begin(),::towlower);
  if(e==L".html"||e==L".htm")return "text/html; charset=utf-8";
  if(e==L".js"||e==L".mjs")return "text/javascript; charset=utf-8";
  if(e==L".css")return "text/css; charset=utf-8";if(e==L".svg")return "image/svg+xml";
  if(e==L".png")return "image/png";if(e==L".jpg"||e==L".jpeg")return "image/jpeg";
  if(e==L".webp")return "image/webp";if(e==L".mp3")return "audio/mpeg";
  if(e==L".json")return "application/json";return "application/octet-stream";
}
void ServeClient(SOCKET s,fs::path root) {
  std::string req;char b[8192];
  while(req.find("\r\n\r\n")==std::string::npos&&req.size()<32768){int n=recv(s,b,sizeof(b),0);if(n<=0)break;req.append(b,n);}
  std::istringstream in(req);std::string method,url,proto;in>>method>>url>>proto;
  if(method!="GET"&&method!="HEAD"){const std::string h="HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";SendAll(s,h.data(),h.size());closesocket(s);return;}
  size_t q=url.find_first_of("?#");if(q!=std::string::npos)url.resize(q);
  std::string path=DecodePath(url);while(!path.empty()&&(path[0]=='/'||path[0]=='\\'))path.erase(path.begin());if(path.empty())path="index.html";
  fs::path rel=fs::u8path(path);bool bad=rel.is_absolute();for(const auto& x:rel)if(x==L".."||x==L".")bad=true;
  std::error_code ec;root=fs::weakly_canonical(root,ec);fs::path file=fs::weakly_canonical(root/rel,ec);fs::path check=file.lexically_relative(root);
  if(ec||bad||check.empty()||(check.begin()!=check.end()&&*check.begin()==L"..")||!fs::is_regular_file(file,ec)){
    const std::string h="HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";SendAll(s,h.data(),h.size());closesocket(s);return;
  }
  uint64_t size=fs::file_size(file,ec),first=0,last=size?size-1:0;bool partial=false;std::string line,range;
  while(std::getline(in,line)){if(!line.empty()&&line.back()=='\r')line.pop_back();std::string low=line;std::transform(low.begin(),low.end(),low.begin(),[](unsigned char c){return char(std::tolower(c));});if(low.rfind("range:",0)==0)range=low.substr(6);}
  if(!range.empty()&&size){size_t m=range.find("bytes=");if(m!=std::string::npos){std::string spec=range.substr(m+6);size_t d=spec.find('-');if(d!=std::string::npos){try{first=std::stoull(spec.substr(0,d));if(d+1<spec.size())last=std::stoull(spec.substr(d+1));if(first<size&&last>=first){last=std::min<uint64_t>(last,size-1);partial=true;}else{first=0;last=size-1;}}catch(...){first=0;last=size-1;}}}}
  uint64_t length=size?last-first+1:0;std::ostringstream hs;hs<<(partial?"HTTP/1.1 206 Partial Content\r\n":"HTTP/1.1 200 OK\r\n")<<"Content-Type: "<<ContentType(file)<<"\r\nContent-Length: "<<length<<"\r\nAccept-Ranges: bytes\r\nCache-Control: no-store\r\nConnection: close\r\n";
  if(partial)hs<<"Content-Range: bytes "<<first<<"-"<<last<<"/"<<size<<"\r\n";hs<<"\r\n";std::string head=hs.str();
  if(!SendAll(s,head.data(),head.size())||method=="HEAD"||!length){closesocket(s);return;}
  std::ifstream f(file,std::ios::binary);if(!f){closesocket(s);return;}f.seekg(std::streamoff(first));uint64_t left=length;
  while(left&&f){size_t chunk=size_t(std::min<uint64_t>(left,sizeof(b)));f.read(b,std::streamsize(chunk));size_t n=size_t(f.gcount());if(!n||!SendAll(s,b,n))break;left-=n;}closesocket(s);
}
class LoopbackServer {
 public:
  bool Start(const fs::path& root,unsigned short* port){
    root_=root;WSADATA w{};if(WSAStartup(MAKEWORD(2,2),&w)!=0)return false;
    sock_=socket(AF_INET,SOCK_STREAM,IPPROTO_TCP);if(sock_==INVALID_SOCKET)return false;
    sockaddr_in a{};a.sin_family=AF_INET;a.sin_addr.s_addr=htonl(INADDR_LOOPBACK);a.sin_port=htons(47831);
    if(bind(sock_,reinterpret_cast<sockaddr*>(&a),sizeof(a))==SOCKET_ERROR||listen(sock_,SOMAXCONN)==SOCKET_ERROR)return false;
    *port=47831;running_=true;thread_=std::thread([this](){while(running_){SOCKET c=accept(sock_,nullptr,nullptr);if(c==INVALID_SOCKET){if(!running_)break;continue;}std::thread(ServeClient,c,root_).detach();}});return true;
  }
  ~LoopbackServer(){running_=false;if(sock_!=INVALID_SOCKET){shutdown(sock_,SD_BOTH);closesocket(sock_);}if(thread_.joinable())thread_.join();WSACleanup();}
 private:fs::path root_;SOCKET sock_=INVALID_SOCKET;std::atomic<bool> running_{false};std::thread thread_;
};
class GameClient:public CefClient,public CefDisplayHandler,public CefLifeSpanHandler,public CefLoadHandler{
 public:
  CefRefPtr<CefDisplayHandler> GetDisplayHandler()override{return this;}
  CefRefPtr<CefLifeSpanHandler> GetLifeSpanHandler()override{return this;}
  CefRefPtr<CefLoadHandler> GetLoadHandler()override{return this;}
  void OnTitleChange(CefRefPtr<CefBrowser> b,const CefString& title)override{CEF_REQUIRE_UI_THREAD();HWND h=b->GetHost()->GetWindowHandle();if(h)SetWindowTextW(h,title.ToWString().c_str());}
  void OnAfterCreated(CefRefPtr<CefBrowser> b)override{CEF_REQUIRE_UI_THREAD();HWND h=b->GetHost()->GetWindowHandle();if(h)ShowWindow(h,SW_MAXIMIZE);}
  bool DoClose(CefRefPtr<CefBrowser>)override{CEF_REQUIRE_UI_THREAD();return false;}
  void OnBeforeClose(CefRefPtr<CefBrowser>)override{CEF_REQUIRE_UI_THREAD();CefQuitMessageLoop();}
  void OnLoadError(CefRefPtr<CefBrowser>,CefRefPtr<CefFrame> frame,ErrorCode code,const CefString&,const CefString&)override{
    CEF_REQUIRE_UI_THREAD();if(code==ERR_ABORTED)return;
    const std::string html="<html><body style='background:#080817;color:#ff8adf;font:16px Consolas;padding:40px'><h2>DRIVELLA не удалось запустить</h2><p>Локальные игровые файлы недоступны.</p></body></html>";
    frame->LoadURL("data:text/html;charset=utf-8,"+CefURIEncode(html,false).ToString());
  }
 private:IMPLEMENT_REFCOUNTING(GameClient);
};
class GameApp:public CefApp,public CefBrowserProcessHandler{
 public:explicit GameApp(std::string u):url_(std::move(u)){}
  CefRefPtr<CefBrowserProcessHandler> GetBrowserProcessHandler()override{return this;}
  void OnContextInitialized()override{CEF_REQUIRE_UI_THREAD();CefWindowInfo wi;wi.SetAsPopup(nullptr,"DRIVELLA");wi.runtime_style=CEF_RUNTIME_STYLE_ALLOY;CefBrowserSettings bs;bs.windowless_frame_rate=60;CefBrowserHost::CreateBrowser(wi,new GameClient(),url_,bs,nullptr,nullptr);}
 private:std::string url_;IMPLEMENT_REFCOUNTING(GameApp);
};
fs::path ExeDir(){wchar_t p[MAX_PATH]{};GetModuleFileNameW(nullptr,p,MAX_PATH);return fs::path(p).parent_path();}
}
int APIENTRY wWinMain(HINSTANCE instance,HINSTANCE,LPWSTR,int){
  CefMainArgs args(instance);int child=CefExecuteProcess(args,nullptr,nullptr);if(child>=0)return child;
  CefRefPtr<CefCommandLine> cmd=CefCommandLine::CreateCommandLine();cmd->InitFromString(GetCommandLineW());
  std::wstring root_arg=cmd->GetSwitchValue("game-dir").ToWString();fs::path root=root_arg.empty()?ExeDir()/L"content":fs::path(root_arg);
  std::error_code ec;root=fs::weakly_canonical(root,ec);
  if(ec||!fs::exists(root/L"index.html")){MessageBoxW(nullptr,L"Файлы DRIVELLA не установлены. Запустите обновление игры.",L"DRIVELLA",MB_ICONERROR|MB_OK);return 2;}
  LoopbackServer server;unsigned short port=0;if(!server.Start(root,&port)){MessageBoxW(nullptr,L"Не удалось запустить локальный игровой сервер.",L"DRIVELLA",MB_ICONERROR|MB_OK);return 3;}
  wchar_t appdata[MAX_PATH]{};SHGetFolderPathW(nullptr,CSIDL_LOCAL_APPDATA,nullptr,SHGFP_TYPE_CURRENT,appdata);
  fs::path cache=fs::path(appdata)/L"DRIVELLA"/L"CEFCache";fs::create_directories(cache,ec);
  CefSettings settings;settings.no_sandbox=true; // Prototype only; public release must use the current CEF bootstrap sandbox.
  settings.windowless_rendering_enabled=false;settings.log_severity=LOGSEVERITY_WARNING;
  CefString(&settings.cache_path)=cache.wstring();CefString(&settings.resources_dir_path)=ExeDir().wstring();
  CefString(&settings.locales_dir_path)=(ExeDir()/L"locales").wstring();
  std::string url="http://127.0.0.1:"+std::to_string(port)+"/index.html";
  CefRefPtr<GameApp> app(new GameApp(url));if(!CefInitialize(args,settings,app.get(),nullptr)){MessageBoxW(nullptr,L"Не удалось инициализировать Chromium Embedded Framework.",L"DRIVELLA",MB_ICONERROR|MB_OK);return CefGetExitCode();}
  CefRunMessageLoop();CefShutdown();return 0;
}
