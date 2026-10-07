-- Mercado Pago: seguimiento de los reportes ya importados y del último pedido.
alter table yuro.conexiones_mp
  add column if not exists reportes_procesados text[] not null default '{}',
  add column if not exists ultimo_reporte_pedido timestamptz;
