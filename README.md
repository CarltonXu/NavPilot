# NavPilot
NavPilot 是一个简洁的企业内部导航门户，支持后台快速编辑、AI 自然语言添加导航条目、分类管理、网站状态探测（在线/离线/未知）、动态延迟展示、点击统计、多主题切换，并区分「公共空间」（团队统一维护）与「个人空间」。

## 功能一览

- **公共 / 个人双空间**：
  - **公共空间**：企业统一维护，所有人可见；管理员登录后可在门户点击「编辑公共空间」进入编辑态
  - **个人空间**：登录账户自己的收藏与分类，仅本人可见，可跨设备持久使用
  - 公共与个人分类均支持最多三级树；父分类聚合展示所有下级资源，删除分类树时资源保留并转入未分类
  - 编辑态支持分类原位重命名、资源多选批量移动，以及将资源直接拖到左侧分类完成归类
  - 顶部空间切换条随时切换，公共与每个用户的分类完全独立
- **账户体系**：服务器持久用户、scrypt 密码哈希和可撤销 HttpOnly Cookie 会话；账户由管理员创建
- **全局搜索与导航助手**：
  - 所有人都能搜索公共资源；登录后同时搜索自己的个人空间
  - 登录后可进行创建、修改、删除、分类和移动等资源操作；管理员可切换公共空间与个人空间
  - 助手不依赖门户编辑态，每次只生成操作计划，必须由当前用户明确授权后才会执行
  - `⌘K` / `Ctrl+K` 唤起全局搜索，结果旁展示需用户确认的 AI 建议；`⌘J` / `Ctrl+J` 唤起导航助手
- **独立管理后台**：只有 admin 角色在账户菜单中看到入口，账户、安全审计、通用设置和 AI 设置集中在 `/admin`
- **AI 添加导航**（公共空间，管理员）：一句话描述想加的网站（可一次描述多个），调用大模型自动解析出 名称/链接/分类/图标/描述，预览确认后再入库
- **状态探测**：
  - 支持 HTTP(S) 探测（HEAD/GET，2xx-4xx 视为在线，5xx/超时/连接失败视为离线）
  - 支持 TCP 端口探测（host:port 连通性）
  - 支持定时自动探测（仅监控已启用的资源，间隔可配置，默认 5 分钟）
  - 用户手动点击“全部探测”或单条目探测时会临时检查当前空间资源，不受定时监控开关影响
  - 展示实时延迟（毫秒），顶部栏常驻"在线/离线/总数"统计
- **点击统计**：记录每个导航条目被点击的次数
- **主题切换**：科技暗（默认）/ 明亮 / 深空 / 护眼，4 套主题共享同一套视觉语言，选择记忆在浏览器本地
- **中英文切换**：顶部语言菜单对所有用户可见，界面语言保存在浏览器本地；AI 新生成的描述与分类也会跟随当前语言
- **后台 AI 配置**：管理员可维护多个 OpenAI 兼容模型，支持新增、修改、删除、启用/禁用、默认模型和连接测试，保存后无需重启即可生效
- **图标 / 描述 / 分类 / 链接**：均可在表单中自由配置，图标支持 emoji 快选

## 设计语言

整体走"科技监控面板"方向，把状态探测这个核心功能变成视觉签名，而不是套用通用后台模板：

- **色板**：主色信号蓝 `#5B7FFF`，在线状态青绿 `#34E7B0`，离线珊瑚红 `#FF6B6B`，4 套主题统一色相体系，只是明暗与背景基调不同
- **字体分工**：标题用 `Space Grotesk`（几何感），正文用 `Inter`，所有数字类信息（延迟 ms、点击数、域名）统一用等宽字体 `JetBrains Mono`，强化"数据面板"的感觉
- **签名细节**：卡片默认无阴影极简风格，鼠标悬停时四角浮现直角取景框描边（呼应"探测/锁定"的产品语义）；侧边栏采用代码编辑器式左侧高亮线；分类标题用 `// 分类名` 的等宽注释体小标签
- **悬浮 AI 助手**：呼吸光晕圆形按钮，视觉上呼应"在线状态"绿点的语言，暗示"助手在待命"
- **背景**：全局铺一层极淡的网点网格，弱化但不消失，保留科技面板的呼吸感

## 技术栈

- 后端：Node.js + Express + better-sqlite3（SQLite，零配置，数据文件在 `server/data/navpilot.db`）+ node-cron（定时探测）+ axios（HTTP 探测与 AI 接口调用）
- 前端：React 18 + Vite，纯 CSS 变量实现多主题，无额外 UI 框架依赖

