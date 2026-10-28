// Temporary deployment diagnostic. Logs only presence/absence of storage credentials,
// never their values. Remove after persistence verification.
console.log('VIP Norte runtime env:', JSON.stringify({
    mongo: Boolean(process.env.MONGO_URI),
    blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    vercelOidc: Boolean(process.env.VERCEL_OIDC_TOKEN)
}));
