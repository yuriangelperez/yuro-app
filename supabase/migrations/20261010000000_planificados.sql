-- Fase 2 del plan maestro: transacciones planificadas ("sueldo esperado el 15/10: +$1.000.000").
-- No son movimientos: no afectan saldos ni estadísticas hasta que ocurren. Al llegar el movimiento real se vinculan.

create table if not exists yuro.planificados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fecha date not null,                                   -- cuándo se espera
  concepto text not null,
  valor numeric(18,2) not null,                          -- con signo: ingresos +, egresos -
  moneda text not null default 'ARS' check (moneda in ('ARS','USD','USDT')),
  tipo text not null check (tipo in ('Ingreso','Egreso')),
  metodo text not null default '',
  cuenta_id uuid references yuro.cuentas (id) on delete set null,
  categoria text not null default '',
  categoria2 text not null default '',
  estado text not null default 'pendiente' check (estado in ('pendiente','cumplido','cancelado')),
  movimiento_id uuid references yuro.movimientos (id) on delete set null,  -- el movimiento real que lo cumplió
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists planificados_user_estado_idx on yuro.planificados (user_id, estado, fecha);

drop trigger if exists planificados_updated on yuro.planificados;
create trigger planificados_updated before update on yuro.planificados
  for each row execute function yuro.set_updated_at();

alter table yuro.planificados enable row level security;
drop policy if exists planificados_propios on yuro.planificados;
create policy planificados_propios on yuro.planificados for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on yuro.planificados to authenticated;
grant all on yuro.planificados to service_role;
revoke all on yuro.planificados from anon;
