(function () {
  "use strict";
  var script = document.currentScript;
  if (!script) return;
  var publicKey = script.getAttribute("data-convora-key");
  if (!publicKey) {
    console.error("[CONVORA] data-convora-key is required");
    return;
  }
  var base =
    script.getAttribute("data-convora-base") ||
    (script.src ? script.src.replace(/\/widget\.js.*$/, "") : "");
  var TOKEN_KEY = "convora_wc_token_" + publicKey;
  var sessionToken = null;
  var config = {};
  var open = false;
  var messages = [];
  var pollTimer = null;
  var lastMessageId = null;
  var sending = false;
  var shadow = null;

  function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign(
      { "Content-Type": "application/json" },
      opts.headers || {},
    );
    if (sessionToken) headers["x-convora-visitor-token"] = sessionToken;
    return fetch(base + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok)
          throw new Error(
            (data.error && data.error.message) || "Request failed",
          );
        return data;
      });
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function safeColor(c) {
    return /^#[0-9a-fA-F]{3,8}$/.test(c || "") ? c : "#1f4e3d";
  }

  function ensureHost() {
    if (document.getElementById("convora-wc-host")) return;
    var host = document.createElement("div");
    host.id = "convora-wc-host";
    host.style.cssText =
      "position:fixed;z-index:2147483646;bottom:20px;right:20px;";
    if ((config.launcherPosition || "bottom-right") === "bottom-left") {
      host.style.right = "auto";
      host.style.left = "20px";
    }
    document.body.appendChild(host);
    shadow = host.attachShadow({ mode: "closed" });
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPoll() {
    stopPoll();
    pollTimer = setInterval(function () {
      if (!open) return;
      loadMessages(true);
    }, 3000);
  }

  function render() {
    ensureHost();
    var accent = safeColor(config.accentColor);
    if (!open) {
      stopPoll();
      shadow.innerHTML =
        "<style>button{cursor:pointer;border:none;font-family:system-ui,sans-serif}</style>" +
        '<button type="button" part="launcher" aria-label="Open chat" style="width:56px;height:56px;border-radius:50%;background:' +
        accent +
        ';color:#fff;font-size:22px;box-shadow:0 4px 14px rgba(0,0,0,.2)">💬</button>';
      shadow.querySelector("button").onclick = function () {
        open = true;
        render();
        loadMessages(false);
        startPoll();
      };
      return;
    }
    shadow.innerHTML =
      "<style>" +
      ":host{all:initial;font-family:system-ui,-apple-system,sans-serif}" +
      ".panel{width:340px;max-width:calc(100vw - 32px);height:440px;background:#fff;border:1px solid #e4e4e2;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.12);display:flex;flex-direction:column;overflow:hidden}" +
      ".header{padding:12px 14px;color:#fff;font-size:14px;font-weight:600}" +
      ".msgs{flex:1;overflow:auto;padding:12px;background:#f8f8f7}" +
      ".m{margin:0 0 8px;padding:8px 10px;border-radius:8px;font-size:13px;line-height:1.4;max-width:85%;word-break:break-word}" +
      ".visitor{background:" +
      accent +
      ";color:#fff;margin-left:auto}" +
      ".agent{background:#fff;border:1px solid #e4e4e2}" +
      ".pending{opacity:.6}" +
      ".failed{border:1px solid #c00}" +
      ".form{display:flex;gap:6px;padding:10px;border-top:1px solid #e4e4e2}" +
      ".form input{flex:1;border:1px solid #e4e4e2;border-radius:8px;padding:8px 10px;font-size:13px}" +
      ".err{color:#a00;font-size:12px;padding:0 10px 8px}" +
      "</style>" +
      '<div class="panel" role="dialog" aria-label="Chat">' +
      '<div class="header" style="background:' +
      accent +
      '">' +
      escapeHtml(config.headerText || "Chat") +
      ' <button type="button" id="x" style="float:right;background:transparent;color:#fff;border:none;font-size:16px;cursor:pointer" aria-label="Close">×</button></div>' +
      '<div class="msgs" id="msgs"></div>' +
      '<div class="err" id="err" hidden></div>' +
      '<form class="form" id="f"><input id="in" type="text" placeholder="Type a message…" autocomplete="off" /><button type="submit" style="background:' +
      accent +
      ';color:#fff;border:none;border-radius:8px;padding:8px 12px;font-size:13px;cursor:pointer">Send</button></form></div>';
    shadow.getElementById("x").onclick = function () {
      open = false;
      stopPoll();
      render();
    };
    shadow.getElementById("f").onsubmit = function (e) {
      e.preventDefault();
      if (sending) return;
      var input = shadow.getElementById("in");
      var text = input.value.trim();
      if (!text) return;
      input.value = "";
      sendMessage(text);
    };
    paintMessages();
  }

  function showError(msg) {
    var el = shadow && shadow.getElementById("err");
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = msg;
  }

  function paintMessages() {
    var el = shadow && shadow.getElementById("msgs");
    if (!el) return;
    if (!messages.length) {
      el.innerHTML =
        '<p style="font-size:13px;color:#5c5c5c">' +
        escapeHtml(config.welcomeMessage || "Hi! How can we help?") +
        "</p>";
      return;
    }
    el.innerHTML = messages
      .map(function (m) {
        var cls =
          "m " +
          (m.role === "visitor" ? "visitor" : "agent") +
          (m.pending ? " pending" : "") +
          (m.failed ? " failed" : "");
        return '<div class="' + cls + '">' + escapeHtml(m.body) + "</div>";
      })
      .join("");
    el.scrollTop = el.scrollHeight;
  }

  function sendMessage(text) {
    var clientMessageId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : "c-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    messages.push({
      id: clientMessageId,
      body: text,
      role: "visitor",
      pending: true,
    });
    paintMessages();
    sending = true;
    showError("");
    api("/api/web-chat/messages", {
      method: "POST",
      body: { body: text, clientMessageId: clientMessageId },
    })
      .then(function (data) {
        messages = messages.filter(function (m) {
          return m.id !== clientMessageId;
        });
        if (data.message && !messages.find(function (m) {
          return m.id === data.message.id;
        })) {
          messages.push(data.message);
          lastMessageId = data.message.id;
        }
        paintMessages();
      })
      .catch(function (err) {
        messages = messages.map(function (m) {
          if (m.id === clientMessageId) {
            return Object.assign({}, m, { pending: false, failed: true });
          }
          return m;
        });
        paintMessages();
        showError(err.message || "Could not send message");
      })
      .then(function () {
        sending = false;
      });
  }

  function loadMessages(incremental) {
    var path =
      "/api/web-chat/messages" +
      (incremental && lastMessageId ? "?after=" + encodeURIComponent(lastMessageId) : "");
    api(path)
      .then(function (data) {
        var incoming = data.messages || [];
        if (!incremental) {
          messages = incoming;
        } else {
          incoming.forEach(function (m) {
            if (!messages.find(function (x) {
              return x.id === m.id;
            })) {
              messages.push(m);
            }
          });
        }
        if (messages.length) {
          lastMessageId = messages[messages.length - 1].id;
        }
        paintMessages();
      })
      .catch(function () {
        /* soft fail on poll */
      });
  }

  function boot() {
    var stored = null;
    try {
      stored = localStorage.getItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
    api("/api/web-chat/session", {
      method: "POST",
      body: { publicKey: publicKey, sessionToken: stored },
    })
      .then(function (data) {
        sessionToken = data.sessionToken;
        config = data.config || {};
        try {
          localStorage.setItem(TOKEN_KEY, sessionToken);
        } catch {
          /* ignore */
        }
        render();
      })
      .catch(function (err) {
        console.error("[CONVORA] session failed", err && err.message);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
