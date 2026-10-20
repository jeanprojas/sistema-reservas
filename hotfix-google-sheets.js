// VIP Norte - compatibility hotfix for the Google Sheets webhook.
// This is intentionally additive: it does not remove or replace any existing
// reservation functionality. It only adds authentication headers and accepts
// common successful webhook response formats while preserving real errors.

const originalFetch = global.fetch;

if (typeof originalFetch === 'function') {
    global.fetch = async function vipNorteFetch(input, init = {}) {
        const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
        const token = process.env.GOOGLE_SHEETS_WEBHOOK_TOKEN;
        const requestUrl = typeof input === 'string' ? input : input?.url;

        if (!webhookUrl || !token || !requestUrl || requestUrl !== webhookUrl) {
            return originalFetch(input, init);
        }

        const headers = new Headers(
            (typeof input === 'object' && input?.headers) || init.headers || {}
        );
        headers.set('Authorization', `Bearer ${token}`);
        headers.set('X-Webhook-Token', token);

        const nextInit = { ...init, headers };
        const response = await originalFetch(input, nextInit);

        if (!response.ok) return response;

        try {
            const raw = await response.clone().text();
            const text = String(raw || '').trim();
            let parsed = null;

            try {
                parsed = text ? JSON.parse(text) : null;
            } catch (_) {
                // Some Apps Script webhooks answer with plain text.
            }

            const status = String(parsed?.status || '').toLowerCase();
            const success = parsed?.success === true || parsed?.ok === true;
            const acceptedStatus = ['success', 'ok', 'created', 'updated', 'inserted'].includes(status);
            const plainSuccess = ['ok', 'success', 'created', 'updated', 'inserted', 'true'].includes(text.toLowerCase());

            if (success || acceptedStatus || plainSuccess) {
                return new Response(JSON.stringify({ status: 'success' }), {
                    status: response.status,
                    headers: { 'content-type': 'application/json' }
                });
            }
        } catch (error) {
            console.warn('VIP Norte: no fue posible normalizar la respuesta de Google Sheets:', error.message);
        }

        return response;
    };
}
