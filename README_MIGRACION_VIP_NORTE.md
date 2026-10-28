# VIP Norte — Migración de infraestructura

Este repositorio corresponde exclusivamente al sistema de reservas de VIP Norte Discotecas.

## Arquitectura objetivo

- Frontend estático: GitHub Pages.
- Backend y persistencia: Supabase.
- Base de datos: PostgreSQL/Supabase.
- Sincronización: Supabase Edge Function -> Google Apps Script -> Google Sheets.
- Vercel: eliminado de la arquitectura de producción.
- Render: legado; debe quedar deshabilitado/eliminado después de validar producción.

## Regla de datos

Supabase es la fuente primaria. Google Sheets es una copia sincronizada. Una falla de Sheets no debe impedir guardar una reserva.

## Compatibilidad

Las páginas existentes continúan usando rutas `/api/...`; `public/api-bridge.js` las dirige al Edge Function de Supabase sin obligar a reescribir toda la interfaz.

## Datos históricos

No se elimina `data/reservas.json`, ni los archivos del backend legado. Se conservan para recuperación/auditoría hasta completar la validación final.
