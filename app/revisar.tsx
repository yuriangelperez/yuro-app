import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { avisar, confirmar } from '../src/alerta';
import { exportarRespaldo } from '../src/exportar';
import { desdeLaHoja, duplicadosEntreCuentas, recurrentesRepetidos, yaCargadosComoTransferencia } from '../src/mantenimiento';
import { cambiosMalHechos, fueraDelMes, cuotasRotas, enCero, pagosEnCuentaEquivocada, pagosPorOtraCuenta, programadosAFuturo, recurrentesDeReserva, sinCuenta } from '../src/mantenimiento';
import { useDepositosReserva, useFinanzas } from '../src/store';
import { c } from '../src/theme';
import { Card, centrado, Chip, MAX_FORM, s, tap, Titulo } from '../src/ui';
import { fechaCorta, hoyYmd, money } from '../src/util';

const Boton = ({ t, onPress, color = c.accent, ocupado }: { t: string; onPress: () => void; color?: string; ocupado?: boolean }) => (
  <Pressable onPress={onPress} disabled={ocupado} style={{ backgroundColor: color, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 10, opacity: ocupado ? 0.6 : 1 }}>
    <Text style={{ color: '#fff', fontWeight: '700' }}>{ocupado ? 'Trabajando…' : t}</Text>
  </Pressable>
);

