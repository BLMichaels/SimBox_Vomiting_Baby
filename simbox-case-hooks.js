/* SimBox slide hooks — load AFTER simbox-tracking.js.
   Does not edit Storyline-generated timer scripts.

   Configure start/complete slides in window.SIMBOX_TRACKING_CONFIG:
     startSlideIds, completeSlideIds,
     startSlideTitles, completeSlideTitles
*/
(function () {
  "use strict";

  function cfg() {
    var c = window.SIMBOX_TRACKING_CONFIG || {};
    return {
      debug: c.debug === true,
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

  function readSlide() {
    var id = "";
    var title = "";
    try {
      if (typeof GetPlayer === "function") {
        var player = GetPlayer();
        if (player && typeof player.GetVar === "function") {
          id = String(player.GetVar("currentSlideId") || "");
        }
      }
    } catch (e) {}
    try {
      if (window.DS && DS.pub && DS.pub.currentSlide) {
        id = id || String(DS.pub.currentSlide.id || DS.pub.currentSlide.slideid || "");
        title = String(DS.pub.currentSlide.title || "");
      }
    } catch (e2) {}
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
    if (key !== lastKey && (slide.id || slide.title)) {
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

  var intervalId = window.setInterval(tick, 500);
  if (document.addEventListener) {
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") tick();
    });
  }
  window.setTimeout(tick, 1000);

  window.SimBoxCaseHooks = {
    stop: function () {
      window.clearInterval(intervalId);
    }
  };
})();
