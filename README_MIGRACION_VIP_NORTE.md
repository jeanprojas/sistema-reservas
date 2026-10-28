# VIP Norte — Migración de infraestructura

Este repositorio corresponde exclusivamente al sistema de reservas de **VIP Norte Discotecas**. No comparte aplicación, datos, Supabase, dominios ni credenciales con Los Cantaritos Paisas.

## Arquitectura nueva

- Frontend: GitHub Pages.
- API/backend: Supabase Edge Function `vip-api-v2`.
- Base primaria: Supabase PostgreSQL, proyecto independiente `vip-norte-reservas`.
- Sincronización: PostgreSQL -> `sheets_sync_jobs` -> `vip-sheets-worker` -> Google Apps Script -> Google Sheets.
- Reintentos: persistentes en PostgreSQL; el worker corre cada minuto mediante Supabase Cron.
- Vercel: fuera de la ruta de producción.
- Render: fuera de la nueva ruta de producción; el servicio legado debe mantenerse apagado hasta completar la verificación y después eliminarse.

## Compatibilidad

La interfaz existente continúa utilizando rutas `/api/...`. `public/api-bridge.js` las redirige al Edge Function de Supabase, por lo que no es necesario reescribir las pantallas actuales.

## Integridad de datos

Supabase es la fuente primaria. Google Sheets es una copia sincronizada. Una falla temporal de Sheets no debe impedir guardar una reserva.

Las eliminaciones de reservas se conservan como estados (`Eliminada`/`Cancelado`) en lugar de borrar físicamente el registro.

## Histórico

No se elimina `data/reservas.json`, ni los archivos del backend legado. Permanecen en GitHub como respaldo/auditoría hasta que el histórico externo de MongoDB haya sido verificado y recuperado.

## Google Sheets

Las credenciales del webhook no se guardan en GitHub ni en el navegador. Deben existir como secretos de Supabase Function:

- `GOOGLE_SHEETS_WEBHOOK_URL`
- `GOOGLE_SHEETS_WEBHOOK_TOKEN`

El worker ya está desplegado y la cola ya está programada; si faltan esos secretos, los trabajos permanecen pendientes y se reintentan sin perder las reservas.
