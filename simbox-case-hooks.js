/* SimBox slide hooks — load AFTER simbox-tracking.js.
   Storyline’s currentSlideId player variable is empty unless authors set it.
   This file watches slide JS loads, the DOM, and DS player state instead.
*/
(function () {
  "use strict";

  function cfg() {
    var c = window.SIMBOX_TRACKING_CONFIG || {};
    var debugQs = /[?&]simbox_debug=1(?:&|$)/.test(window.location.search || "");
    return {
      debug: c.debug === true || debugQs,
      startIds: [].concat(c.startSlideIds || []),
      completeIds: [].concat(c.completeSlideIds || []),
      startTitles: [].concat(c.startSlideTitles || []).map(lower),
      completeTitles: [].concat(c.completeSlideTitles || []).map(lower)
    };
  }

  function lower(s) {
    return String(s || "").toLowerCase();
  }

  function debug() {
    if (!cfg().debug) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift("[SimBoxCaseHooks]");
    if (console && console.log) console.log.apply(console, args);
  }

  function matches(id, title, ids, titles) {
    var i;
    var nid = String(id || "");
    var t = lower(title);
    for (i = 0; i < ids.length; i++) {
      if (ids[i] && nid.indexOf(ids[i]) !== -1) return true;
    }
    for (i = 0; i < titles.length; i++) {
      if (titles[i] && t.indexOf(titles[i]) !== -1) return true;
    }
    return false;
  }

  var lastScriptSlideId = "";

  function noteSrc(src) {
    var m = String(src || "").match(/html5\/data\/js\/([56][A-Za-z0-9]+)\.js/i);
    if (m) lastScriptSlideId = m[1];
  }

  try {
    var po = new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      var i;
      for (i = 0; i < entries.length; i++) noteSrc(entries[i].name);
    });
    po.observe({ type: "resource" });
  } catch (e0) {}

  if (document.querySelectorAll) {
    var existing = document.querySelectorAll("script[src]");
    var si;
    for (si = 0; si < existing.length; si++) noteSrc(existing[si].src);
  }

  try {
    var observer = new MutationObserver(function (muts) {
      var m, n, j;
      for (m = 0; m < muts.length; m++) {
        var nodes = muts[m].addedNodes;
        if (!nodes) continue;
        for (n = 0; n < nodes.length; n++) {
          var node = nodes[n];
          if (!node) continue;
          if (node.tagName === "SCRIPT") noteSrc(node.src);
          if (node.querySelectorAll) {
            var inner = node.querySelectorAll("script[src]");
            for (j = 0; j < inner.length; j++) noteSrc(inner[j].src);
          }
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e1) {}

  function fromPlayerVars() {
    var id = "";
    var title = "";
    try {
      if (typeof GetPlayer !== "function") return { id: id, title: title };
      var player = GetPlayer();
      if (!player || typeof player.GetVar !== "function") return { id: id, title: title };
      var names = [
        "currentSlideId",
        "Project.SlideTitle",
        "Slide.Title",
        "Menu.SlideTitle"
      ];
      var i;
      for (i = 0; i < names.length; i++) {
        var v = player.GetVar(names[i]);
        if (v == null || v === "") continue;
        var s = String(v);
        if (names[i].toLowerCase().indexOf("title") !== -1) title = title || s;
        else id = id || s;
      }
    } catch (e2) {}
    return { id: id, title: title };
  }

  function walkForSlide(obj, depth, seen) {
    if (!obj || depth > 5 || typeof obj !== "object") return null;
    if (seen.indexOf(obj) !== -1) return null;
    seen.push(obj);
    try {
      var title = obj.title || obj.slideTitle || "";
      var sid = obj.id || obj.slideid || obj.slideId || "";
      if (title && sid && typeof title === "string" && typeof sid === "string") {
        if (/^[56][A-Za-z0-9]+$/.test(sid) && title.length < 80) {
          return { id: sid, title: title };
        }
      }
      if (obj.currentSlide && typeof obj.currentSlide === "object") {
        var nested = walkForSlide(obj.currentSlide, depth + 1, seen);
        if (nested) return nested;
        var cs = obj.currentSlide;
        if (typeof cs.get === "function") {
          var gid = cs.get("id") || cs.get("slideid") || "";
          var gtitle = cs.get("title") || "";
          if (gid || gtitle) return { id: String(gid || ""), title: String(gtitle || "") };
        }
      }
      var keys = ["state", "pub", "presentation", "player", "store"];
      var k;
      for (k = 0; k < keys.length; k++) {
        if (obj[keys[k]]) {
          var found = walkForSlide(obj[keys[k]], depth + 1, seen);
          if (found) return found;
        }
      }
    } catch (e3) {}
    return null;
  }

  function fromDom() {
    var id = "";
    var title = "";
    try {
      var labeled = document.querySelector("[data-acc-text], .slide-title, .cs-slide-title");
      if (labeled) title = String(labeled.getAttribute("data-acc-text") || labeled.textContent || "").trim();
      var withId = document.querySelector("[data-slide-id], [data-model-id]");
      if (withId) {
        id = String(withId.getAttribute("data-slide-id") || withId.getAttribute("data-model-id") || "");
      }
    } catch (e4) {}
    return { id: id, title: title };
  }

  function readSlide() {
    var a = fromPlayerVars();
    var b = { id: "", title: "" };
    try {
      if (window.DS) {
        var walked = walkForSlide(window.DS, 0, []);
        if (walked) b = walked;
      }
    } catch (e5) {}
    var c = fromDom();
    var id = a.id || b.id || c.id || lastScriptSlideId;
    var title = a.title || b.title || c.title || "";
    return { id: id, title: title };
  }

  var lastKey = "";
  var started = false;
  var completed = false;

  function tick() {
    if (!window.SimBoxTracking) return;
    var c = cfg();
    if (!c.startIds.length && !c.startTitles.length) return;
    var slide = readSlide();
    var key = slide.id + "|" + slide.title;
    if (key !== lastKey) {
      debug("slide", slide);
      lastKey = key;
    }
    if (!started && matches(slide.id, slide.title, c.startIds, c.startTitles)) {
      started = true;
      debug("start");
      window.SimBoxTracking.start();
    }
    if (!completed && matches(slide.id, slide.title, c.completeIds, c.completeTitles)) {
      completed = true;
      debug("complete");
      window.SimBoxTracking.complete();
    }
  }

  var intervalId = window.setInterval(tick, 250);
  if (document.addEventListener) {
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") tick();
    });
  }
  window.setTimeout(tick, 300);

  window.SimBoxCaseHooks = {
    stop: function () {
      window.clearInterval(intervalId);
    },
    readSlide: readSlide
  };
})();
