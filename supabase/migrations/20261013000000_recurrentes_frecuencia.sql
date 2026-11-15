-- Recurrentes semanales y quincenales: frecuencia, día de la semana y progreso por fecha.
-- Idempotente. Los recurrentes existentes quedan como "mensual".

alter table yuro.recurrentes
  add column if not exists frecuencia text not null default 'mensual' check (frecuencia in ('mensual','quincenal','semanal')),
  add column if not exists dia_semana smallint check (dia_semana between 0 and 6),
  add column if not exists inicio date,
  add column if not exists ultima_fecha date;
