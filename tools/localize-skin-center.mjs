#!/usr/bin/env node
/**
 * 本地化 @linxin666/dsh-client-ui-skin-center。
 *
 * 它每天向 dsh-market.com 发一次匿名「已安装」心跳。这个脚本把该地址改成同源的
 * 本地空路由 /dsh-media-center/noop（204，不出网）。补丁会被插件升级覆盖，
 * 所以升级后重跑一次即可。
 *
 *   node tools/localize-skin-center.mjs            打补丁
 *   node tools/localize-skin-center.mjs --check     只看状态，不改文件
 *   node tools/localize-skin-center.mjs --revert    还原成原始地址
 *   node tools/localize-skin-center.mjs --target <目录>   指定插件目录
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
const REMOTE = 'https://dsh-market.com/api/telemetry/event'
const LOCAL = '/dsh-media-center/noop'
const PKG = '@linxin666/dsh-client-ui-skin-center'

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const valueOf = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

const mode = flag('--check') ? 'check' : flag('--revert') ? 'revert' : 'patch'
const explicit = valueOf('--target')

function isDir(p) {
  try { return fs.statSync(p).isDirectory() } catch { return false }
}

/** 找出所有装了该插件的目录（通常只有当前 profile 一份）。 */
function findPackages() {
  if (explicit) return isDir(explicit) ? [explicit] : []
  const found = []
  const profiles = path.join(HOME, 'profiles')
  let names = []
  try { names = fs.readdirSync(profiles) } catch { return found }
  for (const name of names) {
    const dir = path.join(profiles, name, 'node_modules', PKG)
    if (isDir(dir)) found.push(dir)
  }
  return found
}

function walkJs(dir, out = []) {
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkJs(full, out)
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full)
  }
  return out
}

const packages = findPackages()
if (packages.length === 0) {
  console.error(`找不到 ${PKG}`)
  console.error(`扫描位置：${path.join(HOME, 'profiles', '*', 'node_modules', PKG)}`)
  console.error('先安装该插件，或用 --target 指定目录。')
  process.exit(1)
}

let touched = 0
let hits = 0

for (const pkgDir of packages) {
  console.log(`插件：${pkgDir}`)
  for (const file of walkJs(pkgDir)) {
    let text
    try { text = fs.readFileSync(file, 'utf8') } catch { continue }
    const before = text.split(REMOTE).length - 1
    const already = text.split(LOCAL).length - 1
    hits += before + already
    if (before === 0 && already === 0) continue

    if (mode === 'check') {
      if (before > 0) console.log(`  未本地化  ${path.relative(pkgDir, file)}  (${before} 处)`)
      else console.log(`  已本地化  ${path.relative(pkgDir, file)}  (${already} 处)`)
      continue
    }

    let next = text
    if (mode === 'patch' && before > 0) next = text.split(REMOTE).join(LOCAL)
    if (mode === 'revert' && already > 0) next = text.split(LOCAL).join(REMOTE)
    if (next === text) continue

    fs.writeFileSync(file, next, 'utf8')
    touched += 1
    const rel = path.relative(pkgDir, file)
    if (mode === 'patch') console.log(`  已改写    ${rel}  ${before} 处 -> 本地路由`)
    else console.log(`  已还原    ${rel}  ${already} 处 -> 原始地址`)
  }
}

if (mode === 'check') {
  console.log(hits > 0 ? '\n检查完成：仅查看，未改动任何文件。' : '\n没有找到心跳地址，可能版本变了。')
} else if (touched === 0) {
  console.log(mode === 'patch' ? '\n无需改动：已经是本地路由。' : '\n无需改动：本来就是原始地址。')
} else {
  console.log(`\n完成：改了 ${touched} 个文件。重启 DSH 后生效。`)
}
