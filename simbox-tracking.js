/* SimBox anonymous usage adapter — dependency-free.
   Load from the case index.html AFTER story_content/user.js.
   Do not wrap Script1–Script6 in the Penetrating Trauma reference case;
   those scripts are countdown timers (see docs/reference-case-audit.md).
*/
(function () {
  "use strict";

  var STORAGE_SESSION = "simbox.anonSession";
  var STORAGE_STARTED = "simbox.started";
  var STORAGE_COMPLETED = "simbox.completed";
  var STORAGE_EXITED = "simbox.exited";
  var STORAGE_STARTED_AT = "simbox.startedAtMs";

  function cfg() {
    var c = window.SIMBOX_TRACKING_CONFIG || {};
    var debugQs = /[?&]simbox_debug=1(?:&|$)/.test(window.location.search || "");
    return {
      caseKey: String(c.caseKey || ""),
      endpointUrl: String(c.endpointUrl || ""),
      appVersion: String(c.appVersion || "1.0.0"),
      debug: c.debug === true || debugQs,
      autoStartOnLoad: c.autoStartOnLoad === true,
      environment: String(c.environment || "production")
    };
  }

  function log() {
    if (!cfg().debug) return;
    if (typeof console === "undefined" || !console.log) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift("[SimBoxTracking]");
    console.log.apply(console, args);
  }

  function safeSessionGet(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function safeSessionSet(key, value) {
    try {
      window.sessionStorage.setItem(key, value);
    } catch (e) {
      /* private mode / blocked storage — still send with in-memory fallback */
    }
  }

  var memory = {};

  function getFlag(key) {
    var v = safeSessionGet(key);
    if (v != null) return v;
    return memory[key] || null;
  }

  function setFlag(key, value) {
    memory[key] = value;
    safeSessionSet(key, value);
  }

  function randomId() {
    try {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
      var bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      var hex = [];
      for (var i = 0; i < bytes.length; i++) {
        hex.push(("0" + bytes[i].toString(16)).slice(-2));
      }
      return (
        hex.slice(0, 4).join("") + "-" +
        hex.slice(4, 6).join("") + "-" +
        hex.slice(6, 8).join("") + "-" +
        hex.slice(8, 10).join("") + "-" +
        hex.slice(10).join("")
      );
    } catch (e) {
      return "s" + String(Date.now()) + "-" + String(Math.random()).slice(2, 10);
    }
  }

  function sessionId() {
    var existing = getFlag(STORAGE_SESSION);
    if (existing) return existing;
    var id = randomId();
    setFlag(STORAGE_SESSION, id);
    return id;
  }

  function deliveryContext() {
    try {
      if (window.self !== window.top) return "wix_embedded";
      return "github_direct";
    } catch (e) {
      return "unknown";
    }
  }

  function deviceType() {
    try {
      var w = window.innerWidth || 0;
      var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      var noHover = window.matchMedia && window.matchMedia("(hover: none)").matches;
      if (w > 0 && w < 768) return "mobile";
      if ((coarse || noHover) && w > 0 && w < 1100) return "tablet";
      if (w === 0) return "unknown";
      return "desktop";
    } catch (e) {
      return "unknown";
    }
  }

  function elapsedSeconds() {
    var started = getFlag(STORAGE_STARTED_AT);
    if (!started) return 0;
    var n = parseInt(started, 10);
    if (!n) return 0;
    var sec = Math.floor((Date.now() - n) / 1000);
    if (sec < 0) return 0;
    if (sec > 43200) return 43200;
    return sec;
  }

  function buildPayload(eventType) {
    var c = cfg();
    var sid = sessionId();
    var env = c.environment;
    if (/[?&]simbox_env=test(?:&|$)/.test(window.location.search || "")) {
      env = "test";
    }
    return {
      event_type: eventType,
      case_key: c.caseKey,
      session_id: sid,
      event_key: sid + ":" + eventType,
      occurred_at: new Date().toISOString(),
      elapsed_seconds: eventType === "case_started" ? 0 : elapsedSeconds(),
      delivery_context: deliveryContext(),
      device_type: deviceType(),
      app_version: c.appVersion,
      metadata: { environment: env }
    };
  }

  function send(payload, useBeacon) {
    var url = cfg().endpointUrl;
    if (!url || url.indexOf("YOUR_PROJECT_REF") !== -1) {
      log("endpoint not configured; skipping", payload.event_type);
      return;
    }
    var body = JSON.stringify(payload);
    if (useBeacon && navigator.sendBeacon) {
      try {
            var blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
        var ok = navigator.sendBeacon(url, blob);
        log("beacon", payload.event_type, ok);
        if (ok) return;
      } catch (e) {
        log("beacon failed, falling back to fetch");
      }
    }
    function postOnce() {
      return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        keepalive: true,
        mode: "cors",
        credentials: "omit"
      });
    }
    function attempt(n) {
      try {
        postOnce()
          .then(function (res) {
            log("fetch", payload.event_type, res.status);
            if (!res.ok && n < 3) {
              window.setTimeout(function () {
                attempt(n + 1);
              }, 400 * n);
            }
          })
          .catch(function (err) {
            log("fetch failed (retrying)", String(err));
            if (n < 3) {
              window.setTimeout(function () {
                attempt(n + 1);
              }, 400 * n);
            }
          });
      } catch (e) {
        log("send failed (ignored)");
      }
    }
    attempt(1);
  }

  function start() {
    try {
      if (getFlag(STORAGE_STARTED) === "1") {
        log("start ignored (already started)");
        return;
      }
      setFlag(STORAGE_STARTED, "1");
      setFlag(STORAGE_STARTED_AT, String(Date.now()));
      send(buildPayload("case_started"), false);
    } catch (e) {
      log("start error ignored");
    }
  }

  function complete() {
    try {
      if (getFlag(STORAGE_COMPLETED) === "1") {
        log("complete ignored (already completed)");
        return;
      }
      if (getFlag(STORAGE_STARTED) !== "1") {
        start();
      }
      setFlag(STORAGE_COMPLETED, "1");
      send(buildPayload("case_completed"), false);
    } catch (e) {
      log("complete error ignored");
    }
  }

  function exit() {
    try {
      if (getFlag(STORAGE_EXITED) === "1") {
        log("exit ignored (already exited)");
        return;
      }
      if (getFlag(STORAGE_COMPLETED) === "1") {
        log("exit skipped (session already completed)");
        return;
      }
      if (getFlag(STORAGE_STARTED) !== "1") {
        log("exit skipped (never started)");
        return;
      }
      setFlag(STORAGE_EXITED, "1");
      send(buildPayload("case_exited"), true);
    } catch (e) {
      log("exit error ignored");
    }
  }

  function onPageHide() {
    exit();
  }

  function onVisibility() {
    if (document.visibilityState === "hidden") {
      exit();
    }
  }

  window.SimBoxTracking = {
    start: start,
    complete: complete,
    exit: exit
  };

  if (window.addEventListener) {
    window.addEventListener("pagehide", onPageHide, { capture: true });
    document.addEventListener("visibilitychange", onVisibility);
  }

  if (cfg().autoStartOnLoad) {
    start();
  }

  log("ready", {
    caseKey: cfg().caseKey,
    delivery: deliveryContext(),
    device: deviceType()
  });
})();
