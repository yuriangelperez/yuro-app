import { Link } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { avisar, confirmar, mensajeError } from '../../src/alerta';
import { abrirAjustes, tieneAcceso } from '../../modules/yuro-notificaciones';
import { type EntradaLog, hayServicio, leerLog, procesarNotificaciones } from '../../src/notificaciones';
import { conectarMp, desconectarMp, type EstadoMp, estadoMp, sincronizarMp } from '../../src/mp';
import { entrarConGoogle, salir, useSesion } from '../../src/auth';
import { nube } from '../../src/nube';
import { type FuenteUsd, type Nivel, useCategorias, useFinanzas } from '../../src/store';
import { c, catInfo } from '../../src/theme';
import { Card, centrado, Chip, EstadoSync, MAX_FORM, NuevaCategoria, s, SelectorMoneda, tap, Titulo } from '../../src/ui';
import { money, parseMonto } from '../../src/util';

const FUENTES: { f: FuenteUsd; label: string }[] = [
  { f: 'blue', label: 'Blue' },
  { f: 'oficial', label: 'Oficial' },
  { f: 'bolsa', label: 'MEP' },
];

const Cotizacion = ({ m }: { m: 'USD' | 'USDT' }) => {
  const valor = useFinanzas((st) => st.cotizaciones[m]);
  const setCotizacion = useFinanzas((st) => st.setCotizacion);
  const [texto, setTexto] = useState('');
  const guardar = () => {
    const n = parseMonto(texto);
    if (n && n > 0) setCotizacion(m, n);
    setTexto('');
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
      <Text style={{ color: c.text, fontWeight: '700', width: 56 }}>1 {m}</Text>
      <Text style={{ color: c.muted, marginRight: 8 }}>=</Text>
      <TextInput
        style={{ flex: 1, backgroundColor: c.card2, color: c.text, borderRadius: 10, padding: 10 }}
        placeholder={valor ? money(valor) : 'Sin cotización'}
        placeholderTextColor={valor ? c.text : c.muted}
        keyboardType="decimal-pad"
        value={texto}
        onChangeText={setTexto}
        returnKeyType="done"
        onSubmitEditing={guardar}
        onBlur={guardar}
      />
    </View>
  );
};

// Lista editable: tocá ✕ para borrar una categoría, "+ Nueva" para agregar.
const ListaCategorias = ({ nivel, titulo }: { nivel: Nivel; titulo: string }) => {
  const lista = useCategorias(nivel);
  const borrar = useFinanzas((st) => st.borrarCategoria);
  const onBorrar = async (x: string) => {
    tap(true);
    if (await confirmar('¿Borrar categoría?', `"${x}" deja de aparecer en la lista. Los movimientos que ya la usan no cambian.`, 'Borrar')) borrar(nivel, x);
  };
  return (
    <>
      <Text style={[s.h, { marginTop: 10, marginBottom: 8 }]}>{titulo}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {lista.map((x) => (
          <Pressable key={x} onPress={() => onBorrar(x)} style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 10, paddingVertical: 8, borderRadius: 20, backgroundColor: c.card2, marginRight: 8, marginBottom: 8 }}>
            <Text style={{ color: c.text }}>{nivel === 'cat' ? `${catInfo(x).emoji} ` : ''}{x}</Text>
            <Text style={{ color: c.gasto, marginLeft: 8, fontWeight: '700' }}>✕</Text>
          </Pressable>
        ))}
        <NuevaCategoria nivel={nivel} />
      </View>
    </>
  );
};

