/**
 * 隔离回归测试：POST /dsh-media-center/config 的两条分支。
 *
 *   node tools/test-config-branches.mjs
 *
 * 用临时 DSH_HOME 跑真实 handler，不碰 ~/.dsh 的配置。覆盖两条容易回归的规则：
 *   ① 选「纯视频 / 关闭」时必须清掉 config.skin，否则皮肤自带背景会盖住视频；
 *   ② 选 `skin:<id>` 时写 config.skin 并关掉视频背景。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { fileURLToPath, pathToFileURL } from 'node:url'

const pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-test-'))
process.env.DSH_HOME = home

const mediaDir = path.join(home, 'media-center')
fs.mkdirSync(mediaDir, { recursive: true })
const configFile = path.join(mediaDir, 'config.json')
const readConfig = () => JSON.parse(fs.readFileSync(configFile, 'utf8'))
const writeConfig = (obj) => fs.writeFileSync(configFile, `${JSON.stringify(obj, null, 2)}\n`, 'utf8')

const { apply } = await import(pathToFileURL(path.join(pluginDir, 'index.js')).href)

const handlers = new Map()
apply({
  on() {},
  inject(_deps, cb) {
    cb({
      webServer: {
        register(route) {
          handlers.set(route.path, route.handler)
        },
      },
    })
  },
})

function post(url, body) {
  const handler = handlers.get(url)
  if (!handler) throw new Error(`no handler for ${url}`)
  const req = new EventEmitter()
  req.method = 'POST'
  req.url = url
  req.headers = { 'content-type': 'application/json' }
  const chunks = []
  const res = {
    writeHead(status, headers) { this.status = status; this.headers = headers ?? {} },
    end(payload) { chunks.push(payload ?? '') },
  }
  const done = new Promise((resolve) => {
    const end = res.end.bind(res)
    res.end = (payload) => { end(payload); resolve() }
  })
  handler(req, res)
  req.emit('data', Buffer.from(JSON.stringify(body), 'utf8'))
  req.emit('end')
  return done.then(() => ({ status: res.status, body: JSON.parse(chunks.join('') || 'null') }))
}

function get(url) {
  const handler = handlers.get(url)
  if (!handler) throw new Error(`no handler for ${url}`)
  const req = new EventEmitter()
  req.method = 'GET'
  req.url = url
  req.headers = {}
  const chunks = []
  const res = {
    writeHead(status, headers) { this.status = status; this.headers = headers ?? {} },
    end(payload) { chunks.push(payload ?? '') },
  }
  const done = new Promise((resolve) => {
    const end = res.end.bind(res)
    res.end = (payload) => { end(payload); resolve() }
  })
  handler(req, res)
  return done.then(() => ({ status: res.status, body: JSON.parse(chunks.join('') || 'null') }))
}

const results = []
const check = (name, ok, detail) => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : `  ${detail}`}`)
}

// ① 皮肤在时选「关闭 / 纯视频」：背景启用、皮肤必须被清掉
writeConfig({ boot: { enabled: false }, background: { enabled: true, file: 'C:/x/bg.mp4' }, skin: 'blue-fantasy', surface: 0.2, veil: 0.14 })
let res = await post('/dsh-media-center/config', { boot: 'none', background: 'none' })
check('关闭背景 -> config.skin 被清空', !('skin' in readConfig()), `current=${JSON.stringify(res.body.current)}`)
check('关闭背景 -> background.enabled=false', readConfig().background.enabled === false)

// ② 选皮肤：写 config.skin、关掉视频背景
writeConfig({ boot: { enabled: false }, background: { enabled: true, file: 'C:/x/bg.mp4' }, surface: 0.2, veil: 0.14 })
res = await post('/dsh-media-center/config', { boot: 'none', background: 'skin:blue-fantasy' })
let config = readConfig()
check('选皮肤 -> config.skin=blue-fantasy', config.skin === 'blue-fantasy')
check('选皮肤 -> background.enabled=false', config.background.enabled === false)

// ③ 从皮肤切回纯视频：currentSelection 不能再报 skin:*
res = await post('/dsh-media-center/config', { boot: 'none', background: 'none' })
check('皮肤 -> 纯视频后 current.background 不带 skin: 前缀', !String(res.body.current.background).startsWith('skin:'))
check('皮肤 -> 纯视频后 config.skin 已删除', !('skin' in readConfig()))

// ④ 原地换皮肤用的引导数据端点
const boot = await get('/dsh-media-center/bootstrap')
check('GET /bootstrap -> 200 且带 base', boot.status === 200 && boot.body.base === '/dsh-media-center', `status=${boot.status}`)
check('GET /bootstrap -> skin / boot / background 三段齐全',
  typeof boot.body.skin === 'object' && typeof boot.body.boot === 'object' && typeof boot.body.background === 'object')
const bootPost = await post('/dsh-media-center/bootstrap', {})
check('POST /bootstrap -> 405', bootPost.status === 405, `status=${bootPost.status}`)

fs.rmSync(home, { recursive: true, force: true })
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed === 0 ? 0 : 1)
