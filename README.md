# dsh-media-center

给 **DeepSeek Harness (DSH)** 用的媒体中心插件：在设置里用**带封面的卡片网格**选择「启动动画」与「界面背景」，点一下就切换、原地生效，不需要刷新或重启 DSH。

**自带渲染**：插件自己铺背景视频、播启动动画、把界面表面压成半透明，**不依赖任何第三方渲染插件**。

**自带皮肤**：本仓库打包了 **2 套皮肤**（`blue-fantasy`、`whale-fantasy`，含各自的插画/循环视频与预览图），放在 `skins/`，安装后首次加载会自动装到 `$DSH_HOME/skins/`，装好就能切换。

**视频素材不在仓库里**：启动动画和雨夜房间背景体积太大（约 113 MB），改放在本仓库的 **Releases** 附件（`dsh-media-center-1.0.8-full.zip`）。要现成素材的话：下载 Release 包解压，把 `media/` 放进 `$DSH_HOME/media-center/`，或用设置里的「从插件包导入素材」。不放也能用——启动动画和视频背景的卡片会少一些，皮肤照常。

---

## 安装

### 方式一：DSH 设置界面（最简单）

设置 → 内置插件 → 添加插件 → 输入 `github:axedss1/dsh-media-center` → 重启 DSH。

### 方式二：命令行

```sh
dsh plugin --profile desktop add github:axedss1/dsh-media-center
```

也可以用本地目录：`dsh plugin --profile desktop add "link:C:\path\to\dsh-media-center"`。

### 方式三：npm（发布后）

```sh
dsh plugin --profile desktop add dsh-media-center
```

装完**重启一次 DSH**（宿主侧代码与客户端模块都在启动时加载），设置左侧会出现「媒体中心」。

> 国内直连 GitHub 不稳时，先给安装环境配好代理（`HTTPS_PROXY`），否则拉取会超时。

---

## 使用

设置 → 媒体中心：

- **启动动画**：卡片网格，当前生效的带绿色「当前使用」。优先**带声音**播；被浏览器自动播放策略拦下时自动转静音，并在右下角给一个「🔊 开启声音」。播放时点击画面、按 Esc 或空格可跳过。
- **界面背景**：铺满整个界面的循环视频，界面面板半透明压在上面。**皮肤也排在这排卡片里**（带「皮肤」标签），选中它等于应用那套皮肤 + 它自带的背景。
- 每块下方有一条虚线框，填**绝对路径**即可使用自己的视频（`mp4 / webm / ogv`）。
- 点卡片（或卡片上的「应用」）→ 写配置 → **原地换皮肤/背景，立即生效**；只有宿主侧代码改动才需要重启。

---

## 素材目录

```
$DSH_HOME/media-center/
├── config.json           当前选择（boot / background / surface / veil）
├── sources.json          可选，自定义候选清单（覆盖内置清单）
├── posters/              封面图，<id>.jpg
├── alice/  lxj/  extra/  放自己的视频（约定，非强制）
```

`$DSH_HOME` 默认是 `~/.dsh`（Windows：`C:\Users\<你>\.dsh`），可用环境变量 `DSH_HOME` 覆盖。

### sources.json

存在时**完全覆盖**内置清单（`none` 这一项始终由插件自动加在最前）。`file` 不存在的条目会被静默跳过，所以清单里留着失效路径也不会出错。

```json
{
  "boot": [
    { "id": "mine", "label": "我的启动动画", "file": "D:\\videos\\boot.mp4" }
  ],
  "background": [
    { "id": "mine-bg", "label": "我的背景", "file": "D:\\videos\\bg.mp4" }
  ]
}
```

- `id`：只允许 `[A-Za-z0-9_-]`，且必须与封面文件名对应（`posters/<id>.jpg`）。
- 改完 `sources.json` **刷新页面即生效**，不用重启。

### 封面

```sh
node tools/make-posters.mjs --at 3 --width 480
```

对 `sources.json` 里每段素材用 ffmpeg 抽一帧，写到 `posters/<id>.jpg`。需要本机有 `ffmpeg`（或用 `FFMPEG` 环境变量指定路径）。没有封面时卡片显示「无预览」，功能不受影响。

---

## 皮肤

皮肤没有独立区块，**并进「界面背景」卡片**：`$DSH_HOME/skins/<id>/` 下每个声明了 `contributes.backgroundMedia` 的皮肤，都会以 `skin:<id>` 出现在背景网格里（封面取 `preview/`），点卡片即切换（原地应用，不刷新页面）。

