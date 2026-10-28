// Load runtime-only persistence after dependencies are installed.
// npm sets npm_lifecycle_event during install/build scripts; skipping the
// adapter there prevents NODE_OPTIONS from interfering with dependency setup.
if (!process.env.npm_lifecycle_event) {
    require('./blob-persistence.js');
}
