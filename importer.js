/**
 * 从已安装插件的包内导入素材。
 *
 * 场景：某个插件里有好用的启动动画/背景视频，但它即将被卸载（或已经不需要它的
 * 其它功能），希望能把素材搬到 $DSH_HOME/media-center/extra/ 并留在候选列表里。
 *
 * 只做「复制 + 登记」，不改动源插件、不执行它的代码。
 * 安全：包名白名单字符、路径必须落在包目录内、只接受视频扩展名。
 */
import fs from 'node:fs'
import path from 'node:path'

const VIDEO_EXT = new Set(['.mp4', '.webm', '.ogv'])

export function createImporter(options) {
  const { home, mediaDir, sourcesFile, resolvePeerModules } = options
  const isFile = (p) => { try { return fs.statSync(p).isFile() } catch { return false } }
  const isDir = (p) => { try { return fs.statSync(p).isDirectory() } catch { return false } }

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
        if (size > 16 * 1024) { reject(new Error('body-too-large')); req.destroy(); return }
        chunks.push(chunk)
      })
      req.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch (error) { reject(error) }
      })
      req.on('error', reject)
    })
  }

  function sameOrigin(req) {
    const origin = req.headers?.origin
    if (typeof origin !== 'string' || origin === '') return true
    try { return new URL(origin).host === req.headers?.host } catch { return false }
  }

  /** 在 profile 的 node_modules 及其 pnpm store 里定位包目录。 */
  function findPackage(name) {
    const direct = path.join(resolvePeerModules(), ...name.split('/'))
    if (isDir(direct)) return direct
    const profiles = path.join(home, 'profiles')
    let names = []
    try { names = fs.readdirSync(profiles) } catch { return null }
    for (const profile of names) {
      const store = path.join(profiles, profile, 'node_modules', '.pnpm')
      if (!isDir(store)) continue
      let entries = []
      try { entries = fs.readdirSync(store) } catch { continue }
      for (const entry of entries) {
        const candidate = path.join(store, entry, 'node_modules', ...name.split('/'))
        if (isDir(candidate)) return candidate
      }
    }
    return null
  }

  function readSources() {
    try {
      const parsed = JSON.parse(fs.readFileSync(sourcesFile, 'utf8'))
      if (parsed && typeof parsed === 'object') {
        return {
          boot: Array.isArray(parsed.boot) ? parsed.boot : [],
          background: Array.isArray(parsed.background) ? parsed.background : [],
        }
      }
    } catch { /* ignore */ }
    return { boot: [], background: [] }
  }

  function writeSources(next) {
    fs.mkdirSync(path.dirname(sourcesFile), { recursive: true })
    fs.writeFileSync(sourcesFile, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  }

  const slugOf = (input) => String(input)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)

  async function handler(req, res) {
    if (String(req.method ?? 'GET').toUpperCase() !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
      return
    }
    if (!sameOrigin(req)) { sendJson(res, 403, { ok: false, error: 'cross-origin' }); return }

    let body
    try { body = await readBody(req) } catch (error) { sendJson(res, 400, { ok: false, error: String(error.message) }); return }

    const pkg = typeof body?.package === 'string' ? body.package.trim() : ''
    const rel = typeof body?.path === 'string' ? body.path.trim() : ''
    const kind = body?.kind === 'background' ? 'background' : 'boot'
    const labelInput = typeof body?.label === 'string' ? body.label.trim() : ''

    if (!/^(@[a-zA-Z0-9._-]+\/)?[a-zA-Z0-9._-]+$/.test(pkg)) {
      sendJson(res, 400, { ok: false, error: 'invalid-package-name' }); return
    }
    if (rel === '') { sendJson(res, 400, { ok: false, error: 'missing-path' }); return }

    let pkgDir
    try { pkgDir = findPackage(pkg) } catch { pkgDir = null }
    if (!pkgDir) { sendJson(res, 404, { ok: false, error: 'package-not-installed', package: pkg }); return }

    const abs = path.resolve(pkgDir, rel)
    if (!abs.startsWith(pkgDir + path.sep)) { sendJson(res, 400, { ok: false, error: 'path-escape' }); return }
    if (!isFile(abs)) { sendJson(res, 404, { ok: false, error: 'file-not-found', resolved: abs }); return }

    const ext = path.extname(abs).toLowerCase()
    if (!VIDEO_EXT.has(ext)) { sendJson(res, 415, { ok: false, error: 'unsupported-extension', ext }); return }

    const baseSlug = slugOf(path.basename(abs, ext)) || 'imported'
    const pkgSlug = slugOf(pkg.replace('/', '-')) || 'pkg'
    const id = `${pkgSlug}-${baseSlug}`
    const label = labelInput || `${pkgSlug} · ${path.basename(abs)}`

    const extraDir = path.join(mediaDir, 'extra')
    fs.mkdirSync(extraDir, { recursive: true })
    const target = path.join(extraDir, `${id}${ext}`)
    try {
      fs.copyFileSync(abs, target)
    } catch (error) {
      sendJson(res, 500, { ok: false, error: String(error.message) }); return
    }

    const sources = readSources()
    const list = sources[kind]
    const index = list.findIndex((item) => item && item.id === id)
    const entry = { id, label, file: target }
    if (index >= 0) list[index] = entry
    else list.push(entry)
    writeSources(sources)

    sendJson(res, 200, {
      ok: true,
      id,
      label,
      kind,
      file: target,
      sizeMb: Math.round((fs.statSync(target).size / 1048576) * 10) / 10,
      replaced: index >= 0,
    })
  }

  return { handler, findPackage, readSources, writeSources }
}
