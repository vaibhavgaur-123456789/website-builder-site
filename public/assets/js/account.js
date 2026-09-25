/* Login, sign up, forgot password and reset password pages. */
(function () {
  "use strict";
  var Auth = window.VWS_AUTH;
  var F = window.VWS_FORMS;
  var form = document.querySelector("[data-auth-form]");
  if (!Auth || !F || !form) return;

  var mode = form.getAttribute("data-auth-form");
  var status = document.querySelector("[data-auth-status]");
  var submitBtn = form.querySelector("[type=submit]");
  var startedAt = Date.now();
  var params = new URLSearchParams(window.location.search);
  var next = Auth.safeNext(params.get("next"));

  function show(kind, title, text) {
    status.hidden = !title;
    if (!title) return;
    status.className = "alert " + (kind === "success" ? "alert-success" : kind === "info" ? "alert-info" : "alert-error");
    status.textContent = "";
    var wrap = document.createElement("div");
    var h = document.createElement("h2");
    h.className = "h3";
    h.textContent = title;
    wrap.appendChild(h);
    if (text) { var p = document.createElement("p"); p.textContent = text; wrap.appendChild(p); }
    status.appendChild(wrap);
  }

  function fieldError(name, message) {
    var input = form.elements[name];
    if (input) F.setFieldError(input, message);
    return message;
  }

  function passwordProblem(pw) {
    if (!pw) return "Please choose a password.";
    if (pw.length < 8) return "Use at least 8 characters.";
    if (pw.length > 72) return "Please keep it under 72 characters.";
    if (!/[a-z]/i.test(pw) || !/\d/.test(pw)) return "Use a mix of letters and numbers.";
    return "";
  }

  // Show / hide password buttons
  form.querySelectorAll("[data-toggle-password]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var input = form.elements[btn.getAttribute("data-toggle-password")];
      var showing = input.type === "text";
      input.type = showing ? "password" : "text";
      btn.textContent = showing ? "Show" : "Hide";
      btn.setAttribute("aria-pressed", String(!showing));
    });
  });

  // Live password strength hint
  var meter = form.querySelector("[data-pw-hint]");
  if (meter && form.elements.password) {
    form.elements.password.addEventListener("input", function () {
      var pw = form.elements.password.value;
      var problem = passwordProblem(pw);
      meter.textContent = pw ? (problem || "Good password ✓") : "At least 8 characters, with letters and numbers.";
      meter.classList.toggle("is-ok", !!pw && !problem);
    });
  }

  // Clear errors while typing
  form.addEventListener("input", function (e) {
    if (e.target.getAttribute("aria-invalid") === "true") F.setFieldError(e.target, "");
  });

  /* ---------- Page states ---------- */
  if (!Auth.enabled) {
    form.hidden = true;
    var off = document.querySelector("[data-auth-disabled]");
    if (off) off.hidden = false;
    return;
  }

  var hashResult = Auth.captureHash();
  if (hashResult.type === "error") {
    show("error", "That link has expired or was already used", "Email links work once and expire after a while. Please request a new one.");
  }

  if (mode === "login") {
    if (params.get("reason") === "auth") show("info", "Please log in to continue", "Log in to see your projects and their progress.");
    if (params.get("signedout")) show("success", "You've been logged out", "See you soon!");
    if (params.get("reset") === "done") show("success", "Password updated", "You can now log in with your new password.");
    if (Auth.hasSession() && hashResult.type !== "error") {
      Auth.currentUser().then(function (s) { if (s) window.location.replace(next); }).catch(function () {});
    }
  }

  if (mode === "reset") {
    // The recovery link signs the user in; a valid session is all this page needs.
    Auth.getSession().then(function (s) {
      if (hashResult.type === "recovery" && s) return;
      if (!s) {
        form.hidden = true;
        if (hashResult.type !== "error") show("error", "This reset link isn't valid", "Please request a new password reset link.");
        document.querySelector("[data-reset-again]").hidden = false;
      }
    }).catch(function (err) { show("error", "Couldn't check your link", err.message); });
  }

  /* ---------- Submit ---------- */
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    show();
    var el = form.elements;
    var errors = [];
    if (el.name) errors.push(fieldError("name", F.validators.name(el.name.value)));
    if (el.email) errors.push(fieldError("email", F.validators.email(el.email.value)));
    if (el.password) {
      errors.push(fieldError("password", mode === "login" ? (el.password.value ? "" : "Please enter your password.") : passwordProblem(el.password.value)));
    }
    if (el.confirm) errors.push(fieldError("confirm", el.confirm.value === el.password.value ? "" : "The passwords don't match."));
    if (el.terms) {
      var termsErr = el.terms.checked ? "" : "Please accept the Terms and Privacy Policy.";
      document.querySelector("[data-terms-error]").textContent = termsErr;
      errors.push(termsErr);
    }
    var firstBad = form.querySelector("[aria-invalid=true]");
    if (errors.some(Boolean)) { if (firstBad) firstBad.focus(); return; }

    if (el._honey && el._honey.value) return; // bot
    if (mode !== "login" && Date.now() - startedAt < 2500) {
      show("error", "That was very quick", "Please check your details and press the button again.");
      startedAt = Date.now() - 1500;
      return;
    }

    F.setButtonLoading(submitBtn, true, mode === "login" ? "Logging in…" : "Please wait…");
    var email = el.email ? el.email.value.trim().toLowerCase() : "";
    var action;
    if (mode === "login") {
      action = Auth.signIn(email, el.password.value).then(function () { window.location.assign(next); return "redirect"; });
    } else if (mode === "signup") {
      action = Auth.signUp(email, el.password.value, el.name.value.trim(), "/dashboard").then(function (r) {
        if (r.session) { window.location.assign(next); return "redirect"; }
        form.hidden = true;
        show("success", "Check your email to confirm your account",
          "We've sent a confirmation link to " + email + ". Click it to activate your account, then you'll be taken to your dashboard. Can't find it? Check spam or promotions.");
      });
    } else if (mode === "forgot") {
      action = Auth.requestReset(email).then(function () {
        form.hidden = true;
        show("success", "Check your email", "If an account exists for " + email + ", you'll get a link to reset your password within a few minutes.");
      });
    } else if (mode === "reset") {
      action = Auth.updatePassword(el.password.value).then(function () {
        window.location.assign("/dashboard?password=updated");
        return "redirect";
      });
    }

    action.then(function (result) {
      if (result !== "redirect") F.setButtonLoading(submitBtn, false);
    }, function (err) {
      F.setButtonLoading(submitBtn, false);
      var titles = { invalid_credentials: "Couldn't log you in", user_already_exists: "Account already exists" };
      show("error", titles[err.code] || "Something went wrong", err.message);
      status.focus();
    });
  });
})();
