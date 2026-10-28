from pathlib import Path
p=Path('server.js')
s=p.read_text(encoding='utf-8')
s=s.replace("controller.abort(), 8000", "controller.abort(), 6000", 1)
s=s.replace("async function sincronizarReservasGoogleBatch(reservas, concurrency = 6)", "async function sincronizarReservasGoogleBatch(reservas, concurrency = 12)", 1)
s=s.replace("sincronizarReservasGoogleBatch(reservas, 6)", "sincronizarReservasGoogleBatch(reservas, 12)", 1)
p.write_text(s, encoding='utf-8')