- 皮肤是纯资源目录：`skin.json`（清单）+ `skin.css`（`--dsw-*` token 重映射）+ `patches.css`（自由选择器）+ `preview/` + 可选 `assets/`。
- 应用方式：注入 `skin.css` + `patches.css`、给 `<html>` 打 `data-dsh-skin="<id>"`、记住选择。`id` 必须与目录名一致，否则跳过（fail closed）。
- 皮肤声明的 `contributes.backgroundMedia.{light,dark}` 由页面运行时铺成背景层（图或视频，`scrim` 是叠在上面的遮罩渐变）。
- 选皮肤 → 写 `config.skin` 并关掉视频背景；选回纯视频背景 → 清空 `config.skin`。两者互斥，不会叠两层。
- 皮肤样式用浏览器原生 `@scope (html[data-dsh-skin]) to ([role="dialog"], [aria-modal="true"])` 收束：弹层子树直接排除在作用域外，所以**不需要**再开关样式表（`link.disabled` 那套会因弹层节点常驻而误判，导致 HUD 消失）。
- 半透明 token 覆盖**始终启用**，否则不透明的画布会把背景（皮肤插画或视频）整块盖住。
- 不声明 `backgroundMedia` 的皮肤不会进背景网格；想让它可选，补一段声明即可。
- 「关闭 · 只留纯色背景」= 同时清空皮肤与视频背景，回到 DSH 原生外观。

与原皮肤中心相比**有意省略**的部分：CSS 安全管线（lightningcss 作用域重写/白名单/一次性 worker）、皮肤 `hooks.mjs`、provenance 校验、首屏防闪注入、壁纸引擎协作、逐皮肤的试穿态。本地单用户场景下直接注入原样式即可。

## 工作方式

```
设置 → 媒体中心（React 组件，settings.section 插槽）
        │  GET  /dsh-media-center/config     素材清单 + 当前选择
        │  POST /dsh-media-center/config     写配置
        ▼
$DSH_HOME/media-center/config.json
        │
        ▼
宿主每次返回页面时注入 <style> + <script>（webserver/index-inject）
        │
        ▼
页面运行时：<video id="mc-backdrop"> 铺背景 + <div id="mc-boot"> 播启动动画
           并把 body 上的 --dsw-alias-* 别名压成半透明
```

半透明的做法：内核主题把色板定义在 `body` / `body[data-ds-dark-theme]` 上，全应用的可视表面都引用 `--dsw-alias-*` 别名，所以覆盖别名就能一次改到所有面板，不需要知道任何组件类名。**只压「画布」和「侧栏」**，抬起来的表面（弹层、菜单、设置页）保持内核原生不透明，避免文字叠字。

