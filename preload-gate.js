// Load runtime-only persistence after dependencies are installed.
// During Vercel's dependency installation mongoose is not present yet, so the
// adapter must not be loaded. At runtime mongoose is installed and available.
try {
    require.resolve('mongoose');
    require('./blob-persistence.js');
} catch (error) {
    if (error && error.code !== 'MODULE_NOT_FOUND') throw error;
}
