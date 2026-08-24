// Browser half of the dsh-open-project plugin.
//
// Contributes one "open with" utility to the right edge of the session header
// (the session-scoped `conversation.session.header.utilities` list). The control
// is a split trigger: the icon shows the app that would open the project (the
// last one used, or the first detected one by default) and clicking it launches
// that app immediately; the caret beside it opens a dropdown of every detected
// editor/IDE/terminal with its product icon (a letter badge when a CLI tool has
// no extractable icon). Choosing one launches it with the current project folder
// (the session's cwd) and remembers the choice, so the icon switches to that
// app. Only apps actually installed on the host are listed — detection is
// dynamic.

const LS_KEY = 'dsh.open-project.last'

function readLast() {
  try { return typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null } catch { return null }
}
function writeLast(id) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(LS_KEY, id) } catch { /* ignore */ }
}

const css = `
.dsw-openwith-root{position:relative;display:inline-flex;align-items:center}
.dsw-openwith-trigger{display:inline-flex;align-items:stretch;overflow:hidden;height:28px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary)}
.dsw-openwith-trigger:hover{border-color:var(--dsw-alias-border-l2)}
.dsw-openwith-main{display:inline-flex;align-items:center;justify-content:center;padding:0 8px;border:0;background:transparent;cursor:pointer}
.dsw-openwith-main:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsw-openwith-caretbtn{display:inline-flex;align-items:center;justify-content:center;padding:0 6px;border:0;border-left:1px solid var(--dsw-alias-border-l1);background:transparent;cursor:pointer}
.dsw-openwith-caretbtn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsw-openwith-triggerimg{width:18px;height:18px;object-fit:contain;display:block}
.dsw-openwith-iconimg{width:18px;height:18px;object-fit:contain;display:block;flex:none}
.dsw-openwith-fallback{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:5px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:600;flex:none;box-sizing:border-box}
.dsw-openwith-caret{display:inline-flex;align-items:center;justify-content:center;flex:none;color:var(--dsw-alias-label-secondary);opacity:.85}
.dsw-openwith-backdrop{position:fixed;inset:0;z-index:900}
.dsw-openwith-popover{position:absolute;top:calc(100% + 8px);right:0;z-index:901;min-width:230px;padding:6px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.22);transform-origin:top right;animation:dsw-openwith-pop .12s ease}
@keyframes dsw-openwith-pop{from{opacity:0;transform:translateY(-4px) scale(.98)}to{opacity:1;transform:none}}
.dsw-openwith-list{display:flex;flex-direction:column;gap:1px}
.dsw-openwith-item{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border:0;background:transparent;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);font-size:13px;text-align:left;cursor:pointer;border-radius:8px}
.dsw-openwith-item:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsw-openwith-item-active{background:var(--dsw-alias-interactive-bg-hover)}
.dsw-openwith-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsw-openwith-check{color:var(--dsw-alias-state-success-primary);font-size:14px;line-height:1;flex:none}
.dsw-openwith-empty{padding:12px 10px;font-size:12px;color:var(--dsw-alias-label-secondary)}
`

function AppIcon(props) {
  if (props.src) return React.createElement('img', { className: props.className, src: props.src, alt: props.label || '' })
  return React.createElement('span', { className: props.className + ' dsw-openwith-fallback' }, (props.label || '?').charAt(0).toUpperCase())
}

function OpenWithMenu(props) {
  const { sessionId, useSessions } = props
  const [open, setOpen] = React.useState(false)
  const [apps, setApps] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [activeId, setActiveId] = React.useState(null)
  const cwd = useSessions((s) => sessionId ? s.byId[sessionId]?.cwd : undefined)

  React.useEffect(() => {
    if (!cwd) { setApps([]); setLoading(false); return }
    let cancelled = false
    host.call('list-apps', { path: cwd }).then((res) => {
      if (cancelled) return
      const list = Array.isArray(res) ? res : []
      setApps(list)
      setLoading(false)
      const last = readLast()
      const found = list.find((a) => a.id === last)
      setActiveId(found ? found.id : (list[0] ? list[0].id : null))
    }).catch(() => { if (!cancelled) { setApps([]); setLoading(false) } })
    return () => { cancelled = true }
  }, [cwd])

  if (!cwd) return null

  const active = (apps || []).find((a) => a.id === activeId) || null
  const openWith = (app) => {
    host.call('open-with', { appId: app.id, path: cwd })
    setActiveId(app.id)
    writeLast(app.id)
    setOpen(false)
  }

  const triggerIcon = active
    ? React.createElement(AppIcon, { className: 'dsw-openwith-triggerimg', src: active.icon, label: active.label })
    : React.createElement('span', { className: 'dsw-openwith-triggerimg' }, '')
  const caret = React.createElement('svg', {
    width: 12,
    height: 12,
    viewBox: '0 0 16 16',
    fill: 'none',
    className: 'dsw-openwith-caret',
    'aria-hidden': true,
  }, React.createElement('path', {
    d: 'M4 6l4 4 4-4',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }))
  const openActive = () => { if (active) openWith(active) }
  const mainBtn = React.createElement('button', {
    className: 'dsw-openwith-main',
    title: active ? 'Open with ' + active.label : 'Open with',
    'aria-label': active ? 'Open with ' + active.label : 'Open with',
    onClick: openActive,
  }, triggerIcon)
  const caretBtn = React.createElement('button', {
    className: 'dsw-openwith-caretbtn',
    title: 'Choose an app',
    'aria-label': 'Choose an app',
    onClick: () => setOpen((v) => !v),
  }, caret)
  const trigger = React.createElement('div', { className: 'dsw-openwith-trigger' }, mainBtn, caretBtn)

  if (!open) return React.createElement('div', { className: 'dsw-openwith-root' }, trigger)

  const items = loading
    ? React.createElement('div', { className: 'dsw-openwith-empty' }, 'Detecting installed apps…')
    : (apps.length === 0
        ? React.createElement('div', { className: 'dsw-openwith-empty' }, 'No compatible app detected')
        : React.createElement('div', { className: 'dsw-openwith-list' },
            apps.map((app) => {
              const isActive = app.id === activeId
              return React.createElement('button', {
                key: app.id,
                className: 'dsw-openwith-item' + (isActive ? ' dsw-openwith-item-active' : ''),
                onClick: () => openWith(app),
              },
                React.createElement(AppIcon, { className: 'dsw-openwith-iconimg', src: app.icon, label: app.label }),
                React.createElement('span', { className: 'dsw-openwith-label' }, app.label),
                isActive ? React.createElement('span', { className: 'dsw-openwith-check' }, '\u2713') : null,
              )
            })))

  return React.createElement('div', { className: 'dsw-openwith-root' },
    trigger,
    React.createElement('div', { className: 'dsw-openwith-backdrop', onClick: () => setOpen(false) }),
    React.createElement('div', { className: 'dsw-openwith-popover' }, items),
  )
}

export const inject = ['slots']
export function apply(ctx) {
  const slots = ctx.get('slots')
  if (slots === undefined) return
  ctx.effect(() => styles.insert(css))
  slots.inject('conversation.session.header.utilities', () => slots.register({
    name: 'conversation.session.header.utilities',
    id: 'open-with',
    order: 100,
    label: 'Open with',
  }, OpenWithMenu))
}
