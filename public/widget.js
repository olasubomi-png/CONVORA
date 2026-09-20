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
        if (!r.ok) throw new Error((data.error && data.error.message) || "Request failed");
        return data;
      });
    });
  }

  function ensureHost() {
    if (document.getElementById("convora-wc-root")) return;
    var root = document.createElement("div");
    root.id = "convora-wc-root";
    root.style.cssText =
      "all:initial;position:fixed;z-index:2147483646;font-family:system-ui,-apple-system,sans-serif;";
    var pos = (config.launcherPosition || "bottom-right") === "bottom-left";
    root.style[pos ? "left" : "right"] = "20px";
    root.style.bottom = "20px";
    document.body.appendChild(root);

    var style = document.createElement("style");
    style.textContent =
      "#convora-wc-root button{cursor:pointer;border:none;}" +
      "#convora-wc-panel{width:340px;max-width:calc(100vw - 32px);height:440px;background:#fff;border:1px solid #e4e4e2;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.12);display:flex;flex-direction:column;overflow:hidden;}" +
      "#convora-wc-header{padding:12px 14px;color:#fff;font-size:14px;font-weight:600;}" +
      "#convora-wc-msgs{flex:1;overflow:auto;padding:12px;background:#f8f8f7;}" +
      "#convora-wc-msgs .m{margin:0 0 8px;padding:8px 10px;border-radius:8px;font-size:13px;line-height:1.4;max-width:85%;}" +
      "#convora-wc-msgs .visitor{background:#1f4e3d;color:#fff;margin-left:auto;}" +
      "#convora-wc-msgs .agent{background:#fff;border:1px solid #e4e4e2;}" +
      "#convora-wc-form{display:flex;gap:6px;padding:10px;border-top:1px solid #e4e4e2;}" +
      "#convora-wc-form input{flex:1;border:1px solid #e4e4e2;border-radius:8px;padding:8px 10px;font-size:13px;}" +
      "#convora-wc-launcher{width:56px;height:56px;border-radius:50%;color:#fff;font-size:22px;box-shadow:0 4px 14px rgba(0,0,0,.2);}";
    document.head.appendChild(style);
  }

  function render() {
    ensureHost();
    var root = document.getElementById("convora-wc-root");
    var accent = config.accentColor || "#1f4e3d";
    if (!open) {
      root.innerHTML =
        '<button id="convora-wc-launcher" type="button" aria-label="Open chat" style="background:' +
        accent +
        '">💬</button>';
      document.getElementById("convora-wc-launcher").onclick = function () {
        open = true;
        render();
        loadMessages();
        startEvents();
      };
      return;
    }
    var html =
      '<div id="convora-wc-panel" role="dialog" aria-label="Chat">' +
      '<div id="convora-wc-header" style="background:' +
      accent +
      '">' +
      escapeHtml(config.headerText || "Chat") +
      ' <button type="button" id="convora-wc-close" style="float:right;background:transparent;color:#fff;font-size:16px" aria-label="Close">×</button></div>' +
      '<div id="convora-wc-msgs"></div>' +
      '<form id="convora-wc-form"><input id="convora-wc-input" type="text" placeholder="Type a message…" autocomplete="off" /><button type="submit" style="background:' +
      accent +
      ';color:#fff;border-radius:8px;padding:8px 12px;font-size:13px">Send</button></form></div>';
    root.innerHTML = html;
    document.getElementById("convora-wc-close").onclick = function () {
      open = false;
      render();
    };
    document.getElementById("convora-wc-form").onsubmit = function (e) {
      e.preventDefault();
      var input = document.getElementById("convora-wc-input");
      var text = input.value.trim();
      if (!text) return;
      input.value = "";
      sendMessage(text);
    };
    paintMessages();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function paintMessages() {
    var el = document.getElementById("convora-wc-msgs");
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
        return (
          '<div class="m ' +
          (m.role === "visitor" ? "visitor" : "agent") +
          '">' +
          escapeHtml(m.body) +
          "</div>"
        );
      })
      .join("");
    el.scrollTop = el.scrollHeight;
  }

  function sendMessage(text) {
    var clientMessageId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now());
    messages.push({ id: clientMessageId, body: text, role: "visitor" });
    paintMessages();
    api("/api/web-chat/messages", {
      method: "POST",
      body: { body: text, clientMessageId: clientMessageId },
    })
      .then(function (data) {
        if (data.message) {
          messages = messages.filter(function (m) {
            return m.id !== clientMessageId;
          });
          if (!messages.find(function (m) {
            return m.id === data.message.id;
          })) {
            messages.push(data.message);
          }
          paintMessages();
        }
      })
      .catch {
        console.error("[CONVORA]", err);
      });
  }

  function loadMessages() {
    api("/api/web-chat/messages")
      .then(function (data) {
        messages = data.messages || [];
        paintMessages();
      })
      .catch {});
  }

  var es = null;
  function startEvents() {
    if (es || typeof EventSource === "undefined") return;
    // EventSource cannot set custom headers — fall back to polling via loadMessages
    setInterval(loadMessages, 3000);
  }

  function boot() {
    var stored = null;
    try {
      stored = localStorage.getItem(TOKEN_KEY);
    } catch { /* ignore storage */ }
    api("/api/web-chat/session", {
      method: "POST",
      body: { publicKey: publicKey, sessionToken: stored },
    })
      .then(function (data) {
        sessionToken = data.sessionToken;
        config = data.config || {};
        try {
          localStorage.setItem(TOKEN_KEY, sessionToken);
        } catch { /* ignore storage */ }
        render();
      })
      .catch {
        console.error("[CONVORA] session failed", err);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