export default function Revisar() {
  const porAnio = useFinanzas((st) => st.porAnio);
  const cuentas = useFinanzas((st) => st.cuentas);
  const recurrentes = useFinanzas((st) => st.recurrentes);
  const { guardar, eliminar, guardarRecurrente, borrarRecurrente, convertirEnDeposito, descartarTransferencia, dejarSoloEsteMes } = useFinanzas();
  const descartadas = useFinanzas((st) => st.transferenciasDescartadas);
  const depositos = useDepositosReserva();
  const [ocupado, setOcupado] = useState<string | null>(null);

  const todos = useMemo(() => Object.values(porAnio).flat(), [porAnio]);
  const ceros = useMemo(() => enCero(todos), [todos]);
  const sinCta = useMemo(() => sinCuenta(todos), [todos]);
  const cuotas = useMemo(() => cuotasRotas(todos), [todos]);
  const cambios = useMemo(() => cambiosMalHechos(todos, cuentas), [todos, cuentas]);
  const recsReserva = useMemo(() => recurrentesDeReserva(recurrentes, cuentas), [recurrentes, cuentas]);
  const pagos = useMemo(() => pagosEnCuentaEquivocada(todos, cuentas).filter((x) => !descartadas.includes(`pago|${x.egreso.id}`)), [todos, cuentas, descartadas]);
  const porOtra = useMemo(() => pagosPorOtraCuenta(todos, cuentas).filter((x) => !descartadas.includes(`otra|${x.mov.id}`)), [todos, cuentas, descartadas]);
  const planificados = useFinanzas((st) => st.planificados);
  const programados = useMemo(() => programadosAFuturo(todos, hoyYmd(), planificados).filter((g) => !descartadas.includes(`prog|${g.clave}`)), [todos, planificados, descartadas]);
  const ocultarCero = descartadas.includes('cero|oculto');
  const dupCuentas = useMemo(() => duplicadosEntreCuentas(todos).filter((x) => !descartadas.includes(`dup|${x.auto.id}`)), [todos, descartadas]);
  const yaTransf = useMemo(() => yaCargadosComoTransferencia(todos).filter((x) => !descartadas.includes(`yat|${x.mov.id}`)), [todos, descartadas]);
  const recsRepetidos = useMemo(() => recurrentesRepetidos(recurrentes), [recurrentes]);
  const hoja = useMemo(() => desdeLaHoja(todos, hoyYmd().slice(0, 7)).filter((m) => !descartadas.includes(`hoja|${m.id}`)), [todos, descartadas]);
  const nombreCuenta = (id?: string | null) => cuentas.find((x) => x.id === id)?.nombre ?? 'sin cuenta';
  const ym = hoyYmd().slice(0, 7);
  const fuera = useMemo(() => fueraDelMes(todos, ym), [todos, ym]);
  const antes = fuera.filter((m) => m.fecha.slice(0, 7) < ym).length;
  const despues = fuera.length - antes;
  const activas = cuentas.filter((x) => x.activa);
  const total = yaTransf.length + dupCuentas.length + recsRepetidos.length + programados.length + porOtra.length + pagos.length + depositos.length + cambios.length + recsReserva.length + ceros.length + sinCta.length + cuotas.length;

  const correr = async (clave: string, f: () => Promise<void>) => {
    tap(true);
    setOcupado(clave);
    try { await f(); } catch (e) { avisar(e instanceof Error ? e.message : 'No se pudo corregir'); }
    setOcupado(null);
  };

  const pasarADepositos = () => correr('dep', async () => {
    for (const d of depositos) await convertirEnDeposito(d);
  });
  const corregirCambio = (x: (typeof cambios)[number]) => correr(`cambio-${x.mov.id}`, async () => {
    const { mov: m, origen, destino, salida } = x;
    // La salida en pesos reemplaza al movimiento original (mismo id, conserva el id de Mercado Pago); la entrada es nueva
    await guardar(
      { id: m.id, fecha: m.fecha, hora: m.hora ?? null, concepto: `Cambio ${origen.nombre} → ${destino.nombre}`, valor: -salida, moneda: 'ARS', valorArs: -salida, tipo: 'Cambio', metodo: origen.nombre, categoria: '', categoria2: '', cuotasCumplidas: null, cuotasTotales: null, cuentaId: origen.id, origen: m.origen, externalId: m.externalId },
      { fecha: m.fecha, hora: m.hora ?? null, concepto: `Cambio ${origen.nombre} → ${destino.nombre}`, valor: m.valor, moneda: m.moneda, valorArs: salida, tipo: 'Cambio', metodo: destino.nombre, categoria: '', categoria2: '', cuotasCumplidas: null, cuotasTotales: null, cuentaId: destino.id },
    );
  });
  const pasarPago = (x: (typeof pagos)[number]) => correr(`pago-${x.egreso.id}`, async () => {
    await guardar({ ...x.egreso, cuentaId: x.destino.id, metodo: x.destino.nombre });
  });
  const separarPago = (x: (typeof porOtra)[number]) => correr(`otra-${x.mov.id}`, async () => {
    const { mov: m, origen, destino } = x;
    // La salida de Mercado Pago pasa a ser una transferencia (mismo movimiento, conserva su id de Mercado Pago) y el pago sale de la otra cuenta
    await guardar({ ...m, concepto: `Transferencia ${origen.nombre} → ${destino.nombre}`, valor: Math.abs(m.valor), valorArs: m.valorArs == null ? null : Math.abs(m.valorArs), tipo: 'Transferencia', metodo: origen.nombre, categoria: '', categoria2: '', cuentaId: origen.id, cuentaDestinoId: destino.id });
    await guardar({ fecha: m.fecha, hora: m.hora ?? null, concepto: m.concepto, valor: m.valor, moneda: m.moneda, valorArs: m.valorArs ?? null, tipo: 'Egreso', metodo: destino.nombre, categoria: m.categoria, categoria2: m.categoria2, cuotasCumplidas: null, cuotasTotales: null, cuentaId: destino.id });
  });
  const borrarGrupo = async (g: (typeof programados)[number]) => {
    if (!(await confirmar(`¿Borrar ${g.movs.length} ${g.movs.length === 1 ? 'movimiento' : 'movimientos'} de “${g.concepto}”?`, 'Son movimientos con fecha futura: todavía no ocurrieron y no cambian ningún saldo. Dejan de contar en lo que falta pagar o cobrar de cada mes.', 'Borrar'))) return;
    await correr(`prog-${g.clave}`, async () => { for (const m of g.movs) await eliminar(m); });
  };
  const empezarDeCero = async () => {
    if (!(await confirmar(
      `¿Dejar solo los movimientos de este mes?`,
      `Se borran ${fuera.length} movimientos (${antes} de meses anteriores y ${despues} de meses siguientes) y quedan los ${todos.length - fuera.length} de este mes. Tus saldos de hoy no cambian: lo que desaparece pasa a los saldos iniciales. Antes se descarga una copia de seguridad. No se puede deshacer.`,
      'Borrar y empezar de cero',
    ))) return;
    await correr('cero', async () => {
      try { await exportarRespaldo(); } catch { if (!(await confirmar('No se pudo descargar la copia de seguridad', '¿Seguir igual y borrar sin copia?', 'Borrar sin copia'))) return; }
      const n = await dejarSoloEsteMes();
      avisar(`Listo: se borraron ${n} movimientos. Ahora todo se calcula a partir de este mes.`);
    });
  };
  const unirDuplicado = (x: (typeof dupCuentas)[number]) => correr(`dup-${x.auto.id}`, async () => {
    // Se conserva el movimiento de Mercado Pago (tiene su id y no se vuelve a importar) con los datos que ya habías cargado vos
    await guardar({ ...x.auto, concepto: x.manual.concepto, categoria: x.manual.categoria, categoria2: x.manual.categoria2, cuotasCumplidas: x.manual.cuotasCumplidas, cuotasTotales: x.manual.cuotasTotales });
    await eliminar(x.manual);
  });
  const unirComoTransferencia = (x: (typeof yaTransf)[number]) => correr(`yat-${x.mov.id}`, async () => {
    const { mov: m, transferencia: t } = x;
    // El movimiento de Mercado Pago pasa a ser la transferencia (conserva su id) y la cargada a mano sobra
    await guardar({ ...m, tipo: 'Transferencia', concepto: t.concepto, valor: Math.abs(t.valor), valorArs: t.valorArs == null ? null : Math.abs(t.valorArs), metodo: t.metodo, categoria: '', categoria2: '', cuentaId: t.cuentaId, cuentaDestinoId: t.cuentaDestinoId });
    await eliminar(t);
  });
  const desactivarRecurrentes = () => correr('rec', async () => { for (const r of recsReserva) guardarRecurrente({ ...r, activo: false }); });
  const borrarCeros = async () => {
    if (!(await confirmar(`¿Borrar ${ceros.length} movimientos en cero?`, 'No tienen importe: son filas vacías que quedaron de la migración. No cambian ningún saldo.', 'Borrar'))) return;
    await correr('ceros', async () => { for (const m of ceros) await eliminar(m); });
  };
  const limpiarCuotas = () => correr('cuotas', async () => { for (const m of cuotas) await guardar({ ...m, cuotasCumplidas: null }); });
  const asignar = (m: (typeof sinCta)[number], cuentaId: string) => correr(`sc-${m.id}`, async () => {
    const cta = cuentas.find((x) => x.id === cuentaId);
    if (cta) await guardar({ ...m, cuentaId, metodo: cta.nombre });
  });

  const Lista = ({ filas }: { filas: { k: string; t: string; sub: string }[] }) => (
    <>
      {filas.slice(0, 6).map((f) => (
        <View key={f.k} style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: c.border }}>
          <Text style={s.titulo} numberOfLines={1}>{f.t}</Text>
          <Text style={s.sub} numberOfLines={1}>{f.sub}</Text>
        </View>
      ))}
      {filas.length > 6 && <Text style={[s.sub, { marginTop: 4 }]}>y {filas.length - 6} más…</Text>}
    </>
  );

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40, ...centrado(MAX_FORM) }}>
      <View style={{ marginBottom: 14 }}>
        <Text style={s.h}>Revisión de tus datos</Text>
        <Text style={s.big}>{total === 0 ? 'Todo en orden ✓' : `${total} ${total === 1 ? 'cosa para corregir' : 'cosas para corregir'}`}</Text>
        <Text style={[s.sub, { marginTop: 4 }]}>Cada corrección se hace con un toque y no borra nada que te importe. Después de corregir, entrá a “Efectivo y digital” y revisá que tus saldos coincidan con lo que tenés.</Text>
      </View>

      {programados.length > 0 && (
        <Card>
          <Titulo t={`📅 Programados a futuro (${programados.length} ${programados.length === 1 ? 'concepto' : 'conceptos'})`} sub="Movimientos con fecha de meses siguientes. Vienen de la hoja o de un recurrente que ya borraste, y siguen contando en las estimaciones. Borrá los que ya no esperás." />
          {programados.map((g) => (
            <View key={g.clave} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border }}>
              <Text style={s.titulo} numberOfLines={1}>{g.concepto}</Text>
              <Text style={s.sub}>{g.movs.length} {g.movs.length === 1 ? 'vez' : 'veces'} · del {fechaCorta(g.movs[0].fecha)} al {fechaCorta(g.movs[g.movs.length - 1].fecha)} · {money(g.movs[0].valor, g.movs[0].moneda)} c/u</Text>
              <View style={{ flexDirection: 'row', gap: 20, paddingTop: 8 }}>
                <Pressable onPress={() => borrarGrupo(g)} disabled={ocupado === `prog-${g.clave}`}>
                  <Text style={{ color: c.gasto, fontWeight: '700' }}>{ocupado === `prog-${g.clave}` ? 'Borrando…' : `🗑 Borrar ${g.movs.length === 1 ? 'este' : `los ${g.movs.length}`}`}</Text>
                </Pressable>
                <Pressable onPress={() => { tap(); descartarTransferencia(`prog|${g.clave}`); }}><Text style={{ color: c.muted, fontWeight: '600' }}>Está bien así</Text></Pressable>
              </View>
            </View>
          ))}
          {programados.length > 1 && (
            <Pressable onPress={() => { tap(); programados.forEach((g) => descartarTransferencia(`prog|${g.clave}`)); }} style={{ paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border }}>
              <Text style={{ color: c.muted, fontWeight: '600', textAlign: 'center' }}>Están bien todos: no mostrar más</Text>
            </Pressable>
          )}
        </Card>
      )}

      {yaTransf.length > 0 && (
        <Card>
          <Titulo t={`🔁 Contados dos veces (${yaTransf.length})`} sub="Mercado Pago trajo un pago por una plata que vos ya habías cargado como transferencia entre tus cuentas. La plata se está contando dos veces. Se unen en una sola transferencia." />
          {yaTransf.map((x) => (
            <View key={x.mov.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border }}>
              <Text style={s.titulo} numberOfLines={1}>{money(Math.abs(x.mov.valor), x.mov.moneda)} · {fechaCorta(x.mov.fecha)}</Text>
              <Text style={s.sub} numberOfLines={2}>Tenés «{x.mov.concepto}» {x.mov.valor > 0 ? 'como ingreso' : 'como gasto'} en {nombreCuenta(x.mov.cuentaId)} y «{x.transferencia.concepto}»</Text>
              <Boton t="Unir en una sola transferencia" onPress={() => unirComoTransferencia(x)} ocupado={ocupado === `yat-${x.mov.id}`} />
              <Pressable onPress={() => { tap(); descartarTransferencia(`yat|${x.mov.id}`); }} style={{ paddingTop: 10 }}><Text style={{ color: c.muted, textAlign: 'center' }}>Son cosas distintas</Text></Pressable>
            </View>
          ))}
        </Card>
      )}

      {dupCuentas.length > 0 && (
        <Card>
          <Titulo t={`👯 ¿El mismo pago dos veces? (${dupCuentas.length})`} sub="Mismo importe, mismo día y a pocos minutos, cargado en una cuenta a mano y traído por Mercado Pago en otra. Si es el mismo pago, se cuenta dos veces." />
          {dupCuentas.map((x) => (
            <View key={x.auto.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border }}>
              <Text style={s.titulo}>{money(x.auto.valor, x.auto.moneda)} · {fechaCorta(x.auto.fecha)}</Text>
              <Text style={s.sub}>«{x.manual.concepto}» en {nombreCuenta(x.manual.cuentaId)} ({x.manual.hora}) y «{x.auto.concepto}» en {nombreCuenta(x.auto.cuentaId)} ({x.auto.hora})</Text>
              <Boton t={`Es el mismo: dejar uno solo en ${nombreCuenta(x.auto.cuentaId)}`} onPress={() => unirDuplicado(x)} ocupado={ocupado === `dup-${x.auto.id}`} />
              <Pressable onPress={() => { tap(); descartarTransferencia(`dup|${x.auto.id}`); }} style={{ paddingTop: 10 }}><Text style={{ color: c.muted, textAlign: 'center' }}>Son pagos distintos</Text></Pressable>
            </View>
          ))}
        </Card>
      )}

      {recsRepetidos.length > 0 && (
        <Card>
          <Titulo t={`🔁 Recurrentes repetidos (${recsRepetidos.length})`} sub="Hay dos recurrentes con el mismo nombre: cada mes cargan (y cuentan como pendiente) lo mismo dos veces. Borrá el que sobra." />
          {recsRepetidos.map((g) => (
            <View key={g[0].id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border }}>
              <Text style={s.titulo}>{g[0].concepto}</Text>
              {g.map((r) => (
                <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 6 }}>
                  <Text style={[s.sub, { flex: 1 }]}>{money(r.valor, r.moneda)} · día {r.dia} · {r.metodo || 'sin cuenta'}</Text>
                  <Pressable onPress={() => { tap(true); borrarRecurrente(r.id); }}><Text style={{ color: c.gasto, fontWeight: '700' }}>🗑 Borrar este</Text></Pressable>
                </View>
              ))}
            </View>
          ))}
        </Card>
      )}

      {porOtra.length > 0 && (
        <Card>
          <Titulo t={`🔀 Pagos que salieron de Mercado Pago (${porOtra.length})`} sub="Vinieron de Mercado Pago pero están cargados en otra cuenta. Esa plata salió de Mercado Pago y se pagó desde la otra: se separa en una transferencia y el pago." />
          {porOtra.map((x) => (
            <View key={x.mov.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border }}>
              <Text style={s.titulo} numberOfLines={1}>{x.mov.concepto} · {money(x.mov.valor, x.mov.moneda)}</Text>
              <Text style={s.sub}>{fechaCorta(x.mov.fecha)} · quedaría: {x.origen.nombre} → {x.destino.nombre}, y el pago desde {x.destino.nombre}</Text>
              <Boton t="Separar en transferencia y pago" onPress={() => separarPago(x)} ocupado={ocupado === `otra-${x.mov.id}`} />
              <Pressable onPress={() => { tap(); descartarTransferencia(`otra|${x.mov.id}`); }} style={{ paddingTop: 10 }}><Text style={{ color: c.muted, textAlign: 'center' }}>Está bien así</Text></Pressable>
            </View>
          ))}
        </Card>
      )}

      {pagos.length > 0 && (
        <Card>
          <Titulo t={`💸 Pagos en la cuenta equivocada (${pagos.length})`} sub="Figuran pagados desde una reserva, pero ese mismo día pasaste plata de esa reserva a otra cuenta. Si el pago salió de ahí, la plata se descuenta dos veces de la reserva." />
          {pagos.map((x) => (
            <View key={x.egreso.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border }}>
              <Text style={s.titulo} numberOfLines={1}>{x.egreso.concepto} · {money(x.egreso.valor, x.egreso.moneda)}</Text>
              <Text style={s.sub}>{fechaCorta(x.egreso.fecha)} · está en {x.reserva.nombre}; ese día pasaste {money(Math.abs(x.transferencia.valor), x.transferencia.moneda)} a {x.destino.nombre}</Text>
              <Boton t={`Pasarlo a ${x.destino.nombre}`} onPress={() => pasarPago(x)} ocupado={ocupado === `pago-${x.egreso.id}`} />
              <Pressable onPress={() => { tap(); descartarTransferencia(`pago|${x.egreso.id}`); }} style={{ paddingTop: 10 }}><Text style={{ color: c.muted, textAlign: 'center' }}>Está bien así</Text></Pressable>
            </View>
          ))}
        </Card>
      )}

      {depositos.length > 0 && (
        <Card>
          <Titulo t={`🗂️ Plata pasada a una reserva (${depositos.length})`} sub="Están cargados como gasto de categoría “Reserva”, pero es plata que solo cambió de cuenta. Pasan a ser transferencias." />
          <Lista filas={depositos.map((d) => ({ k: d.clave, t: `${money(-d.mov.valor, d.mov.moneda)} · ${fechaCorta(d.mov.fecha)}`, sub: `${d.origen.nombre} → ${d.destino.nombre}` }))} />
          <Boton t="Convertir en transferencias" onPress={pasarADepositos} ocupado={ocupado === 'dep'} />
        </Card>
      )}

      {recsReserva.length > 0 && (
        <Card>
          <Titulo t={`🔁 Recurrentes de reserva (${recsReserva.length})`} sub="Cargan todos los meses, como gasto, plata que solo se mueve de una cuenta tuya a otra. Se desactivan (podés reactivarlos desde Recurrentes)." />
          <Lista filas={recsReserva.map((r) => ({ k: r.id, t: `${r.concepto} · ${money(r.valor, r.moneda)}`, sub: `día ${r.dia} de cada mes · ${r.metodo}` }))} />
          <Boton t="Desactivar" onPress={desactivarRecurrentes} ocupado={ocupado === 'rec'} />
        </Card>
      )}

      {cambios.length > 0 && (
        <Card>
          <Titulo t={`🔄 Cambios de moneda mal registrados (${cambios.length})`} sub="Figuran como transferencia, pero cambian de moneda: los pesos nunca salen de la cuenta de origen. Se rehacen como un cambio (sale en pesos, entra en la otra moneda)." />
          {cambios.map((x) => (
            <View key={x.mov.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border }}>
              <Text style={s.titulo}>{x.origen.nombre} → {x.destino.nombre}</Text>
              <Text style={s.sub}>Salen {money(x.salida, 'ARS')} y entran {money(x.mov.valor, x.mov.moneda)} · {fechaCorta(x.mov.fecha)}</Text>
              <Boton t="Rehacer como cambio" onPress={() => corregirCambio(x)} ocupado={ocupado === `cambio-${x.mov.id}`} />
            </View>
          ))}
        </Card>
      )}

      {sinCta.length > 0 && (
        <Card>
          <Titulo t={`🏦 Sin cuenta (${sinCta.length})`} sub="No suman ni restan en ninguna cuenta. Elegí de dónde sale o a dónde entra cada uno, también los que están programados a futuro." />
          {sinCta.map((m) => (
            <View key={m.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border }}>
              <Text style={s.titulo} numberOfLines={1}>{m.concepto}</Text>
              <Text style={[s.sub, { marginBottom: 6 }]}>{money(m.valor, m.moneda)} · {fechaCorta(m.fecha)}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {activas.map((x) => <Chip key={x.id} label={x.nombre} on={false} onPress={() => asignar(m, x.id)} />)}
              </View>
            </View>
          ))}
        </Card>
      )}

      {ceros.length > 0 && (
        <Card>
          <Titulo t={`0️⃣ Movimientos en cero (${ceros.length})`} sub="Filas sin importe que quedaron de la migración desde la hoja (sueldo en 0, “cambio” en 0…). Se borran: no cambian ningún saldo." />
          <Lista filas={ceros.map((m) => ({ k: m.id, t: m.concepto, sub: `${m.tipo} · ${fechaCorta(m.fecha)}` }))} />
          <Boton t={`Borrar ${ceros.length} movimientos`} onPress={borrarCeros} color={c.gasto} ocupado={ocupado === 'ceros'} />
        </Card>
      )}

      {cuotas.length > 0 && (
        <Card>
          <Titulo t={`💳 Cuotas con datos corridos (${cuotas.length})`} sub="Tienen “cuotas cumplidas” pero no el total (ej. youtube con 7,8): es un número que se movió de columna. Se limpia ese dato." />
          <Lista filas={cuotas.map((m) => ({ k: m.id, t: m.concepto, sub: `${m.cuotasCumplidas} cuotas cumplidas, sin total · ${fechaCorta(m.fecha)}` }))} />
          <Boton t="Limpiar" onPress={limpiarCuotas} ocupado={ocupado === 'cuotas'} />
        </Card>
      )}

      {total === 0 && <Text style={[s.sub, { textAlign: 'center', marginTop: 24 }]}>No encontré nada raro en tus movimientos, cuentas ni recurrentes.</Text>}

      {hoja.length > 0 && (
        <Card>
          <Titulo t={`📄 Cargados desde tu hoja (${hoja.length})`} sub="Son las partidas de este mes que vinieron de la hoja de cálculo, de mayor a menor. Son las más difíciles de verificar. Repasalas: si alguna no ocurrió así, borrala; si está bien, tocá “Está bien”." />
          {hoja.slice(0, 15).map((m) => (
            <View key={m.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.titulo} numberOfLines={1}>{m.concepto.trim()}</Text>
                  <Text style={s.sub}>{fechaCorta(m.fecha)} · {nombreCuenta(m.cuentaId)}</Text>
                </View>
                <Text style={{ color: m.valor > 0 ? c.ingreso : c.gasto, fontWeight: '700' }}>{money(m.valor, m.moneda)}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 20, paddingTop: 6 }}>
                <Pressable onPress={async () => { if (await confirmar(`¿Borrar “${m.concepto.trim()}”?`, `${money(m.valor, m.moneda)} del ${fechaCorta(m.fecha)}. Cambia el saldo de ${nombreCuenta(m.cuentaId)}.`, 'Borrar')) correr(`hoja-${m.id}`, async () => { await eliminar(m); }); }}><Text style={{ color: c.gasto, fontWeight: '700' }}>🗑 Borrar</Text></Pressable>
                <Pressable onPress={() => { tap(); descartarTransferencia(`hoja|${m.id}`); }}><Text style={{ color: c.muted, fontWeight: '600' }}>Está bien</Text></Pressable>
              </View>
            </View>
          ))}
          {hoja.length > 15 && <Text style={[s.sub, { marginTop: 8 }]}>y {hoja.length - 15} más: aparecen a medida que repasás.</Text>}
        </Card>
      )}

      {fuera.length > 0 && !ocultarCero && (
        <Card>
          <Titulo t="🧹 Empezar de cero con este mes" sub="Borra el historial de meses anteriores y los movimientos copiados de meses siguientes. Solo queda lo de este mes, y todo se calcula a partir de ahí." />
          <Text style={[s.sub, { marginTop: 2 }]}>Se borrarían {fuera.length} movimientos ({antes} anteriores · {despues} siguientes). Se conservan {todos.length - fuera.length}.</Text>
          <Text style={[s.sub, { marginTop: 6 }]}>Tus saldos de hoy no cambian: lo borrado pasa a los saldos iniciales. Antes de borrar se descarga una copia de seguridad. Tus cuentas, recurrentes, planificados, reservas y reglas no se tocan.</Text>
          <Boton t={`Borrar ${fuera.length} y dejar solo este mes`} onPress={empezarDeCero} color={c.gasto} ocupado={ocupado === 'cero'} />
          <Pressable onPress={() => { tap(); descartarTransferencia('cero|oculto'); }} style={{ paddingTop: 12 }}><Text style={{ color: c.muted, textAlign: 'center' }}>No mostrar más</Text></Pressable>
        </Card>
      )}
    </ScrollView>
  );
}