const Cuenta = () => {
  const sesion = useSesion();
  const { nubeUid, conectarNube, desconectarNube, sincronizar, sincronizando, url, token } = useFinanzas();
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const correr = async (f: () => Promise<void>) => {
    tap(true);
    setError(null);
    setTrabajando(true);
    try { await f(); } catch (e) { setError(mensajeError(e)); }
    setTrabajando(false);
  };
  const migrar = () => correr(async () => {
    const hayNube = await nube.tieneDatos();
    if (hayNube && !(await confirmar('Tu cuenta ya tiene datos', 'Se van a bajar los de la nube y se reemplazan los de este teléfono. Lo que tengas solo acá se pierde.', 'Reemplazar'))) return;
    await conectarNube({ subirLocal: !hayNube });
    avisar(hayNube ? 'Listo: datos bajados de la nube.' : 'Listo: tus datos ya están en la nube.');
  });
  const cerrar = async () => {
    tap();
    if (!(await confirmar('¿Cerrar sesión?', nubeUid ? 'Tus datos quedan guardados en tu cuenta; este teléfono se vacía hasta que vuelvas a entrar.' : 'Vas a salir de tu cuenta.', 'Salir'))) return;
    await correr(async () => {
      if (nubeUid) {
        await sincronizar();
        if (useFinanzas.getState().pendientes.length) throw new Error('Hay cambios sin subir. Conectate a internet y reintentá para no perderlos.');
        desconectarNube();
      }
      await salir();
    });
  };
  const ocupado = trabajando || sincronizando;
  const otraCuenta = !!sesion && !!nubeUid && sesion.user.id !== nubeUid;
  const boton = { padding: 14, borderRadius: 14, alignItems: 'center', marginTop: 8 } as const;
  return (
    <Card>
      <Titulo t="👤 Cuenta" sub={sesion ? undefined : 'Entrá con Google para guardar tus datos en la nube y usarlos en varios dispositivos.'} />
      {sesion ? (
        <>
          <Text style={{ color: c.text, marginBottom: 4 }}>{sesion.user.user_metadata?.full_name ?? sesion.user.email}{'\n'}<Text style={{ color: c.muted }}>{sesion.user.email}</Text></Text>
          {otraCuenta ? (
            <Text style={{ color: c.aviso, marginVertical: 8 }}>Este teléfono está atado a otra cuenta. Cerrá sesión y entrá con esa para no mezclar datos.</Text>
          ) : nubeUid ? (
            <Text style={{ color: c.ingreso, marginVertical: 8 }}>☁️ Tus datos se guardan en la nube.</Text>
          ) : (
            <>
              <Text style={{ color: c.muted, marginVertical: 8, lineHeight: 19 }}>
                Migrá tus movimientos{url && token ? ' (leídos de tu hoja de Google Sheets)' : ''}, presupuestos, recurrentes y ahorros a tu cuenta. Es seguro repetirlo: no duplica.
              </Text>
              <Pressable onPress={migrar} disabled={ocupado} style={[boton, { backgroundColor: c.accent, opacity: ocupado ? 0.6 : 1 }]}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{ocupado ? 'Migrando…' : '☁️ Migrar mis datos a la nube'}</Text>
              </Pressable>
            </>
          )}
          <Pressable onPress={cerrar} disabled={ocupado} style={[boton, { backgroundColor: c.card2 }]}>
            <Text style={{ color: c.text, fontWeight: '700' }}>Cerrar sesión</Text>
          </Pressable>
        </>
      ) : (
        <Pressable onPress={() => correr(entrarConGoogle)} disabled={sesion === undefined || ocupado} style={[boton, { backgroundColor: c.accent }]}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Continuar con Google</Text>
        </Pressable>
      )}
      {!!error && <Text style={{ color: c.gasto, marginTop: 10 }}>{error}</Text>}
    </Card>
  );
};

