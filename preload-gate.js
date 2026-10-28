// Load the durable persistence adapter before the existing Express server.
// Vercel also exposes NODE_OPTIONS while installing dependencies. mongoose is
// absent during that phase, so the adapter is skipped until runtime.
try {
    require.resolve('mongoose');
    const originalLog = console.log;
    console.log = () => {};
    try {
        require('./blob-persistence.js');
    } finally {
        console.log = originalLog;
    }
} catch (error) {
    if (error && error.code !== 'MODULE_NOT_FOUND') throw error;
}
