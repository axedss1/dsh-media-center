/**
 * dsh-media-center — 在 DSH 设置里选择「启动动画」与「界面背景」，并自己渲染。
 *
 * 渲染方式（与 dsh-video-skin 同一套原理，但不依赖它）：
 *   ① 一个 z-index:-1 的固定背景层放 <video>；
 *   ② 覆盖 body 上的 --dsw-alias-* 别名 token，把画布/侧栏压成半透明，
 *      抬起来的表面（弹层、菜单、设置页）保持内核原生不透明；
 *   ③ 启动动画是一层全屏 <video> 覆盖，播完 / 点击 / Esc 后淡出。
 *
 * 配置与素材都在每次请求时从磁盘重读，换片只需刷新页面。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { createSkinEngine } from './skins.js'
import { createImporter } from './importer.js'
import { scopeCssCached } from './scoper.js'

export const name = 'media-center'
export const inject = []

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url))
const HOME = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
const MEDIA_DIR = path.join(HOME, 'media-center')
const SOURCES_FILE = path.join(MEDIA_DIR, 'sources.json')
const POSTER_DIR = path.join(MEDIA_DIR, 'posters')
/** 随包分发的素材与封面（相对路径 + 包内 sources.json）。 */
const PACKAGE_SOURCES = path.join(SELF_DIR, 'sources.json')
const PACKAGE_POSTERS = path.join(SELF_DIR, 'media', 'posters')
const CONFIG_FILE = path.join(MEDIA_DIR, 'config.json')
const LEGACY_CONFIG = path.join(HOME, 'dsh-video-skin.json')
const BASE = '/dsh-media-center'

/** 精简皮肤引擎：皮肤清单 / 切换 / 皮肤自带背景。 */
const skins = createSkinEngine({ home: HOME, base: BASE })

/** 从已安装插件的包内导入素材（复制 + 登记到 sources.json）。 */
const importer = createImporter({
  home: HOME,
  mediaDir: MEDIA_DIR,
  sourcesFile: SOURCES_FILE,
  resolvePeerModules,
})

const VIDEO_EXT = new Set(['.mp4', '.webm', '.ogv'])

function isFile(p) {
  try { return fs.statSync(p).isFile() } catch { return false }
}
function isDir(p) {
  try { return fs.statSync(p).isDirectory() } catch { return false }
}

/**
 * 包内自带皮肤（`<包>/skins/<id>/`）：首次加载时装到 $DSH_HOME/skins。
 * 已存在的目录跳过，不会覆盖用户改过的皮肤；只读环境下静默放弃。
 */
function ensureBundledSkins() {
  const bundled = path.join(SELF_DIR, 'skins')
  if (!isDir(bundled)) return
  try {
    for (const name of fs.readdirSync(bundled)) {
      const from = path.join(bundled, name)
      const to = path.join(HOME, 'skins', name)
      if (!isDir(from) || isDir(to)) continue
      fs.mkdirSync(path.dirname(to), { recursive: true })
      fs.cpSync(from, to, { recursive: true })
    }
  } catch { /* 只读目录等：跳过 */ }
}
ensureBundledSkins()

function real(p) {
  try { return fs.realpathSync.native(p) } catch { return p }
}
function sizeMb(p) {
  try { return Math.round((fs.statSync(p).size / 1048576) * 10) / 10 } catch { return 0 }
}

function resolvePeerModules() {
  const sibling = path.join(path.dirname(SELF_DIR), 'dsh-video-skin', 'assets')
  if (isDir(sibling)) return path.dirname(SELF_DIR)
  try {
    for (const profile of fs.readdirSync(path.join(HOME, 'profiles'))) {
      const candidate = path.join(HOME, 'profiles', profile, 'node_modules')
      if (isDir(path.join(candidate, 'dsh-video-skin', 'assets'))) return candidate
    }
  } catch { /* ignore */ }
  return path.dirname(SELF_DIR)
}

function peerDirs() {
  const nm = resolvePeerModules()
  return {
    videoSkin: path.join(nm, 'dsh-video-skin', 'assets'),
    alice: path.join(MEDIA_DIR, 'alice'),
    lxj: path.join(MEDIA_DIR, 'lxj'),
    extra: path.join(MEDIA_DIR, 'extra'),
    skin: path.join(HOME, 'skins', 'whale-fantasy', 'assets'),
  }
}