// Mercado Pago (solo lectura): trae los movimientos de tu cuenta a la app. Necesita la cuenta en la nube.
const MercadoPago = () => {
  const [estado, setEstado] = useState<EstadoMp | undefined>(undefined);
  const [trabajando, setTrabajando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);
  const recargar = () => estadoMp().then(setEstado).catch((e) => { setEstado(null); setMsg({ texto: mensajeError(e), ok: false }); });
  useEffect(() => {
    recargar();
    // En web, Mercado Pago vuelve a esta pantalla con ?mp=ok o ?mp=error&msg=…
    const q = new URLSearchParams((globalThis as unknown as { location?: { search: string } }).location?.search ?? '');
    if (q.get('mp') === 'ok') correr(async () => `Mercado Pago conectado. ${await traer()}`);
    else if (q.get('mp') === 'error') setMsg({ texto: q.get('msg') || 'Mercado Pago no se pudo conectar', ok: false });
  }, []);
  const correr = async (f: () => Promise<string | void>) => {
    tap(true);
    setMsg(null);
    setTrabajando(true);
    try {
      const texto = await f();
      if (texto) setMsg({ texto, ok: true });
    } catch (e) { setMsg({ texto: mensajeError(e), ok: false }); }
    await recargar();
    setTrabajando(false);
  };
  // Mercado Pago arma el reporte con demora: se vuelve a preguntar solo cada 25 s (hasta ~3 min) mientras esta pantalla siga abierta.
  const viva = useRef(true);
  useEffect(() => () => { viva.current = false; }, []);
  const traer = async (): Promise<string> => {
    let total = 0;
    for (let intento = 0; ; intento++) {
      const r = await sincronizarMp();
      total += r.nuevos;
      if (r.nuevos) await useFinanzas.getState().sincronizar();
      if (r.estado === 'ok' || intento >= 7 || !viva.current) {
        return r.estado === 'ok'
          ? `Listo: ${total} movimientos nuevos.${r.pidioNuevo ? ' Se pidió un reporte más reciente: volvé a sincronizar en unos minutos para ver lo último.' : ''}`
          : `Mercado Pago sigue preparando el reporte. Volvé a tocar "Sincronizar" en unos minutos${total ? ` (ya se importaron ${total})` : ''}.`;
      }
      setMsg({ texto: `Esperando el reporte de Mercado Pago… (${intento + 1}/8)`, ok: true });
      await new Promise<void>((ok) => setTimeout(ok, 25_000));
    }
  };
  const sync = () => correr(traer);
  const boton = { padding: 14, borderRadius: 14, alignItems: 'center', marginTop: 8 } as const;
  return (
    <Card>
      <Titulo t="💙 Mercado Pago" sub="Trae los movimientos de tu cuenta de Mercado Pago (solo lectura: la app nunca mueve plata). Los que ya cargaste a mano no se duplican." />
      {estado ? (
        <>
          <Text style={{ color: c.ingreso, marginBottom: 4 }}>Conectado{estado.ultima_sync ? ` · última sincronización ${new Date(estado.ultima_sync).toLocaleString()}` : ''}</Text>
          <Pressable onPress={sync} disabled={trabajando} style={[boton, { backgroundColor: c.accent, opacity: trabajando ? 0.6 : 1 }]}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{trabajando ? 'Trabajando…' : '↻ Sincronizar'}</Text>
          </Pressable>
          <Pressable onPress={async () => { if (await confirmar('¿Desconectar Mercado Pago?', 'Se borra la conexión. Los movimientos ya importados quedan.', 'Desconectar')) correr(async () => { await desconectarMp(); return 'Desconectado.'; }); }} disabled={trabajando} style={[boton, { backgroundColor: c.card2 }]}>
            <Text style={{ color: c.text, fontWeight: '700' }}>Desconectar</Text>
          </Pressable>
        </>
      ) : (
        <Pressable onPress={() => correr(async () => { if ((await conectarMp()) === 'ok') return `Mercado Pago conectado. ${await traer()}`; })} disabled={trabajando || estado === undefined} style={[boton, { backgroundColor: c.accent, opacity: trabajando ? 0.6 : 1 }]}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Conectar Mercado Pago</Text>
        </Pressable>
      )}
      {!!msg && <Text style={{ color: msg.ok ? c.text : c.gasto, marginTop: 10, lineHeight: 19 }}>{msg.texto}</Text>}
    </Card>
  );
};

