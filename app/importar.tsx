import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { avisar, mensajeError } from '../src/alerta';
import { detectarDuplicados, leerExtracto, type Lectura, norm, sugeridor } from '../src/importar';
import { nube, nuevoId, requiereSesion } from '../src/nube';
import { buscarRegla } from '../src/reglas';
import { detectarTransferencias } from '../src/transferencias';
import { convertir, useFinanzas } from '../src/store';
import { c } from '../src/theme';
import type { Moneda, Movimiento } from '../src/types';
import { Card, centrado, Chip, MAX_FORM, s, SelectorMoneda, tap, Titulo } from '../src/ui';
import { fechaCorta, money, ymdMenos } from '../src/util';

const MOSTRAR = 300; // filas de la vista previa (se importan todas las marcadas, se vean o no)

export default function Importar() {
  const { porAnio, cotizaciones, nubeUid, guardar, reglas, cuentas } = useFinanzas();
  const [archivo, setArchivo] = useState('');
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [moneda, setMoneda] = useState<Moneda>('ARS');
  const [metodo, setMetodo] = useState('Banco');
  const [gastos, setGastos] = useState(true); // si los montos vienen sin signo: ¿son gastos?
  const [manual, setManual] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const existentes = useMemo(() => Object.values(porAnio).flat(), [porAnio]);
  const sugerir = useMemo(() => sugeridor(existentes), [existentes]);
  const filas = useMemo(() => (lectura ? lectura.filas.map((f) => ({ ...f, valor: lectura.sinSigno && gastos ? -f.valor : f.valor })) : []), [lectura, gastos]);
  const dups = useMemo(() => detectarDuplicados(filas, existentes, moneda), [filas, existentes, moneda]);
  const incluida = (i: number) => manual[i] ?? dups[i] === null;
  const marcadas = filas.reduce((n, _, i) => n + (incluida(i) ? 1 : 0), 0);

  const elegir = async () => {
    tap();
    setError(null);
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (r.canceled || !r.assets[0]) return;
      const a = r.assets[0];
      const buf = await (await fetch(a.uri)).arrayBuffer();
      setLectura(leerExtracto(buf));
      setArchivo(a.name);
      setManual({});
    } catch (e) {
      setLectura(null);
      setError(mensajeError(e));
    }
  };

  const importar = async () => {
    if (!lectura || !marcadas) return;
    tap(true);
    setError(null);
    setTrabajando(true);
    try {
      const ars = (v: number) => {
        const x = convertir(v, moneda, 'ARS', cotizaciones);
        return x === null ? null : Math.round(x * 100) / 100;
      };
      const elegidas = filas.filter((_, i) => incluida(i));
      const movs: Movimiento[] = elegidas.map((f) => {
        const regla = buscarRegla(reglas, f.concepto);
        const sug = regla ? { categoria: regla.categoria, categoria2: regla.categoria2 } : sugerir(f.concepto);
        return {
          id: nuevoId(), fecha: f.fecha, hora: f.hora, concepto: f.concepto, valor: f.valor, tipo: f.valor > 0 ? 'Ingreso' : 'Egreso', metodo: metodo.trim(),
          categoria: sug?.categoria ?? '', categoria2: sug?.categoria2 ?? '', cuotasCumplidas: null, cuotasTotales: null, moneda, valorArs: ars(f.valor),
        };
      });
      if (nubeUid) {
        const uid = await requiereSesion();
        const idImp = await nube.crearImportacion({ origen: /\.csv$/i.test(archivo) ? 'csv' : 'excel', archivo, total: filas.length, nuevas: movs.length, duplicadas: filas.length - movs.length });
        // Si el mismo archivo se importa dos veces, external_id (fecha|importe|concepto|n) evita duplicar en la base.
        const veces = new Map<string, number>();
        await nube.importar(uid, movs.map((m) => {
          const base = `imp|${m.fecha}|${m.valor}|${m.moneda}|${norm(m.concepto)}`;
          const k = veces.get(base) ?? 0;
          veces.set(base, k + 1);
          return { m, externalId: `${base}|${k}` };
        }), idImp);
        for (const anio of new Set(movs.map((m) => +m.fecha.slice(0, 4)))) {
          const lista = await nube.listar(`${anio}-01-01`, `${anio}-12-31`);
          useFinanzas.setState((st) => ({ porAnio: { ...st.porAnio, [anio]: lista } }));
        }
        // La base crea sola la cuenta del método que escribiste: se baja para que los movimientos nuevos no apunten a una cuenta desconocida
        await nube.listarCuentas().then((cuentas) => useFinanzas.setState({ cuentas })).catch(() => {});
        await useFinanzas.getState().conciliarPlanificados();
      } else {
        await guardar(...movs.map(({ id: _, ...m }) => m));
      }
      // ¿Alguno de lo importado parece una transferencia entre tus cuentas? Se avisa para que no infle ingresos y gastos
      const est = useFinanzas.getState();
      const posibles = detectarTransferencias(Object.values(est.porAnio).flat().filter((m) => m.fecha >= ymdMenos(180)), new Set(est.transferenciasDescartadas)).length;
      avisar(`Se importaron ${movs.length} movimientos.${posibles ? `\n\n↔️ ${posibles} parecen transferencias entre tus cuentas: revisalas en Mis cuentas para que no cuenten como ingresos y gastos.` : ''}`);
      router.back();
    } catch (e) {
      setError(mensajeError(e));
    }
    setTrabajando(false);
  };

  const input = { backgroundColor: c.card2, color: c.text, borderRadius: 12, padding: 14, marginBottom: 12 } as const;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40, ...centrado(MAX_FORM) }} keyboardShouldPersistTaps="handled">
      <Card>
        <Titulo t="📥 Importar extracto" sub="Subí el Excel o CSV que descargás de tu banco o billetera virtual. La app detecta las columnas, evita lo que ya cargaste y sugiere categorías según tu historial. Los PDF todavía no." />
        <Pressable onPress={elegir} disabled={trabajando} style={{ backgroundColor: c.accent, padding: 14, borderRadius: 14, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{lectura ? 'Elegir otro archivo' : 'Elegir archivo (.xlsx, .xls, .csv)'}</Text>
        </Pressable>
        {!!error && <Text style={{ color: c.gasto, marginTop: 10, lineHeight: 19 }}>{error}</Text>}
      </Card>

      {lectura && (
        <>
          <Card>
            <Titulo t={archivo} sub={`${filas.length} movimientos leídos. ${lectura.columnas}`} />
            <Text style={s.h}>Moneda del extracto</Text>
            <View style={{ alignSelf: 'flex-start', marginBottom: 14 }}><SelectorMoneda valor={moneda} onChange={(m) => { setMoneda(m); setManual({}); }} /></View>
            <Text style={s.h}>¿De qué cuenta es el extracto?</Text>
            {cuentas.some((x) => x.activa) && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
                {cuentas.filter((x) => x.activa).map((x) => <Chip key={x.id} label={x.nombre} on={norm(metodo) === norm(x.nombre)} onPress={() => setMetodo(x.nombre)} />)}
              </View>
            )}
            <TextInput style={input} placeholder="Elegí una cuenta o escribí una nueva (ej. Banco Galicia)" placeholderTextColor={c.muted} value={metodo} onChangeText={setMetodo} />
            {(!metodo.trim() || norm(metodo) === 'banco') && <Text style={{ color: c.aviso, fontSize: 12, marginBottom: 10 }}>Poné el nombre real de la cuenta (no "Banco" a secas): así se detectan las transferencias entre tus cuentas y cada saldo queda separado.</Text>}
            {lectura.sinSigno && (
              <>
                <Text style={s.h}>Los importes vienen sin signo. Son…</Text>
                <View style={{ flexDirection: 'row' }}>
                  <Chip label="Gastos" on={gastos} onPress={() => { setGastos(true); setManual({}); }} />
                  <Chip label="Ingresos" on={!gastos} onPress={() => { setGastos(false); setManual({}); }} />
                </View>
              </>
            )}
          </Card>

          <Card>
            <Titulo t={`${marcadas} de ${filas.length} se van a importar`} sub="Tocá una fila para incluirla o sacarla. Las que ya parecen cargadas vienen sin marcar." />
            {filas.slice(0, MOSTRAR).map((f, i) => {
              const sug = sugerir(f.concepto);
              const on = incluida(i);
              return (
                <Pressable key={i} onPress={() => { tap(); setManual((m) => ({ ...m, [i]: !on })); }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, opacity: on ? 1 : 0.45 }}>
                  <Text style={{ color: on ? c.ingreso : c.muted, fontSize: 18, width: 28 }}>{on ? '✓' : '○'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.titulo} numberOfLines={1}>{f.concepto}</Text>
                    <Text style={s.sub} numberOfLines={1}>
                      {fechaCorta(f.fecha)}{f.hora ? ` ${f.hora}` : ''} · {sug?.categoria || 'Sin categoría'}
                      {dups[i] === 'exacto' ? ' · ya cargado' : dups[i] === 'probable' ? ' · posible duplicado' : ''}
                    </Text>
                  </View>
                  <Text style={{ color: f.valor > 0 ? c.ingreso : c.gasto, fontWeight: '700' }}>{money(f.valor, moneda)}</Text>
                </Pressable>
              );
            })}
            {filas.length > MOSTRAR && <Text style={[s.sub, { marginTop: 8 }]}>…y {filas.length - MOSTRAR} más (se importan según su marca).</Text>}
          </Card>

          <Pressable onPress={importar} disabled={trabajando || !marcadas} style={{ backgroundColor: c.accent, padding: 16, borderRadius: 14, alignItems: 'center', opacity: trabajando || !marcadas ? 0.5 : 1 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{trabajando ? 'Importando…' : `Importar ${marcadas} movimientos`}</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}
