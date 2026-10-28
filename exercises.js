/* ============================================================
   Smartech Typing Tutor — Shared exercise loader (exercises.js)

   ONE source of exercises for every page:
     - Chunk lists     (engtutor / pbitutor / hinditutor  -> testpage.html)
     - Long/Paragraph  (engexercises / pbiexercises / hindiexercises -> paragraph.html)
     - Demo            (demo.html -> paragraph.html, 5-minute timer)

   Everything is downloaded from the GitHub exercises.txt file
   (DEFAULT_URL below). The last good download is cached on the
   device, so the lists still work when the computer is offline.

   ------------------------------------------------------------
   HOW TO WRITE exercises.txt  (edit it on GitHub)
   ------------------------------------------------------------
   Every exercise is a header line starting with ###, followed by
   the text between two "---" lines:

       ### English
       ---
       Text of an exercise that appears in BOTH lists...
       ---

   The words in the header decide where the exercise appears:

       ### English                  -> Chunk list AND Long list
       ### English Chunk            -> Chunk list only
       ### English Paragraph        -> Long list only   ("Long" also works)

   Same for Punjabi and Hindi:

       ### Punjabi Chunk
       ### Hindi Paragraph
       ### Hindi

   Any other words in the header become the button label:

       ### English Chunk Special 1     -> button "3. English Special 1"
       ### Punjabi August              -> button "5. Punjabi August"

   DEMO exercises (5-minute demo test, shown before English everywhere):

       ### Demo English
       ---
       Text of the English demo exercise...
       ---

       ### Demo Punjabi        ### Demo Hindi

   The word "Demo" in the header is what matters. The language word
   (English / Punjabi / Hindi) is optional: if it is left out, the
   language is detected from the text itself. Extra words become the
   button label ("### Demo English Banking" -> "Demo Banking").
   Demo exercises appear ONLY on the Demo page, never in the Chunk or
   Long Paragraph lists.

   Exercises are shown in the same order as they appear in the file.
   Anything above the first ### line is ignored (use it for notes).
   ============================================================ */