// Android: lee las notificaciones de bancos y billeteras y las convierte en movimientos al instante.
const Notificaciones = () => {
  const [acceso, setAcceso] = useState(tieneAcceso());
  const [log, setLog] = useState<EntradaLog[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const refrescar = async () => { setAcceso(tieneAcceso()); setLog(await leerLog()); };
  useEffect(() => {
    refrescar();
    // Al volver de la pantalla de permisos del sistema, se actualiza solo
    const sub = AppState.addEventListener('change', (e) => { if (e === 'active') refrescar(); });
    return () => sub.remove();
  }, []);
  const leerAhora = async () => {
    tap(true);
    setTrabajando(true);
    try {
      const r = await procesarNotificaciones();
      setMsg(r.guardados || r.sinReconocer ? `${r.guardados} movimientos nuevos${r.sinReconocer ? ` · ${r.sinReconocer} notificaciones que no se entendieron` : ''}.` : 'No hay notificaciones nuevas.');
    } catch (e) { setMsg(mensajeError(e)); }
    await refrescar();
    setTrabajando(false);
  };
  return (
    <Card>
      <Titulo t="🔔 Notificaciones del celular" sub="La app lee las notificaciones de tu banco y billeteras (Mercado Pago, Ualá, Brubank, Naranja X, Galicia…) y carga el gasto o ingreso con su hora. Solo se miran esas apps; todo se procesa en este teléfono." />
      {acceso ? (
        <>
          <Text style={{ color: c.ingreso, marginBottom: 4 }}>✓ Acceso activado. Las notificaciones se cargan al abrir la app.</Text>
          <Pressable onPress={leerAhora} disabled={trabajando} style={{ backgroundColor: c.accent, padding: 14, borderRadius: 14, alignItems: 'center', marginTop: 8, opacity: trabajando ? 0.6 : 1 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{trabajando ? 'Leyendo…' : '↻ Leer ahora'}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={{ color: c.muted, lineHeight: 19, marginBottom: 4 }}>Android pide que lo actives vos: en la pantalla que se abre, elegí "Yuro" y activá el acceso.</Text>
          <Pressable onPress={() => { tap(true); abrirAjustes(); }} style={{ backgroundColor: c.accent, padding: 14, borderRadius: 14, alignItems: 'center', marginTop: 8 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Dar acceso a las notificaciones</Text>
          </Pressable>
        </>
      )}
      {!!msg && <Text style={{ color: c.text, marginTop: 10 }}>{msg}</Text>}
      {log.length > 0 && (
        <View style={{ marginTop: 12 }}>
          <Text style={s.h}>Últimas leídas</Text>
          {log.slice(0, 8).map((x, i) => (
            <Text key={i} style={{ color: x.ok ? c.text : c.muted, fontSize: 12, marginBottom: 4 }} numberOfLines={2}>
              {x.ok ? '✓' : '?'} {new Date(x.t).toLocaleString()} · {x.app} · {x.ok ? `${x.concepto} ${money(x.valor ?? 0)}` : x.texto}
            </Text>
          ))}
          <Text style={s.sub}>Las marcadas con ? no se entendieron como un movimiento (promociones, avisos…). Si es un pago real, mandame ese texto para que aprenda el formato.</Text>
        </View>
      )}
    </Card>
  );
};

export default function Ajustes() {
  const sesion = useSesion();
  const { nubeUid, url, token, setConfig, sincronizar, sincronizando, versionScript, ultimaSync, monedaVista, setMonedaVista, fuenteUsd, setFuenteUsd, cotizaciones, actualizarCotizaciones, mostrarTips } = useFinanzas();
  const [u, setU] = useState(url);
  const [t, setT] = useState(token);
  const input = { backgroundColor: c.card2, color: c.text, borderRadius: 12, padding: 14, marginBottom: 12 } as const;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40, ...centrado(MAX_FORM) }} keyboardShouldPersistTaps="handled">
      <Cuenta />
      {hayServicio && <Notificaciones />}
      {!!sesion && <MercadoPago />}
      {!nubeUid && (
      <Card>
        <Titulo t="🔗 Google Sheets (opcional)" sub='Sin conectar, la app funciona igual y guarda todo en este teléfono. Para sincronizar con tu hoja, pegá la URL del Web App de Apps Script y el token (ver README). Lo que cargaste antes se sube al conectar.' />
        <TextInput style={input} placeholder="https://script.google.com/macros/s/…/exec" placeholderTextColor={c.muted} autoCapitalize="none" value={u} onChangeText={setU} />
        <TextInput style={input} placeholder="Token" placeholderTextColor={c.muted} autoCapitalize="none" secureTextEntry value={t} onChangeText={setT} />
        <Pressable onPress={async () => { tap(true); setConfig(u, t); await sincronizar(); }} style={{ backgroundColor: c.accent, padding: 14, borderRadius: 14, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{sincronizando ? 'Sincronizando…' : 'Guardar y sincronizar'}</Text>
        </Pressable>
        <View style={{ marginTop: 12 }}><EstadoSync /></View>
        {versionScript !== null && <Text style={s.sub}>Versión del Apps Script: {versionScript || 'vieja (sin monedas)'}{versionScript >= 4 ? ' ✓' : ' (actualizala)'}</Text>}
        {ultimaSync && <Text style={[s.sub, { marginTop: 10 }]}>Última sincronización: {new Date(ultimaSync).toLocaleString()}</Text>}
      </Card>
      )}

      <Card>
        <Titulo t="💱 Monedas" sub="Cada movimiento guarda su moneda (columna J de la hoja). Los totales se convierten a la moneda que elijas." />
        <Text style={[s.h, { marginTop: 4 }]}>Ver totales en</Text>
        <View style={{ alignSelf: 'flex-start', marginBottom: 14 }}><SelectorMoneda valor={monedaVista} onChange={setMonedaVista} /></View>
        <Text style={s.h}>Dólar de referencia para USD</Text>
        <View style={{ flexDirection: 'row' }}>
          {FUENTES.map((x) => <Chip key={x.f} label={x.label} on={fuenteUsd === x.f} onPress={() => setFuenteUsd(x.f)} />)}
        </View>
        <Text style={s.sub}>USDT usa el dólar cripto. Podés escribir tu propia cotización.</Text>
        <Cotizacion m="USD" />
        <Cotizacion m="USDT" />
        <Pressable onPress={() => { tap(); actualizarCotizaciones(); }} style={{ marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center' }}>
          <Text style={{ color: c.accent, fontWeight: '700' }}>↻ Actualizar desde dolarapi.com</Text>
        </Pressable>
        {cotizaciones.fecha && <Text style={[s.sub, { marginTop: 8 }]}>Actualizada: {new Date(cotizaciones.fecha).toLocaleString()}</Text>}
      </Card>

      <Card>
        <Titulo t="🏷️ Categorías" sub="Agregá las tuyas o borrá las que no usás. Borrar una no cambia los movimientos que ya la tienen." />
        <ListaCategorias nivel="cat" titulo="Categoría" />
        <ListaCategorias nivel="cat2" titulo="Categoría 2" />
      </Card>

      <Card>
        <Titulo t="🎯 Saldos, presupuestos y ayuda" />
        <Link href="/importar" asChild>
          <Pressable style={{ paddingVertical: 10 }}><Text style={{ color: c.text }}>📥 Importar extracto del banco (Excel/CSV) ›</Text></Pressable>
        </Link>
        <Link href="/recurrentes" asChild>
          <Pressable style={{ paddingVertical: 10 }}><Text style={{ color: c.text }}>🔁 Movimientos recurrentes ›</Text></Pressable>
        </Link>
        <Link href="/saldos" asChild>
          <Pressable style={{ paddingVertical: 10 }}><Text style={{ color: c.text }}>👛 Saldos iniciales por moneda ›</Text></Pressable>
        </Link>
        <Link href="/presupuestos" asChild>
          <Pressable style={{ paddingVertical: 10 }}><Text style={{ color: c.text }}>Editar presupuestos por categoría ›</Text></Pressable>
        </Link>
        <Pressable onPress={() => { tap(); mostrarTips(); }} style={{ paddingVertical: 10 }}>
          <Text style={{ color: c.text }}>💡 Volver a mostrar los consejos</Text>
        </Pressable>
      </Card>
    </ScrollView>
  );
}
