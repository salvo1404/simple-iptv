/* Video playback: native HLS where supported (Tizen), hls.js otherwise (desktop Chrome/Firefox).
 * Player.create(videoEl) makes an independent player (used for the channel preview);
 * the global Player is the full-screen one. */
(function (global) {
  'use strict';

  /* opts.muted: play without sound (the preview). Sound is set explicitly on every play, because
   * Samsung TVs share one media pipeline and a muted element can otherwise silence the next one. */
  function create(videoEl, opts) {
    opts = opts || {};
    var video = videoEl || null;
    var hls = null;
    var listeners = {};
    var active = false;

    function emit(name, data) {
      (listeners[name] || []).forEach(function (fn) { fn(data); });
    }

    function destroyHls() {
      if (hls) { hls.destroy(); hls = null; }
    }

    function setSound(on) {
      try { video.muted = !on; video.volume = on ? 1 : 0; } catch (e) { /* ignore */ }
    }

    function stop() {
      active = false;
      destroyHls();
      if (!video) return;
      setSound(true);   // never leave an element muted behind us
      video.pause();
      video.removeAttribute('src');
      video.load();
    }

    function play(url) {
      stop();
      active = true;
      setSound(!opts.muted);
      emit('loading');
      var isHls = /\.m3u8/i.test(decodeURIComponent(url));
      var nativeHls = video.canPlayType('application/vnd.apple.mpegurl');

      if (isHls && !nativeHls && global.Hls && global.Hls.isSupported()) {
        hls = new global.Hls({ lowLatencyMode: false, backBufferLength: 30 });
        hls.on(global.Hls.Events.ERROR, function (_, data) {
          if (!data.fatal) return;
          if (data.type === global.Hls.ErrorTypes.NETWORK_ERROR) emit('error', 'Stream unavailable');
          else if (data.type === global.Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else emit('error', 'Playback error');
        });
        hls.loadSource(url);
        hls.attachMedia(video);
      } else {
        video.src = url;
      }
      var p = video.play();
      if (p && p.catch) p.catch(function () { /* autoplay or abort; events report real errors */ });
    }

    function init(el) {
      video = el;
      video.addEventListener('playing', function () {
        if (active) setSound(!opts.muted);   // re-assert once the TV's player is actually running
        emit('playing');
      });
      video.addEventListener('waiting', function () { emit('loading'); });
      video.addEventListener('error', function () { if (video.getAttribute('src') || hls) emit('error', 'Stream unavailable'); });
    }
    if (videoEl) init(videoEl);

    return {
      init: init,
      on: function (name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
      play: play,
      stop: stop,
      isActive: function () { return active; },
      video: function () { return video; },
    };
  }

  var main = create();
  main.create = create;
  global.Player = main;
})(window);
