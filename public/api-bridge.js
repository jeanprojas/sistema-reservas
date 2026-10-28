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

    // Compatibility layer for the legacy VIP Norte public reservation form.
    // The old frontend sends `motivo` and `instagram`; the new PostgreSQL API
    // stores the former as motivoReserva and keeps the latter inside payload.
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

    // Legacy public search sends ?query=. The API accepts the same value as
    // telefono/codigo/id; map it to telefono for backwards compatibility.
    if (source.pathname === '/api/reservas/buscar' && source.searchParams.has('query') &&
        !source.searchParams.has('telefono') && !source.searchParams.has('codigo') && !source.searchParams.has('id')) {
      const q = source.searchParams.get('query') || '';
      const rewritten = new URLSearchParams(source.searchParams);
      rewritten.delete('query');
      rewritten.set('telefono', q);
      nextInit.__vipTarget = API + targetPath + '?' + rewritten.toString();
    }

    const response = await nativeFetch(nextInit.__vipTarget || target, nextInit);

    // Keep the response contract expected by the legacy frontend.
    if (source.pathname === '/api/reservas' && (init.method || 'GET').toUpperCase() === 'POST') {
      try {
        const data = await response.clone().json();
        if (response.ok && data && !data.success) {
          return new Response(JSON.stringify({ ...data, success: true, mensaje: 'Reserva creada correctamente.' }), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
          });
        }
      } catch (_) {}
    }

    try {
      const data = await response.clone().json();
      if (data?.token) localStorage.setItem('vip_session_token', data.token);
      if (data?.usuario && !data.username) {
        data.username = data.usuario.username;
        data.rol = data.usuario.rol;
        data.sede = data.usuario.sede;
      }
    } catch (_) {}

    return response;
  };
})();
