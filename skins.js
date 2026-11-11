/**
 * 精简皮肤引擎（替代 @linxin666/dsh-client-ui-skin-center 的核心能力）。
 *
 * 能力：扫描 $DSH_HOME/skins/<id>/ 的 skin.json，列出皮肤、提供 CSS 与素材、
 * 记住当前选择，并把皮肤自带的背景图/视频交给页面运行时铺开。
 *
 * 有意不做的（原插件有、这里没有）：
 *   - CSS 安全管线（lightningcss 作用域重写 + 白名单 + 一次性 worker）
 *   - 皮肤 hooks.mjs（可执行 facet）与 provenance 校验
 *   - 首屏防闪注入（index.html tap）、壁纸引擎协作、逐张皮肤的试穿态
 * 因为只在本地单用户环境用，且一次只挂一套皮肤，直接注入原样式即可。
 */
import fs from 'node:fs'
import path from 'node:path'
import { scopeCssCached } from './scoper.js'

export function createSkinEngine(options) {
  const { home, base } = options
  const SKINS_DIR = path.join(home, 'skins')
  const CONFIG_FILE = path.join(home, 'media-center', 'config.json')
  const BASE = base

  const isFile = (p) => { try { return fs.statSync(p).isFile() } catch { return false } }
  const isDir = (p) => { try { return fs.statSync(p).isDirectory() } catch { return false } }

  function readConfig() {
    try {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch { return {} }
  }
  function writeConfig(next) {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
    fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  }

  /** 读一个皮肤目录；skin.json 缺失或 id 与目录名不一致就跳过（fail closed）。 */
  function readSkinDir(dir) {
    let manifest
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(dir, 'skin.json'), 'utf8'))
    } catch { return null }
    if (!manifest || typeof manifest !== 'object' || typeof manifest.id !== 'string') return null
    if (manifest.id !== path.basename(dir)) return null
    const contributes = manifest.contributes && typeof manifest.contributes === 'object' ? manifest.contributes : {}
    const cssFiles = []
    for (const key of ['stylesheet', 'patches']) {
      const rel = contributes[key]
      if (typeof rel !== 'string' || rel === '') continue
      const abs = path.resolve(dir, rel)
      if (abs.startsWith(dir + path.sep) && isFile(abs)) cssFiles.push(abs)
    }
    if (cssFiles.length === 0) return null
    return { dir, manifest, cssFiles, contributes }
  }

  function catalog() {
    let names = []
    try { names = fs.readdirSync(SKINS_DIR) } catch { return [] }
    const out = []
    for (const name of names) {
      const dir = path.join(SKINS_DIR, name)
      if (!isDir(dir)) continue
      const skin = readSkinDir(dir)
      if (skin) out.push(skin)
    }
    return out.sort((a, b) => (a.manifest.order ?? 999) - (b.manifest.order ?? 999))
  }

  const findSkin = (id) => catalog().find((skin) => skin.manifest.id === id)

  /** 把清单里的相对素材路径转成可访问 URL。 */
  function assetUrl(skin, rel) {
    if (typeof rel !== 'string' || rel === '') return null
    const abs = path.resolve(skin.dir, rel)
    if (!abs.startsWith(skin.dir + path.sep) || !isFile(abs)) return null
    const relUrl = path.relative(skin.dir, abs).split(path.sep).map(encodeURIComponent).join('/')
    return `${BASE}/skin/${encodeURIComponent(skin.manifest.id)}/asset/${relUrl}`
  }

  /** 皮肤的背景素材：manifest.contributes.backgroundMedia.{light,dark}。 */
  function backgroundOf(skin) {
    const media = skin.contributes?.backgroundMedia
    if (!media || typeof media !== 'object') return null
    const one = (entry) => {
      if (!entry || typeof entry !== 'object') return null
      const src = assetUrl(skin, entry.src)
      if (!src) return null
      return {
        type: entry.type === 'video' ? 'video' : 'image',
        src,
        scrim: typeof entry.scrim === 'string' ? entry.scrim : '',
      }
    }
    const light = one(media.light)
    const dark = one(media.dark)
    if (!light && !dark) return null
    return { light: light ?? dark, dark: dark ?? light }
  }

  function previewOf(skin) {
    const preview = skin.manifest.preview
    if (!preview || typeof preview !== 'object') return null
    return {
      light: assetUrl(skin, preview.light),
      dark: assetUrl(skin, preview.dark),
    }
  }

  function list() {
    return catalog().map((skin) => ({
      id: skin.manifest.id,
      name: skin.manifest.name || skin.manifest.id,
      tagline: skin.manifest.tagline || '',
      accent: skin.manifest.accent || '',
      preview: previewOf(skin),
      hasBackground: backgroundOf(skin) !== null,
    }))
  }

  function active() {
    const config = readConfig()
    const id = typeof config.skin === 'string' && config.skin !== '' ? config.skin : ''
    if (id === '') return null
    const skin = findSkin(id)
    if (!skin) return null
    return { id, skin }
  }

  /** 供页面运行时使用的引导数据。 */
  function bootstrap() {
    const current = active()
    if (!current) return { id: '', css: '', background: null, preview: null }
    return {
      id: current.id,
      css: `${BASE}/skin/${encodeURIComponent(current.id)}/css`,
      background: backgroundOf(current.skin),
      preview: previewOf(current.skin),
    }
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
        if (size > 32 * 1024) { reject(new Error('body-too-large')); req.destroy(); return }
        chunks.push(chunk)
      })
      req.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch (error) { reject(error) }
      })
      req.on('error', reject)
    })
  }

  async function selectHandler(req, res) {
    const method = String(req.method ?? 'GET').toUpperCase()
    if (method === 'GET') {
      sendJson(res, 200, { ok: true, active: active()?.id ?? '', skins: list() })
      return
    }
    if (method !== 'POST') { sendJson(res, 405, { ok: false, error: 'method-not-allowed' }); return }
    try {
      const body = await readBody(req)
      const id = typeof body?.id === 'string' ? body.id : ''
      if (id !== '' && !findSkin(id)) { sendJson(res, 404, { ok: false, error: 'skin-not-found' }); return }
      const config = readConfig()
      if (id === '') delete config.skin
      else config.skin = id
      writeConfig(config)
      sendJson(res, 200, { ok: true, active: id })
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
    }
  }

  /** /skin/<id>/css 与 /skin/<id>/asset/<rel> 共用。 */
  function assetHandler(req, res) {
    const raw = decodeURIComponent(String(req.url ?? '/').split('?')[0])
    const segs = raw.split('/').filter(Boolean)
    const isCss = segs[segs.length - 1] === 'css'
    let id = ''
    let rel = ''
    if (isCss) {
      id = segs[segs.length - 2] ?? ''
    } else {
      const at = segs.indexOf('asset')
      if (at > 0) {
        id = segs[at - 1]
        rel = segs.slice(at + 1).join('/')
      }
    }
    const skin = id === '' ? null : findSkin(id)
    if (!skin) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('skin not found'); return }

    if (isCss) {
      const parts = []
      for (const file of skin.cssFiles) {
        try { parts.push(fs.readFileSync(file, 'utf8')) } catch { /* skip */ }
      }
      const text = scopeCssCached(skin.manifest.id, parts.join('\n'))
      res.writeHead(200, {
        'Content-Type': 'text/css; charset=utf-8',
        'Content-Length': Buffer.byteLength(text),
        'Cache-Control': 'no-cache',
      })
      res.end(text)
      return
    }

    const abs = path.resolve(skin.dir, rel)
    if (!abs.startsWith(skin.dir + path.sep) || !isFile(abs)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('asset not found')
      return
    }
    const ext = path.extname(abs).toLowerCase()
    const type = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
      : ext === '.png' ? 'image/png'
        : ext === '.webp' ? 'image/webp'
          : ext === '.svg' ? 'image/svg+xml'
            : ext === '.mp4' ? 'video/mp4'
              : ext === '.webm' ? 'video/webm' : 'application/octet-stream'
    try {
      const buf = fs.readFileSync(abs)
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': buf.length, 'Cache-Control': 'no-cache' })
      res.end(buf)
    } catch {
      res.writeHead(500); res.end('asset error')
    }
  }

  return { list, active, bootstrap, selectHandler, assetHandler, SKINS_DIR, readConfig, writeConfig }
}
