/*
 * Browser half for dsh-open-project.
 *
 * A standalone plugin's client half must ship as a self-registering module that
 * DSH's client module loader consumes through window.__ModuleLoader__.load().
 * We build React elements with React.createElement (no JSX) and reach the host
 * over the public Connection service: context.connection.rpc.call(channel,
 * endpoint, payload). The host half registers the matching channel with
 * ctx.get('connection').rpc.handle(channel, handler). This avoids relying on
 * the dynamic-plugin-only host/harness globals, which are not present when DSH
 * loads a plugin straight out of npm.
 *
 * The control is a split trigger at the right edge of the session header: the
 * icon opens the project with the app that would be used (the last one chosen,
 * or the first detected app), and the caret beside it opens a dropdown of every
 * detected editor/IDE/terminal with its product icon (a letter badge when an
 * entry has no extractable icon, e.g. CLI tools on Linux/macOS). Choosing one
 * launches it with the current project folder (the session's cwd) and remembers
 * the choice. Only apps actually installed on the host are listed — detection is
 * dynamic.
 *
 * Additionally the plugin contributes a "📂 打开项目文件夹" row to the left
 * sidebar's Workspace overflow menu ("…", Rename / Delete workspace). That menu
 * is hard-coded by dsh-client-ui-workspace with no plugin slot in this runtime,
 * so the row is mounted into the portaled menu with a DOM/React-root adapter
 * (see installLegacyWorkspaceMenu) and resolves the folder by workspace title
 * through the host's open-workspace-folder endpoint.
 */

