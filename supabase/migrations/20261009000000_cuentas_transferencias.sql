-- Fase 1 del plan maestro: proveedores, cuentas, transferencias entre cuentas propias y huella anti-duplicados.
-- Idempotente. Los movimientos existentes se enlazan solos a una cuenta por su "metodo".

-- ───────────────────────── Proveedores (catálogo común, solo lectura) ─────────────────────────

create table if not exists yuro.proveedores (
  id text primary key,                                  -- slug estable: 'mercadopago', 'naranjax'…
  nombre text not null,
  tipo text not null check (tipo in ('bank','wallet','cash','payment','exchange','other')),
  pais text not null default 'AR',
  logo text,
  activo boolean not null default true
);

insert into yuro.proveedores (id, nombre, tipo) values
  ('efectivo',    'Efectivo',      'cash'),
  ('mercadopago', 'Mercado Pago',  'wallet'),
  ('naranjax',    'Naranja X',     'wallet'),
  ('uala',        'Ualá',          'wallet'),
  ('brubank',     'Brubank',       'bank'),
  ('santander',   'Santander',     'bank'),
  ('galicia',     'Galicia',       'bank'),
  ('bbva',        'BBVA',          'bank'),
  ('macro',       'Banco Macro',   'bank'),
  ('nacion',      'Banco Nación',  'bank'),
  ('paypal',      'PayPal',        'payment'),
  ('binance',     'Binance',       'exchange'),
  ('lemon',       'Lemon',         'exchange'),
  ('belo',        'Belo',          'exchange')
on conflict (id) do nothing;

-- ───────────────────────── Cuentas del usuario ─────────────────────────

create table if not exists yuro.cuentas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null,
  proveedor_id text references yuro.proveedores (id),
  tipo text not null default 'wallet' check (tipo in ('bank','wallet','cash','payment','exchange','savings','investment')),
  moneda text not null default 'ARS' check (moneda in ('ARS','USD','USDT')),  -- moneda habitual (una cuenta puede tener movimientos en otras)
  saldo_inicial numeric(18,2) not null default 0,       -- en su moneda habitual
  activa boolean not null default true,                 -- archivar en vez de borrar: los movimientos la conservan
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un nombre por usuario, sin distinguir mayúsculas ("Mercado pago" = "mercado PAGO").
create unique index if not exists cuentas_nombre_uq on yuro.cuentas (user_id, lower(nombre));

drop trigger if exists cuentas_updated on yuro.cuentas;
create trigger cuentas_updated before update on yuro.cuentas
  for each row execute function yuro.set_updated_at();

-- ───────────────────────── Movimientos: cuenta, destino, tipo Transferencia, huella ─────────────────────────

alter table yuro.movimientos
  add column if not exists cuenta_id uuid references yuro.cuentas (id) on delete set null,
  add column if not exists cuenta_destino_id uuid references yuro.cuentas (id) on delete set null,
  add column if not exists huella text;

-- Transferencia = plata que pasa de una cuenta propia a otra. No es ingreso ni gasto. `valor` es el monto (positivo).
alter table yuro.movimientos drop constraint if exists movimientos_tipo_check;
alter table yuro.movimientos add constraint movimientos_tipo_check
  check (tipo in ('Ingreso','Egreso','Ahorro','Cambio','Transferencia'));

create index if not exists movimientos_cuenta_idx on yuro.movimientos (cuenta_id);
create index if not exists movimientos_huella_idx on yuro.movimientos (user_id, huella);

-- Huella: identifica "la misma operación" venga de donde venga (fecha | importe | moneda). No es única:
-- dos compras iguales el mismo día son legítimas; la app/edge function decide con más señales.
create or replace function yuro.huella_de(f date, v numeric, m text) returns text
language sql stable as $$ select f::text || '|' || to_char(v, 'FM999999999999990.00') || '|' || m $$;

