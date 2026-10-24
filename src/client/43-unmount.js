    const unmount = () => {
      if (!mounted) return
      mounted = false
      disposeToken()
      disposeStyles()
      disposeToken = () => {}
      disposeStyles = () => {}
      // Guarded like every other body touch: an unload race must not throw here.
      if (typeof document !== 'undefined' && document.body !== null) {
        document.body.classList.remove('theme-endfield-round')
        /* The palette class must go with the stylesheet that gives it meaning:
           left behind it would be a class nothing defines, and it would make
           isWulingPalette() report a palette the page is no longer using. The
           stored preference is untouched, so re-enabling restores it. */
        document.body.classList.remove(PALETTE_CLASS)
        document.body.removeAttribute?.('data-endfield-glass')
      }
      // The plate is styled by the theme stylesheet just torn down — an orphaned
      // plate would sit there as an unstyled black-less div, so drop it too.
      destroyLoader()
      // Same reasoning for the contour sheet: its positioning and the background
      // transparency rules it depends on both live in that stylesheet, so leaving
      // it mounted would drop two raw canvases into the app's layout flow.
      contourTeardown()
      /* The output-scroll animator holds a transform on the transcript column. The
         theme does not style that column, so an orphaned offset would survive as a
         permanently shifted transcript — the one thing here that must be released
         even though it is invisible to the stylesheet. */
      destroyScrollAnim()
      /* The announcement plate is styled entirely by that stylesheet too, so an
         in-flight word would become an unstyled, un-positioned block of text in the
         document flow. Stop watching as well: with the theme off there is nothing to
         announce into. */
      thunderStopWatch()
      destroyThunder()
      /* The watermark must go with the stylesheet too, and it cannot wait for
         syncWatermarkVisibility(): with the sheet torn down its
         `opacity: var(--edge-wm-alpha)` computes invalid and falls back to 1,
         so an orphaned mark sits on the page as a fully opaque 9.5vw ENDFIELD.
         This path also runs when the switch is turned off from ANOTHER window
         (reconcileFromPrefs -> unmount), where nothing else removes the node —
         the local toggle path only looked covered because toggleTheme happened
         to call syncWatermarkVisibility() itself. */
      if (watermarkRaf !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(watermarkRaf)
      watermarkRaf = null
      if (watermarkEl !== null && watermarkEl.parentNode) watermarkEl.parentNode.removeChild(watermarkEl)
      watermarkEl = null
      watermarkHost = null
      // The attention poll belongs to the themed, audio-enabled page; leaving it
      // running would keep reporting confirmations for a theme that is off.
      stopAudioAttentionWatch()
      // Same for the balance capsule: its poll and its node both live inside the
      // themed page, and its styles were just torn down with the sheet above.
      destroyBalanceCapsule()
      /* LOCAL PATCH: And the shutdown button. This one is not cosmetic cleanup:
         the control ends a running process, so leaving it on an un-themed page
         would put a live "close DSH" button on a page whose theme is off — and a
         user who turned the theme off should not still be able to end the service
         from the leftover node. */
      shutdownButton.destroy()
      /* LOCAL PATCH: and the two background layers, whose geometry lives in the
         sheet just removed — an orphaned wrapper would sit there as a raw div
         carrying a background image. The body class goes with them. */
      bgImageTeardown()
      navBgImageTeardown()
      if (typeof document !== 'undefined' && document.body !== null) {
        document.body.classList.remove(BG_ACTIVE_CLASS)
      }
    }

    if (isEnabled()) {
      mount()
      syncWatermarkVisibility()
      // The contour sheet needs the stylesheet mount() just inserted, and the app
      // frame to exist; syncContour is a no-op until both are true and the
      // watermark's MutationObserver retries it as the app renders.
      syncContour()
      // Output-scroll animation: a no-op until the app renders a conversation
      // scrollport. The same observer retries it as the app mounts one, so opening
      // a session later needs no reload.
      syncScrollAnim()
      // Boot animation: only on a real page load, only when switched on, and only
      // after the stylesheet above exists (mount() inserted it).
      if (isLoaderOn()) runLoader()
      // Task announcements: subscribes only while switched on, and the first value
      // it reads is a baseline, so enabling mid-turn stays silent.
      syncThunder()
      // 需要你回应: starts only while the theme and the audio feature are both on.
      syncAudioAttentionWatch()
      // 顶部余额胶囊: mounts only while its own switch is on, and polls the
      // host-side balance route only while mounted.
      syncBalanceCapsule()
      /* LOCAL PATCH: the shutdown control is a surface like the watermark and
         the capsule, so it is synced here — AFTER mount() has put the sheet in,
         because it reads --edge-paper / --edge-accent from that sheet and would
         otherwise paint itself with the fallback literals for its first paint. */
      syncShutdownButton()
    }

    /* Live preference reconciler. The namespace scope subscription in the store
       block near the top of apply() calls this every time an authoritative
       section change lands (our own committed writes echo back, another window /
       device edits the same profile's settings document
       (<profile>/cordis.patch.yml on 0.1.7, <dshHome>/settings.yaml before it),
       or the host reverts a value). It mirrors the initial mount block above so a
       runtime change re-paints exactly the live surfaces it can: the master switch mounts/unmounts
       the token + stylesheet layers, then radius/palette/watermark/contour/
       thunder re-derive from the new value. The boot loader is deliberately not
       replayed here: it is a once-per-page-load plate, so a mid-session section
       change must not slam a startup animation over a running app. The one thing
       that DOES start it outside apply() is the first authoritative settle
       (onPrefsSettled) — that is the same page-load moment, not a later edit — plus
       the plate's own toggle and 预览 button. Every layer entry point is idempotent
       (mount() and unmount() guard on `mounted`, syncContour is a no-op until the
       frame and stylesheet exist), so repeated echoes are cheap and safe. */
    reconcileFromPrefs = () => {
      const enabledNext = isEnabled()
      const enabledNow = mounted
      if (enabledNext && !enabledNow) mount()
      else if (!enabledNext && enabledNow) unmount()
      if (enabledNext) {
        // These sync helpers read the store on each call, so no snapshot passing.
        syncRadiusMode()
        syncGlass()
        syncPaletteClass()
        syncWatermarkVisibility()
        syncContour()
        syncScrollAnim()
        syncThunder()
        // Same reason: it re-reads both switches and starts or stops the poll.
        syncAudioAttentionWatch()
        // Same reason: it re-reads its switch and mounts or removes the capsule.
        syncBalanceCapsule()
        /* LOCAL PATCH: And the shutdown control. Its absence here is why the
           switch could read "on" with no button on screen: a settings write
           lands in the DURABLE store, and this reconciler is the only thing
           that re-derives surfaces from it. Mounting the control in apply()
           covered page load and nothing else, so the one path a real user
           takes — flip the switch — never reached it. */
        syncShutdownButton()
      } else {
        // Switched off mid-session: the watcher must not keep polling a page the
        // theme no longer owns.
        stopAudioAttentionWatch()
        // And the capsule must not keep polling the balance route on an unthemed
        // page — destroyBalanceCapsule also clears its interval.
        destroyBalanceCapsule()
        // LOCAL PATCH: same reasoning for the shutdown control: a page whose
        // theme is off must not be carrying a live button that ends the process.
        // Routed through the same helper as the enabled branch so the two paths
        // cannot drift.
        syncShutdownButton()
      }
    }