globalThis.__ModuleLoader__.load({
  id: 'dsh-open-project',
  factory(require) {
    'use strict'
    const React = require('react')
    const { useState, useCallback, useEffect } = React
    const { createRoot } = require('react-dom/client')

    const LS_KEY = 'dsh.open-project.last'
    const SLOT = 'conversation.session.header.utilities'
    const ID = 'open-with'
    const CHANNEL = '/dsh-open-project'

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
.dsw-openwith-row{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border:0;background:transparent;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);font-size:13px;text-align:left;cursor:pointer;border-radius:8px}
.dsw-openwith-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsw-openwith-foldericon{width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;flex:none;color:var(--dsw-alias-label-secondary);font-size:14px;line-height:1}
`

    function readLast() {
      try { return typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null } catch { return null }
    }
    function writeLast(id) {
      try { if (typeof localStorage !== 'undefined') localStorage.setItem(LS_KEY, id) } catch { /* ignore */ }
    }

    function AppIcon(props) {
      if (props.src) return React.createElement('img', { className: props.className, src: props.src, alt: props.label || '' })
      return React.createElement('span', { className: props.className + ' dsw-openwith-fallback' }, (props.label || '?').charAt(0).toUpperCase())
    }

    function OpenWithMenu(props) {
      const { sessionId, useSessions, listApps, openWith } = props
      const [open, setOpen] = useState(false)
      const [apps, setApps] = useState(null)
      const [loading, setLoading] = useState(true)
      const [activeId, setActiveId] = useState(null)
      const [debug, setDebug] = useState(null)
      const cwd = useSessions((s) => sessionId ? s.byId[sessionId]?.cwd : undefined)

      const fetchApps = useCallback(() => {
        if (!cwd) { setApps([]); setLoading(false); return }
        listApps(cwd).then((res) => {
          // The generic Connection RPC wraps the host reply in its own
          // { ok:true, value } envelope; unwrap it to get the { apps, debug } body.
          const value = res && typeof res === 'object' && res.ok === true && 'value' in res ? res.value : res
          const payload = value && !Array.isArray(value) ? value : { apps: Array.isArray(value) ? value : [] }
          const list = Array.isArray(payload.apps) ? payload.apps : []
          setApps(list)
          setLoading(false)
          setDebug(payload.debug || null)
          const last = readLast()
          const found = list.find((a) => a.id === last)
          setActiveId(found ? found.id : (list[0] ? list[0].id : null))
        }).catch(() => { setApps([]); setLoading(false); setDebug(null) })
      }, [cwd, listApps])

      useEffect(() => { setLoading(true); fetchApps() }, [fetchApps])

      // Re-fetch whenever the dropdown opens (cheap: the host caches its detection
      // result, so this stays fresh without re-running detection each time).
      useEffect(() => { if (open) fetchApps() }, [open, fetchApps])

      if (!cwd) return null

      const active = (apps || []).find((a) => a.id === activeId) || null
      const launch = (app) => {
        openWith(app.id, cwd)
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
      const openActive = () => { if (active) launch(active) }
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
            ? React.createElement('div', { className: 'dsw-openwith-empty' },
                debug ? 'No compatible app detected (' + debug.platform + (debug.subprocess ? '' : ', subprocess unavailable') + ')' : 'No compatible app detected')
            : React.createElement('div', { className: 'dsw-openwith-list' },
                apps.map((app) => {
                  const isActive = app.id === activeId
                  return React.createElement('button', {
                    key: app.id,
                    className: 'dsw-openwith-item' + (isActive ? ' dsw-openwith-item-active' : ''),
                    onClick: () => launch(app),
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

    // --- Workspace "..." overflow menu: "Open project folder" row -----------
    // DSH's Workspace overflow menu (Rename / Delete workspace) is hard-coded in
    // dsh-client-ui-workspace and exposes no published plugin slot in this
    // runtime (0.1.1-rc.2). We therefore add one row by observing the portaled
    // menu and mounting a React root (createRoot) into it, mirroring the
    // reference plugin's legacy-menu adapter. The workspace title is read from
    // the owning row's treeitem text, and the host resolves title -> path and
    // opens it.

    function WorkspaceMenuRow(props) {
      const { label, onOpenFolder, onClose } = props
      return React.createElement('button', {
        type: 'button',
        role: 'menuitem',
        className: 'dsw-openwith-row',
        onClick: () => {
          try { if (onOpenFolder) onOpenFolder() } catch (e) { console.error('[dsh-open-project] open folder error', e) }
          if (onClose) onClose()
        },
      },
        React.createElement('span', { className: 'dsw-openwith-foldericon' }, '\uD83D\uDCC2'),
        React.createElement('span', { className: 'dsw-openwith-label' }, label),
      )
    }

    function installLegacyWorkspaceMenu(opts) {
      const { workspaceT, openFolderByTitle } = opts
      const ROOT_ATTR = 'data-dsh-open-project-wsrow'
      let active = undefined

      const unmount = () => {
        if (active === undefined) return
        if (active.root) { try { active.root.unmount() } catch (e) { /* ignore */ } }
        if (active.mount && active.mount.parentNode) active.mount.parentNode.removeChild(active.mount)
        if (active.menu) active.menu.removeAttribute(ROOT_ATTR)
        active.root = undefined; active.mount = undefined; active.menu = undefined
      }

      const isWorkspaceMenu = (menu) => {
        const items = Array.from(menu.querySelectorAll('[role="menuitem"]')).map((el) => (el.textContent || '').trim())
        const rename = workspaceT('rename')
        const del = workspaceT('delete.workspace')
        const hasRename = items.some((l) => l === rename || l === 'Rename' || l === '重命名' || l === 'rename')
        const hasDelete = items.some((l) => l === del || /delete\s+workspace/i.test(l) || /删除工作区/.test(l) || l === 'Delete workspace' || l === 'delete workspace')
        return hasRename && hasDelete
      }

      const mountIntoOpenMenu = () => {
        if (active === undefined || active.root !== undefined) return
        const menus = Array.from(globalThis.document.querySelectorAll('[role="menu"]')).filter((m) => isWorkspaceMenu(m))
        const menu = menus[menus.length - 1]
        if (menu === undefined || menu.hasAttribute(ROOT_ATTR)) return
        const treeitem = active.treeitem
        const title = treeitem ? (treeitem.textContent || '').trim() : ''
        if (title === '') return
        const mount = globalThis.document.createElement('div')
        mount.setAttribute('role', 'presentation')
        mount.setAttribute(ROOT_ATTR, '')
        const viewport = menu.querySelector(':scope > [role="presentation"]') ?? menu
        viewport.appendChild(mount)
        menu.setAttribute(ROOT_ATTR, '')
        const root = createRoot(mount)
        active.menu = menu; active.mount = mount; active.root = root
        root.render(React.createElement(WorkspaceMenuRow, {
          label: '\u6253\u5F00\u9879\u76EE\u6587\u4EF6\u5939',
          onOpenFolder: () => { void openFolderByTitle(title) },
          onClose: () => { globalThis.document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) },
        }))
      }

      const observer = new MutationObserver(() => {
        if (active !== undefined && active.menu !== undefined && !active.menu.isConnected) unmount()
        mountIntoOpenMenu()
      })
      observer.observe(globalThis.document.body, { childList: true, subtree: true })

      const onClick = (event) => {
        const target = event.target
        if (!(target instanceof Element)) return
        const button = target.closest('button[aria-label]')
        if (button === null) return
        const treeitem = button.closest('[role="treeitem"]')
        if (treeitem === null) return
        unmount()
        active = { treeitem, anchor: button.parentElement || button }
        queueMicrotask(mountIntoOpenMenu)
      }
      globalThis.document.addEventListener('click', onClick, true)

      return () => {
        globalThis.document.removeEventListener('click', onClick, true)
        observer.disconnect()
        unmount()
        active = undefined
      }
    }

    return {
      inject: ['slots', 'connection', 'locale'],
      apply(ctx) {
        const slots = ctx.get('slots')
        if (slots === undefined) return
        const styleEl = globalThis.document.createElement('style')
        styleEl.textContent = css
        ctx.effect(() => {
          if (globalThis.document.head) {
            globalThis.document.head.appendChild(styleEl)
            return () => { if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl) }
          }
          return undefined
        }, 'dsh-open-project: styles')
        // Resolve connection lazily so the handlers survive a reconnect/remount.
        const listApps = (path) => { const c = ctx.get('connection'); return c === undefined ? Promise.resolve([]) : c.rpc.call(CHANNEL, 'list-apps', { path }) }
        const openWith = (appId, path) => { const c = ctx.get('connection'); return c === undefined ? Promise.resolve({ ok: false, error: 'no connection' }) : c.rpc.call(CHANNEL, 'open-with', { appId, path }) }
        const openFolderByTitle = (title) => { const c = ctx.get('connection'); return c === undefined ? Promise.resolve({ ok: false, error: 'no connection' }) : c.rpc.call(CHANNEL, 'open-workspace-folder', { title }) }
        // Workspace overflow-menu row: the menu has no plugin slot on this
        // runtime, so mount the "Open project folder" row into the portaled menu.
        const locale = ctx.get('locale')
        const workspaceT = locale && typeof locale.bind === 'function' ? locale.bind('workspace') : () => ''
        ctx.effect(() => installLegacyWorkspaceMenu({ workspaceT, openFolderByTitle }), 'dsh-open-project: workspace legacy menu')
        const injectProps = () => ({ listApps, openWith })
        slots.inject(SLOT, () => slots.register({
          name: SLOT,
          id: ID,
          order: 100,
          inject: injectProps,
        }, OpenWithMenu))
      },
    }
  },
})
