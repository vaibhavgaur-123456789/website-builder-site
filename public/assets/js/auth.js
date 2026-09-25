/* Minimal Supabase client (Auth + REST) using fetch, no SDK.
   Passwords are only ever sent to Supabase over HTTPS; Supabase stores them hashed (bcrypt).
   The session (short-lived access token + rotating refresh token) is kept in localStorage,
   which the site's strict Content-Security-Policy protects from injected scripts. */
(function () {
  "use strict";
  var CONFIG = window.VWS_CONFIG || {};
  var BASE = (CONFIG.supabaseUrl || "").replace(/\/+$/, "");
  var KEY = CONFIG.supabaseAnonKey || "";
  var SESSION_KEY = "vws:session";
  var enabled = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(BASE) && KEY.length > 20;

  var FRIENDLY = {
    invalid_credentials: "That email and password don't match. Please try again.",
    email_not_confirmed: "Please confirm your email first. Check your inbox for the confirmation link.",
    user_already_exists: "An account with this email already exists. Try logging in instead.",
    weak_password: "Please choose a stronger password: at least 8 characters with letters and numbers.",
    over_email_send_rate_limit: "Too many emails were sent recently. Please wait a few minutes and try again.",
    over_request_rate_limit: "Too many attempts. Please wait a minute and try again.",
    same_password: "Your new password must be different from the old one.",
    session_expired: "Your session has expired. Please log in again.",
    rate_limit: "You've sent several projects today. Please wait a while or contact me directly.",
    offline: "You seem to be offline. Please check your connection and try again.",
    not_configured: "Accounts aren't switched on yet. You can still send your project without an account.",
    generic: "Something went wrong on our side. Please try again in a moment."
  };

  function friendly(code) { return FRIENDLY[code] || FRIENDLY.generic; }

  /* Map Supabase error payloads (several shapes across versions) to our codes */
  function errorCode(status, data) {
    data = data || {};
    var code = data.error_code || data.code || data.error || "";
    var msg = String(data.msg || data.error_description || data.message || "").toLowerCase();
    if (code === "invalid_credentials" || code === "invalid_grant" || msg.indexOf("invalid login") > -1) return "invalid_credentials";
    if (code === "email_not_confirmed" || msg.indexOf("not confirmed") > -1) return "email_not_confirmed";
    if (code === "user_already_exists" || msg.indexOf("already registered") > -1) return "user_already_exists";
    if (code === "weak_password" || msg.indexOf("password should") > -1) return "weak_password";
    if (code === "same_password" || msg.indexOf("different from the old") > -1) return "same_password";
    if (code === "over_email_send_rate_limit" || msg.indexOf("email rate") > -1) return "over_email_send_rate_limit";
    if (msg.indexOf("rate_limit") > -1) return "rate_limit";
    if (status === 429) return "over_request_rate_limit";
    if (status === 401 || status === 403) return "session_expired";
    return "generic";
  }

  function AuthError(code) { this.code = code; this.message = friendly(code); }

  /* ---------- Session storage ---------- */
  function readSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (e) { return null; }
  }
  function writeSession(s) {
    if (!s || !s.access_token) return null;
    var session = {
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expires_at: s.expires_at ? s.expires_at * 1000 : Date.now() + (parseInt(s.expires_in, 10) || 3600) * 1000,
      user: s.user ? { id: s.user.id, email: s.user.email, name: (s.user.user_metadata || {}).full_name || "" } : null
    };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) { /* storage unavailable */ }
    return session;
  }
  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  }

  /* ---------- HTTP ---------- */
  function request(path, opts) {
    opts = opts || {};
    if (!enabled) return Promise.reject(new AuthError("not_configured"));
    if (!navigator.onLine) return Promise.reject(new AuthError("offline"));
    var headers = { "apikey": KEY, "Content-Type": "application/json" };
    if (opts.token) headers.Authorization = "Bearer " + opts.token;
    if (opts.prefer) headers.Prefer = opts.prefer;
    return fetch(BASE + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        if (!res.ok) throw new AuthError(errorCode(res.status, data));
        return data;
      });
    }, function () { throw new AuthError(navigator.onLine ? "generic" : "offline"); });
  }

  var refreshing = null;
  /* Returns a valid session, refreshing the access token if it is about to expire. */
  function getSession() {
    var s = readSession();
    if (!s || !enabled) return Promise.resolve(null);
    if (s.expires_at - Date.now() > 60000) return Promise.resolve(s);
    if (!refreshing) {
      refreshing = request("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: s.refresh_token } })
        .then(writeSession, function (err) {
          if (err.code !== "offline") clearSession();
          return null;
        })
        .then(function (res) { refreshing = null; return res; });
    }
    return refreshing;
  }

  function siteUrl(path) { return window.location.origin + path; }

  /* Only allow same-site relative paths as post-login destinations (no open redirects). */
  function safeNext(value, fallback) {
    return typeof value === "string" && /^\/(?!\/)[a-z0-9\-/?=&]*$/i.test(value) ? value : (fallback || "/dashboard");
  }

  /* After clicking an email link, Supabase returns tokens (or an error) in the URL hash. */
  function captureHash() {
    var hash = window.location.hash.replace(/^#/, "");
    if (!hash || (hash.indexOf("access_token=") === -1 && hash.indexOf("error") === -1)) return { type: null };
    var params = {};
    hash.split("&").forEach(function (pair) {
      var i = pair.indexOf("=");
      if (i > 0) params[decodeURIComponent(pair.slice(0, i))] = decodeURIComponent(pair.slice(i + 1).replace(/\+/g, " "));
    });
    history.replaceState(null, "", window.location.pathname + window.location.search);
    if (params.error) return { type: "error", code: params.error_code || params.error };
    writeSession({ access_token: params.access_token, refresh_token: params.refresh_token, expires_in: params.expires_in });
    return { type: params.type || "login" };
  }

  function loadUser(session) {
    return request("/auth/v1/user", { token: session.access_token }).then(function (user) {
      var s = readSession() || session;
      s.user = { id: user.id, email: user.email, name: (user.user_metadata || {}).full_name || "" };
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
      return s;
    });
  }

  var Auth = {
    enabled: enabled,
    friendly: friendly,
    safeNext: safeNext,
    captureHash: captureHash,
    getSession: getSession,
    hasSession: function () { return !!readSession(); },

    signUp: function (email, password, fullName, redirectPath) {
      var redirect = encodeURIComponent(siteUrl(redirectPath || "/dashboard"));
      return request("/auth/v1/signup?redirect_to=" + redirect, {
        method: "POST",
        body: { email: email, password: password, data: { full_name: fullName } }
      }).then(function (data) {
        // With email confirmation on, Supabase returns the user without a session.
        if (data && data.access_token) return { session: writeSession(data), needsConfirmation: false };
        return { session: null, needsConfirmation: true };
      });
    },

    signIn: function (email, password) {
      return request("/auth/v1/token?grant_type=password", { method: "POST", body: { email: email, password: password } })
        .then(writeSession);
    },

    signOut: function () {
      var s = readSession();
      clearSession();
      if (!s || !enabled) return Promise.resolve();
      return request("/auth/v1/logout", { method: "POST", token: s.access_token }).catch(function () { /* already signed out locally */ });
    },

    requestReset: function (email) {
      return request("/auth/v1/recover?redirect_to=" + encodeURIComponent(siteUrl("/reset-password")), {
        method: "POST", body: { email: email }
      });
    },

    updatePassword: function (password) {
      return getSession().then(function (s) {
        if (!s) throw new AuthError("session_expired");
        return request("/auth/v1/user", { method: "PUT", token: s.access_token, body: { password: password } });
      });
    },

    currentUser: function () {
      return getSession().then(function (s) {
        if (!s) return null;
        return s.user && s.user.email ? s : loadUser(s);
      }).catch(function (err) {
        if (err.code === "session_expired") { clearSession(); return null; }
        throw err;
      });
    },

    /* PostgREST helpers — Row Level Security limits every query to the signed-in user's rows. */
    select: function (table, query) {
      return getSession().then(function (s) {
        if (!s) throw new AuthError("session_expired");
        return request("/rest/v1/" + table + "?" + query, { token: s.access_token });
      });
    },
    insert: function (table, row, opts) {
      opts = opts || {};
      return getSession().then(function (s) {
        if (!s && !opts.anonymous) throw new AuthError("session_expired");
        return request("/rest/v1/" + table, {
          method: "POST",
          token: s ? s.access_token : null,
          prefer: opts.anonymous ? "return=minimal" : "return=representation",
          body: row
        });
      });
    },

    /* Redirects to login when there is no valid session. Resolves with the session otherwise. */
    requireUser: function () {
      return Auth.currentUser().then(function (s) {
        if (!s) {
          window.location.replace("/login?next=" + encodeURIComponent(window.location.pathname) + "&reason=auth");
          return new Promise(function () { /* navigating away */ });
        }
        return s;
      });
    }
  };

  window.VWS_AUTH = Auth;
})();
