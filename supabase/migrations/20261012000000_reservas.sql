-- Reservas (sobres): plata apartada dentro de una cuenta para un fin ("Transportes: $50.000 en Mercado Pago").
-- No son movimientos: no cambian el saldo ni cuentan como gasto/ahorro. Los gastos reales que coinciden con la reserva
-- (por categoría o por una palabra del concepto, ej. "sube") la van descontando; eso se calcula en la app.

create table if not exists yuro.reservas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null,
  monto numeric(18,2) not null check (monto >= 0),        -- lo apartado
  moneda text not null default 'ARS' check (moneda in ('ARS','USD','USDT')),
  cuenta_id uuid references yuro.cuentas (id) on delete set null,   -- dónde está la plata (opcional)
  categoria text not null default '',                     -- los gastos de esta categoría descuentan la reserva
  patron text not null default '',                        -- ...y/o los que tengan esta palabra en el concepto
  mensual boolean not null default false,                 -- true: se repone cada mes; false: se va gastando hasta agotarse
  desde date not null default current_date,               -- los gastos anteriores no la descuentan
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reservas_user_idx on yuro.reservas (user_id, activa);

drop trigger if exists reservas_updated on yuro.reservas;
create trigger reservas_updated before update on yuro.reservas
  for each row execute function yuro.set_updated_at();

alter table yuro.reservas enable row level security;
drop policy if exists reservas_propias on yuro.reservas;
create policy reservas_propias on yuro.reservas for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on yuro.reservas to authenticated;
grant all on yuro.reservas to service_role;
revoke all on yuro.reservas from anon;