(function (global) {
  "use strict";

  var DEFAULT_URL =
    "https://raw.githubusercontent.com/skrajb/App/refs/heads/main/All%20Exercises%20for%20Institute.txt";

  // Re-download at most this often while students move between pages.
  var TTL_MS = 5 * 60 * 1000;

  var KEY = {
    remote: "smartechExercisesRemote",      // parsed copy of the GitHub file
    fetchedAt: "smartechExercisesFetchedAt", // when it was last downloaded
    custom: "smartechExercisesCustom",       // exercises added on this computer
    url: "smartechExercisesUrl"              // optional source override
  };

  var mem = { remote: null };  // in-memory copy (used if localStorage is full)
  var inflight = null;         // one download at a time

  /* ---------- small storage helpers ---------- */
  function readArray(key) {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  /* ---------- source URL ---------- */
  function getSourceUrl() {
    try { return localStorage.getItem(KEY.url) || DEFAULT_URL; }
    catch (e) { return DEFAULT_URL; }
  }
  function setSourceUrl(url) {
    try {
      if (!url || url === DEFAULT_URL) localStorage.removeItem(KEY.url);
      else localStorage.setItem(KEY.url, url);
    } catch (e) { /* ignore */ }
  }

  /* ---------- parsing ---------- */
  // Guess the language from the script of the exercise text itself.
  function detectLang(text) {
    var t = String(text || "");
    var gur = (t.match(/[\u0A00-\u0A7F]/g) || []).length;
    var dev = (t.match(/[\u0900-\u097F]/g) || []).length;
    if (gur > dev && gur > 0) return "Punjabi";
    if (dev > 0) return "Hindi";
    return "English";
  }

  function parseHeader(header) {
    var isDemo = /\bdemo\b/i.test(header);
    var lm = header.match(/\b(english|punjabi|hindi)\b/i);
    // A Demo header may leave the language out (it is detected from the text later)
    if (!lm && !isDemo) return null;
    var lang = lm ? lm[1].charAt(0).toUpperCase() + lm[1].slice(1).toLowerCase() : "";

    var hasChunk = /\bchunk\b/i.test(header);
    var hasPara = /\b(paragraph|long)\b/i.test(header);
    var mode = isDemo ? "demo"
             : hasChunk && !hasPara ? "chunk"
             : hasPara && !hasChunk ? "paragraph"
             : "both";

    var cleaned = header
      .replace(/\b(chunk|paragraph|long)\b/ig, " ")
      .replace(/[\[(]\s*[\])]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^[\s|:\-\u2013]+|[\s|:\-\u2013]+$/g, "");

    var title;
    if (isDemo) {
      // "Demo English" -> "Demo";  "Demo English Banking" -> "Demo Banking"
      var extra = cleaned
        .replace(/\b(demo|english|punjabi|hindi)\b/ig, " ")
        .replace(/\s+/g, " ")
        .replace(/^[\s|:\-\u2013]+|[\s|:\-\u2013]+$/g, "");
      title = extra ? "Demo " + extra : "Demo";
    } else {
      title = cleaned || lang;
    }
    return { lang: lang, mode: mode, title: title };
  }

  function parse(raw) {
    var text = String(raw || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    var heads = [];
    var re = /^###[ \t]*(.*)$/gm;
    var m;
    while ((m = re.exec(text))) {
      heads.push({ header: m[1].trim(), start: m.index, bodyStart: re.lastIndex });
    }

    var out = [];
    heads.forEach(function (h, i) {
      var info = parseHeader(h.header);
      if (!info) return;                       // unknown language -> skip
      var end = i + 1 < heads.length ? heads[i + 1].start : text.length;
      var segs = text.slice(h.bodyStart, end)
        .split(/^[ \t]*---+[ \t]*$/m)
        .map(function (s) { return s.trim(); })
        .filter(Boolean);
      if (!segs.length) return;

      out.push({ lang: info.lang || detectLang(segs[0]), mode: info.mode, title: info.title, text: segs[0] });
      // Older files could pack extra "title --- text" pairs into one block.
      for (var j = 1; j + 1 < segs.length; j += 2) {
        out.push({ lang: info.lang || detectLang(segs[j + 1]), mode: info.mode, title: segs[j], text: segs[j + 1] });
      }
    });
    return out;
  }

  /* ---------- reading the lists ---------- */
  function remoteItems() { return mem.remote || readArray(KEY.remote); }

  function list(lang, mode) {
    return remoteItems().concat(readArray(KEY.custom)).filter(function (ex) {
      return ex && ex.lang === lang && ex.text &&
             (ex.mode === "both" || ex.mode === mode);
    });
  }

  /* ---------- downloading ---------- */
  // Older builds saved a copy in exercisesEnglish / exercisesPunjabi.
  // Use it once so the first launch after updating works offline too.
  function seedFromLegacy() {
    try {
      if (localStorage.getItem(KEY.remote) !== null) return;
      var seeded = [];
      [["English", "exercisesEnglish"], ["Punjabi", "exercisesPunjabi"]].forEach(function (p) {
        readArray(p[1]).forEach(function (ex) {
          if (ex && ex.text) {
            seeded.push({ lang: p[0], mode: "both", title: ex.title || p[0], text: String(ex.text) });
          }
        });
      });
      if (seeded.length) { mem.remote = seeded; writeJSON(KEY.remote, seeded); }
    } catch (e) { /* ignore */ }
  }

  // Resolves true when fresh exercises were downloaded, false otherwise
  // (already fresh, offline, bad file). Never rejects.
  function refresh(opts) {
    opts = opts || {};
    var url = opts.url || getSourceUrl();
    var fetchedAt = 0;
    try { fetchedAt = Number(localStorage.getItem(KEY.fetchedAt)) || 0; } catch (e) {}
    var fresh = remoteItems().length > 0 && Date.now() - fetchedAt < TTL_MS;

    if (!opts.force && fresh) return Promise.resolve(false);
    if (inflight) return inflight;

    inflight = fetch(url, { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(function (text) {
        var items = parse(text);
        if (!items.length) throw new Error("no exercises found in file");
        mem.remote = items;
        writeJSON(KEY.remote, items);
        try { localStorage.setItem(KEY.fetchedAt, String(Date.now())); } catch (e) {}
        if (opts.url) setSourceUrl(opts.url);
        return true;
      })
      .catch(function (err) {
        console.warn("[exercises] could not refresh from " + url + ":", err && err.message);
        return false;
      })
      .then(function (ok) { inflight = null; return ok; });

    return inflight;
  }

  /* ---------- exercises added on this computer (admin panel) ---------- */
  var custom = {
    list: function () { return readArray(KEY.custom); },
    add: function (ex) {
      var all = readArray(KEY.custom);
      all.push({
        lang: ex.lang,
        mode: ex.mode === "chunk" || ex.mode === "paragraph" || ex.mode === "demo" ? ex.mode : "both",
        title: ex.title || ex.lang,
        text: ex.text
      });
      return writeJSON(KEY.custom, all);
    },
    remove: function (index) {
      var all = readArray(KEY.custom);
      all.splice(index, 1);
      return writeJSON(KEY.custom, all);
    },
    clear: function () {
      try { localStorage.removeItem(KEY.custom); } catch (e) {}
    },
    // Add every exercise found in a text file (same ### format as exercises.txt)
    importText: function (text) {
      var items = parse(text);
      var all = readArray(KEY.custom).concat(items);
      writeJSON(KEY.custom, all);
      return items.length;
    }
  };

  /* ---------- render a list of exercise buttons into the page ---------- */
  // opts: container (id or element), lang, mode ("chunk"|"paragraph"),
  //       target (page to open), emptyText, hideWhenEmpty (id or element)
  function mount(opts) {
    var el = typeof opts.container === "string"
      ? document.getElementById(opts.container) : opts.container;
    if (!el) return;
    var hideEl = opts.hideWhenEmpty
      ? (typeof opts.hideWhenEmpty === "string"
          ? document.getElementById(opts.hideWhenEmpty) : opts.hideWhenEmpty)
      : null;
    var loading = true;

    function render() {
      var items = list(opts.lang, opts.mode);
      el.innerHTML = "";

      if (!items.length) {
        var p = document.createElement("p");
        p.textContent = loading
          ? "Loading exercises\u2026"
          : (opts.emptyText ||
             (global.navigator && global.navigator.onLine === false
               ? "You are offline. Connect to the internet once so the exercises can download."
               : "No exercises available yet."));
        el.appendChild(p);
        if (hideEl) hideEl.style.display = loading ? "" : "none";
        return;
      }
      if (hideEl) hideEl.style.display = "";

      items.forEach(function (ex, i) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "exercise-btn";
        b.textContent = (i + 1) + ". " + ex.title;
        b.addEventListener("click", function () {
          localStorage.setItem("selectedExerciseText", ex.text);
          localStorage.setItem("selectedExerciseLanguage", opts.lang);
          localStorage.setItem("selectedExerciseNo", String(i + 1));
          localStorage.setItem("selectedExerciseTitle", ex.title || "");
          localStorage.setItem("selectedExerciseMode", opts.mode || "");
          window.location.href = opts.target;
        });
        el.appendChild(b);
      });
    }

    render();                                   // show the cached list instantly
    refresh().then(function () { loading = false; render(); });
  }

  /* ---------- Demo exercises (5-minute demo test) ---------- */
  var DEMO_LANGS = ["English", "Punjabi", "Hindi"];

  // All demo exercises for one language (or every language when lang is omitted)
  function demos(lang) {
    return remoteItems().concat(readArray(KEY.custom)).filter(function (ex) {
      return ex && ex.text && ex.mode === "demo" && (!lang || ex.lang === lang);
    });
  }

  // Render the demo buttons of ONE language into a container (opens paragraph.html,
  // which runs the 5-minute timer when selectedExerciseMode is "demo").
  // opts: container (id or element), lang, target (default paragraph.html)
  function mountDemo(opts) {
    var el = typeof opts.container === "string"
      ? document.getElementById(opts.container) : opts.container;
    if (!el) return;
    var loading = true;

    function render() {
      var items = demos(opts.lang);
      el.innerHTML = "";
      if (!items.length) {
        var p = document.createElement("p");
        p.className = "demo-empty";
        p.textContent = loading
          ? "Loading demo\u2026"
          : (global.navigator && global.navigator.onLine === false
              ? "You are offline. Connect to the internet once so the demo can download."
              : "No demo available yet.");
        el.appendChild(p);
        return;
      }
      items.forEach(function (ex, i) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "exercise-btn demo-btn";
        b.textContent = items.length > 1 && ex.title === "Demo" ? "Demo " + (i + 1) : ex.title;
        b.addEventListener("click", function () {
          localStorage.setItem("selectedExerciseText", ex.text);
          localStorage.setItem("selectedExerciseLanguage", opts.lang);
          localStorage.removeItem("selectedExerciseNo");
          localStorage.setItem("selectedExerciseTitle", ex.title || "Demo");
          localStorage.setItem("selectedExerciseMode", "demo");
          window.location.href = opts.target || "paragraph.html";
        });
        el.appendChild(b);
      });
    }

    render();
    refresh().then(function () { loading = false; render(); });
  }

  seedFromLegacy();

  global.SmartechExercises = {
    demos: demos,
    mountDemo: mountDemo,
    DEMO_LANGS: DEMO_LANGS,
    DEFAULT_URL: DEFAULT_URL,
    parse: parse,
    list: list,
    refresh: refresh,
    mount: mount,
    custom: custom,
    getSourceUrl: getSourceUrl,
    remoteCount: function () { return remoteItems().length; }
  };
})(window);
