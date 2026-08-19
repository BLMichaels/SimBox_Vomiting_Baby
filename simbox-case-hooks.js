/* SimBox slide hooks — load AFTER simbox-tracking.js, BEFORE bootstrapper.
   Storyline does not fill currentSlideId. Watch the player’s own slide
   navigation, asset URLs, and same-origin iframes instead.
*/
(function () {
  "use strict";

  function cfg() {
    var c = window.SIMBOX_TRACKING_CONFIG || {};
    var q = window.location.search || "";
    var steps = [].concat(c.steps || []);
    var startIds = [].concat(c.startSlideIds || []);
    var completeIds = [].concat(c.completeSlideIds || []);
    var startTitles = [].concat(c.startSlideTitles || []).map(lower);
    var completeTitles = [].concat(c.completeSlideTitles || []).map(lower);
    var minStep = Infinity;
    var maxStep = -Infinity;
    var i;
    for (i = 0; i < steps.length; i++) {
      var n = Number(steps[i].step);
      if (!isFinite(n)) continue;
      if (n < minStep) minStep = n;
      if (n > maxStep) maxStep = n;
    }
    for (i = 0; i < steps.length; i++) {
      var st = steps[i];
      var n2 = Number(st.step);
      if (st.id && n2 === minStep) startIds.push(st.id);
      if (st.id && n2 === maxStep) completeIds.push(st.id);
      if (st.title && n2 === minStep) startTitles.push(lower(st.title));
      if (st.title && n2 === maxStep) completeTitles.push(lower(st.title));
    }
    return {
      debug: c.debug === true || /[?&]simbox_debug=1(?:&|$)/.test(q),
      steps: steps,
      startIds: startIds,
      completeIds: completeIds,
      startTitles: startTitles,
      completeTitles: completeTitles,
      minStep: minStep,
      maxStep: maxStep
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

  function idFrom(value) {
    var s = String(value || "");
    var m = s.match(/([56][A-Za-z0-9]{6,})(?:\.js)?(?:$|[^A-Za-z0-9])/);
    if (m) return m[1];
    var parts = s.split(".");
    return parts.length ? parts[parts.length - 1] : s;
  }

  function titleMatches(t, needle) {
    if (!needle) return false;
    if (t === needle) return true;
    if (t.indexOf(needle + "-") === 0) return true;
    if (t.indexOf(needle + " ") === 0) return true;
    return false;
  }

  function matches(id, title, ids, titles) {
    var i;
    var nid = String(id || "");
    var shortId = idFrom(nid);
    var t = lower(title);
    for (i = 0; i < ids.length; i++) {
      if (!ids[i]) continue;
      if (nid.indexOf(ids[i]) !== -1) return true;
      if (shortId && shortId.indexOf(ids[i]) !== -1) return true;
    }
    for (i = 0; i < titles.length; i++) {
      if (titleMatches(t, titles[i])) return true;
    }
    return false;
  }

  function findStep(slide) {
    var steps = cfg().steps;
    var i;
    for (i = 0; i < steps.length; i++) {
      var st = steps[i];
      if (matches(slide.id, slide.title, st.id ? [st.id] : [], st.title ? [lower(st.title)] : [])) {
        return st;
      }
    }
    return null;
  }

  var lastNavId = "";
  var lastTitle = "";

  function noteSrc(src) {
    if (src == null) return;
    var s = src;
    if (typeof src !== "string") {
      try {
        s = src.url || src.href || String(src);
      } catch (e) {
        return;
      }
    }
    s = String(s);
    if (s.indexOf(".js") === -1 && s.indexOf("/html5/data/js") === -1) return;
    var sid = idFrom(s);
    if (sid && /^[56][A-Za-z0-9]{6,}$/.test(sid)) {
      lastNavId = sid;
    }
  }

  function wrapNetwork(win) {
    if (!win || win.__simboxNetWrapped) return;
    try {
      win.__simboxNetWrapped = true;
    } catch (e0) {
      return;
    }
    try {
      if (typeof win.fetch === "function") {
        var origFetch = win.fetch;
        win.fetch = function (input) {
          try {
            noteSrc(input);
          } catch (e1) {}
          return origFetch.apply(this, arguments);
        };
      }
    } catch (e2) {}
    try {
      var XO = win.XMLHttpRequest;
      if (XO && XO.prototype && !XO.prototype.__simboxOpen) {
        var origOpen = XO.prototype.open;
        XO.prototype.open = function (method, url) {
          try {
            noteSrc(url);
          } catch (e3) {}
          return origOpen.apply(this, arguments);
        };
        XO.prototype.__simboxOpen = true;
      }
    } catch (e4) {}
  }

  wrapNetwork(window);

  try {
    var proto = window.HTMLScriptElement && HTMLScriptElement.prototype;
    var desc = proto && Object.getOwnPropertyDescriptor(proto, "src");
    if (desc && desc.set && desc.get) {
      Object.defineProperty(proto, "src", {
        configurable: true,
        get: function () {
          return desc.get.call(this);
        },
        set: function (v) {
          noteSrc(v);
          return desc.set.call(this, v);
        }
      });
    }
  } catch (e5) {}

  try {
    var po = new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      var i;
      for (i = 0; i < entries.length; i++) noteSrc(entries[i].name);
    });
    try {
      po.observe({ type: "resource" });
    } catch (e6) {
      po.observe({ entryTypes: ["resource"] });
    }
  } catch (e7) {}

  function playerWindows() {
    var list = [window];
    try {
      var frames = document.getElementsByTagName("iframe");
      var i;
      for (i = 0; i < frames.length; i++) {
        try {
          if (frames[i].contentWindow) list.push(frames[i].contentWindow);
        } catch (e8) {}
      }
    } catch (e9) {}
    return list;
  }

  function slideFromModel(slide) {
    if (!slide) return { id: "", title: "" };
    var id = "";
    var title = "";
    try {
      id = slide.absoluteId || slide.id || "";
      if (typeof slide.get === "function") {
        id = id || slide.get("id") || slide.get("slideid") || "";
        title = slide.get("title") || "";
      } else {
        title = slide.title || "";
      }
    } catch (e10) {}
    return { id: String(id || ""), title: String(title || "") };
  }

  function fromStoryline(win) {
    var empty = { id: "", title: "" };
    try {
      var DS = win.DS;
      if (!DS) return empty;
      if (DS.frame) {
        var wins = DS.frame.windows;
        if (wins && wins.length) {
          var w;
          for (var i = 0; i < wins.length; i++) {
            w = wins[i];
            if (w && typeof w.getCurrentSlide === "function") {
              var got = slideFromModel(w.getCurrentSlide());
              if (got.id || got.title) return got;
            }
          }
        }
      }
      if (DS.presentation && typeof DS.presentation.slideMap === "function") {
        var sm = DS.presentation.slideMap();
        if (sm && !sm.__simboxHooked && typeof sm.setCurrentSlide === "function") {
          var orig = sm.setCurrentSlide;
          sm.setCurrentSlide = function (id) {
            lastNavId = String(id || lastNavId);
            debug("setCurrentSlide", lastNavId);
            var result = orig.apply(this, arguments);
            tick();
            return result;
          };
          sm.__simboxHooked = true;
          debug("hooked slideMap.setCurrentSlide");
        }
        if (sm && typeof sm.getCurrentSlide === "function") {
          var cur = slideFromModel(sm.getCurrentSlide());
          if (cur.id || cur.title) return cur;
        }
      }
    } catch (e11) {}
    return empty;
  }

  function fromGetPlayer(win) {
    try {
      if (typeof win.GetPlayer !== "function") return { id: "", title: "" };
      var player = win.GetPlayer();
      if (!player || typeof player.GetVar !== "function") return { id: "", title: "" };
      return {
        id: String(player.GetVar("currentSlideId") || ""),
        title: String(player.GetVar("Project.SlideTitle") || player.GetVar("Slide.Title") || "")
      };
    } catch (e12) {
      return { id: "", title: "" };
    }
  }

  function readSlide() {
    var wins = playerWindows();
    var i;
    var best = { id: lastNavId, title: lastTitle };
    for (i = 0; i < wins.length; i++) {
      wrapNetwork(wins[i]);
      var a = fromStoryline(wins[i]);
      var b = fromGetPlayer(wins[i]);
      if (a.id) best.id = a.id;
      if (a.title) best.title = a.title;
      if (b.id) best.id = best.id || b.id;
      if (b.title) best.title = best.title || b.title;
    }
    lastTitle = best.title || lastTitle;
    return best;
  }

  var started = false;
  var completed = false;
  var lastKey = "";

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
    var st = findStep(slide);
    var info = {
      slideId: (st && st.id) || slide.id,
      slideTitle: (st && st.title) || slide.title,
      step: st ? Number(st.step) : undefined
    };
    if (!started && matches(slide.id, slide.title, c.startIds, c.startTitles)) {
      started = true;
      debug("start");
      window.SimBoxTracking.start(info);
    }
    if (
      st &&
      window.SimBoxTracking.checkpoint &&
      Number(st.step) !== c.minStep &&
      Number(st.step) !== c.maxStep
    ) {
      window.SimBoxTracking.checkpoint(info);
    }
    if (!completed && matches(slide.id, slide.title, c.completeIds, c.completeTitles)) {
      completed = true;
      debug("complete");
      window.SimBoxTracking.complete(info);
    }
  }

  var intervalId = window.setInterval(tick, 250);
  window.setTimeout(tick, 200);
  if (document.addEventListener) {
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") tick();
    });
  }

  window.SimBoxCaseHooks = {
    stop: function () {
      window.clearInterval(intervalId);
    },
    readSlide: readSlide
  };
})();
