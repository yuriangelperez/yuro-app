-- Hora de cada movimiento (HH:MM, hora argentina). Los anteriores quedan sin hora.
alter table yuro.movimientos
  add column if not exists hora text check (hora ~ '^\d{2}:\d{2}$');