## 目录结构

```
navpilot/
├── server/            # 后端服务
│   ├── src/
│   │   ├── index.js          # 服务入口
│   │   ├── db.js             # SQLite 初始化 + 表结构（含 scope/owner 字段）+ 默认数据
│   │   ├── cron.js           # 定时探测任务
│   │   ├── middleware/auth.js   # requireAdmin(公共空间) / requireUser(个人空间身份)
│   │   ├── routes/           # categories / items / ai / settings
│   │   └── services/         # healthCheck(状态探测) / aiParser(AI解析，支持公共/个人两种落库范围)
│   └── .env.example          # 环境变量示例，需复制为 .env
└── client/            # 前端(React + Vite)
    └── src/
        ├── App.jsx            # 空间切换、身份、条目列表等核心状态
        ├── api.js             # 后端 API 封装（同源 HttpOnly Cookie 会话）
        ├── auth/              # AuthProvider：登录、会话、角色与强制改密
        ├── components/
        │   ├── SpaceSwitcher.jsx        # 公共/个人空间切换条
        │   ├── AuthDialogs.jsx          # 登录、改密与账户菜单
        │   ├── AdminWorkspace.jsx       # 角色受控管理后台
        │   ├── SystemSettingsModal.jsx  # 管理员 AI 设置
        │   ├── AiAssistantWidget.jsx    # 全局助手（搜索 + 多空间资源操作）
        │   └── ...（导航卡片、分类导航、表单等）
        └── styles/            # themes.css(主题变量) + app.css
```

## 快速开始

### 1. 安装依赖

```bash
cd server && npm install
cd ../client && npm install
```

### 2. 配置环境变量

```bash
cd server
cp .env.example .env
```

打开 `server/.env` 按需修改端口、探测参数、首个管理员和 AI 回退配置：

```ini
PORT=8787

# 仅当数据库还没有管理员时创建首个管理员；首次改密后从环境中删除
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_DISPLAY_NAME=NavPilot Admin
BOOTSTRAP_ADMIN_PASSWORD=请替换为至少10位的随机强密码

AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=
AI_MODEL=gpt-4o-mini

AUTO_CHECK_ENABLED=true
CHECK_INTERVAL_MINUTES=5
CHECK_TIMEOUT_MS=5000
```

AI 配置优先级为：**系统设置数据库覆盖 > 环境变量 > 内置默认值**。后台保存的 API Key 使用 AES-256-GCM 加密，主密钥首次运行时生成在数据目录 `.navpilot-secret`；也可以通过 `NAVPILOT_SECRET_KEY` 提供 32 字节 Base64 或 64 位十六进制密钥。数据库和主密钥必须分别备份，否则无法恢复模型密钥。

> 不配置 `AI_API_KEY` 不影响搜索和其他功能，只有 AI 资源操作不可用。
> 生产环境必须使用 HTTPS，并限制数据库、备份和运行环境变量的访问权限。

### 3. 本地开发运行（两个终端）

```bash
# 终端1：后端，默认监听 8787
cd server
npm run dev

# 终端2：前端开发服务器，默认监听 5173，已配置好代理到后端
cd client
npm run dev
```

浏览器打开 http://localhost:5173 即可。

### 4. Docker Compose 部署（推荐）

项目根目录提供了多阶段 `Dockerfile` 和 `docker-compose.yml`。镜像构建时编译前端，运行时由 Express 同源托管 API 与静态资源；SQLite 数据保存在 Docker 命名卷 `navpilot-data` 中。

```bash
# 首次部署：填写管理员临时密码及其他配置
cp server/.env.example server/.env

# 构建并后台启动
docker compose up -d --build

# 查看状态和日志
docker compose ps
docker compose logs -f app
```

默认访问 `http://localhost:8787`。如需修改宿主机端口：

```bash
NAVPILOT_HTTP_PORT=8080 docker compose up -d
```

默认使用 Docker 命名卷，升级或重建容器不会丢失数据库。若要直接使用当前 `server/data/navpilot.db`，可改为宿主机目录挂载（该目录必须允许容器内 UID 1000 写入）：

```bash
NAVPILOT_DATA_SOURCE=./server/data docker compose up -d --build
```

常用运维命令：

```bash
# 停止服务但保留数据
docker compose down

# 仅重新构建并滚动替换应用
docker compose up -d --build

# 删除服务及命名卷数据（不可恢复，请先备份）
docker compose down -v
```

