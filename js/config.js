const PRIVATE_LAN = /^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

export const config = {
  // Checked in order; the first matching rule decides the environment.
  // Anything unmatched uses defaultEnv, which is the safe read-only PUBLIC mode.
  envRules: [
    { name: 'file protocol', env: 'LOCAL', test: (loc) => loc.protocol === 'file:' },
    { name: 'localhost', env: 'LOCAL', test: (loc) => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(loc.hostname) },
    { name: '.local hostname', env: 'LOCAL', test: (loc) => loc.hostname.endsWith('.local') },
    { name: 'private network address', env: 'LOCAL', test: (loc) => PRIVATE_LAN.test(loc.hostname) },
    { name: 'GitHub Pages', env: 'PUBLIC', test: (loc) => loc.hostname.endsWith('.github.io') },
    { name: 'custom public domain', env: 'PUBLIC', test: (loc) => config.publicDomains.includes(loc.hostname) },
  ],
  // Add a custom domain here if the Pages site is served from one, e.g. 'notes.example.com'.
  publicDomains: [],
  defaultEnv: 'PUBLIC',

  paths: {
    library: 'data/library.json',
    descriptors: 'data/descriptors.json',
    videoData: (id) => `data/videos/${id}.json`,
    videosDir: 'videos',
  },

  player: {
    jumpHistoryLimit: 20,
    jumpDedupeSeconds: 2,
    stallTimeoutMs: 8000,
    seekStep: 5,
    bigSeekStep: 10,
    rates: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
    controlsHideMs: 2500,
  },

  undoMs: 6000,
  videoExtensions: ['.mp4', '.webm', '.m4v', '.mov', '.mkv', '.ogv', '.ogg'],
  tagSwatches: ['#4f7cff', '#2fb8c9', '#3fb27f', '#7cc45a', '#e0a43b', '#d9774b', '#e5484d', '#e86fb0', '#b07cff', '#8a94a6'],
};
