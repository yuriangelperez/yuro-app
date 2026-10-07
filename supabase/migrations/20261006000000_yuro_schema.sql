-- Schema "yuro": base de datos de Mis Finanzas.
-- Pegar completo en Supabase > SQL Editor. Es idempotente (se puede correr dos veces).

create schema if not exists yuro;

-- ───────────────────────── Utilidades ─────────────────────────

create or replace function yuro.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ───────────────────────── Perfil (1 fila por usuario de auth) ─────────────────────────

create table if not exists yuro.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text,
  avatar_url text,
  moneda_vista text not null default 'ARS' check (moneda_vista in ('ARS','USD','USDT')),
  fuente_usd text not null default 'blue' check (fuente_usd in ('blue','oficial','bolsa')),
  meta_ahorro_nombre text,
  meta_ahorro_monto numeric(18,2),
  meta_ahorro_moneda text check (meta_ahorro_moneda in ('ARS','USD','USDT')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Al registrarse (Google u otro), se crea el perfil solo.
create or replace function yuro.crear_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into yuro.perfiles (id, nombre, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created_yuro on auth.users;
create trigger on_auth_user_created_yuro
  after insert on auth.users
  for each row execute function yuro.crear_perfil();

-- ───────────────────────── Categorías propias ─────────────────────────

create table if not exists yuro.categorias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nivel text not null check (nivel in ('cat','cat2')),
  nombre text not null,
  oculta boolean not null default false, -- borrada: no se ofrece más, los movimientos viejos la conservan
  created_at timestamptz not null default now(),
  unique (user_id, nivel, nombre)
);

-- ───────────────────────── Importaciones (Excel / PDF / CSV) ─────────────────────────

create table if not exists yuro.importaciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  origen text not null check (origen in ('excel','csv','pdf')),
  archivo_nombre text,
  banco text,
  filas_total int not null default 0,
  filas_nuevas int not null default 0,
  filas_duplicadas int not null default 0,
  estado text not null default 'pendiente' check (estado in ('pendiente','confirmada','descartada','error')),
  error text,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Movimientos ─────────────────────────

create table if not exists yuro.movimientos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fecha date not null,
  hora text check (hora ~ '^\d{2}:\d{2}$'),     -- HH:MM, hora argentina (opcional)
  concepto text not null,
  valor numeric(18,2) not null,                 -- con signo, en su moneda: egresos y ahorros negativos
  moneda text not null default 'ARS' check (moneda in ('ARS','USD','USDT')),
  valor_ars numeric(18,2),                      -- equivalente en pesos al momento de cargarlo
  tipo text not null check (tipo in ('Ingreso','Egreso','Ahorro','Cambio')),
  metodo text not null default '',
  categoria text not null default '',
  categoria2 text not null default '',
  cuotas_cumplidas numeric(8,2), -- numeric: la hoja trae valores como 7.8
  cuotas_totales numeric(8,2),
  -- de dónde vino y cómo evitar duplicados
  origen text not null default 'manual' check (origen in ('manual','importacion','mercadopago','notificacion','recurrente')),
  external_id text,                             -- id de MP, o hash fecha|valor|concepto en importaciones
  importacion_id uuid references yuro.importaciones (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists movimientos_user_fecha_idx on yuro.movimientos (user_id, fecha desc);
create index if not exists movimientos_importacion_idx on yuro.movimientos (importacion_id);
-- Un mismo movimiento externo no se carga dos veces. Índice NO parcial (necesario para upsert con on_conflict);
-- los NULL no chocan entre sí, así que los movimientos manuales sin external_id no se afectan.
create unique index if not exists movimientos_externo_uq
  on yuro.movimientos (user_id, origen, external_id);

drop trigger if exists movimientos_updated on yuro.movimientos;
create trigger movimientos_updated before update on yuro.movimientos
  for each row execute function yuro.set_updated_at();

-- ───────────────────────── Reglas para categorizar solo ─────────────────────────
-- Si el concepto contiene `patron` (sin distinguir mayúsculas), se sugiere esa categoría.

create table if not exists yuro.reglas_categoria (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  patron text not null,
  categoria text not null,
  categoria2 text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, patron)
);

-- ───────────────────────── Presupuestos, recurrentes, saldos ─────────────────────────

create table if not exists yuro.presupuestos (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  categoria text not null,
  monto numeric(18,2) not null check (monto >= 0),
  moneda text not null default 'ARS' check (moneda in ('ARS','USD','USDT')),
  primary key (user_id, categoria)
);

create table if not exists yuro.recurrentes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  concepto text not null,
  valor numeric(18,2) not null,
  moneda text not null default 'ARS' check (moneda in ('ARS','USD','USDT')),
  tipo text not null check (tipo in ('Ingreso','Egreso','Ahorro')),
  metodo text not null default '',
  categoria text not null default '',
  categoria2 text not null default '',
  dia int not null check (dia between 1 and 31),
  desde text not null check (desde ~ '^\d{4}-\d{2}$'),
  activo boolean not null default true,
  ultimo_ym text check (ultimo_ym ~ '^\d{4}-\d{2}$'),
  created_at timestamptz not null default now()
);

