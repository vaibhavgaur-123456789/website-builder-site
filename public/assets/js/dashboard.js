/* Client dashboard: the signed-in user's projects, status, updates and account. */
(function () {
  "use strict";
  var Auth = window.VWS_AUTH;
  var F = window.VWS_FORMS;
  if (!Auth || !F) return;
  var $ = function (s, root) { return (root || document).querySelector(s); };
  var $$ = function (s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); };

  var STATUSES = ["Requirement Submitted", "Under Review", "Planning", "Design", "Development", "Testing", "Ready for Launch", "Live"];
  var NEXT = {
    "Requirement Submitted": "I'll review your requirements, usually within 24 hours, and contact you on your preferred channel.",
    "Under Review": "I'm going through your answers and may message you with a few questions. Next, you'll get a written scope, price and timeline.",
    "Planning": "We're agreeing the pages, features, price and timeline. Once you approve the quote and pay the advance, design begins.",
    "Design": "I'm designing your website. You'll get a preview to review and can request changes before development starts.",
    "Development": "Your approved design is being built into a working website, page by page.",
    "Testing": "I'm testing everything on phones, tablets and computers, including speed, forms and links.",
    "Ready for Launch": "Everything is ready. After your final approval and the remaining payment, your website goes live.",
    "Live": "Your website is live 🎉 Small fixes are covered for 30 days after launch. Message me any time for changes."
  };

  var loading = $("[data-dash-loading]");
  var dash = $("[data-dash]");
  var projects = [];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
    catch (e) { return ""; }
  }
  function statusIndex(s) { var i = STATUSES.indexOf(s); return i < 0 ? 0 : i; }
  function statusClass(s) { return "status-" + statusIndex(s); }

  if (!Auth.enabled) {
    loading.hidden = true;
    $("[data-auth-disabled]").hidden = false;
    return;
  }

  var hash = Auth.captureHash();
  // An expired or already-used email link: explain it on the login page instead of failing silently
  if (hash.type === "error") {
    window.location.replace("/login?reason=link");
    return;
  }

  function notice(text) {
    var box = $("[data-dash-notice]");
    box.querySelector("p").textContent = text;
    box.hidden = false;
  }

  /* ---------- Project list ---------- */
  function renderList() {
    var list = $("[data-project-list]");
    list.textContent = "";
    list.setAttribute("aria-busy", "false");
    $("[data-projects-empty]").hidden = projects.length > 0;
    projects.forEach(function (p) {
      var card = el("article", "dash-project");
      var top = el("div", "dash-project-top");
      top.appendChild(el("span", "status-pill " + statusClass(p.status), p.status));
      top.appendChild(el("span", "text-muted", "Sent " + fmtDate(p.created_at)));
      card.appendChild(top);
      card.appendChild(el("h3", null, p.name));
      card.appendChild(el("p", "text-muted", p.website_type + (p.budget ? " · " + p.budget : "")));
      var bar = el("div", "mini-progress");
      bar.setAttribute("aria-hidden", "true");
      var fill = el("span");
      fill.style.width = Math.round(((statusIndex(p.status) + 1) / STATUSES.length) * 100) + "%";
      bar.appendChild(fill);
      card.appendChild(bar);
      var btn = el("button", "btn btn-ghost btn-sm", "View details →");
      btn.type = "button";
      btn.setAttribute("aria-label", "View details for " + p.name);
      btn.addEventListener("click", function () { openProject(p.id, true); });
      card.appendChild(btn);
      list.appendChild(card);
    });
  }

  function loadProjects() {
    $("[data-projects-error]").hidden = true;
    return Auth.select("projects", "select=id,name,website_type,budget,timeline,status,requirements,created_at,updated_at&order=created_at.desc")
      .then(function (rows) { projects = rows || []; renderList(); })
      .catch(function (err) {
        if (err.code === "session_expired") return Auth.requireUser();
        $("[data-project-list]").textContent = "";
        $("[data-error-text]").textContent = err.message;
        $("[data-projects-error]").hidden = false;
      });
  }

  /* ---------- Project detail ---------- */
  function showView(name) {
    $$("[data-view]").forEach(function (v) { v.hidden = v.getAttribute("data-view") !== name; });
  }

  function renderRequirements(p) {
    var box = $("[data-requirements]");
    box.textContent = "";
    var groups = (p.requirements && p.requirements.groups) || [];
    if (!groups.length) { box.appendChild(el("p", "text-muted", "No details were saved with this project.")); return; }
    groups.forEach(function (g) {
      var block = el("section", "review-block");
      var head = el("div", "review-head");
      head.appendChild(el("h3", null, String(g.title || "")));
      block.appendChild(head);
      var dl = el("dl");
      (g.rows || []).forEach(function (r) {
        var row = el("div", "review-row");
        row.appendChild(el("dt", null, String(r.label || "")));
        var v = String(r.value || "");
        row.appendChild(el("dd", v ? null : "empty", v || "Not answered"));
        dl.appendChild(row);
      });
      block.appendChild(dl);
      box.appendChild(block);
    });
  }

  function renderTracker(status) {
    var t = $("[data-tracker]");
    t.textContent = "";
    var current = statusIndex(status);
    STATUSES.forEach(function (s, i) {
      var li = el("li", i < current ? "is-done" : i === current ? "is-current" : "", s);
      if (i === current) li.setAttribute("aria-current", "step");
      t.appendChild(li);
    });
  }

  function loadUpdates(projectId) {
    var list = $("[data-updates]");
    var empty = $("[data-updates-empty]");
    list.textContent = "";
    list.appendChild(el("li", "text-muted", "Loading updates…"));
    empty.hidden = true;
    Auth.select("project_updates", "select=message,created_at&project_id=eq." + encodeURIComponent(projectId) + "&order=created_at.desc")
      .then(function (rows) {
        list.textContent = "";
        (rows || []).forEach(function (u) {
          var li = el("li");
          li.appendChild(el("time", null, fmtDate(u.created_at)));
          li.appendChild(el("p", null, u.message));
          list.appendChild(li);
        });
        empty.hidden = !!(rows && rows.length);
      })
      .catch(function (err) {
        list.textContent = "";
        list.appendChild(el("li", "field-error", "Couldn't load updates. " + err.message));
      });
  }

  function openProject(id, push) {
    var p = projects.filter(function (x) { return x.id === id; })[0];
    if (!p) { showView("list"); return; }
    if (push) history.pushState({ project: id }, "", "/dashboard?project=" + encodeURIComponent(id));
    $("[data-detail-title]").textContent = p.name;
    $("[data-detail-meta]").textContent = p.website_type + " · Sent " + fmtDate(p.created_at) + " · Ref " + p.id.slice(0, 8).toUpperCase();
    var pill = $("[data-detail-status]");
    pill.textContent = p.status;
    pill.className = "status-pill " + statusClass(p.status);
    renderTracker(p.status);
    $("[data-next-step]").textContent = NEXT[p.status] || NEXT["Requirement Submitted"];
    renderRequirements(p);
    loadUpdates(p.id);
    var ref = "Ref " + p.id.slice(0, 8).toUpperCase();
    $("[data-wa-project]").href = F.whatsappLink("Hi Vaibhav, about my project \"" + p.name + "\" (" + ref + "): ");
    $("[data-mail-project]").href = "mailto:" + (window.VWS_CONFIG || {}).email + "?subject=" + encodeURIComponent("Project: " + p.name + " (" + ref + ")");
    showView("detail");
    window.scrollTo(0, 0);
    $("[data-detail-title]").focus({ preventScroll: true });
  }

  function routeFromUrl() {
    var id = new URLSearchParams(window.location.search).get("project");
    if (id) openProject(id, false); else showView("list");
  }

  $("[data-back-to-list]").addEventListener("click", function () {
    history.pushState({}, "", "/dashboard");
    showView("list");
  });
  window.addEventListener("popstate", routeFromUrl);
  $("[data-retry]").addEventListener("click", loadProjects);

  /* ---------- Account ---------- */
  $("[data-logout]").addEventListener("click", function (e) {
    F.setButtonLoading(e.currentTarget, true, "Logging out…");
    Auth.signOut().then(function () { window.location.replace("/login?signedout=1"); });
  });

  var pwForm = $("[data-password-form]");
  pwForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var pw = pwForm.elements.password, confirm = pwForm.elements.confirm, msg = $("[data-password-msg]");
    msg.textContent = "";
    var problem = !pw.value ? "Please enter a new password." : pw.value.length < 8 ? "Use at least 8 characters." : (!/[a-z]/i.test(pw.value) || !/\d/.test(pw.value)) ? "Use a mix of letters and numbers." : "";
    F.setFieldError(pw, problem);
    F.setFieldError(confirm, !problem && confirm.value !== pw.value ? "The passwords don't match." : "");
    if (problem) { pw.focus(); return; }
    if (confirm.value !== pw.value) { confirm.focus(); return; }
    var btn = pwForm.querySelector("[type=submit]");
    F.setButtonLoading(btn, true, "Saving…");
    Auth.updatePassword(pw.value).then(function () {
      F.setButtonLoading(btn, false);
      pwForm.reset();
      msg.className = "form-msg is-ok";
      msg.textContent = "Password updated ✓";
    }, function (err) {
      F.setButtonLoading(btn, false);
      msg.className = "form-msg is-error";
      msg.textContent = err.message;
    });
  });

  /* A project sent from the planner while the email was still unconfirmed is kept on this
     device; save it now that the user is signed in with that same email. */
  function savePendingProject(user) {
    var pending = null;
    try { pending = JSON.parse(localStorage.getItem("vws:pendingProject") || "null"); } catch (e) { pending = null; }
    if (!pending || !pending.row) return Promise.resolve();
    var sameUser = String(pending.email || "").toLowerCase() === String(user.email || "").toLowerCase();
    var fresh = Date.now() - (pending.savedAt || 0) < 7 * 24 * 3600 * 1000;
    if (!sameUser || !fresh) {
      if (!fresh) try { localStorage.removeItem("vws:pendingProject"); } catch (e) { /* ignore */ }
      return Promise.resolve();
    }
    return Auth.insert("projects", pending.row).then(function () {
      try { localStorage.removeItem("vws:pendingProject"); } catch (e) { /* ignore */ }
      notice("The project you sent earlier has been saved to your dashboard. 🎉");
    }, function () { /* keep it and try again next visit */ });
  }

  /* ---------- Start ---------- */
  Auth.requireUser().then(function (session) {
    var user = session.user || {};
    var first = (user.name || "").trim().split(" ")[0];
    $("[data-user-first]").textContent = first ? ", " + first : "";
    $$("[data-user-email]").forEach(function (n) { n.textContent = user.email || ""; });
    $("[data-user-name]").textContent = user.name || "Not set";
    loading.hidden = true;
    dash.hidden = false;
    if (hash.type === "signup") notice("Your email is confirmed and your account is ready. Welcome! 🎉");
    if (new URLSearchParams(window.location.search).get("password") === "updated") notice("Your password has been updated.");
    if (new URLSearchParams(window.location.search).get("sent")) notice("Your project has been sent. You can follow its progress here.");
    return savePendingProject(user).then(loadProjects).then(routeFromUrl);
  }).catch(function (err) {
    loading.hidden = true;
    $("[data-fatal-text]").textContent = err.message || Auth.friendly("generic");
    $("[data-dash-fatal]").hidden = false;
  });
})();