function readUserSources() {
  // 优先用户级清单；没有就用随包分发的清单。
  for (const file of [SOURCES_FILE, PACKAGE_SOURCES]) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (parsed && typeof parsed === 'object') return parsed
    } catch { /* try next */ }
  }
  return null
}

function buildDefaults() {
  const dirs = peerDirs()
  return {
    boot: [
      { id: 'vs-boot', label: 'video-skin · boot', file: path.join(dirs.videoSkin, 'boot.mp4') },
      ...[1, 2, 3, 4].map((i) => ({ id: `alice-${i}`, label: `Alice-Marx · ${i}.mp4`, file: path.join(dirs.alice, `${i}.mp4`) })),
      ...[1, 2, 3, 4, 5].map((i) => ({ id: `lxj-${i}`, label: `lxj5820 · ${i}.mp4`, file: path.join(dirs.lxj, `${i}.mp4`) })),
    ],
    background: [
      { id: 'vs-bg', label: 'video-skin · background', file: path.join(dirs.videoSkin, 'background.mp4') },
      { id: 'skin-whale', label: 'whale-fantasy · 皮肤循环视频', file: path.join(dirs.skin, 'whale-fantasy-loop.mp4') },
    ],
  }
}

function sources(kind) {
  const defaults = buildDefaults()[kind] ?? []
  const user = readUserSources()?.[kind]
  const merged = []
  const seen = new Set()

  const push = (entry) => {
    if (!entry || typeof entry.id !== 'string' || seen.has(entry.id)) return
    let file = typeof entry.file === 'string' ? entry.file : ''
    // 相对路径按包根解析，这样随包分发的素材在任何机器上都成立。
    if (file !== '' && !path.isAbsolute(file)) file = path.resolve(SELF_DIR, file)
    if (file !== '' && !isFile(file)) return
    seen.add(entry.id)
    merged.push({
      id: entry.id,
      label: typeof entry.label === 'string' && entry.label !== ''
        ? entry.label
        : (file !== '' ? path.basename(file) : entry.id),
      file: file === '' ? null : real(file),
    })
  }

  push({ id: 'none', label: kind === 'boot' ? '关闭 · 不播启动动画' : '关闭 · 只留纯色背景', file: '' })
  if (Array.isArray(user)) user.forEach(push)
  else defaults.forEach(push)
  return merged
}

function listForClient(kind) {
  return sources(kind).map(({ id, file, label }) => {
    const size = file ? sizeMb(file) : 0
    return {
      id,
      label: file ? `${label} · ${size} MB` : label,
      name: label,
      meta: file ? `${size} MB` : '',
      poster: file && (isFile(path.join(POSTER_DIR, `${id}.jpg`)) ? `${BASE}/poster/${id}.jpg`
        : isFile(path.join(PACKAGE_POSTERS, `${id}.jpg`)) ? `${BASE}/poster/${id}.jpg` : null),
    }
  })
}

/** 配置：优先 media-center/config.json；不存在时从 dsh-video-skin.json 迁移一次。 */
/**
 * 背景候选 = 纯视频 + 皮肤自带的背景。
 * 皮肤项用 `skin:<id>` 作 id：选中它等于「应用这套皮肤」，切换入口因此绑定在背景上，
 * 设置里不再需要独立的皮肤区块。
 */
function mergedBackgrounds() {
  const base = listForClient('background').map((item) => ({ ...item, kind: 'video' }))
  const skinItems = skins.list()
    .filter((skin) => skin.hasBackground)
    .map((skin) => {
      const preview = skin.preview ? (skin.preview.dark || skin.preview.light) : null
      return {
        id: `skin:${skin.id}`,
        name: skin.name,
        label: skin.tagline || '皮肤自带背景',
        meta: '皮肤',
        poster: preview,
        kind: 'skin',
      }
    })
  return base.concat(skinItems)
}

function readConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    if (parsed && typeof parsed === 'object') return parsed
  } catch { /* fallthrough */ }
  try {
    const legacy = JSON.parse(fs.readFileSync(LEGACY_CONFIG, 'utf8'))
    const migrated = {
      boot: { enabled: legacy?.boot?.enabled !== false, file: legacy?.boot?.file ?? '' },
      background: { enabled: legacy?.background?.enabled !== false, file: legacy?.background?.file ?? '' },
      surface: 0.2,
      veil: 0.14,
    }
    fs.mkdirSync(MEDIA_DIR, { recursive: true })
    fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(migrated, null, 2)}\n`, 'utf8')
    return migrated
  } catch {
    return { boot: { enabled: false }, background: { enabled: false }, surface: 0.2, veil: 0.14 }
  }
}

function matchId(list, file) {
  if (typeof file !== 'string' || file === '') return null
  const target = real(file)
  for (const source of list) if (source.file && real(source.file) === target) return source.id
  return null
}

function currentSelection() {
  const config = readConfig()
  const boot = config.boot ?? {}
  const background = config.background ?? {}
  const bootId = boot.enabled === false
    ? 'none'
    : (typeof boot.file === 'string' && boot.file !== '' ? (matchId(sources('boot'), boot.file) ?? 'custom') : 'none')
  const bgId = background.enabled === false
    ? 'none'
    : (typeof background.file === 'string' && background.file !== '' ? (matchId(sources('background'), background.file) ?? 'custom') : 'none')
  const skinId = typeof config.skin === 'string' ? config.skin : ''
  if (skinId !== '') {
    const hasSkinBg = skins.list().some((skin) => skin.id === skinId && skin.hasBackground)
    if (hasSkinBg) return { boot: bootId, background: `skin:${skinId}` }
  }
  return { boot: bootId, background: bgId }
}

function normalizeCustom(file) {
  if (typeof file !== 'string' || file.trim() === '') return null
  const abs = path.resolve(file.trim().replace(/^"|"$/g, ''))
  if (!isFile(abs)) return null
  if (!VIDEO_EXT.has(path.extname(abs).toLowerCase())) return null
  return real(abs)
}

function resolveChoice(kind, id, customFile) {
  if (id === 'custom') {
    const file = normalizeCustom(customFile)
    return file ? { id: 'custom', file } : null
  }
  return sources(kind).find((item) => item.id === id) ?? null
}

function writeSelection(body) {
  const boot = resolveChoice('boot', typeof body?.boot === 'string' ? body.boot : 'none', body?.bootFile)
  const background = resolveChoice('background', typeof body?.background === 'string' ? body.background : 'none', body?.backgroundFile)
  if (!boot) throw new Error('unknown-boot-source')
  if (!background) throw new Error('unknown-background-source')

  const config = readConfig()
  config.boot = { ...(config.boot ?? {}) }
  config.background = { ...(config.background ?? {}) }
  // 走到这里说明背景选的是纯视频（或关闭）：必须清掉皮肤，否则皮肤自带的
  // 背景会在页面运行时优先于这条视频，用户点了也看不到。
  delete config.skin
  if (boot.file) {
    config.boot.enabled = true
    config.boot.file = boot.file
  } else {
    config.boot.enabled = false
  }
  if (background.file) {
    config.background.enabled = true
    config.background.file = background.file
  } else {
    config.background.enabled = false
  }
  fs.mkdirSync(MEDIA_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  return config
}

function sameOrigin(req) {
  const origin = req.headers?.origin
  if (typeof origin !== 'string' || origin === '') return true
  try { return new URL(origin).host === req.headers?.host } catch { return false }
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  })
  res.end(text)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 64 * 1024) { reject(new Error('body-too-large')); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch (error) { reject(error) }
    })
    req.on('error', reject)
  })
}

/** 启动动画 / 背景的媒体流（支持 Range，浏览器才肯边下边播）。 */
function streamFile(req, res, file) {
  let stat
  try { stat = fs.statSync(file) } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('media not found')
    return
  }
  const total = stat.size
  const type = path.extname(file).toLowerCase() === '.webm' ? 'video/webm'
    : path.extname(file).toLowerCase() === '.ogv' ? 'video/ogg' : 'video/mp4'
  const range = req.headers?.range
  if (typeof range === 'string') {
    const match = /bytes=(\d*)-(\d*)/.exec(range)
    let start = match && match[1] !== '' ? parseInt(match[1], 10) : 0
    let end = match && match[2] !== '' ? parseInt(match[2], 10) : total - 1
    if (!Number.isFinite(start) || start < 0) start = 0
    if (!Number.isFinite(end) || end >= total) end = total - 1
    if (start >= total) {
      res.writeHead(416, { 'Content-Range': `bytes */${total}` })
      res.end()
      return
    }
    res.writeHead(206, {
      'Content-Type': type,
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Cache-Control': 'no-cache',
    })
    fs.createReadStream(file, { start, end }).pipe(res)
    return
  }
  res.writeHead(200, {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Content-Length': total,
    'Cache-Control': 'no-cache',
  })
  fs.createReadStream(file).pipe(res)
}

function mediaHandler(req, res) {
  const urlPath = decodeURIComponent(String(req.url ?? '/').split('?')[0])
  const slot = urlPath.split('/').filter(Boolean).pop() || ''
  const name = slot.replace(/\.(mp4|webm|ogv)$/i, '')
  const config = readConfig()
  const file = config?.[name]?.enabled === true ? config[name]?.file : ''
  if (name !== 'boot' && name !== 'background') {
    res.writeHead(404); res.end('unknown slot'); return
  }
  if (typeof file !== 'string' || file === '' || !isFile(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('media unavailable')
    return
  }
  streamFile(req, res, file)
}

function posterHandler(req, res) {
  const urlPath = decodeURIComponent(String(req.url ?? '/').split('?')[0])
  const last = urlPath.split('/').filter(Boolean).pop() || ''
  const id = last.replace(/\.jpg$/i, '').replace(/[^a-zA-Z0-9_-]/g, '')
  const file = id === '' ? '' : (isFile(path.join(POSTER_DIR, `${id}.jpg`)) ? path.join(POSTER_DIR, `${id}.jpg`)
    : isFile(path.join(PACKAGE_POSTERS, `${id}.jpg`)) ? path.join(PACKAGE_POSTERS, `${id}.jpg`) : '')
  if (id === '' || !isFile(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('poster not found')
    return
  }
  try {
    const buf = fs.readFileSync(file)
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': buf.length, 'Cache-Control': 'no-cache' })
    res.end(buf)
  } catch {
    res.writeHead(500); res.end('poster error')
  }
}

async function configHandler(req, res) {
  const method = String(req.method ?? 'GET').toUpperCase()
  if (method === 'GET') {
    const config = readConfig()
    sendJson(res, 200, {
      ok: true,
      dependency: true,
      current: currentSelection(),
      currentFiles: {
        boot: typeof config.boot?.file === 'string' ? config.boot.file : '',
        background: typeof config.background?.file === 'string' ? config.background.file : '',
      },
      boot: listForClient('boot'),
      background: mergedBackgrounds(),
      skins: skins.list(),
      activeSkin: skins.active()?.id ?? '',
      file: CONFIG_FILE,
      sourcesFile: SOURCES_FILE,
    })
    return
  }
  if (method !== 'POST') { sendJson(res, 405, { ok: false, error: 'method-not-allowed' }); return }
  if (!sameOrigin(req)) { sendJson(res, 403, { ok: false, error: 'cross-origin' }); return }
  try {
    const body = await readBody(req)
    const picked = typeof body?.background === 'string' ? body.background : 'none'
    if (picked.startsWith('skin:')) {
      // 背景卡片里选的是「皮肤」：应用皮肤 + 关掉纯视频背景。
      const config = readConfig()
      config.boot = { ...(config.boot ?? {}) }
      const bootSel = resolveChoice('boot', typeof body?.boot === 'string' ? body.boot : 'none', body?.bootFile)
      if (bootSel) {
        if (bootSel.file) { config.boot.enabled = true; config.boot.file = bootSel.file }
        else { config.boot.enabled = false }
      }
      config.skin = picked.slice('skin:'.length)
      config.background = { ...(config.background ?? {}), enabled: false }
      fs.mkdirSync(MEDIA_DIR, { recursive: true })
      fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
    } else {
      writeSelection(body)
    }
    sendJson(res, 200, { ok: true, current: currentSelection(), file: CONFIG_FILE })
  } catch (error) {
    sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
  }
}

/** 每次请求现算的引导数据：素材 URL 带 mtime 版本号，换片即换 URL。 */
function bootstrapUnsafe() {
  const config = readConfig()
  const stamp = (file) => {
    try { return `${Math.round(fs.statSync(file).mtimeMs)}` } catch { return '0' }
  }
  const boot = config.boot ?? {}
  const background = config.background ?? {}
  const bootOn = boot.enabled !== false && typeof boot.file === 'string' && boot.file !== '' && isFile(boot.file)
  const bgOn = background.enabled !== false && typeof background.file === 'string' && background.file !== '' && isFile(background.file)
  return {
    base: BASE,
    surface: typeof config.surface === 'number' ? config.surface : 0.2,
    veil: typeof config.veil === 'number' ? config.veil : 0.14,
    skin: skins.bootstrap(),
    boot: bootOn
      ? { enabled: true, src: `${BASE}/media/boot.mp4?v=${stamp(boot.file)}`, hint: '正在启动…', skipLabel: '点击画面跳过' }
      : { enabled: false },
    background: bgOn
      ? { enabled: true, src: `${BASE}/media/background.mp4?v=${stamp(background.file)}` }
      : { enabled: false },
  }
}

/** 引导数据：异常时退化成「都没有」，别把整个页面注入搞挂。 */
function bootstrap() {
  try {
    return bootstrapUnsafe()
  } catch (error) {
    return {
      base: BASE,
      surface: 0.2,
      veil: 0.14,
      skin: { id: '', css: '', background: null, preview: null },
      boot: { enabled: false },
      background: { enabled: false },
      error: String(error?.message ?? error),
    }
  }
}

/** /dsh-media-center/bootstrap：设置里切换后拿最新引导数据，原地换皮肤用。 */
function bootstrapHandler(req, res) {
  const method = String(req.method ?? 'GET').toUpperCase()
  if (method !== 'GET') { sendJson(res, 405, { ok: false, error: 'method-not-allowed' }); return }
  sendJson(res, 200, bootstrap())
}

export function apply(ctx) {
  try {
    ctx.on('webserver/index-inject', (table) => {
      if (!table || typeof table.push !== 'function') return
      const css = (() => { try { return fs.readFileSync(path.join(SELF_DIR, 'client', 'inject.css'), 'utf8') } catch { return '' } })()
      const js = (() => { try { return fs.readFileSync(path.join(SELF_DIR, 'client', 'inject.js'), 'utf8') } catch { return '' } })()
      if (css) table.push({ kind: 'style', text: css })
      if (js) {
        const data = `globalThis.__DSH_MEDIA_CENTER__=${JSON.stringify(bootstrap())};`
        table.push({ kind: 'script', placement: 'body', text: `${data}\n${js}` })
      }
    })
  } catch { /* 没有注入表时只保留设置页 */ }

  ctx.inject(['webServer'], (child) => {
    child.webServer.register({ kind: 'exact', path: `${BASE}/config`, handler: configHandler })
    child.webServer.register({ kind: 'exact', path: `${BASE}/bootstrap`, handler: bootstrapHandler })
    child.webServer.register({ kind: 'prefix', path: `${BASE}/media`, handler: mediaHandler })
    child.webServer.register({ kind: 'prefix', path: `${BASE}/poster`, handler: posterHandler })
    child.webServer.register({ kind: 'exact', path: `${BASE}/skin-catalog`, handler: skins.selectHandler })
    child.webServer.register({ kind: 'exact', path: `${BASE}/import`, handler: importer.handler })
    // 皮肤中心的心跳已被本地化到这个地址：直接 204，不出网。
    child.webServer.register({
      kind: 'exact',
      path: `${BASE}/noop`,
      handler: (req, res) => { res.writeHead(204); res.end() },
    })
    child.webServer.register({ kind: 'prefix', path: `${BASE}/skin`, handler: skins.assetHandler })
  })
}

export function __debugSources() {
  return { peerModules: resolvePeerModules(), config: readConfig(), boot: listForClient('boot'), background: listForClient('background'), skins: skins.list(), activeSkin: skins.active()?.id ?? '' }
}