create table if not exists yuro.saldos_iniciales (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  anio int not null,
  moneda text not null check (moneda in ('ARS','USD','USDT')),
  saldo numeric(18,2) not null default 0,   -- lo que tenías el 1 de enero
  ahorro numeric(18,2) not null default 0,  -- ajuste de lo ahorrado
  primary key (user_id, anio, moneda)
);

-- ───────────────────────── Mercado Pago (solo lectura de movimientos) ─────────────────────────
-- Guarda los tokens OAuth. NO tiene policies ni grants para usuarios: solo la Edge Function
-- (service_role) la lee y escribe. La app consulta el estado con yuro.mp_estado.

create table if not exists yuro.conexiones_mp (
  user_id uuid primary key references auth.users (id) on delete cascade,
  mp_user_id bigint not null,
  access_token text not null,
  refresh_token text,
  expira_en timestamptz,
  ultima_sync timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists conexiones_mp_updated on yuro.conexiones_mp;
create trigger conexiones_mp_updated before update on yuro.conexiones_mp
  for each row execute function yuro.set_updated_at();

-- Vista sin tokens para que la app sepa si está conectado.
create or replace view yuro.mp_estado with (security_invoker = off) as
  select user_id, mp_user_id, ultima_sync, created_at
  from yuro.conexiones_mp
  where user_id = auth.uid();

-- ───────────────────────── Seguridad (RLS) ─────────────────────────

alter table yuro.perfiles          enable row level security;
alter table yuro.categorias        enable row level security;
alter table yuro.importaciones     enable row level security;
alter table yuro.movimientos       enable row level security;
alter table yuro.reglas_categoria  enable row level security;
alter table yuro.presupuestos      enable row level security;
alter table yuro.recurrentes       enable row level security;
alter table yuro.saldos_iniciales  enable row level security;
alter table yuro.conexiones_mp     enable row level security; -- sin policies = nadie salvo service_role

-- Perfil: cada uno ve y edita solo el suyo (se crea por trigger, no se inserta a mano).
drop policy if exists perfiles_select on yuro.perfiles;
drop policy if exists perfiles_update on yuro.perfiles;
create policy perfiles_select on yuro.perfiles for select to authenticated using (id = (select auth.uid()));
create policy perfiles_update on yuro.perfiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Tablas con user_id: acceso total solo a las filas propias.
do $$
declare t text;
begin
  foreach t in array array['categorias','importaciones','movimientos','reglas_categoria','presupuestos','recurrentes','saldos_iniciales']
  loop
    execute format('drop policy if exists %I on yuro.%I', t || '_propias', t);
    execute format(
      'create policy %I on yuro.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_propias', t);
  end loop;
end $$;

-- ───────────────────────── Permisos de la API ─────────────────────────

grant usage on schema yuro to authenticated, service_role;

grant select, update on yuro.perfiles to authenticated;
grant select, insert, update, delete on
  yuro.categorias, yuro.importaciones, yuro.movimientos, yuro.reglas_categoria,
  yuro.presupuestos, yuro.recurrentes, yuro.saldos_iniciales
  to authenticated;
grant select on yuro.mp_estado to authenticated;

grant all on all tables in schema yuro to service_role;
grant all on all sequences in schema yuro to service_role;

-- Nada para anon: sin sesión no se ve nada.
revoke all on all tables in schema yuro from anon;
