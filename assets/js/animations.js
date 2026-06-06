/* ══════════════════════════════════════════════════════════════
   animations.js — Page Transitions + Image Lightbox
   Hugo PaperMod  ·  Vanilla JS  ·  No external deps
   ══════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    /* ── Respect reduced-motion preference ─────────────────── */
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches) return;

    /* ── Theme helper ──────────────────────────────────────── */
    function isDarkMode() {
        return document.documentElement.classList.contains('dark');
    }

    /* ══════════════════════════════════════════════════════════
       SECTION 1: PAGE TRANSITIONS
       ══════════════════════════════════════════════════════════ */

    const supportsVT = typeof document.startViewTransition === 'function';
    let transitionInFlight = false;

    /**
     * Check if an anchor is an internal same-origin navigation link
     * (not hash-only, not external, not target=_blank, etc.)
     */
    function isInternalLink(anchor) {
        if (!anchor || !anchor.href) return false;
        // Must be same origin
        try {
            const url = new URL(anchor.href, location.origin);
            if (url.origin !== location.origin) return false;
            // Skip hash-only links
            if (url.pathname === location.pathname && url.hash) return false;
        } catch (e) {
            return false;
        }
        // Skip if opens in new tab/window
        if (anchor.target === '_blank' || anchor.target === '_new') return false;
        // Skip if has download attribute
        if (anchor.hasAttribute('download')) return false;
        // Skip mailto:, tel:, javascript: etc
        if (/^(mailto|tel|javascript):/.test(anchor.href)) return false;
        return true;
    }

    /**
     * Find the closest <a> ancestor of an event target
     */
    function findAnchorAncestor(el) {
        while (el && el !== document.body) {
            if (el.tagName === 'A') return el;
            el = el.parentElement;
        }
        return null;
    }

    /* ── View Transitions API path (Chrome 111+) ──────────── */
    function initViewTransitions() {
        document.addEventListener('click', function (e) {
            const anchor = findAnchorAncestor(e.target);
            if (!anchor || !isInternalLink(anchor)) return;

            // Don't intercept if modifier keys are held (open in new tab)
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

            e.preventDefault();

            // Rapid-click guard: skip if transition is already in flight
            if (transitionInFlight) return;
            transitionInFlight = true;

            const href = anchor.href;

            const transition = document.startViewTransition(function () {
                return new Promise(function (resolve) {
                    // Navigate by changing location; resolve to let the old snapshot be captured
                    window.location.href = href;
                    // The page will unload, but resolve to complete the transition setup
                    resolve();
                });
            });

            transition.finished.then(function () {
                transitionInFlight = false;
            }).catch(function () {
                transitionInFlight = false;
            });
        });
    }

    /* ── Fallback path (Firefox / older Safari) ───────────── */
    function initFallbackTransitions() {
        const main = document.querySelector('.page-transition-main');
        if (!main) return;

        // Mark body as JS-ready
        document.body.classList.add('js-ready');

        // Entrance animation on page load
        main.classList.add('page-enter');
        // Force reflow so the browser paints the initial state
        void main.offsetHeight;
        // Trigger the enter transition
        requestAnimationFrame(function () {
            main.classList.add('page-entered');
        });

        // Clean up classes after transition completes
        main.addEventListener('transitionend', function handler(e) {
            if (e.target === main && e.propertyName === 'opacity') {
                main.classList.remove('page-enter', 'page-entered');
                main.removeEventListener('transitionend', handler);
            }
        });

        // Intercept link clicks for exit animation
        document.addEventListener('click', function (e) {
            const anchor = findAnchorAncestor(e.target);
            if (!anchor || !isInternalLink(anchor)) return;
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

            e.preventDefault();

            if (transitionInFlight) return;
            transitionInFlight = true;

            const href = anchor.href;

            // Trigger exit animation
            main.classList.add('page-exit');

            // Navigate after exit animation completes
            setTimeout(function () {
                window.location.href = href;
            }, 200); // matches the 200ms exit duration
        });
    }


    /* ══════════════════════════════════════════════════════════
       SECTION 2: EDUCATION TIMELINE STAGGER
       ══════════════════════════════════════════════════════════ */

    function initTimelineStagger() {
        const timelineItems = document.querySelectorAll('.timeline-item');
        if (!timelineItems.length) return;

        // Determine the right delay: if using View Transitions, the page enter
        // animation takes ~300ms; for fallback it's also ~300ms.
        const baseDelay = 320; // ms after page becomes visible
        const staggerInterval = 80; // ms between each item

        // Mark items as ready (hidden)
        timelineItems.forEach(function (item) {
            item.classList.add('timeline-stagger-ready');
        });

        // Stagger them in after the page transition completes
        setTimeout(function () {
            timelineItems.forEach(function (item, index) {
                item.style.setProperty('--stagger-delay', (index * staggerInterval) + 'ms');
                item.classList.add('timeline-stagger-in');
            });
        }, baseDelay);
    }


    /* ══════════════════════════════════════════════════════════
       SECTION 3: IMAGE LIGHTBOX (FLIP animation)
       ══════════════════════════════════════════════════════════ */

    let lightboxOpen = false;
    let lightboxScrim = null;
    let savedScrollbarWidth = 0;

    /**
     * Determine which images are lightbox-eligible.
     * Target: architecture diagram images in project cards (.card-image img),
     *         entry cover images (.entry-cover img), post content images
     * Exclude: profile images, logos, social icons, card-icon images,
     *          and any img that is a direct child of <a>
     */
    function getLightboxImages() {
        const candidates = document.querySelectorAll(
            '.card-image img, .entry-cover img, .post-content img'
        );
        const eligible = [];

        candidates.forEach(function (img) {
            // Exclude images that are direct children of <a> tags
            if (img.parentElement && img.parentElement.tagName === 'A') return;
            // Exclude profile images
            if (img.closest('.profile-image-wrapper')) return;
            // Exclude logo images
            if (img.closest('.logo')) return;
            // Exclude social icon images
            if (img.closest('.social-icons')) return;
            // Exclude card-icon overlay images
            if (img.closest('.card-icon')) return;

            eligible.push(img);
        });

        return eligible;
    }

    /**
     * Measure scrollbar width
     */
    function getScrollbarWidth() {
        return window.innerWidth - document.documentElement.clientWidth;
    }

    /**
     * Lock scroll and compensate for scrollbar
     */
    function lockScroll() {
        savedScrollbarWidth = getScrollbarWidth();
        document.body.classList.add('lightbox-open');
        document.body.style.paddingRight = savedScrollbarWidth + 'px';
    }

    /**
     * Unlock scroll
     */
    function unlockScroll() {
        document.body.classList.remove('lightbox-open');
        document.body.style.paddingRight = '';
    }

    /**
     * Open lightbox with FLIP animation
     */
    function openLightbox(sourceImg) {
        if (lightboxOpen) return;
        lightboxOpen = true;

        // 1. Capture source bounding rect
        const sourceRect = sourceImg.getBoundingClientRect();

        // 2. Lock scroll
        lockScroll();

        // 3. Create scrim
        lightboxScrim = document.createElement('div');
        lightboxScrim.className = 'lightbox-scrim';
        lightboxScrim.setAttribute('role', 'dialog');
        lightboxScrim.setAttribute('aria-modal', 'true');
        lightboxScrim.setAttribute('aria-label', 'Image lightbox');

        // 4. Create close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'lightbox-close';
        closeBtn.setAttribute('aria-label', 'Close lightbox');
        lightboxScrim.appendChild(closeBtn);

        // 5. Create lightbox image
        const lightboxImg = document.createElement('img');
        lightboxImg.className = 'lightbox-image';
        lightboxImg.src = sourceImg.src;
        lightboxImg.alt = sourceImg.alt || '';
        // Remove the box-shadow initially (it settles after animation)
        lightboxImg.style.boxShadow = 'none';
        lightboxScrim.appendChild(lightboxImg);

        // 6. Create caption if alt text exists
        let captionEl = null;
        if (sourceImg.alt && sourceImg.alt.trim()) {
            captionEl = document.createElement('div');
            captionEl.className = 'lightbox-caption';
            captionEl.textContent = sourceImg.alt;
            lightboxScrim.appendChild(captionEl);
        }

        // 7. Add to DOM
        document.body.appendChild(lightboxScrim);

        // 8. Force reflow, then show scrim
        void lightboxScrim.offsetHeight;
        lightboxScrim.classList.add('lightbox-visible');

        // 9. Wait for image to load (it may be cached), then FLIP
        function runFlip() {
            // Calculate final centered position
            const viewW = window.innerWidth - savedScrollbarWidth;
            const viewH = window.innerHeight;
            const maxW = viewW * 0.88;
            const maxH = viewH * 0.82;

            const naturalW = lightboxImg.naturalWidth || sourceRect.width;
            const naturalH = lightboxImg.naturalHeight || sourceRect.height;

            // Fit within max bounds while maintaining aspect ratio
            let finalW, finalH;
            const aspectRatio = naturalW / naturalH;

            if (naturalW / maxW > naturalH / maxH) {
                finalW = Math.min(naturalW, maxW);
                finalH = finalW / aspectRatio;
            } else {
                finalH = Math.min(naturalH, maxH);
                finalW = finalH * aspectRatio;
            }

            // Final position (centered)
            const finalX = (viewW - finalW) / 2;
            const finalY = (viewH - finalH) / 2;

            // Set the image to its final size
            lightboxImg.style.width = finalW + 'px';
            lightboxImg.style.height = finalH + 'px';
            lightboxImg.style.position = 'fixed';
            lightboxImg.style.left = finalX + 'px';
            lightboxImg.style.top = finalY + 'px';

            // Calculate FLIP transform: from source rect to final rect
            const scaleX = sourceRect.width / finalW;
            const scaleY = sourceRect.height / finalH;
            const translateX = sourceRect.left - finalX;
            const translateY = sourceRect.top - finalY;

            // Animate FROM source TO final using Web Animations API
            const flipAnim = lightboxImg.animate([
                {
                    transformOrigin: 'top left',
                    transform: 'translate(' + translateX + 'px, ' + translateY + 'px) scale(' + scaleX + ', ' + scaleY + ')',
                    borderRadius: '4px'
                },
                {
                    transformOrigin: 'top left',
                    transform: 'translate(0, 0) scale(1, 1)',
                    borderRadius: '6px'
                }
            ], {
                duration: 320,
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                fill: 'forwards'
            });

            flipAnim.onfinish = function () {
                // Settle the box-shadow
                lightboxImg.style.boxShadow = '';

                // Show caption with delay
                if (captionEl) {
                    requestAnimationFrame(function () {
                        captionEl.classList.add('lightbox-caption-visible');
                    });
                }
            };
        }

        if (lightboxImg.complete && lightboxImg.naturalWidth > 0) {
            runFlip();
        } else {
            lightboxImg.onload = runFlip;
        }

        // 10. Close handlers
        function closeHandler(e) {
            // Only close if clicking scrim (not the image itself)
            if (e.target === lightboxImg) return;
            closeLightbox(sourceImg);
        }

        function escHandler(e) {
            if (e.key === 'Escape') {
                closeLightbox(sourceImg);
            }
        }

        lightboxScrim.addEventListener('click', closeHandler);
        closeBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            closeLightbox(sourceImg);
        });
        document.addEventListener('keydown', escHandler);

        // Store references for cleanup
        lightboxScrim._closeHandler = closeHandler;
        lightboxScrim._escHandler = escHandler;
        lightboxScrim._sourceImg = sourceImg;
    }

    /**
     * Close lightbox with reverse FLIP animation
     */
    function closeLightbox(sourceImg) {
        if (!lightboxOpen || !lightboxScrim) return;
        lightboxOpen = false;

        const lightboxImg = lightboxScrim.querySelector('.lightbox-image');
        const captionEl = lightboxScrim.querySelector('.lightbox-caption');

        // Hide caption immediately
        if (captionEl) {
            captionEl.classList.remove('lightbox-caption-visible');
        }

        // Get current image position
        const currentRect = lightboxImg.getBoundingClientRect();

        // Get the source image's current bounding rect (it may have shifted due to scroll lock)
        const sourceRect = sourceImg.getBoundingClientRect();

        // Calculate reverse FLIP
        const scaleX = sourceRect.width / currentRect.width;
        const scaleY = sourceRect.height / currentRect.height;
        const translateX = sourceRect.left - currentRect.left;
        const translateY = sourceRect.top - currentRect.top;

        // Animate back to source position
        const reverseAnim = lightboxImg.animate([
            {
                transformOrigin: 'top left',
                transform: 'translate(0, 0) scale(1, 1)',
                borderRadius: '6px'
            },
            {
                transformOrigin: 'top left',
                transform: 'translate(' + translateX + 'px, ' + translateY + 'px) scale(' + scaleX + ', ' + scaleY + ')',
                borderRadius: '4px'
            }
        ], {
            duration: 260,
            easing: 'ease-in',
            fill: 'forwards'
        });

        // Fade out scrim simultaneously
        lightboxScrim.classList.remove('lightbox-visible');
        lightboxScrim.classList.add('lightbox-closing');

        // Remove DOM after animation
        reverseAnim.onfinish = function () {
            cleanup();
        };

        // Safety timeout in case animation doesn't fire
        setTimeout(function () {
            cleanup();
        }, 300);

        function cleanup() {
            if (!lightboxScrim) return;

            // Remove event listeners
            document.removeEventListener('keydown', lightboxScrim._escHandler);

            // Remove from DOM
            if (lightboxScrim.parentNode) {
                lightboxScrim.parentNode.removeChild(lightboxScrim);
            }
            lightboxScrim = null;

            // Unlock scroll
            unlockScroll();
        }
    }

    /**
     * Initialize lightbox on eligible images
     */
    function initLightbox() {
        const images = getLightboxImages();

        images.forEach(function (img) {
            img.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                openLightbox(img);
            });
        });
    }


    /* ══════════════════════════════════════════════════════════
       INITIALIZATION
       ══════════════════════════════════════════════════════════ */

    function init() {
        // Page transitions
        if (supportsVT) {
            initViewTransitions();
        } else {
            initFallbackTransitions();
        }

        // Education timeline stagger (only on pages with timeline items)
        initTimelineStagger();

        // Image lightbox
        initLightbox();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
