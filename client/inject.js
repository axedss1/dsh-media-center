/**
 * dsh-media-center 的页面运行时：皮肤 + 背景 + 启动动画。
 *
 * 引导数据由宿主每次返回页面时写进 globalThis.__DSH_MEDIA_CENTER__：
 *   { surface, veil, skin:{id,css,background}, boot:{...}, background:{...} }
 *
 * 除了首屏，设置里切换皮肤/背景时会调 globalThis.__DSH_MEDIA_CENTER_APPLY__(data)
 * 就地把新的引导数据套上去（不刷新页面）。这样即使页面重载拿到的是缓存的旧
 * index.html，切换也照样生效——这正是「点了应用、背景纹丝不动」的根因。
 *
 * 皮肤样式不再靠「设置弹层打开就 disabled」来隔离：弹层关闭后节点常常还留在 DOM 里，
 * 判断一误判皮肤就永远回不来。现在由 scoper.js 在 CSS 里用
 * `@scope (html[data-dsh-skin]) to ([role=dialog], [aria-modal=true])` 直接排除弹层子树，
 * 与弹层是否隐藏无关，链接始终保持启用。
 */
(() => {
  const root = document.documentElement
  const state = { link: null, bootShown: false, watchdog: null, lastTime: null, stalls: 0 }

  /** 摘掉上一层（旧皮肤样式 + 旧背景层），换皮肤时先清后建。 */
  function clearLayers() {
    if (state.link) {
      state.link.remove()
      state.link = null
    }
    const backdrop = document.getElementById('mc-backdrop')
    if (backdrop) backdrop.remove()
    root.removeAttribute('data-dsh-skin')
    // 皮肤约定：背景层在时打这个标记，皮肤自己的「地面」才会让路
    root.removeAttribute('data-dsh-backdrop-active')
    document.body.removeAttribute('data-dsh-backdrop-active')
  }

  function addBackdrop(chosen) {
    const wrap = document.createElement('div')
    wrap.id = 'mc-backdrop'
    // 皮肤中心的约定：这就是「背景层」。鲸鱼娘靠这条属性把自己的地面层让开，
    // 并用一次 z-index 跳变（@keyframes ff-lift）让合成器重新接管视频层。
    wrap.setAttribute('data-dsh-skin-layer', 'background')
    if (chosen.type === 'video') {
      const video = document.createElement('video')
      video.id = 'mc-backdrop-video'
      video.src = chosen.src
      video.muted = true
      video.loop = true
      video.autoplay = true
      video.playsInline = true
      video.preload = 'auto'
      // 自己提一层：负 z-index + 被 #root 盖住时，部分 Chromium 合成路径会把视频
      // 当成「被遮挡」只画一帧，看起来就是背景冻住。
      video.style.transform = 'translateZ(0)'
      video.style.willChange = 'transform'
      video.addEventListener('canplay', () => { video.setAttribute('data-shown', '1') })
      wrap.appendChild(video)
      const playing = video.play()
      if (playing && typeof playing.catch === 'function') playing.catch(() => {})
    } else {
      const img = document.createElement('img')
      img.id = 'mc-backdrop-image'
      img.alt = ''
      img.addEventListener('load', () => { img.setAttribute('data-shown', '1') })
      img.src = chosen.src
      wrap.appendChild(img)
    }
    const veil = document.createElement('div')
    veil.id = 'mc-backdrop-veil'
    if (chosen.scrim) veil.style.background = chosen.scrim
    wrap.appendChild(veil)
    document.body.appendChild(wrap)
    // 皮肤约定：有背景层时打这个标记（皮肤的 body::after 地面会让路，不盖住视频）
    root.setAttribute('data-dsh-backdrop-active', '')
    document.body.setAttribute('data-dsh-backdrop-active', '')
    watchPlayback()
  }

  /**
   * 播放看门狗：某些合成路径 / 省电策略会把静音背景视频停住或停在某一帧。
   * 每 2 秒检查一次：暂停就重播；连续两次 currentTime 不动就重挂 src。
   */
  function watchPlayback() {
    if (state.watchdog) return
    state.watchdog = setInterval(() => {
      const video = document.getElementById('mc-backdrop-video')
      if (!video) { state.lastTime = null; state.stalls = 0; return }
      if (video.paused) {
        state.lastTime = null
        state.stalls = 0
        const playing = video.play()
        if (playing && typeof playing.catch === 'function') playing.catch(() => {})
        return
      }
      const at = video.currentTime
      if (state.lastTime !== null && Math.abs(at - state.lastTime) < 0.01) {
        state.stalls += 1
        if (state.stalls >= 2) {
          state.stalls = 0
          try {
            const src = video.currentSrc || video.src
            video.src = src
            const playing = video.play()
            if (playing && typeof playing.catch === 'function') playing.catch(() => {})
          } catch { /* ignore */ }
        }
      } else {
        state.stalls = 0
      }
      state.lastTime = at
    }, 2000)
  }

  /** 应用皮肤；返回 true 表示皮肤自己铺了背景（此时不再叠视频背景）。 */
  function applySkin(skin) {
    if (!skin || !skin.id) return false
    root.setAttribute('data-dsh-skin', skin.id)
    if (skin.css) {
      const link = document.createElement('link')
      link.id = 'mc-skin-css'
      link.rel = 'stylesheet'
      link.href = skin.css
      state.link = link
      document.head.appendChild(link)
    }
    const bg = skin.background
    if (!bg) return false
    const dark = document.body.hasAttribute('data-ds-dark-theme')
    const chosen = dark ? (bg.dark || bg.light) : (bg.light || bg.dark)
    if (!chosen) return false
    addBackdrop(chosen)
    return true
  }

  function mountBackground(cfg) {
    if (!cfg || !cfg.enabled || !cfg.src) return
    if (document.getElementById('mc-backdrop')) return
    addBackdrop({ type: 'video', src: cfg.src, scrim: '' })
  }

  /** 把一份引导数据整体套到页面上（首次加载与设置里切换都走这里）。 */
  function apply(data) {
    if (!data) return
    clearLayers()
    const skinDrewBackground = applySkin(data.skin)
    // 半透明始终启用：否则不透明的画布会把背景层（皮肤插画或视频）整块盖住。
    // 只有「再铺一层视频背景」要跟皮肤互斥（见下面的 skinDrewBackground）。
    if (typeof data.surface === 'number') root.style.setProperty('--mc-surface', String(data.surface))
    if (typeof data.veil === 'number') {
      root.style.setProperty('--mc-veil', String(data.veil))
      root.style.setProperty('--mc-veil-l', String(Math.min(0.92, data.veil * 0.7)))
    }
    root.setAttribute('data-mc', 'on')
    if (!skinDrewBackground) mountBackground(data.background)
  }

  function addSoundPill(video, overlay) {
    if (overlay.querySelector('#mc-boot-sound')) return
    const pill = document.createElement('button')
    pill.id = 'mc-boot-sound'
    pill.type = 'button'
    pill.textContent = '🔊 开启声音'
    pill.addEventListener('click', (event) => {
      event.stopPropagation()
      video.muted = false
      video.volume = 1
      const playing = video.play()
      if (playing && typeof playing.catch === 'function') playing.catch(() => {})
      pill.remove()
    })
    overlay.appendChild(pill)
  }

  function mountBoot(cfg) {
    if (!cfg || !cfg.enabled || !cfg.src) return
    if (document.getElementById('mc-boot')) return
    const overlay = document.createElement('div')
    overlay.id = 'mc-boot'
    const video = document.createElement('video')
    video.id = 'mc-boot-video'
    video.src = cfg.src
    video.playsInline = true
    video.preload = 'auto'
    // 先按「带声音」播：DSH 桌面版（Electron）默认允许未静音的自动播放。
    video.muted = false
    video.volume = 1
    video.addEventListener('canplay', () => { video.setAttribute('data-shown', '1') })
    const veil = document.createElement('div')
    veil.id = 'mc-boot-veil'
    const hint = document.createElement('div')
    hint.id = 'mc-boot-hint'
    hint.textContent = cfg.skipLabel || '点击画面跳过'
    overlay.appendChild(video)
    overlay.appendChild(veil)
    overlay.appendChild(hint)
    document.body.appendChild(overlay)

    let done = false
    const finish = () => {
      if (done) return
      done = true
      overlay.setAttribute('data-leaving', '1')
      try { video.muted = true } catch { /* ignore */ }
      setTimeout(() => { overlay.remove() }, 900)
    }

    video.addEventListener('ended', finish)
    video.addEventListener('error', finish)
    overlay.addEventListener('click', finish)
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' || event.key === ' ' || event.key === 'Spacebar') finish()
    })
    setTimeout(finish, 20000)

    const attempt = video.play()
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(() => {
        video.muted = true
        const retry = video.play()
        if (retry && typeof retry.catch === 'function') retry.catch(() => {})
        addSoundPill(video, overlay)
      })
    }
  }

  /** 设置里切换后由 client.js 调用：拿新的引导数据就地把皮肤/背景换掉。 */
  globalThis.__DSH_MEDIA_CENTER_APPLY__ = (data) => {
    try {
      apply(data)
      return true
    } catch (error) {
      console.error('[media-center] apply', error)
      return false
    }
  }

  /** 运行时自检：设置里的「媒体中心」会把它显示出来，出问题不用猜。 */
  globalThis.__DSH_MEDIA_CENTER_DIAG__ = () => {
    const video = document.getElementById('mc-backdrop-video')
    const backdrop = document.getElementById('mc-backdrop')
    const link = document.getElementById('mc-skin-css')
    return {
      skin: root.getAttribute('data-dsh-skin') || '',
      link: link !== null && link.disabled !== true,
      backdrop: backdrop !== null,
      layer: backdrop !== null ? window.getComputedStyle(backdrop).zIndex : '',
      video: video !== null
        ? {
            paused: video.paused,
            t: Math.round(video.currentTime * 10) / 10,
            w: video.videoWidth,
            shown: video.getAttribute('data-shown'),
          }
        : null,
    }
  }

  const initial = globalThis.__DSH_MEDIA_CENTER__
  if (!initial) return

  /** 引导数据的「有效指纹」：皮肤、背景、透明度变了才需要重建。 */
  function signature(data) {
    if (!data) return ''
    const skinBg = data.skin && data.skin.background
      ? ((data.skin.background.dark && data.skin.background.dark.src) || (data.skin.background.light && data.skin.background.light.src) || '')
      : ''
    const videoBg = data.background && data.background.enabled ? data.background.src : ''
    return [data.skin ? data.skin.id : '', skinBg, videoBg, data.surface, data.veil].join('|')
  }

  const run = () => {
    try { apply(initial) } catch (error) { console.error('[media-center] skin', error) }
    if (!state.bootShown) {
      state.bootShown = true
      try { mountBoot(initial.boot) } catch (error) { console.error('[media-center] boot', error) }
    }
    // 页面 HTML 可能来自缓存、内联快照是旧的：再向宿主要一份最新的，指纹不同才重建。
    try {
      fetch('/dsh-media-center/bootstrap', { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((fresh) => {
          if (fresh && signature(fresh) !== signature(initial)) apply(fresh)
        })
        .catch(() => {})
    } catch { /* ignore */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run)
  else run()
})()
