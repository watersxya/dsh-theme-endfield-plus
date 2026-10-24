    /* ================= LOCAL PATCH (not upstream): 关闭 DSH 悬浮按钮 =================
       The control lives beside the other floating surfaces (40-balance-pricing.js
       above, 33-balance-capsule.js before it) rather than in the settings panel:
       a control that ends the process is an ACTION, and the panel is for
       configuration. The settings row (51-settings-page.js) only flips the
       switch and calls syncShutdownButton(), so the control appears or vanishes
       the moment the switch is flipped, not on the next page load.
       Host half: lib/system-bridge.js (GET /theme-endfield/system probes the
       appExit capability, POST .../shutdown requests the exit).
     */
    /* ---------- 关闭 DSH 悬浮按钮（LOCAL PATCH）----------
       Kept beside the other floating surfaces rather than in the settings panel:
       a control that ends the process is an ACTION, and the panel is for
       configuration. syncShutdownButton() is also what toggleShutdownButton()
       calls, so flipping the switch makes the button appear or vanish now
       instead of on the next page load.

       WHY A FACTORY AND NOT INLINE STATEMENTS. The control is a small state
       machine (idle → armed → acting) with its own node, listeners and timers.
       Written as straight-line code inside mount() it would leak a listener and
       a timer on every remount, and the "is it still armed" question would have
       no single place to live. The factory owns exactly one button and hands
       back three verbs.

       WHY TWO CLICKS. Ending a running process from a 30px circle is one misclick
       from losing an unsaved conversation, so the first click arms and only a
       second one inside the window acts. A native confirm() dialog is the
       alternative and is deliberately NOT used: it is a heavier interruption than
       the action warrants and it cannot be styled to match.

       THE SAFETY LINE, restated because it is the point of the feature: this
       asks the HOST to end the DSH process. It does not power off, restart or log
       out the machine, and there is no path here that could — see
       lib/system-bridge.js and test/system-bridge.test.js. */
    const SHUTDOWN_ARM_MS = 3200
    const shutdownButton = (() => {
      let node = null
      let armedUntil = 0
      let available = true
      let disposed = false

      /* `--edge-ink` does not exist. It was referenced here and defined
         nowhere in this file, so the fallback was always the one that
         painted: #101110, which is ALSO what --edge-paper resolves to in
         dark mode (--dsw-alias-bg-base). A dark glyph on a dark chip, at
         30px, is invisible on screen while present in the DOM — exactly
         the "the node exists but I cannot see it" report.

         Both replacements below are tokens this theme actually defines, and
         both are scheme-aware, so the chip inverts with the palette instead
         of depending on a hardcoded pair that only works in one scheme:
           ink    --dsw-alias-label-primary      #101110 / #f5f5f0
           paper  --edge-paper                    light #e8e8e2 / dark #101110
         The ink is also the token the settings panel's own labels read
         (labelStyle, line 8375), so the control sits in the same type
         system as the page it floats over. */

      /* THE RIM IS LOAD-BEARING, and this is why.
         --edge-paper resolves to #101110 in dark mode, which is also what the
         dark app background is. So a chip filled with it has no boundary at
         all: the circle reads as "nothing there", which is the second half of
         the original report ("the node exists but I cannot see it" — after the
         ink was fixed, the RIM was what still could not be seen).

         The fill below is therefore NOT --edge-paper. It is this theme's own
         glass recipe, copied from the bounded-frost block further down
         (--edge-glass-fill / -edge / -sheen), because that is what every other
         floating surface in this theme uses and it is the only treatment here
         that separates cleanly from BOTH paper colours:
             light  fill 248 247 240 @ .80   rim white @ .65
             dark   fill  31 36 34  @ .76   rim white @ .18
         The dark rim is only .18 alpha, which on a dark page reads as a faint
         ring — so the rim is paired with an accent-coloured glow in the same
         box-shadow. --edge-accent carries the palette (谷地黄 #fff500 /
         武陵青 #14d0d0), so the control picks up the theme's hue instead of
         being a neutral grey dot parked on someone's wallpaper.

         Those glass tokens only exist while body[data-endfield-glass] is set,
         i.e. only when the user turned the glass LAYER on. This control is
         available with that layer off, so every value carries a literal
         fallback that matches the same measured numbers. */
      const CHIP_FILL = 'rgb(var(--edge-glass-fill, 248 247 240) / var(--edge-glass-alpha, 0.8))'
      const CHIP_RIM = 'var(--edge-glass-edge, rgb(255 255 255 / 0.65))'
      const CHIP_SHEEN = 'var(--edge-glass-sheen, rgb(255 255 255 / 0.35))'
      const ACCENT_RGB = 'var(--edge-accent-rgb, 255, 245, 0)'
      const restingBackground =
        `${CHIP_FILL}, ${CHIP_SHEEN} linear-gradient(145deg, transparent 58%)`
      /* Two layers of depth: the accent tint pools under the chip (the theme's
         own glow idiom, see --edge-glow-light/-dark) and a neutral drop shadow
         lifts it off the page. The dark-mode alpha is what carries the rim. */
      const restingShadow =
        `0 2px 12px rgba(0, 0, 0, 0.30), 0 0 0 1px rgba(${ACCENT_RGB}, 0.34), 0 0 14px rgba(${ACCENT_RGB}, 0.18)`

      /* Set via setProperty(..., 'important') rather than assigned on
         `style`, because the stylesheet zeroes rounding on every button and
         kills every transition:
             body:not(.theme-endfield-round) button { border-radius: 0 !important }
             button, [role='button']                { transition: none !important }
         Those two rules are meant for the app's own controls. A fixed
         viewport-anchored control is not one of them, and without the
         priority this button renders as a square with no feedback on
         arm — which reads as "not responding" rather than "restyled". */
      const IMPORTANT_STYLE = {
        borderRadius: '50%',
        transition: 'opacity 140ms ease, background-color 140ms ease, transform 140ms ease',
      }

      /* 38px, up from 30. The glyph is a single character, so it has to be
         big enough to hit without aiming and big enough to read at a glance;
         15px of ⏻ inside 30px was both. */
      const baseStyle = {
        position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483000',
        width: '38px', height: '38px',
        /* An explicit transparent border, NOT `border: none`. The rim is
           drawn by the box-shadow ring above, so the border only has to hold
           the box open — but it must EXIST, because the theme zeroes border
           width on bare `button` selectors in places and a collapsed border
           is one less thing that can differ between themes. */
        border: '1px solid transparent',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--dsw-alias-label-primary, #101110)',
        background: restingBackground,
        boxShadow: restingShadow,
        /* Resting opacity stays below 1 on purpose: this is a control that
           ends the user's session, so it should read as available without
           competing with the conversation. Hover lifts it (see onOver). It was
           .55 before, which on top of an already-dark chip was itself part of
           why nothing could be seen. */
        opacity: '0.82',
        fontSize: '19px', lineHeight: '1', padding: '0',
        WebkitUserSelect: 'none', userSelect: 'none',
      }
      const paint = (extra) => {
        if (node === null) return
        Object.assign(node.style, baseStyle, extra || {})
        if (typeof node.style.setProperty === 'function') {
          node.style.setProperty('border-radius', IMPORTANT_STYLE.borderRadius, 'important')
          node.style.setProperty('transition', IMPORTANT_STYLE.transition, 'important')
        } else {
          Object.assign(node.style, IMPORTANT_STYLE)
        }
      }

      const disarm = () => {
        armedUntil = 0
        if (node === null) return
        node.setAttribute('data-armed', '0')
        paint(available ? null : { opacity: '0.32', cursor: 'not-allowed' })
      }

      const act = () => {
        if (typeof fetch !== 'function' || node === null) return
        node.setAttribute('data-busy', '1')
        paint({ opacity: '0.4', cursor: 'progress' })
        fetch(SHUTDOWN_URL, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: '{}' })
          .then((res) => (res.ok ? res.json() : null))
          .then((json) => {
            /* Success means the host already scheduled the exit and the socket is
               about to die, so there is nothing to restore. Only a refusal needs
               the button back. */
            if (json && json.ok === true) return
            if (node === null) return
            node.removeAttribute('data-busy')
            disarm()
          })
          .catch(() => {
            /* The socket dies with the process, so a rejection is only meaningful
               when the request never landed at all. */
            if (node === null) return
            node.removeAttribute('data-busy')
            disarm()
          })
      }

      const onClick = () => {
        if (!available) return
        if (armedUntil === 0) {
          armedUntil = Date.now() + SHUTDOWN_ARM_MS
          node.setAttribute('data-armed', '1')
          /* The accent chip needs its OWN ink, not the paper-mode one: on the
             yellow chip the page ink #101110 measures 15.26:1, but on the
             teal chip #14d0d0 it is 9.88:1 — both AA, and both are the same
             value only because this palette never goes lighter than #14d0d0.
             Pinning #101110 rather than reading a token keeps the pair stable
             if the chip colour is ever tuned upward.

             The fill goes SOLID rather than through the glass recipe: at
             1px from the glyph a translucent chip would let the page show
             through the one pixel that decides whether the symbol reads. The
             rim is kept (now as a dark ring) so the armed state keeps the
             same circular silhouette it had at rest — a state change should
             recolour the control, not resize it. */
          paint({
            background: 'var(--edge-accent, #fff500)',
            color: '#101110',
            opacity: '1',
            boxShadow: `0 2px 14px rgba(0, 0, 0, 0.34), 0 0 0 1px rgba(0, 0, 0, 0.28)`,
          })
          /* Auto-disarm: a button left armed forever would turn the next
             unrelated click into a shutdown. */
          setTimeout(() => { if (armedUntil !== 0 && Date.now() >= armedUntil) disarm() }, SHUTDOWN_ARM_MS)
          return
        }
        disarm()
        act()
      }
      /* Hover raises opacity to full and strengthens the accent ring, so the
         control reads as live on approach without moving. Disabled drops to
         0.32 — enough to be findable, faint enough that it is obviously not
         offered — and disabled keeps the rim visible so it does not vanish
         into the page the way the pre-glass version did. */
      const disabledLook = { opacity: '0.32', cursor: 'not-allowed' }
      const onOver = () => {
        if (node === null || armedUntil !== 0) return
        paint(available
          ? { opacity: '1', transform: 'scale(1.06)', boxShadow: `0 3px 16px rgba(0, 0, 0, 0.32), 0 0 0 1px rgba(${ACCENT_RGB}, 0.55), 0 0 20px rgba(${ACCENT_RGB}, 0.30)` }
          : disabledLook)
      }
      const onOut = () => { if (node !== null && armedUntil === 0) paint(available ? null : disabledLook) }
      const onDown = () => { if (node !== null) paint({ transform: 'scale(0.96)' }) }

      /* ---------- WHERE THIS CONTROL BELONGS: the conversation page only --------
       * The user asked for it in the conversation surface, and it is also
       * correct to hide it elsewhere: a control that ends the session has no
       * business floating over someone's bookshelf or board.
       *
       * MEASURED, not assumed. DSH has NO ROUTER — packages/client contains
       * zero references to createHashRouter / BrowserRouter / pushState /
       * location.hash. A plugin page is an OVERLAY inside the same document:
       * plugins/novel-forge-alpha/src/client/mount.tsx appends its container to
       * the centre column and flips `html[data-dsh-novelforge-active]`
       * (mount.tsx:61), and CSS then switches .view from display:none to
       * block. So the URL never changes and there is no route event to listen
       * to — the only honest signal is the DOM.
       *
       * The obvious probe is wrong, and this file used it:
       *   - `_sidebarCol` (AppFrame.tsx:280) is part of the PERMANENT app
       *     frame. It renders on every page, plugin overlay included, so a
       *     button gated on it stays visible over plugin pages too.
       * The real conversation marker is
       *   ui-conversation/.../ConversationMainPanel.tsx:46
       *     <div className={css.root} data-phase={phase}>
       * with phase in {hero, active, settling} — and CRUCIALLY the old
       * check tested only [data-phase="hero"], which is the EMPTY conversation.
       * Once a conversation exists the phase becomes "active", so a
       * hero-only probe fails on exactly the page the user cares most about.
       * Hence [data-phase] with no value.
       *
       * Presence is still not sufficient: the overlay leaves that node
       * mounted underneath, so a plugin page reads "conversation present". The
       * siblings' activation attributes are therefore excluded. That list is
       * not a guess — it is the mutual-exclusion set declared by the plugins
       * themselves (novel-forge mount.tsx:16-18 lists the other two).
       */
      const CONVERSATION_MARKER = '[class*="centerCol"] [class*="_root"][data-phase]'
      const PLUGIN_ACTIVE_ATTRS = [
        'data-dsh-novelforge-active',
        'data-dsh-taskboard-active',
        'data-dsh-ssh-active',
      ]
      const onConversationPage = () => {
        if (typeof document === 'undefined' || document === null) return false
        const docEl = document.documentElement
        if (docEl === null || docEl === undefined) return false
        /* One of the sibling panels owns the screen: not the conversation. */
        for (let i = 0; i < PLUGIN_ACTIVE_ATTRS.length; i++) {
          if (docEl.hasAttribute(PLUGIN_ACTIVE_ATTRS[i])) return false
        }
        return document.querySelector(CONVERSATION_MARKER) !== null
      }
      let pageWatch = null
      const create = () => {
        if (node !== null || disposed) return node
        if (typeof document === 'undefined' || document === null) return null
        if (typeof document.createElement !== 'function') return null
        if (!onConversationPage()) return null
        const el = document.createElement('button')
        el.type = 'button'
        // A glyph, not an SVG: keeps the control dependency-free and legible at
        // 30px. The aria-label carries the meaning for anything that does not
        // render the glyph.
        el.textContent = '\u23FB'
        el.setAttribute('data-endfield-shutdown', '')
        el.setAttribute('data-armed', '0')
        el.setAttribute('aria-label', 'Close DSH')
        el.setAttribute('title', 'Close DSH')
        Object.assign(el.style, baseStyle)
        el.addEventListener('click', onClick)
        el.addEventListener('mouseover', onOver)
        el.addEventListener('mouseout', onOut)
        el.addEventListener('mousedown', onDown)
        const parent = document.body || document.documentElement
        if (parent === null || parent === undefined) return null
        parent.appendChild(el)
        node = el
        paint(available ? null : { opacity: '0.32', cursor: 'not-allowed' })
        return node
      }

      const drop = () => {
        if (node === null) return
        try { node.removeEventListener('click', onClick) } catch (e) { /* gone */ }
        try { node.removeEventListener('mouseover', onOver) } catch (e) { /* gone */ }
        try { node.removeEventListener('mouseout', onOut) } catch (e) { /* gone */ }
        try { node.removeEventListener('mousedown', onDown) } catch (e) { /* gone */ }
        if (node.parentNode) { try { node.parentNode.removeChild(node) } catch (e) { /* already gone */ } }
        node = null
        armedUntil = 0
      }

      /* Probe capability on every sync rather than caching it at mount: the
         launcher provides appExit, and a surface that gains it after boot should
         start working without a reload. Cordis lookups are cheap. */
      const refresh = () => {
        if (typeof fetch !== 'function') return
        fetch(SYSTEM_STATE_URL, { headers: { accept: 'application/json' } })
          .then((res) => (res.ok ? res.json() : null))
          .then((json) => {
            if (json === null || json === undefined) return
            const next = json.available === true
            if (next === available) return
            available = next
            if (node === null) return
            node.setAttribute('data-available', next ? '1' : '0')
            if (!next) disarm(); else paint(null)
          })
          .catch(() => { /* route absent: assume available, let the click report */ })
      }

      /* No router exists (see CONVERSATION_MARKER), so nothing announces a panel
         switch. Observe the two things that DO change: the html element's
         attributes (that is where every plugin sets its -active flag) and the
         subtree (that is where the conversation root is added on boot).
         Deliberately narrow — no filter on the subtree, because the attribute
         set we care about lives on <html> and is named in childList/subtree.
         Cheap enough: this only fires reconcile(), which is idempotent. */
      const ensurePageWatch = () => {
        if (pageWatch !== null) return
        if (typeof document === 'undefined' || typeof MutationObserver !== 'function') return
        const docEl = document.documentElement
        if (docEl === null || docEl === undefined) return
        const recheck = () => {
          if (disposed || isShutdownButtonOn() !== true) return
          /* Cheap both ways: create() bails when the page is wrong, and drop()
             detaches when it no longer belongs. Whichever transition this DOM
             change caused, one of the two runs. */
          if (onConversationPage()) create(); else drop()
        }
        try {
          pageWatch = new MutationObserver(recheck)
          pageWatch.observe(docEl, { attributes: true, childList: true, subtree: true })
        } catch (e) { pageWatch = null }
      }
      const dropPageWatch = () => {
        if (pageWatch === null) return
        try { pageWatch.disconnect() } catch (e) { /* gone */ }
        pageWatch = null
      }

      return {
   sync: () => {
          /* `disposed` used to be a one-way latch here, and that was a real bug:
             destroyBalanceCapsule-style unmount runs whenever the THEME is
             switched off — including the initial reconcile pass, which runs
             before the user's preference has been read into the store. One
             early destroy() then set the latch, `create()` returned early for
             the rest of the page's life, and the switch read "on" with no button
             on screen. Turning the theme off must remove the node, NOT retire
             the controller. */
          if (disposed) disposed = false
    if (isShutdownButtonOn() !== true) { drop(); dropPageWatch(); return }
          create()
    /* Only watch while the switch is on: a MutationObserver left running for
             an opted-out control is a permanent listener for nothing. */
          ensurePageWatch()
       refresh()
        },
        destroy: () => { drop(); dropPageWatch() },
   }
    })()

    const syncShutdownButton = () => {
      if (!isEnabled()) {
        shutdownButton.destroy()
        return
      }
      shutdownButton.sync()
    }
