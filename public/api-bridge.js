(() => {
  // VIP Norte only: frontend -> Supabase Edge Function. No Vercel/Render runtime dependency.
  const API = 'https://ddufmiiaxmvobbjtolgm.supabase.co/functions/v1/vip-api-v2';
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const raw = typeof input === 'string' ? input : input?.url;
    let source;
    try { source = new URL(raw, window.location.href); } catch { return nativeFetch(input, init); }
    if (!source.pathname.startsWith('/api/')) return nativeFetch(input, init);

    const targetPath = source.pathname.replace(/^\/api/, '');
    const target = API + targetPath + source.search;
    const headers = new Headers((typeof input === 'object' && input?.headers) || init.headers || {});
    const token = localStorage.getItem('vip_session_token');
    if (token) headers.set('Authorization', `Bearer ${token}`);

    let nextInit = { ...init, headers };

    // Compatibility layer for the legacy public reservation form.
    if (source.pathname === '/api/reservas' && (init.method || 'GET').toUpperCase() === 'POST' && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body);
        if (body.motivo !== undefined && body.motivoReserva === undefined) {
          body.motivoReserva = body.motivo;
          delete body.motivo;
        }
        if (body.instagram !== undefined) {
          body.payload = { ...(body.payload || {}), instagram: body.instagram };
          delete body.instagram;
        }
        nextInit.body = JSON.stringify(body);
      } catch (_) {}
    }

    // Legacy public search sends ?query=. Keep the API's existing parameter contract.
    if (source.pathname === '/api/reservas/buscar' && source.searchParams.has('query') &&
        !source.searchParams.has('telefono') && !source.searchParams.has('codigo') && !source.searchParams.has('id')) {
      const q = source.searchParams.get('query') || '';
      const rewritten = new URLSearchParams(source.searchParams);
      rewritten.delete('query');
      rewritten.set('telefono', q);
      nextInit.__vipTarget = API + targetPath + '?' + rewritten.toString();
    }

    let response = await nativeFetch(nextInit.__vipTarget || target, nextInit);
    try {
      const data = await response.clone().json();
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        let changed = false;

        // Old admin/staff screens expect success=true; Supabase returns ok=true for login.
        if (source.pathname === '/api/login' && data.ok && data.success === undefined) {
          data.success = true;
          changed = true;
        }
        if (data.error && !data.mensaje) {
          data.mensaje = typeof data.error === 'string'
            ? data.error
            : (data.error.message || data.error.details || JSON.stringify(data.error));
          changed = true;
        }
        if (source.pathname === '/api/admin/sincronizar-sheets' && response.ok && data.ok) {
          if (data.success === undefined) { data.success = true; changed = true; }
          if (data.programadas === undefined && data.queued !== undefined) { data.programadas = data.queued; changed = true; }
        }
        if (source.pathname === '/api/admin/sincronizar-sheets/estado' && Array.isArray(data.jobs)) {
          if (data.pendientes === undefined) {
            data.pendientes = data.jobs.filter(j => ['pending', 'processing'].includes(String(j.status))).length;
            changed = true;
          }
          if (data.conErrores === undefined) {
            data.conErrores = data.jobs.filter(j => Number(j.attempts || 0) > 0 || String(j.status) === 'failed').length;
            changed = true;
          }
        }

        // Public form expects a success flag when a reservation was inserted.
        if (source.pathname === '/api/reservas' && (init.method || 'GET').toUpperCase() === 'POST' && response.ok && !data.success) {
          data.success = true;
          data.mensaje = data.mensaje || 'Reserva creada correctamente.';
          changed = true;
        }

        if (data.token) localStorage.setItem('vip_session_token', data.token);
        if (data.usuario && !data.username) {
          data.username = data.usuario.username;
          data.rol = data.usuario.rol;
          data.sede = data.usuario.sede;
          changed = true;
        }

        if (changed) {
          const responseHeaders = new Headers(response.headers);
          responseHeaders.delete('content-length');
          responseHeaders.set('content-type', 'application/json; charset=utf-8');
          response = new Response(JSON.stringify(data), {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders
          });
        }
      }
    } catch (_) {}

    return response;
  };
})();
