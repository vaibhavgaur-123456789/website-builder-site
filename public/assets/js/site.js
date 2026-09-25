/* Site-wide behaviour: mobile menu, header state, footer year, scroll reveal. */
(function () {
  "use strict";
  document.documentElement.classList.add("js");

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    // Header border once the page scrolls
    var header = document.querySelector("[data-header]");
    if (header) {
      var onScroll = function () { header.classList.toggle("is-scrolled", window.scrollY > 8); };
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
    }

    // Mobile menu
    var toggle = document.querySelector("[data-menu-toggle]");
    var menu = document.querySelector("[data-mobile-menu]");
    if (toggle && menu) {
      var label = toggle.querySelector("[data-menu-label]");
      var setOpen = function (open) {
        toggle.setAttribute("aria-expanded", String(open));
        if (label) label.textContent = open ? "Close" : "Menu";
        menu.hidden = !open;
        document.body.classList.toggle("menu-open", open);
        if (open) {
          var first = menu.querySelector("a");
          if (first) first.focus();
        }
      };
      toggle.addEventListener("click", function () {
        setOpen(toggle.getAttribute("aria-expanded") !== "true");
      });
      menu.addEventListener("click", function (e) {
        if (e.target.closest("a")) setOpen(false);
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && !menu.hidden) { setOpen(false); toggle.focus(); }
        // Keep keyboard focus inside the open menu
        if (e.key === "Tab" && !menu.hidden) {
          var focusables = [toggle].concat(Array.prototype.slice.call(menu.querySelectorAll("a, button")));
          var firstEl = focusables[0], lastEl = focusables[focusables.length - 1];
          if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
          else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
        }
      });
      window.matchMedia("(min-width: 1080px)").addEventListener("change", function (mq) {
        if (mq.matches) setOpen(false);
      });
    }

    // Signed-in visitors see a Dashboard link instead of "Log in" (no network call needed)
    var signedIn = false;
    try { signedIn = !!localStorage.getItem("vws:session"); } catch (e) { signedIn = false; }
    if (signedIn) {
      document.querySelectorAll("[data-account-link]").forEach(function (a) {
        a.href = "/dashboard";
        a.textContent = "My dashboard";
      });
    }

    document.querySelectorAll("[data-year]").forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });

    // Reveal below-the-fold content once
    var items = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    items.forEach(function (el) { io.observe(el); });
  });
})();
