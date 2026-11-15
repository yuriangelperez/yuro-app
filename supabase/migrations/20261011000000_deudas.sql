-- Fase 4 del plan maestro: deudas (lo que debo y lo que me deben).
-- Pedir o prestar plata ("Deuda") y pagarla ("Pago deuda") mueven plata pero NO son ingreso ni gasto.

create table if not exists yuro.deudas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null,                                  -- con quién: "Juan", "Banco Galicia"
  direccion text not null check (direccion in ('debo','me_deben')),
  monto numeric(18,2) not null check (monto > 0),         -- total original
  moneda text not null default 'ARS' check (moneda in ('ARS','USD','USDT')),
  fecha date not null default current_date,
  vencimiento date,
  nota text not null default '',
  activa boolean not null default true,                  -- false = archivada
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deudas_user_idx on yuro.deudas (user_id, activa);

drop trigger if exists deudas_updated on yuro.deudas;
create trigger deudas_updated before update on yuro.deudas
  for each row execute function yuro.set_updated_at();

alter table yuro.movimientos add column if not exists deuda_id uuid references yuro.deudas (id) on delete set null;
create index if not exists movimientos_deuda_idx on yuro.movimientos (deuda_id);

alter table yuro.movimientos drop constraint if exists movimientos_tipo_check;
alter table yuro.movimientos add constraint movimientos_tipo_check
  check (tipo in ('Ingreso','Egreso','Ahorro','Cambio','Transferencia','Deuda','Pago deuda'));

alter table yuro.deudas enable row level security;
drop policy if exists deudas_propias on yuro.deudas;
create policy deudas_propias on yuro.deudas for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on yuro.deudas to authenticated;
grant all on yuro.deudas to service_role;
revoke all on yuro.deudas from anon;
