/**
 * 皮肤 CSS 作用域化。
 *
 * 原皮肤中心用 lightningcss 逐条重写选择器。实测在这两套皮肤上不可靠：
 * 部分规则被静默丢弃（12 KB → 5.5 KB），另一些选择器直接抛
 * "expected an object-like struct named Specifier"。所以这里改用浏览器原生的
 * `@scope` 规则：不解析、不改写，一条样式都不丢。
 *
 *   @scope (html[data-dsh-skin]) to ([role="dialog"], [aria-modal="true"]) { ...原样式... }
 *
 * 语义正好是要的效果：皮肤样式只对 <html data-dsh-skin> 的后代生效，而设置弹层那一棵
 * 子树被 `to (...)` 直接排除（弹层开着、关着都一样），溢出不到原生界面。浏览器不支持
 * @scope 时整块被忽略 —— 失败模式是"皮肤不生效"，而不是"样式泄漏"。
 *
 * 两个必要的搬运：
 *   - @import 必须留在最前，不能进 @scope，提到块外；
 *   - @font-face / @keyframes 也提到块外（放进去在部分实现里无效）。
 */

const SCOPE = 'html[data-dsh-skin]'

/**
 * 作用域上界：设置弹层等「不属于主题的浮层」整棵子树排除在外。
 *
 * 以前是运行时监听弹层开关、再 `link.disabled` 开关样式表；但弹层关闭后节点常常
 * 还留在 DOM 里（只是 opacity/visibility/位移），判断一误判皮肤样式就永远回不来
 * ——表现是「切换一次背景后 HUD 消失」。改成 CSS 级的排除后与服务端/运行时状态
 * 无关，弹层开着、关着都一样。
 */
const LIMIT = '[role="dialog"], [aria-modal="true"]'

/** 从 CSS 中摘出以 atName 开头的整块（含嵌套大括号），返回 [提取内容, 剩余内容]。 */
function extractBlocks(css, atName) {
  const blocks = []
  let rest = ''
  let i = 0
  const lower = css.toLowerCase()
  while (i < css.length) {
    const at = lower.indexOf(atName, i)
    if (at === -1) { rest += css.slice(i); break }
    rest += css.slice(i, at)
    // 找块起始 '{'
    let brace = css.indexOf('{', at)
    if (brace === -1) { rest += css.slice(at); break }
    let depth = 0
    let end = brace
    for (; end < css.length; end++) {
      const ch = css[end]
      if (ch === '{') depth++
      else if (ch === '}') { depth--; if (depth === 0) { end++; break } }
    }
    blocks.push(css.slice(at, end))
    i = end
  }
  return [blocks.join('\n'), rest]
}

function extractImports(css) {
  const found = []
  const rest = css.replace(/@import[^;]+;/gi, (m) => { found.push(m); return '' })
  return [found.join('\n'), rest]
}

/**
 * 把一段皮肤 CSS 收进 `html[data-dsh-skin]` 作用域，并把设置弹层等浮层排除在外。
 * @param {string} css 原始 CSS
 * @returns {string} 可直接注入的 CSS
 */
export function scopeCss(css) {
  let body = String(css)

  const [imports, afterImports] = extractImports(body)
  body = afterImports

  const [fontFaces, afterFonts] = extractBlocks(body, '@font-face')
  body = afterFonts

  const [keyframes, afterKeyframes] = extractBlocks(body, '@keyframes')
  body = afterKeyframes

  const head = [imports, fontFaces, keyframes].filter((part) => part.trim() !== '').join('\n')
  const scoped = `@scope (${SCOPE}) to (${LIMIT}) {\n${body}\n}`

  return head === '' ? `${scoped}\n` : `${head}\n${scoped}\n`
}

/** 缓存同 id + 内容哈希的结果，避免每次请求重新拼。 */
const cache = new Map()
export function scopeCssCached(id, css) {
  const key = `${id}:${css.length}:${css.slice(0, 64)}:${css.slice(-64)}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const out = scopeCss(css)
  if (cache.size > 32) cache.clear()
  cache.set(key, out)
  return out
}