Compose 以 `NODE_ENV=production` 启动，因此登录 Cookie 带有 `Secure` 标记。除本机 `localhost` 调试外，正式部署必须在服务前配置 HTTPS 反向代理。

如需通过局域网 IP 使用 HTTP 临时验收登录功能，可设置 `NAVPILOT_NODE_ENV=development`；该选项只应用于本地验证，正式部署不要启用。

#### 可信代理与 GeoIP

访问来源地区支持两种数据源：可信反向代理传入的国家二字码，以及本地 MaxMind GeoLite2/GeoIP2 Country MMDB。系统只保存国家代码；客户端 IP 仍分别按 IPv4 `/24`、IPv6 `/48` 脱敏。

在 `server/.env` 中配置可信代理。该值必须是明确的 IP、CIDR，或 `proxy-addr` 支持的 `loopback`、`linklocal`、`uniquelocal`，不允许使用 `true`、`all` 或 `*`：

```ini
# Nginx/Caddy 与 NavPilot 都在同一 Docker/私有网络时
NAVPILOT_TRUST_PROXY=uniquelocal

# 也可以使用明确网段；多个值用逗号分隔
# NAVPILOT_TRUST_PROXY=127.0.0.1/32,172.20.0.0/16

NAVPILOT_GEOIP_HEADERS=cf-ipcountry,x-country-code,x-vercel-ip-country
NAVPILOT_GEOIP_DB_PATH=/app/geoip/GeoLite2-Country.mmdb
NAVPILOT_GEOIP_CITY_DB_PATH=/app/geoip/geolite2-city-ipv4.mmdb
```

城市数据库是可选项。NavPilot兼容标准 GeoIP2 City 结构，也兼容仅在顶层
返回 `city` 字符串的 MMDB。Country 数据库继续负责国家识别以及 City
数据库未覆盖的 IPv6 降级。启用后，访问分析可以从世界地图点击中国，按
“国家 → 省份 → 省内城市”继续下钻；历史记录不会反推城市，城市数据从
启用后的新访问开始累计。其他国家仍使用城市热点作为通用降级展示。

系统只保存国家代码和城市名称，不保存 City 数据库可能提供的精确经纬度，
也不保存完整客户端 IP。城市热点和中国省市边界使用独立的构建期数据进行
聚合展示，只能用于趋势分析，不能视为 GPS 定位或官方地图。相关第三方数据说明见
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。

GeoLite2 是可选运行数据，不属于 NavPilot 源码和 Docker 镜像。推荐使用仓库提供的安装脚本：

```bash
./scripts/download-geoip.sh --restart
```

脚本会安全提示输入 MaxMind Account ID 和 License Key，下载 `GeoLite2-Country` 的 MMDB 版本，校验官方 SHA256，并原子替换 `server/geoip/GeoLite2-Country.mmdb`。License Key 不会回显，也不会写入仓库。自动更新任务可以通过环境变量或 Secret 文件非交互运行：

```bash
MAXMIND_ACCOUNT_ID=123456 \
MAXMIND_LICENSE_KEY_FILE=/run/secrets/maxmind_license_key \
./scripts/download-geoip.sh
```

也可以从 MaxMind 控制台手动下载并解压 `GeoLite2-Country.mmdb` 到 `server/geoip/`。Compose 会将该目录只读挂载到容器的 `/app/geoip`；数据库不存在或无效时服务不会中断，而是自动降级为可信代理国家头。已加载的 MMDB 更新后会自动热加载；首次安装建议使用脚本的 `--restart`。

开源发布约定：`.mmdb`、GeoLite2 压缩包和下载凭据均被 Git 与 Docker 构建上下文排除。NavPilot 不重新分发 GeoLite2 数据；每个部署者需要自行向 MaxMind 获取数据库并遵守其当前许可和更新条款。`maxmind` Node.js 读取依赖使用 MIT 许可证，但数据文件具有独立许可，不能视为 NavPilot 开源许可证的一部分。

普通 Nginx 至少需要正确传递真实 IP；国家代码可以由 Nginx GeoIP2 模块生成，也可以交给 NavPilot 的本地 MMDB 查询：

```nginx
location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    # 使用 Nginx GeoIP2 时，由代理覆盖该值，不能透传客户端同名请求头
    proxy_set_header X-Country-Code $geoip2_country_code;
}
```

Cloudflare 代理会提供 `CF-IPCountry`，但仍需将 `NAVPILOT_TRUST_PROXY` 配置为 Cloudflare 官方公布的当前出口 CIDR，并通过防火墙禁止用户绕过 Cloudflare 直连应用端口。仅供本机反向代理访问时可绑定回环地址：

