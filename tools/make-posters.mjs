#!/usr/bin/env node
/**
 * 为 sources.json 里的每段素材生成封面图。
 *
 *   node tools/make-posters.mjs [--at 3] [--width 480]
 *
 * - 读取 $DSH_HOME/media-center/sources.json（没有就退出并提示）
 * - 对每一项的 file 用 ffmpeg 抽一帧，写到同目录 posters/<id>.jpg
 * - ffmpeg 可执行文件默认取 PATH 里的 ffmpeg，可用 FFMPEG 环境变量覆盖
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const HOME = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
const MEDIA = path.join(HOME, 'media-center')
const SOURCES = path.join(MEDIA, 'sources.json')
const POSTERS = path.join(MEDIA, 'posters')
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg'

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const at = arg('--at', '3')
const width = arg('--width', '480')

if (!fs.existsSync(SOURCES)) {
  console.error(`找不到 ${SOURCES}`)
  console.error('先准备好素材并写一份 sources.json（见 sources.example.json），再运行本脚本。')
  process.exit(1)
}

fs.mkdirSync(POSTERS, { recursive: true })

const data = JSON.parse(fs.readFileSync(SOURCES, 'utf8'))
const entries = [...(data.boot ?? []), ...(data.background ?? [])]
const seen = new Set()
let ok = 0
let skipped = 0
let failed = 0

for (const entry of entries) {
  if (!entry || typeof entry.id !== 'string' || typeof entry.file !== 'string') continue
  if (seen.has(entry.id)) continue
  seen.add(entry.id)
  if (!fs.existsSync(entry.file)) {
    console.warn(`skip  ${entry.id}: 文件不存在 ${entry.file}`)
    skipped += 1
    continue
  }
  const out = path.join(POSTERS, `${entry.id}.jpg`)
  try {
    execFileSync(FFMPEG, [
      '-v', 'error',
      '-ss', String(at),
      '-i', entry.file,
      '-frames:v', '1',
      '-vf', `scale=${width}:-2`,
      '-q:v', '4',
      '-y', out,
    ], { stdio: 'inherit' })
    ok += 1
    console.log(`ok    ${entry.id} -> ${path.basename(out)}`)
  } catch (error) {
    failed += 1
    console.warn(`fail  ${entry.id}: ${error.message}`)
  }
}

console.log(`\n完成：成功 ${ok}，跳过 ${skipped}，失败 ${failed}`)
