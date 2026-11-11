/**
 * dsh-media-center 客户端那一半：在 DSH 设置里注册一个「媒体中心」分区，
 * 用带缩略图的卡片网格展示每个启动动画 / 背景素材。
 *
 * 格式与 dsh-video-skin 一致：`__ModuleLoader__` 载入 CJS 工厂，`require('react')`，
 * 不需要任何构建步骤。
 */
window.__ModuleLoader__.load({
  id: 'dsh-media-center',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')
    var h = React.createElement

    window.__DSH_MEDIA_CENTER_CLIENT__ = 'v1'

    var API = '/dsh-media-center/config'

    var C = {
      text: 'var(--dsw-alias-label-primary, #e8f1ff)',
      sub: 'var(--dsw-alias-label-secondary, #9aa3b2)',
      faint: 'var(--dsw-alias-label-tertiary, #7c8493)',
      line: 'var(--dsw-alias-border-l2, rgba(255,255,255,.12))',
      card: 'var(--dsw-alias-bg-layer-1, rgba(255,255,255,.04))',
      field: 'var(--dsw-alias-bg-layer-2, rgba(255,255,255,.06))',
      accent: 'var(--dsw-alias-brand-primary, #3a7bff)',
      // 主按钮用显式配色：设置弹层里的 --dsw-* 变量不一定能解析出合法颜色，
      // 之前 `var(--dsw-alias-brand-primary)` 实测落到 #f9fafb，白字直接看不见。
      btnFill: '#4d6bfe',
      btnText: '#ffffff',
      okBg: 'rgba(34,197,94,.16)',
      okText: 'rgba(74,222,128,.95)',
    }

    var gridStyle = {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(212px, 1fr))',
      gap: '14px',
      marginBottom: '26px',
    }
    var cardStyle = {
      position: 'relative',
      border: '1px solid ' + C.line,
      borderRadius: '12px',
      overflow: 'hidden',
      background: C.card,
      display: 'flex',
      flexDirection: 'column',
    }
    var thumbStyle = {
      width: '100%',
      aspectRatio: '16 / 9',
      objectFit: 'cover',
      display: 'block',
      background: 'rgba(0,0,0,.35)',
    }
    var thumbEmptyStyle = Object.assign({}, thumbStyle, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: C.faint,
      fontSize: '12px',
    })
    var bodyStyle = { padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }
    var nameStyle = { fontSize: '13px', fontWeight: 600, color: C.text, wordBreak: 'break-all' }
    var metaStyle = { fontSize: '11px', color: C.faint, minHeight: '16px' }
    var actionsStyle = { marginTop: '8px', display: 'flex', gap: '8px' }
    var btnStyle = {
      height: '28px',
      padding: '0 14px',
      borderRadius: '7px',
      border: '1px solid transparent',
      background: C.btnFill,
      color: C.btnText,
      fontSize: '12px',
      fontWeight: 600,
      cursor: 'pointer',
    }
    var badgeStyle = {
      position: 'absolute',
      top: '8px',
      right: '8px',
      padding: '3px 8px',
      borderRadius: '999px',
      background: C.okBg,
      color: C.okText,
      fontSize: '11px',
      fontWeight: 600,
      backdropFilter: 'blur(6px)',
    }
    var sectionTitle = { margin: '0 0 10px', fontSize: '14px', fontWeight: 600, color: C.text }

    function readJson(url, init) {
      return fetch(url, init || { cache: 'no-store' })
        .then(function (response) { return response.ok ? response.json() : null })
        .catch(function () { return null })
    }

    /** 「当前：蓝色幻想（皮肤）」用的可读名字。 */
    function currentName(data) {
      if (!data || !data.current) return ''
      var id = data.current.background
      var list = data.background || []
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          var item = list[i]
          var name = item.name || item.label || id
          if (id === 'none') return '关闭（纯色背景）'
          return item.kind === 'skin' ? name + '（皮肤）' : name
        }
      }
      return id === 'none' ? '关闭（纯色背景）' : (id || '')
    }

    function Card(props) {
      var item = props.item
      var active = props.active
      var apply = function (event) {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation()
        if (active) return
        props.onApply(item.id)
      }
      return h('div', {
        style: Object.assign({}, cardStyle, active ? { borderColor: C.accent } : { cursor: 'pointer' }),
        title: active ? '当前使用' : '点击卡片应用',
        onClick: active ? undefined : apply,
      },
        item.poster
          ? h('img', { src: item.poster, style: thumbStyle, alt: '', loading: 'lazy' })
          : h('div', { style: thumbEmptyStyle }, item.id === 'none' ? '不使用' : '无预览'),
        active ? h('span', { style: badgeStyle }, '当前使用') : null,
        h('div', { style: bodyStyle },
          h('div', { style: nameStyle }, item.name || item.label),
          h('div', { style: metaStyle }, item.id === 'none' ? '关闭' : (item.meta || item.label)),
          h('div', { style: actionsStyle },
            active
              ? h('button', { type: 'button', disabled: true, style: Object.assign({}, btnStyle, { background: 'transparent', color: C.faint, borderColor: C.line, cursor: 'default' }) }, '已应用')
              : h('button', {
                  type: 'button',
                  style: btnStyle,
                  onClick: apply,
                }, '应用'),
          ),
        ),
      )
    }

    function CustomRow(props) {
      var valueState = React.useState('')
      var value = valueState[0]
      var setValue = valueState[1]
      return h('div', { style: { border: '1px dashed ' + C.line, borderRadius: '12px', padding: '12px 14px', marginBottom: '26px' } },
        h('div', { style: { fontSize: '12px', color: C.sub, marginBottom: '8px' } }, props.hint),
        h('div', { style: { display: 'flex', gap: '8px' } },
          h('input', {
            type: 'text',
            spellCheck: false,
            placeholder: 'D:\\videos\\my-video.mp4',
            value: value,
            onChange: function (event) { setValue(event.target.value) },
            style: {
              flex: 1,
              height: '30px',
              padding: '0 10px',
              borderRadius: '8px',
              border: '1px solid ' + C.line,
              background: C.field,
              color: C.text,
              fontFamily: 'ui-monospace, Consolas, monospace',
              fontSize: '12px',
            },
          }),
          h('button', {
            type: 'button',
            style: Object.assign({}, btnStyle, { height: '30px' }),
            onClick: function () { if (value.trim() !== '') props.onApply('custom', value.trim()) },
          }, '应用'),
        ),
      )
    }

    function ImportBox(props) {
      var pkgState = React.useState('dsh-video-skin')
      var relState = React.useState('assets/background.mp4')
      var kindState = React.useState('background')
      var nameState = React.useState('')
      var msgState = React.useState('')
      var busyState = React.useState(false)
      var textStyle = {
        flex: 1,
        height: '30px',
        padding: '0 10px',
        borderRadius: '8px',
        border: '1px solid ' + C.line,
        background: C.field,
        color: C.text,
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '12px',
      }
      var rowStyle = { display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }

      var submit = function () {
        if (busyState[0]) return
        busyState[1](true)
        msgState[1]('导入中…')
        readJson('/dsh-media-center/import', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            package: pkgState[0].trim(),
            path: relState[0].trim(),
            kind: kindState[0],
            label: nameState[0].trim(),
          }),
        }).then(function (result) {
          busyState[1](false)
          if (!result || !result.ok) {
            msgState[1]('失败：' + ((result && result.error) || '未知错误'))
            return
          }
          msgState[1]('已导入 ' + result.id + '（' + result.sizeMb + ' MB），正在刷新…')
          setTimeout(function () { location.reload() }, 500)
        })
      }

      return h('div', { style: { border: '1px dashed ' + C.line, borderRadius: '12px', padding: '12px 14px', marginBottom: '24px' } },
        h('div', { style: { fontSize: '12px', color: C.sub, marginBottom: '8px' } },
          '从已安装插件的包内导入素材（复制到 media-center/extra，不动原插件）'),
        h('div', { style: rowStyle },
          h('input', {
            type: 'text', spellCheck: false, placeholder: '插件包名，如 dsh-video-skin',
            value: pkgState[0], onChange: function (e) { pkgState[1](e.target.value) }, style: textStyle,
          }),
          h('input', {
            type: 'text', spellCheck: false, placeholder: '包内路径，如 assets/background.mp4',
            value: relState[0], onChange: function (e) { relState[1](e.target.value) }, style: textStyle,
          }),
        ),
        h('div', { style: rowStyle },
          h('select', {
            value: kindState[0], onChange: function (e) { kindState[1](e.target.value) },
            style: { height: '30px', padding: '0 8px', borderRadius: '8px', border: '1px solid ' + C.line, background: C.field, color: C.text, fontSize: '12px' },
          },
            h('option', { value: 'background' }, '作为界面背景'),
            h('option', { value: 'boot' }, '作为启动动画'),
          ),
          h('input', {
            type: 'text', spellCheck: false, placeholder: '显示名（可选）',
            value: nameState[0], onChange: function (e) { nameState[1](e.target.value) }, style: textStyle,
          }),
          h('button', {
            type: 'button', onClick: submit, disabled: busyState[0],
            style: Object.assign({}, btnStyle, { height: '30px', opacity: busyState[0] ? 0.6 : 1 }),
          }, busyState[0] ? '导入中…' : '导入'),
        ),
        h('div', { style: { fontSize: '11px', color: C.faint, minHeight: '16px' } }, msgState[0]),
      )
    }

    function MediaSection() {
      var dataState = React.useState(null)
      var data = dataState[0]
      var setData = dataState[1]
      var busyState = React.useState('')
      var busy = busyState[0]
      var setBusy = busyState[1]
      var msgState = React.useState('')
      var message = msgState[0]
      var setMessage = msgState[1]

      var load = React.useCallback(function () {
        return readJson(API).then(function (payload) {
          if (payload === null) { setMessage('读不到媒体中心配置（宿主路由没应答）'); return }
          setData(payload)
        })
      }, [])

      React.useEffect(function () { load() }, [load])

      // 切换后优先原地换皮肤/背景（不刷新页面）：重载可能拿到缓存的旧 index.html，
      // 引导数据还是上一套，表现就是「点了应用却纹丝不动」。
      var applyRuntime = function () {
        return readJson('/dsh-media-center/bootstrap').then(function (payload) {
          var apply = globalThis.__DSH_MEDIA_CENTER_APPLY__
          if (!payload || typeof apply !== 'function') return false
          return apply(payload) === true
        })
      }

      var apply = function (kind, id, customFile) {
        if (busy) return
        setBusy(kind)
        setMessage('')
        var body = {
          boot: data.current.boot,
          bootFile: (data.currentFiles && data.currentFiles.boot) || '',
          background: data.current.background,
          backgroundFile: (data.currentFiles && data.currentFiles.background) || '',
        }
        if (kind === 'boot') { body.boot = id; if (id === 'custom') body.bootFile = customFile }
        else { body.background = id; if (id === 'custom') body.backgroundFile = customFile }
        readJson(API, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }).then(function (result) {
          setBusy('')
          if (!result || !result.ok) {
            setMessage('保存失败：' + ((result && result.error) || '未知错误') + '（自定义路径必须是存在的视频文件）')
            return
          }
          setMessage(kind === 'boot' ? '已应用 ✓ 下次启动时播放' : '已应用 ✓')
          applyRuntime().then(function (applied) {
            if (applied) return load()
            // 老页面 / 运行时缺席时才退回刷新
            setMessage('已应用，正在刷新…')
            setTimeout(function () { location.reload() }, 350)
          })
        })
      }

      if (!data) {
        return h('div', { style: { padding: '12px 0', color: C.sub, fontSize: '13px' } }, message || '加载媒体中心…')
      }

      var diag = null
      try { diag = typeof globalThis.__DSH_MEDIA_CENTER_DIAG__ === 'function' ? globalThis.__DSH_MEDIA_CENTER_DIAG__() : null } catch (error) { diag = null }
      var diagText = diag === null ? '' : '运行时：皮肤 ' + (diag.skin || '无')
        + ' · CSS ' + (diag.link ? '已启用' : '未启用')
        + ' · 背景层 ' + (diag.backdrop ? '有 (z=' + diag.layer + ')' : '无')
        + (diag.video ? ' · 视频 ' + (diag.video.paused ? '已暂停' : '播放中') + ' ' + diag.video.t + 's' : '')

      return h('div', {},
        h('h2', { style: { margin: '0 0 4px', fontSize: '18px', color: C.text } }, '媒体中心'),
        h('p', { style: { margin: '0 0 12px', fontSize: '13px', color: C.sub, lineHeight: 1.6 } },
          '点卡片（或卡片上的「应用」）即切换：背景立即生效，启动动画下次启动播放，都不需要重启 DSH。'),
        h('p', { style: { margin: '0 0 8px', fontSize: '12px', color: C.text, lineHeight: 1.6 } },
          '当前：' + (currentName(data) || '未设置')),
        diagText ? h('p', { style: { margin: '0 0 8px', fontSize: '11px', color: C.faint, lineHeight: 1.6 } }, diagText) : null,
        message ? h('p', { style: { margin: '0 0 14px', fontSize: '12px', color: C.sub } }, message) : null,

        h('h3', { style: sectionTitle }, '启动动画'),
        h('div', { style: gridStyle },
          (data.boot || []).map(function (item) {
            return h(Card, {
              key: item.id,
              item: item,
              active: data.current.boot === item.id,
              onApply: function (id) { apply('boot', id) },
            })
          }),
        ),
        h(CustomRow, {
          hint: '用自己的视频做启动动画（绝对路径，支持 mp4 / webm / mkv / mov）',
          onApply: function (id, file) { apply('boot', id, file) },
        }),

        h('h3', { style: sectionTitle }, '界面背景'),
        h('div', { style: gridStyle },
          (data.background || []).map(function (item) {
            return h(Card, {
              key: item.id,
              item: item,
              active: data.current.background === item.id,
              onApply: function (id) { apply('background', id) },
            })
          }),
        ),
        h(CustomRow, {
          hint: '用自己的视频做界面背景（绝对路径，支持 mp4 / webm / mkv / mov）',
          onApply: function (id, file) { apply('background', id, file) },
        }),
        h(ImportBox, {}),

        h('p', { style: { margin: '4px 0 0', fontSize: '12px', color: C.faint, lineHeight: 1.6 } },
          '想增加候选：编辑 ' + (data.sourcesFile || '$DSH_HOME/media-center/sources.json') + '，改完刷新页面即生效。'),
      )
    }

    function apply(ctx) {
      ctx.slots.inject('settings.section', function () {
        return ctx.slots.register(
          {
            name: 'settings.section',
            id: 'media-center',
            order: 26,
            label: function () { return '媒体中心' },
          },
          MediaSection,
        )
      })
    }

    exports.apply = apply
    exports.inject = ['slots']
    return module.exports
  },
})