```bash
NAVPILOT_HTTP_BIND=127.0.0.1 docker compose up -d --build
```

启动后可检查采集器状态：

```bash
curl -s http://127.0.0.1:8787/api/health
```

返回的 `geoIp` 中，`trustedProxyConfigured` 表示可信代理已启用，`geoIpDatabaseLoaded` 表示本地 MMDB 已成功加载。配置只影响之后产生的资源点击事件，不会推断或回填历史地区数据。

若通过 cron 定期更新，建议使用只允许 root 读取的 Secret 文件，并避免把 License Key 直接写进 crontab、Shell 历史或 `server/.env`。例如：

```cron
17 4 * * 3 MAXMIND_ACCOUNT_ID=123456 MAXMIND_LICENSE_KEY_FILE=/run/secrets/maxmind_license_key /opt/navpilot/scripts/download-geoip.sh >>/var/log/navpilot-geoip.log 2>&1
```

### 5. 手动生产部署（单进程）

```bash
cd client
npm run build          # 产出 client/dist

cd ../server
npm install --production
npm start               # 后端会自动检测并托管 client/dist，只需暴露一个端口
```

访问 `http://服务器IP:8787` 即可，建议用 `pm2` / `systemd` / Docker 常驻运行，并在前面挂 Nginx 做 HTTPS。

> 如果是从旧版本升级：先将旧的 `nav.db` 做 SQLite 一致性备份并命名为 `navpilot.db`。数据表迁移由 `db.js` 在启动时自动完成。

## 账户、个人空间与管理后台

- 公共空间允许匿名浏览和搜索；个人空间需要登录，数据与服务器账户绑定，可跨设备持久使用。
- 不开放匿名自注册。管理员在 `/admin` 的「账户管理」中创建用户，系统生成一次性临时密码，用户首次登录必须修改密码。
- 首个管理员仅在全新/升级后没有管理员时由 `BOOTSTRAP_ADMIN_USERNAME`、`BOOTSTRAP_ADMIN_DISPLAY_NAME`、`BOOTSTRAP_ADMIN_PASSWORD` 创建。完成首次改密后应从运行环境删除这些变量。
- 普通用户界面不显示公共空间编辑入口；管理员登录后默认仍为正常浏览模式，可通过与个人空间相同位置的「编辑公共空间」按钮进入编辑态。账户、安全审计、品牌与 AI 设置集中在 `/admin`。
- 会话保存在服务器 SQLite 中，浏览器使用 HttpOnly Cookie；空闲 24 小时或最长 7 天后失效。生产环境必须使用 HTTPS。
- 旧版本浏览器身份会迁移为「待认领个人空间」，不会根据昵称自动绑定。管理员创建目标账户后，在后台明确分配。
- 公共分类和每个用户的个人分类完全独立，同名分类可以分别存在。

## 全局助手与展示模式

- 全局搜索面向所有访客，`⌘K`（macOS）或 `Ctrl+K`（Windows/Linux）可随时唤起；导航助手使用 `⌘J` / `Ctrl+J`，也可以点击右下角按钮打开。
- 匿名搜索仅返回公共资源；登录后搜索公共资源和自己的个人资源。搜索不到但输入看起来是网址时，界面会建议创建资源。
- 右下角助手只保留全局搜索和「询问 AI」快捷入口；分析、资源操作和复杂规划统一进入独立 AI 工作台，避免多个入口重复实现同一套能力。
- AI 工作台支持在公共空间与个人空间之间切换，讨论回复使用增量流式输出；通过「讨论与分析 → 生成执行方案 → 检查并授权 → 执行或撤销」完成闭环。公共空间写入仅限管理员，个人空间能力由管理员统一授权。
- 后台可独立配置 OpenAI 兼容 Embedding 模型；启用后全局搜索自动组合关键词与语义相关度，资源变更会排队增量更新索引，索引严格按公共/个人空间隔离。
- AI 操作支持连续对话，模型只接收当前用户有权查看的资源上下文；网页名称、描述和正文均视为不可信数据，不得覆盖系统指令。
- 网站名称、描述和图标由确定性的元信息识别能力处理，不包装成 AI 功能；网页正文不会发送给 AI。
- 顶部「空间工具」随当前空间工作：个人空间和公共空间都支持按资源或目录共享、标准 JSON/Chrome Bookmarks 导入及结构化导出；公共空间写入仅限管理员，共享接收后统一导入接收者的个人空间。
- 支持「丰富卡片」「紧凑列表」和「智能总览」三种展示；智能总览从访问频率、添加时间、健康状态和标签四个维度组织资源，选择保存在浏览器 `navpilot_view_mode_v1`。
- 固定界面图标使用本地 duotone SVG；已有 emoji 内容图标继续兼容。

