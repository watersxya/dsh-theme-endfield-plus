    /* ================= LOCAL PATCH (not upstream): 自定义背景图 =================
       Two independent image layers: a global full-page sheet mounted inside the
       app frame and an optional overlay covering only the navigation column.
       The feature exists only in this fork (upstream has no background-image at
       all), and it lives in its own fragment precisely so it can be dropped
       without a merge conflict. Every row here carries the LOCAL PATCH marker.

       Wiring contract:
         - the nine prefs fields are declared in 10-prefs-store.js and mirror the
           host FIELD_DEFAULTS (src/host/10-identity.js);
         - the two reconcilers are mounted on the watermark MutationObserver
           (16-watermark.js) through bgImageSyncHook / navBgImageSyncHook;
           the assignments at the bottom of this fragment are safe because the
           fragment order is 16 -> 17, so those `let` bindings already exist;
         - findAppFrame is the frame locator defined in 20-contour.js, further
           down the bundle — the same late-const seam that 31-thunder.js and
           40-balance-pricing.js already ride: the observers only call the hooks
           on DOM-change passes, by which time every const in apply() has settled;
         - the geometry CSS lives at the bottom of the theme sheet
           (src/styles/theme.css), after every upstream rule.
     */
    const BG_IMAGE_ON_KEY = 'dsh-theme-endfield-bg-image-on'
    const BG_IMAGE_URL_KEY = 'dsh-theme-endfield-bg-image-url'
    const BG_IMAGE_MASK_KEY = 'dsh-theme-endfield-bg-image-mask'
    const BG_IMAGE_FIT_KEY = 'dsh-theme-endfield-bg-image-fit'
    const BG_IMAGE_MASK_DEFAULT = 55
    /* Stable body class while the global full-page image is active. This is what
       owns the background transparency (especially the sidebar) instead of
       relying only on transient DOM/:has() state, so the nav does not flicker
       or only reveal the image on hover. */
    const BG_ACTIVE_CLASS = 'theme-endfield-bg-on'
    const BG_IMAGE_MASK_MIN = 0
    const BG_IMAGE_MASK_MAX = 90
    const BG_IMAGE_FIT_OPTIONS = ['cover', 'contain']
    // Default OFF (=== '1'): a full-bleed image layer is opt-in decoration.
    const isBgImageOn = () => prefsGet(BG_IMAGE_ON_KEY) === '1'
    const readBgImageUrl = () => {
      const raw = prefsGet(BG_IMAGE_URL_KEY)
      return typeof raw === 'string' ? raw.trim() : ''
    }
    const readBgImageMask = () => {
      const raw = prefsGet(BG_IMAGE_MASK_KEY)
      if (raw === '') return BG_IMAGE_MASK_DEFAULT
      const value = Number(raw)
      if (!Number.isFinite(value)) return BG_IMAGE_MASK_DEFAULT
      return Math.min(BG_IMAGE_MASK_MAX, Math.max(BG_IMAGE_MASK_MIN, Math.round(value)))
    }
    const readBgImageFit = () => {
      const raw = prefsGet(BG_IMAGE_FIT_KEY)
      return BG_IMAGE_FIT_OPTIONS.indexOf(raw) !== -1 ? raw : 'cover'
    }
    const syncBgImageActiveClass = () => {
      if (typeof document === 'undefined' || document.body === null) return
      const on = isEnabled() && isBgImageOn() && readBgImageUrl() !== ''
      if (on) document.body.classList.add(BG_ACTIVE_CLASS)
      else document.body.classList.remove(BG_ACTIVE_CLASS)
      /* Also set the transparency inline on the concrete layout containers.
         This keeps the sidebar and other columns transparent even if a hover /
         quietBars / class-toggling rule would otherwise re-opaque them. */
      const transparentSelectors = [
        '[class$="_sidebarCol"]',
        '[class$="_sidebarCol"] [class$="_root"]',
        '[class$="_centerCol"]',
        '[class$="_rightbarCol"]',
        '[class$="_detailsCol"]',
        '[class$="_detailsCol"] [class$="_root"]',
        '[data-phase]',
      ]
      for (const selector of transparentSelectors) {
        document.querySelectorAll(selector).forEach((el) => {
          if (on) el.style.backgroundColor = 'transparent'
          else el.style.backgroundColor = ''
        })
      }
    }

    /* ---------- navigation overlay background image (independent layer) ------
       An optional second image layer that covers only the left navigation /
       sidebar column (sidebarCol). When disabled it is not mounted at all, so the
       global full-page image shows through the (already transparent) sidebar.
       When enabled it paints above the global image inside the sidebar and has
       its own opacity + scrim controls so the "New Session / Settings" labels
       remain readable. */
    const NAV_BG_IMAGE_ON_KEY = 'dsh-theme-endfield-nav-bg-image-on'
    const NAV_BG_IMAGE_URL_KEY = 'dsh-theme-endfield-nav-bg-image-url'
    const NAV_BG_IMAGE_OPACITY_KEY = 'dsh-theme-endfield-nav-bg-image-opacity'
    const NAV_BG_IMAGE_MASK_KEY = 'dsh-theme-endfield-nav-bg-image-mask'
    const NAV_BG_IMAGE_FIT_KEY = 'dsh-theme-endfield-nav-bg-image-fit'
    const NAV_BG_IMAGE_OPACITY_DEFAULT = 100
    const NAV_BG_IMAGE_OPACITY_MIN = 0
    const NAV_BG_IMAGE_OPACITY_MAX = 100
    const NAV_BG_IMAGE_MASK_DEFAULT = 65
    const NAV_BG_IMAGE_MASK_MIN = 0
    const NAV_BG_IMAGE_MASK_MAX = 90
    const NAV_BG_IMAGE_FIT_OPTIONS = ['cover', 'contain']
    const isNavBgImageOn = () => prefsGet(NAV_BG_IMAGE_ON_KEY) === '1'
    const readNavBgImageUrl = () => {
      const raw = prefsGet(NAV_BG_IMAGE_URL_KEY)
      return typeof raw === 'string' ? raw.trim() : ''
    }
    const readNavBgImageOpacity = () => {
      const raw = prefsGet(NAV_BG_IMAGE_OPACITY_KEY)
      if (raw === '') return NAV_BG_IMAGE_OPACITY_DEFAULT
      const value = Number(raw)
      if (!Number.isFinite(value)) return NAV_BG_IMAGE_OPACITY_DEFAULT
      return Math.min(NAV_BG_IMAGE_OPACITY_MAX, Math.max(NAV_BG_IMAGE_OPACITY_MIN, Math.round(value)))
    }
    const readNavBgImageMask = () => {
      const raw = prefsGet(NAV_BG_IMAGE_MASK_KEY)
      if (raw === '') return NAV_BG_IMAGE_MASK_DEFAULT
      const value = Number(raw)
      if (!Number.isFinite(value)) return NAV_BG_IMAGE_MASK_DEFAULT
      return Math.min(NAV_BG_IMAGE_MASK_MAX, Math.max(NAV_BG_IMAGE_MASK_MIN, Math.round(value)))
    }
    const readNavBgImageFit = () => {
      const raw = prefsGet(NAV_BG_IMAGE_FIT_KEY)
      return NAV_BG_IMAGE_FIT_OPTIONS.indexOf(raw) !== -1 ? raw : 'cover'
    }

    let bgImageWrap = null
    let bgImageHost = null

    const bgImageTeardown = () => {
      if (bgImageWrap !== null && bgImageWrap.parentNode) bgImageWrap.parentNode.removeChild(bgImageWrap)
      bgImageWrap = null
      bgImageHost = null
    }
    /* CSSOM is used for the dynamic parts (image URL, fit, mask) so the stylesheet
       only has to define the geometry and the mount-time guards. The wrapper carries
       no text, so the same translation-proofing as the wordmark is unnecessary; it
       is aria-hidden because it is decorative. */
    const applyBgImageStyles = () => {
      if (bgImageWrap === null) return
      const url = readBgImageUrl()
      const mask = readBgImageMask()
      const fit = readBgImageFit()
      /* Only touch the DOM when a value actually changed: this runs on every page
         mutation through the observer, so the common path must be a string compare,
         not a layout/style write. */
      const nextImage = url !== '' ? `url("${url}")` : 'none'
      if (bgImageWrap.style.backgroundImage !== nextImage) bgImageWrap.style.backgroundImage = nextImage
      const nextMask = mask + '%'
      if (bgImageWrap.style.getPropertyValue('--edge-bg-mask') !== nextMask) bgImageWrap.style.setProperty('--edge-bg-mask', nextMask)
      if (bgImageWrap.style.getPropertyValue('--edge-bg-fit') !== fit) bgImageWrap.style.setProperty('--edge-bg-fit', fit)
    }

    /** Build/refresh/remove the global (whole-page) background layer. */
    const syncBgImage = () => {
      syncBgImageActiveClass()
      const on = isEnabled() && isBgImageOn() && readBgImageUrl() !== ''
      if (!on) {
        if (bgImageWrap !== null) bgImageTeardown()
        return
      }
      const attached = bgImageWrap !== null && bgImageHost !== null
        && bgImageWrap.parentNode === bgImageHost && bgImageHost.isConnected
      if (attached) {
        applyBgImageStyles()
        return
      }
      const host = findAppFrame()
      if (host === null) {
        // Frame not rendered yet; a later mutation will retry through the hooks.
        if (bgImageWrap !== null) bgImageTeardown()
        return
      }
      if (bgImageWrap !== null && bgImageHost !== host) bgImageTeardown()
      if (bgImageWrap === null) {
        const wrap = document.createElement('div')
        wrap.setAttribute('data-endfield-bg-image', '')
        wrap.setAttribute('aria-hidden', 'true')
        /* First child keeps the image at the bottom of the frame's paint order;
           if the contour sheet is also mounted, the image sits beneath the
           contour lines rather than covering them. */
        if (host.firstChild) host.insertBefore(wrap, host.firstChild)
        else host.appendChild(wrap)
        bgImageWrap = wrap
        bgImageHost = host
      }
      applyBgImageStyles()
    }


    let navBgImageWrap = null
    let navBgImageHost = null

    const findNavBgImageHost = () => {
      if (typeof document === 'undefined') return null
      return document.querySelector('[class$="_sidebarCol"]') || document.querySelector('[class*="_sidebarCol"]')
    }

    const navBgImageTeardown = () => {
      if (navBgImageWrap !== null && navBgImageWrap.parentNode) navBgImageWrap.parentNode.removeChild(navBgImageWrap)
      navBgImageWrap = null
      navBgImageHost = null
    }

    const applyNavBgImageStyles = () => {
      if (navBgImageWrap === null) return
      const url = readNavBgImageUrl()
      const opacity = readNavBgImageOpacity()
      const mask = readNavBgImageMask()
      const fit = readNavBgImageFit()
      const nextImage = url !== '' ? `url("${url}")` : 'none'
      if (navBgImageWrap.style.backgroundImage !== nextImage) navBgImageWrap.style.backgroundImage = nextImage
      const nextOpacity = String(opacity / 100)
      if (navBgImageWrap.style.opacity !== nextOpacity) navBgImageWrap.style.opacity = nextOpacity
      const nextMask = mask + '%'
      if (navBgImageWrap.style.getPropertyValue('--edge-nav-mask') !== nextMask) navBgImageWrap.style.setProperty('--edge-nav-mask', nextMask)
      if (navBgImageWrap.style.getPropertyValue('--edge-nav-fit') !== fit) navBgImageWrap.style.setProperty('--edge-nav-fit', fit)
    }

    /** Build/refresh/remove the navigation overlay background layer. */
    const syncNavBgImage = () => {
      const on = isEnabled() && isNavBgImageOn() && readNavBgImageUrl() !== ''
      if (!on) {
        if (navBgImageWrap !== null) navBgImageTeardown()
        return
      }
      const attached = navBgImageWrap !== null && navBgImageHost !== null
        && navBgImageWrap.parentNode === navBgImageHost && navBgImageHost.isConnected
      if (attached) {
        applyNavBgImageStyles()
        return
      }
      const host = findNavBgImageHost()
      if (host === null) {
        if (navBgImageWrap !== null) navBgImageTeardown()
        return
      }
      if (navBgImageWrap !== null && navBgImageHost !== host) navBgImageTeardown()
      if (navBgImageWrap === null) {
        const wrap = document.createElement('div')
        wrap.setAttribute('data-endfield-nav-bg-image', '')
        wrap.setAttribute('aria-hidden', 'true')
        if (host.firstChild) host.insertBefore(wrap, host.firstChild)
        else host.appendChild(wrap)
        navBgImageWrap = wrap
        navBgImageHost = host
      }
      applyNavBgImageStyles()
    }



    /* Install the two reconcilers on the observer declared in 16-watermark.js.
       This fragment runs after that one, so the bindings exist and no TDZ is
       involved (see the wiring note above). */
    bgImageSyncHook = syncBgImage
    navBgImageSyncHook = syncNavBgImage