接口：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/dsh-media-center/config` | 素材清单、当前选择（背景里含 `skin:<id>` 卡片） |
| GET | `/dsh-media-center/bootstrap` | 页面运行时的引导数据；切换后用它原地换皮肤，不刷新页面 |
| POST | `/dsh-media-center/config` | `{ boot, bootFile, background, backgroundFile }`；`background` 传 `skin:<id>` 走皮肤分支，同源校验 |
| GET | `/dsh-media-center/media/boot.mp4` | 启动动画视频流（支持 Range） |
| GET | `/dsh-media-center/media/background.mp4` | 背景视频流（支持 Range） |
| GET | `/dsh-media-center/poster/<id>.jpg` | 封面图 |
| GET/POST | `/dsh-media-center/skin-catalog` | 皮肤清单 / 切换（`{ "id": "…" }`，空串 = 清除） |
| GET | `/dsh-media-center/skin/<id>/css` | 作用域化后的皮肤 CSS（`skin.css` + `patches.css`） |
| GET | `/dsh-media-center/skin/<id>/asset/<路径>` | 皮肤素材（预览图、背景视频、字体） |
| POST | `/dsh-media-center/import` | 从已安装插件包内导入素材到 `media-center/extra` |

宿主侧零第三方依赖、无构建步骤；客户端那一半是手写 CJS，用 `window.__ModuleLoader__.load` + `require('react')`，与 DSH 内置客户端插件同构。

---

## 本地化皮肤中心（可选）

如果同时在用 `@linxin666/dsh-client-ui-skin-center`，它每天会向 `dsh-market.com` 发一次安装心跳。用这个脚本把该地址改成本地空路由（本插件的 `/dsh-media-center/noop`，返回 204）：

```sh
node tools/localize-skin-center.mjs             # 打补丁
node tools/localize-skin-center.mjs --check      # 只看状态，不改文件
node tools/localize-skin-center.mjs --revert     # 还原
```

- 幂等：已本地化时再跑只提示"无需改动"。
- 自动定位 `$DSH_HOME/profiles/*/node_modules/@linxin666/dsh-client-ui-skin-center`，也可 `--target <目录>` 指定。
- **插件升级会覆盖补丁**，升级后重跑一次即可。

## 已知限制

- **只接受视频**（`mp4 / webm / ogv`）。静态图需要先转成循环视频：
  ```sh
  ffmpeg -loop 1 -i art.jpg -t 12 -r 30 -vf scale=1920:-2 \
         -c:v libx264 -crf 20 -pix_fmt yuv420p -an art.mp4
  ```
- 同一时间只支持一个背景、一个启动动画。
- 启动动画**优先带声音**播放；被浏览器自动播放策略拦下时自动静音，并显示「🔊 开启声音」按钮。
- 与其它背景类插件可能叠加，建议只装一个。
- **切换皮肤/背景是原地生效的，不用刷新、不用重启。**
- 改 `sources.json`、`skin.json`、皮肤 CSS、素材后，在设置里再点一次对应卡片即重载。
- 改 `index.js` / `client.js` / `inject.js` 需要重启 DSH：桌面壳不会重新拉取页面文档，连 Ctrl+R 都不会刷新注入的那份 HTML。

---

## 自检

```sh
node tools/test-config-branches.mjs
```

用临时 `DSH_HOME` 跑 `POST /config` 的两条分支（皮肤 ↔ 纯视频互斥、皮肤写入），不碰真实配置。

---

## 更新记录

- **1.0.8** — 分发结构调整：仓库只保留「代码 + 2 套皮肤」（约 7.4 MB），视频素材（5 段启动动画 + 雨夜房间，约 113 MB）移到 Releases 附件；`package.json` 补 `repository` / `homepage`。功能与 1.0.7 一致。
- **1.0.7** — 支持「自带皮肤的整包」：插件加载时若包内有 `skins/`，就把里面的皮肤复制到 `$DSH_HOME/skins/`（已存在则跳过，不覆盖用户改动）。
- **1.0.6** — 修「背景视频冻在第一帧」：背景层补上皮肤契约属性 `data-dsh-skin-layer="background"`（鲸鱼娘靠它把运行时视频层从负 z-index 抬到 1，合成器才会持续接管），视频元素再加 `translateZ(0)` + `will-change: transform`；新增播放看门狗（暂停即重播、连续两次 `currentTime` 不动就重挂 `src`）；设置面板新增一行「运行时」自检（皮肤 / CSS / 背景层 / 视频状态）。
- **1.0.5** — 修「切换一次背景再切回来，HUD 消失」：皮肤样式改用 @scope ... to ([role=dialog], [aria-modal=true]) 把设置弹层整棵子树排除，**删掉 link.disabled 开关逻辑**（弹层关闭后节点常驻、祖先 opacity:0 等会让人肉可见性判断误判，皮肤样式一旦被禁用就再也不恢复）。现在弹层开/关、皮肤切换次数都不影响 HUD。
- **1.0.4** — 修「设置里点了皮肤、HUD 却没换」：设置弹层关闭后往往只是隐藏、节点还在 DOM 里，`settingsOpen()` 误判成「还开着」，皮肤样式被一直 disabled。改成只在弹层**可见**时禁用（`display/visibility/opacity/aria-hidden` 都看），并加 1 秒兜底轮询；另外背景层存在时给 `html/body` 打 `data-dsh-backdrop-active`（皮肤约定的标记，皮肤地面层会让路）。
- **1.0.3** — 切换改为**原地应用**：新增 `GET /bootstrap`，设置里选完直接调页面运行时的 `__DSH_MEDIA_CENTER_APPLY__` 换皮肤/背景，不再依赖 `location.reload()`（页面重载可能拿到缓存的旧 index.html，表现为「点了应用、背景不动」）；卡片整体可点；主按钮改用 `button-primary-fill` + `label-primary-foreground` 这对 token（深色主题里 `brand-primary` 是浅色，白字会变成一块空白按钮）；段落顶部显示「当前：…」。
- **1.0.2** — 皮肤并入「界面背景」卡片（`skin:<id>`，无独立皮肤区块）；半透明始终启用（修「插画被不透明画布挡住」）；`currentSelection` 认皮肤、POST 支持 `skin:` 分支；选纯视频/关闭时清空 `config.skin`（修「切了视频出不来」）；启动动画优先带声音；客户端去掉未使用的 `SkinCard`。
- **1.0.1** — 皮肤引擎改用浏览器原生 `@scope` 作用域化；新增从插件包导入素材。
- **1.0.0** — 首个自包含版本：启动动画 + 界面背景 + 自带渲染。

---

## License

MIT。见 [LICENSE](./LICENSE)。