-- Antes de guardar: calcula la huella y, si el movimiento trae "metodo" pero no cuenta, la busca o la crea.
create or replace function yuro.movimiento_antes() returns trigger
language plpgsql as $$
declare cid uuid;
begin
  new.huella := yuro.huella_de(new.fecha, new.valor, new.moneda);

  if new.cuenta_id is null and coalesce(btrim(new.metodo), '') <> '' then
    select id into cid from yuro.cuentas where user_id = new.user_id and lower(nombre) = lower(btrim(new.metodo));
    if cid is null then
      insert into yuro.cuentas (user_id, nombre, proveedor_id, tipo, moneda)
      values (
        new.user_id, btrim(new.metodo),
        (select p.id from yuro.proveedores p where lower(btrim(new.metodo)) like '%' || lower(p.nombre) || '%' or lower(btrim(new.metodo)) like '%' || p.id || '%' limit 1),
        case when lower(new.metodo) like '%efectivo%' then 'cash' when lower(new.metodo) ~ 'binance|lemon|belo|cripto' then 'exchange' when lower(new.metodo) ~ 'tarjeta|banco' then 'bank' else 'wallet' end,
        new.moneda
      )
      on conflict (user_id, lower(nombre)) do nothing
      returning id into cid;
      if cid is null then
        select id into cid from yuro.cuentas where user_id = new.user_id and lower(nombre) = lower(btrim(new.metodo));
      end if;
    end if;
    new.cuenta_id := cid;
  end if;
  return new;
end $$;

drop trigger if exists movimientos_antes on yuro.movimientos;
create trigger movimientos_antes before insert or update on yuro.movimientos
  for each row execute function yuro.movimiento_antes();

-- Datos existentes: una cuenta por cada "metodo" usado, y los movimientos quedan enlazados.
insert into yuro.cuentas (user_id, nombre, proveedor_id, tipo, moneda)
select distinct on (m.user_id, lower(btrim(m.metodo)))
  m.user_id, btrim(m.metodo),
  (select p.id from yuro.proveedores p where lower(btrim(m.metodo)) like '%' || lower(p.nombre) || '%' or lower(btrim(m.metodo)) like '%' || p.id || '%' limit 1),
  case when lower(m.metodo) like '%efectivo%' then 'cash' when lower(m.metodo) ~ 'binance|lemon|belo|cripto' then 'exchange' when lower(m.metodo) ~ 'tarjeta|banco' then 'bank' else 'wallet' end,
  m.moneda
from yuro.movimientos m
where coalesce(btrim(m.metodo), '') <> ''
order by m.user_id, lower(btrim(m.metodo)), m.fecha desc
on conflict (user_id, lower(nombre)) do nothing;

update yuro.movimientos m
set cuenta_id = c.id
from yuro.cuentas c
where m.cuenta_id is null and c.user_id = m.user_id and lower(c.nombre) = lower(btrim(m.metodo));

-- Esto de arriba dispara el trigger y deja la huella; las filas sin metodo también la necesitan.
update yuro.movimientos set huella = yuro.huella_de(fecha, valor, moneda) where huella is null;

-- ───────────────────────── Mercado Pago: asociar en vez de duplicar ─────────────────────────
-- Si llega un movimiento de Mercado Pago y ya existe el mismo (misma huella y misma cuenta) cargado por una
-- notificación, no se crea otro: la notificación pasa a tener el id de Mercado Pago ("asociar nueva fuente").
create or replace function yuro.mp_asociar() returns trigger
language plpgsql as $$
declare previo uuid;
begin
  if new.origen <> 'mercadopago' or new.external_id is null then return new; end if;
  select id into previo from yuro.movimientos
   where user_id = new.user_id and origen = 'notificacion' and external_id is null
     and huella = yuro.huella_de(new.fecha, new.valor, new.moneda)
     and (cuenta_id is null or new.cuenta_id is null or cuenta_id = new.cuenta_id)
   order by abs(extract(epoch from (coalesce(hora, '00:00')::time - coalesce(new.hora, '00:00')::time)))
   limit 1;
  if previo is null then return new; end if;
  update yuro.movimientos set origen = 'mercadopago', external_id = new.external_id, hora = coalesce(new.hora, hora) where id = previo;
  return null; -- no se inserta la copia
end $$;

drop trigger if exists movimientos_zmp_asociar on yuro.movimientos;
-- "z" para que corra después de movimiento_antes (los triggers corren en orden alfabético): ya tiene huella y cuenta
create trigger movimientos_zmp_asociar before insert on yuro.movimientos
  for each row execute function yuro.mp_asociar();

-- ───────────────────────── Seguridad y permisos ─────────────────────────

alter table yuro.proveedores enable row level security;
alter table yuro.cuentas     enable row level security;

drop policy if exists proveedores_lectura on yuro.proveedores;
create policy proveedores_lectura on yuro.proveedores for select to authenticated using (true);

drop policy if exists cuentas_propias on yuro.cuentas;
create policy cuentas_propias on yuro.cuentas for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select on yuro.proveedores to authenticated;
grant select, insert, update, delete on yuro.cuentas to authenticated;
grant all on yuro.proveedores, yuro.cuentas to service_role;
revoke all on yuro.proveedores, yuro.cuentas from anon;