## 数据迁移与备份

### Chrome Bookmarks 一键导入

普通网页受 Chrome 安全策略限制，不能直接读取浏览器书签。NavPilot 构建时会自动将只申请 `bookmarks` 权限的桥接扩展打包为 `/downloads/navpilot-bookmarks-extension.zip`，并随服务端静态资源一起发布：

1. 在「个人空间工具 → 导入资源 → Chrome Bookmarks」中点击下载扩展并解压。
2. 打开 `chrome://extensions` 并开启「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择解压后的 `navpilot-bookmarks-extension` 目录。
4. 刷新 NavPilot，返回 Chrome Bookmarks 导入页并点击读取。

扩展只在带 NavPilot 页面标记的网站中响应读取请求，不读取登录 Cookie，也不会自行上传或修改书签；导入前仍会展示完整预览、重复检查和选择列表。

升级前应对 `server/data/navpilot.db` 做 SQLite 一致性备份。新版本使用事务化 `schema_migrations`、外键检查和 public/personal realm 约束；迁移失败会停止启动，不会静默跳过。个人旧条目的自动探测在迁移时默认关闭，以避免未经账户确认继续探测。

## 使用说明

### 公共空间（团队维护）

1. 匿名打开默认进入公共空间，可以浏览、搜索和切换展示模式。
2. 管理员登录后默认保持正常浏览模式；点击顶部与个人空间一致位置的「编辑公共空间」按钮后，可管理公共分类、条目、状态探测和 AI 操作。
3. 退出编辑态后恢复正常浏览；公共编辑、批量探测、账户和系统设置均由管理员角色控制。

### 个人空间（自己维护）

1. 点击「我的空间」会要求登录；登录后个人数据与服务器账户绑定，可跨浏览器/设备使用。
2. 用户可新增、编辑、删除自己的条目和分类，但不能访问其他用户的个人空间。
3. 全局助手搜索始终可用；管理员开启个人 AI 后，登录用户可在助手中创建、修改、删除、分类和移动个人资源。
4. 通过账户菜单退出登录；退出不会删除个人数据。

### 管理员专属

- `/admin`：使用分析、安全审计、账户、待认领个人空间、通用设置和多模型 AI 设置；公共内容直接在门户编辑。
- 账户管理支持详情、修改、角色授权、启用/禁用、重置密码和删除，并保护当前账户与最后一个有效管理员。
- 通用设置支持网站名称、门户左上角 Logo 和浏览器标签页图标。
- 安全审计默认每页 20 条，内容区域独立滚动，分页固定在面板底部。
- 首个管理员必须修改 bootstrap 临时密码；后续用户由管理员创建并获得一次性临时密码。
- 顶部「中文 / English」和三种展示模式对所有用户可用。

## 已知局限与生产加固

- UI 保存的 AI API Key 在 SQLite/WAL/备份中保持加密；应限制数据目录权限，并将 `.navpilot-secret` 或 `NAVPILOT_SECRET_KEY` 与数据库分开保管。
- 个人空间已默认禁用 TCP 探测；公共内网目标仍建议在 `healthCheck` 前增加部署网段 allowlist 和 DNS/重定向策略。
- 当前后台使用轻量 pathname 分支而非路由库；页面继续增加时可引入 React Router。
- 自动测试覆盖迁移、密码、会话和设置核心逻辑；账户权限矩阵和键盘交互仍建议持续扩充集成测试。

## 后续可扩展方向（未包含在当前实现中，供参考）

- 拖拽排序（当前分类/条目排序已有 `sort_order` 字段与 `/reorder` 接口，前端拖拽交互可后续补充）
- 自动抓取网站 favicon，减少手动选 emoji 的成本
- 探测结果历史记录 / 可用率趋势图（当前只保留最近一次探测结果）
- 离线状态变化时接入企业微信 / 钉钉 webhook 告警
- 探测失败重试机制（当前一次超时/失败即判定离线，容易受网络抖动影响误报）
- 个人空间"收藏公共空间条目"能力（目前个人空间与公共空间是完全独立的两份数据）
>>>>>>> 38632c6 (feat: initialize NavPilot application)
