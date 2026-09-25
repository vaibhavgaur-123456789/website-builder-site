/* Shared form helpers (validation, spam checks, FormSubmit delivery)
   and the contact form. The planner reuses window.VWS_FORMS. */
(function () {
  "use strict";
  var CONFIG = window.VWS_CONFIG || {};
  var COOLDOWN_MS = 60 * 1000;
  var LAST_KEY = "vws:lastSubmit";

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  var validators = {
    name: function (v) {
      v = v.trim();
      if (!v) return "Please enter your name.";
      if (v.length < 2) return "That name looks too short.";
      if (v.length > 80) return "Please keep your name under 80 characters.";
      return "";
    },
    email: function (v) {
      v = v.trim();
      if (!v) return "Please enter your email address.";
      if (!EMAIL_RE.test(v) || v.length > 254) return "Please check your email address, e.g. name@example.com.";
      return "";
    },
    phone: function (v, required) {
      v = v.trim();
      if (!v) return required ? "Please add a phone or WhatsApp number." : "";
      var digits = v.replace(/\D/g, "");
      if (!/^[+\d\s()-]+$/.test(v) || digits.length < 7 || digits.length > 15) return "Please enter a valid phone number, e.g. +91 98765 43210.";
      return "";
    },
    message: function (v) {
      v = v.trim();
      if (!v) return "Please write a short message.";
      if (v.length < 15) return "Could you add a little more detail? A sentence or two is perfect.";
      if (v.length > 3000) return "Please keep your message under 3000 characters.";
      return "";
    }
  };

  function countLinks(text) {
    var m = String(text).match(/https?:\/\/|www\./gi);
    return m ? m.length : 0;
  }

  function readLast() {
    try { return parseInt(localStorage.getItem(LAST_KEY) || "0", 10); } catch (e) { return 0; }
  }
  function writeLast() {
    try { localStorage.setItem(LAST_KEY, String(Date.now())); } catch (e) { /* storage unavailable */ }
  }

  /* Layered, non-intrusive checks. Returns "" when OK, otherwise a friendly message.
     FormSubmit also discards any submission where `_honey` is filled (server side). */
  function spamCheck(opts) {
    if (opts.honey) return "blocked";
    if (Date.now() - opts.startedAt < (opts.minMs || 4000)) {
      return "That was very quick. Please check your details and press send again.";
    }
    if (countLinks(opts.text || "") > 3) {
      return "Please include no more than 3 links. You can share more once we're talking.";
    }
    if (Date.now() - readLast() < COOLDOWN_MS) {
      return "You've just sent a message. Please wait a minute before sending another.";
    }
    return "";
  }

  var MESSAGES = {
    offline: "You seem to be offline. Please check your internet connection and try again. Your answers are still here.",
    timeout: "The request took too long. Please try again in a moment. Nothing you typed has been lost.",
    failed: "Sorry, your message couldn't be sent right now. Please try again, or reach me directly on WhatsApp or email."
  };

  /* Sends a flat object of readable fields to FormSubmit. Resolves {ok, error}. */
  function deliver(fields) {
    if (!navigator.onLine) return Promise.resolve({ ok: false, error: MESSAGES.offline });
    var controller = "AbortController" in window ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, 20000);
    return fetch(CONFIG.formEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(fields),
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        clearTimeout(timer);
        var ok = res.ok && (data.success === true || data.success === "true");
        if (ok) writeLast();
        return { ok: ok, error: ok ? "" : MESSAGES.failed };
      });
    }).catch(function (err) {
      clearTimeout(timer);
      return { ok: false, error: err && err.name === "AbortError" ? MESSAGES.timeout : MESSAGES.failed };
    });
  }

  function setFieldError(field, message) {
    var wrap = field.closest(".field");
    if (!wrap) return;
    var slot = wrap.querySelector(".field-error");
    wrap.classList.toggle("has-error", !!message);
    field.setAttribute("aria-invalid", message ? "true" : "false");
    if (slot) slot.textContent = message || "";
  }

  function setButtonLoading(btn, loading, loadingText) {
    if (!btn) return;
    if (loading) {
      btn.dataset.label = btn.innerHTML;
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
      btn.textContent = "";
      var s = document.createElement("span");
      s.className = "spinner";
      s.setAttribute("aria-hidden", "true");
      btn.appendChild(s);
      btn.appendChild(document.createTextNode(" " + (loadingText || "Sending…")));
    } else {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
    }
  }

  window.VWS_FORMS = {
    validators: validators,
    spamCheck: spamCheck,
    deliver: deliver,
    setFieldError: setFieldError,
    setButtonLoading: setButtonLoading,
    messages: MESSAGES,
    whatsappLink: function (text) {
      return "https://wa.me/" + CONFIG.whatsapp + (text ? "?text=" + encodeURIComponent(text) : "");
    }
  };

  /* ---------- Contact form ---------- */
  var form = document.querySelector("[data-contact-form]");
  if (!form) return;

  var startedAt = Date.now();
  var status = form.querySelector("[data-form-status]");
  var submitBtn = form.querySelector("[type=submit]");
  var success = document.querySelector("[data-contact-success]");
  var fields = {
    name: form.elements.name,
    email: form.elements.email,
    phone: form.elements.phone,
    subject: form.elements.subject,
    message: form.elements.message
  };

  function validateField(key) {
    var input = fields[key];
    var msg = "";
    if (key === "subject") msg = input.value ? "" : "Please choose what this is about.";
    else msg = validators[key](input.value);
    setFieldError(input, msg);
    return msg;
  }

  Object.keys(fields).forEach(function (key) {
    var input = fields[key];
    input.addEventListener("blur", function () { if (input.value.trim()) validateField(key); });
    input.addEventListener("input", function () {
      if (input.getAttribute("aria-invalid") === "true") validateField(key);
    });
  });

  var counter = form.querySelector("[data-count-for=message]");
  if (counter) {
    fields.message.addEventListener("input", function () {
      counter.textContent = fields.message.value.length + " / 3000";
    });
  }

  function showStatus(message) {
    status.hidden = !message;
    var p = status.querySelector("p");
    if (p) p.textContent = message || "";
    if (message) status.focus();
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    showStatus("");
    var firstInvalid = null;
    Object.keys(fields).forEach(function (key) {
      if (validateField(key) && !firstInvalid) firstInvalid = fields[key];
    });
    if (firstInvalid) { firstInvalid.focus(); return; }

    var spam = spamCheck({
      honey: form.elements._honey.value,
      startedAt: startedAt,
      text: fields.message.value
    });
    if (spam === "blocked") { form.hidden = true; success.hidden = false; return; }
    if (spam) {
      // After a "too quick" warning, allow a retry two seconds later
      if (Date.now() - startedAt < 4000) startedAt = Date.now() - 2000;
      showStatus(spam);
      return;
    }

    setButtonLoading(submitBtn, true);
    // Also keep a copy in the database when Supabase is configured (best effort)
    var Auth = window.VWS_AUTH;
    var stored = Auth && Auth.enabled
      ? Auth.insert("contact_messages", {
          name: fields.name.value.trim(),
          email: fields.email.value.trim(),
          phone: fields.phone.value.trim() || null,
          subject: fields.subject.value,
          message: fields.message.value.trim()
        }, { anonymous: true }).then(function () { return true; }, function () { return false; })
      : Promise.resolve(false);
    var emailed = deliver({
      _subject: "Website enquiry: " + fields.subject.value + " (" + fields.name.value.trim() + ")",
      _template: "table",
      _captcha: "false",
      _honey: "",
      _autoresponse: "Thanks for contacting Vaibhav Web Studio. I've received your message and will reply personally, usually within 24 hours. — Vaibhav Gaur",
      Name: fields.name.value.trim(),
      email: fields.email.value.trim(),
      "Phone / WhatsApp": fields.phone.value.trim() || "Not given",
      Subject: fields.subject.value,
      Message: fields.message.value.trim(),
      "Sent from": "Contact page"
    });
    Promise.all([emailed, stored]).then(function (r) {
      var result = r[0];
      setButtonLoading(submitBtn, false);
      if (result.ok || r[1]) {
        writeLast();
        form.hidden = true;
        success.hidden = false;
        var h = success.querySelector("h2, h3");
        if (h) { h.setAttribute("tabindex", "-1"); h.focus(); }
      } else {
        showStatus(result.error);
      }
    });
  });
})();
