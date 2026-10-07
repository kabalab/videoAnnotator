import { Emitter } from '../../core/emitter.js';

let apiPromise = null;

function loadApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      reject(new Error('the YouTube player script couldn\u2019t be loaded (offline, or blocked by the network or an extension)'));
    };
    document.head.append(s);
    setTimeout(() => {
      if (!window.YT?.Player) {
        apiPromise = null;
        reject(new Error('the YouTube player script took too long to load'));
      }
    }, 15000);
  });
  return apiPromise;
}

const YT_ERRORS = {
  2: 'the YouTube video id is invalid',
  5: 'YouTube\u2019s HTML5 player failed',
  100: 'the YouTube video was removed or is private',
  101: 'the owner doesn\u2019t allow this video to be embedded',
  150: 'the owner doesn\u2019t allow this video to be embedded',
  151: 'YouTube won\u2019t play this video in embedded players (often an age or region restriction); open it on YouTube instead',
  152: 'YouTube won\u2019t play this video in embedded players (often an age or region restriction); open it on YouTube instead',
  153: 'YouTube refused the embed because the page sent no referrer',
};

// offset: seconds of extra footage at the start of the YouTube upload. All times exposed by this
// adapter are on the local file's timeline, so notes line up with either source.
export function createYoutubeAdapter(mount, { videoId, offset = 0, startTime = 0 }) {
  const em = new Emitter();
  const host = document.createElement('div');
  host.className = 'player-media yt-host';
  const target = document.createElement('div');
  host.append(target);
  mount.append(host);

  let yt = null;
  let ready = false;
  let destroyed = false;
  let paused = true;
  let poll = null;
  let lastTime = startTime;
  let pendingSeek = null;
  let state = { volume: 1, muted: false, rate: 1 };

  const toLocal = (t) => Math.max(0, t - offset);
  const getTime = () => (ready ? toLocal(yt.getCurrentTime() || 0) : lastTime);
  const getDuration = () => (ready ? toLocal(yt.getDuration() || 0) : 0);

  loadApi()
    .then((YT) => {
      if (destroyed) return;
      yt = new YT.Player(target, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          controls: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          disablekb: 1,
          iv_load_policy: 3,
          fs: 0,
          start: Math.max(0, Math.floor(startTime + offset)),
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (destroyed) return;
            ready = true;
            yt.setVolume(Math.round(state.volume * 100));
            if (state.muted) yt.mute();
            else yt.unMute();
            if (pendingSeek != null) {
              yt.seekTo(pendingSeek + offset, true);
              pendingSeek = null;
            }
            em.emit('ready', { duration: getDuration() });
            poll = setInterval(tick, 250);
          },
          onStateChange: (e) => {
            const S = YT.PlayerState;
            if (e.data === S.PLAYING) {
              paused = false;
              em.emit('play');
              em.emit('playing');
              em.emit('duration', getDuration());
            } else if (e.data === S.PAUSED || e.data === S.CUED) {
              paused = true;
              em.emit('pause');
              em.emit('playing');
            } else if (e.data === S.ENDED) {
              paused = true;
              em.emit('pause');
              em.emit('ended');
            } else if (e.data === S.BUFFERING) {
              em.emit('waiting');
            }
          },
          onError: (e) => em.emit('error', { code: `YOUTUBE_${e.data}`, message: YT_ERRORS[e.data] || `YouTube error ${e.data}` }),
          onPlaybackRateChange: () => em.emit('ratechange'),
        },
      });
    })
    .catch((err) => em.emit('error', { code: 'YOUTUBE_API', message: err.message }));

  function tick() {
    const t = getTime();
    if (Math.abs(t - lastTime) > 0.01) {
      lastTime = t;
      em.emit('time', t);
    }
    em.emit('buffer');
  }

  return {
    kind: 'youtube',
    el: host,
    on: (e, fn) => em.on(e, fn),
    play: () => ready && yt.playVideo(),
    pause: () => ready && yt.pauseVideo(),
    isPaused: () => paused,
    seek(t) {
      lastTime = t;
      if (ready) yt.seekTo(t + offset, true);
      else pendingSeek = t;
    },
    getTime,
    getDuration,
    getBuffered: () => (ready ? toLocal((yt.getVideoLoadedFraction() || 0) * (yt.getDuration() || 0)) : 0),
    setVolume(x) {
      state.volume = x;
      if (ready) yt.setVolume(Math.round(x * 100));
    },
    setMuted(m) {
      state.muted = m;
      if (ready) (m ? yt.mute() : yt.unMute());
    },
    setRate(r) {
      state.rate = r;
      if (ready) yt.setPlaybackRate(r);
    },
    getRate: () => (ready ? yt.getPlaybackRate() : state.rate),
    getRates: () => (ready ? yt.getAvailablePlaybackRates() : [1]),
    destroy() {
      destroyed = true;
      clearInterval(poll);
      em.clear();
      try {
        yt?.destroy();
      } catch {
        // already gone
      }
      host.remove();
    },
  };
}
