import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { avisar } from '../src/alerta';
import { clasificarConIA, loteDe, MODELO_SUGERIDO, modelosOllama, probarGemini, sinClasificar, type SugerenciaIA } from '../src/ia';
import { useCategorias, useFinanzas } from '../src/store';
import { c, catInfo } from '../src/theme';
import { Card, centrado, Chip, MAX_FORM, s, tap, Tip, Titulo } from '../src/ui';
import { fechaCorta, money, norm, ymdMenos } from '../src/util';

const COLOR = { alta: c.ingreso, media: c.aviso, baja: c.muted } as const;

export default function Asistente() {
  const guardarRegla = useFinanzas((st) => st.guardarRegla);
  const { iaActiva, setIaActiva, iaProveedor, setIaProveedor, iaUrl, iaModelo, setIaConfig, sugerenciasIA, iaVistos, setSugerenciasIA, descartarSugerenciaIA, aplicarSugerenciaIA } = useFinanzas();
  const porAnio = useFinanzas((st) => st.porAnio);
  const cuentas = useFinanzas((st) => st.cuentas);
  const categorias = useCategorias('cat');
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [url, setUrl] = useState(iaUrl);
  const [instalados, setInstalados] = useState<string[] | null>(null);
  const [probando, setProbando] = useState(false);
  const nubeUid = useFinanzas((st) => st.nubeUid);
  const esGemini = iaProveedor === 'gemini';
  const LOTE = loteDe(iaProveedor);
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null);

  const probarNube = async () => {
    tap();
    setProbando(true);
    setEstado(null);
    try {
      const r = await probarGemini();
      setEstado({ ok: true, texto: `✓ Gemini funciona (modelo ${r.modelo}).` });
    } catch (e) {
      setEstado({ ok: false, texto: e instanceof Error ? e.message : 'No se pudo probar' });
    } finally {
      setProbando(false);
    }
  };

  const probar = async () => {
    tap();
    setProbando(true);
    setEstado(null);
    try {
      const modelos = await modelosOllama(url);
      setInstalados(modelos);
      setIaConfig(url, modelos.includes(iaModelo) ? iaModelo : modelos[0] ?? '');
      setEstado(modelos.length ? { ok: true, texto: `✓ Conectado. ${modelos.length} modelo(s) instalado(s).` } : { ok: false, texto: `Conecta, pero no hay modelos. Instalá uno con: ollama pull ${MODELO_SUGERIDO}` });
    } catch (e) {
      setEstado({ ok: false, texto: e instanceof Error ? e.message : 'No se pudo conectar' });
    } finally {
      setProbando(false);
    }
  };

  const todos = useMemo(() => Object.values(porAnio).flat(), [porAnio]);
  const porRevisar = useMemo(() => sinClasificar(todos, new Set(iaVistos), ymdMenos(60)), [todos, iaVistos]);
  const movDe = (id: string) => todos.find((m) => m.id === id);

  const revisar = async () => {
    const lote = porRevisar.slice(0, LOTE);
    if (!lote.length || cargando) return;
    if (!esGemini && !iaModelo) return setAviso('Primero conectá con Ollama y elegí un modelo (arriba).');
    if (esGemini && !nubeUid) return setAviso('Gemini necesita tu cuenta de Yuro (inició sesión y migrá tus datos desde Ajustes).');
    tap(true);
    setCargando(true);
    setAviso(null);
    setProgreso({ hechos: 0, total: lote.length });
    let hechos = 0;
    let con = 0;
    try {
      // Cada tanda se guarda apenas termina: si se corta a la mitad, lo ya revisado queda a la vista
      await clasificarConIA(iaProveedor, iaUrl, iaModelo, lote, categorias, cuentas.filter((x) => x.activa).map((x) => x.nombre), (r, tanda, total) => {
        setSugerenciasIA(r, tanda.map((m) => m.id));
        hechos += tanda.length;
        con += r.length;
        setProgreso({ hechos, total });
      });
      if (!con) setAviso('La IA no encontró nada para sugerir.');
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo revisar');
    } finally {
      setCargando(false);
      setProgreso(null);
    }
  };

  const aplicar = async (sug: SugerenciaIA) => {
    tap(true);
    if ((await aplicarSugerenciaIA(sug)) === 'sin-cuentas') avisar('No encontré las dos cuentas de esa transferencia. Revisá tus cuentas o aplicá solo la categoría.');
  };
  // Aplica y deja una regla con el nombre del comercio para que la próxima vez se clasifique sola, sin IA
  const aplicarYRecordar = async (sug: SugerenciaIA) => {
    const m = movDe(sug.id);
    if (m && sug.categoria && sug.tipo !== 'Transferencia') {
      const palabra = norm(m.concepto).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !/^\d+$/.test(w)).slice(0, 2).join(' ');
      if (palabra) await guardarRegla(palabra, sug.categoria);
    }
    await aplicar(sug);
  };
  const aplicarAltas = async () => {
    tap(true);
    for (const sug of sugerenciasIA.filter((x) => x.confianza === 'alta' && (x.tipo === 'Transferencia' || x.categoria))) await aplicarSugerenciaIA(sug);
  };
  const altas = sugerenciasIA.filter((x) => x.confianza === 'alta').length;

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40, ...centrado(MAX_FORM) }}>
      <Card>
        <Titulo t="✨ Asistente de IA (gratis)" sub="Sugiere categoría y tipo para los movimientos que llegaron sin clasificar. Solo sugiere: vos decidís." />
        <Pressable onPress={() => { tap(); setIaActiva(!iaActiva); }} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontWeight: '700' }}>{iaActiva ? 'Activado' : 'Desactivado'}</Text>
            <Text style={s.sub}>{esGemini ? 'Con Gemini, el concepto, importe, fecha y método de los movimientos que revisás se envían a Google (plan gratis de AI Studio, que puede usar esos datos para mejorar sus productos). Nada se envía hasta que toques "Revisar".' : 'Con Ollama el texto solo viaja a la dirección que pongas abajo: no pasa por ningún servicio en la nube. Nada se envía hasta que toques "Revisar".'}</Text>
          </View>
          <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: iaActiva ? c.accent : c.border, justifyContent: 'center', paddingHorizontal: 3 }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignSelf: iaActiva ? 'flex-end' : 'flex-start' }} />
          </View>
        </Pressable>
      </Card>

      {iaActiva && (
        <>
          <Card>
            <Titulo t="¿Con qué IA?" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Chip label="🖥️ Ollama (en mi compu)" on={!esGemini} onPress={() => { setIaProveedor('ollama'); setEstado(null); }} />
              <Chip label="☁️ Gemini (Google, gratis)" on={esGemini} onPress={() => { setIaProveedor('gemini'); setEstado(null); }} />
            </View>
          </Card>

          {esGemini ? (
            <Card>
              <Titulo t="☁️ Gemini (Google AI Studio)" />
              <Pressable onPress={probarNube} disabled={probando || !nubeUid} style={{ backgroundColor: c.card2, borderRadius: 10, padding: 12, alignItems: 'center', opacity: nubeUid ? 1 : 0.5 }}>
                <Text style={{ color: c.accent, fontWeight: '700' }}>{probando ? 'Probando…' : 'Probar conexión con Gemini'}</Text>
              </Pressable>
              {estado && <Text style={{ color: estado.ok ? c.ingreso : c.gasto, marginTop: 8 }}>{estado.texto}</Text>}
              {!nubeUid && <Text style={{ color: c.aviso, marginTop: 8 }}>Gemini necesita tu cuenta de Yuro: la clave vive en la nube, no en la app.</Text>}
              <Text style={[s.sub, { marginTop: 10, lineHeight: 18 }]}>
                {'1. Sacá una clave gratis en aistudio.google.com/apikey.\n2. En Supabase > Edge Functions > Secrets, creá GEMINI_API_KEY con esa clave.\n3. Desplegá la función "ia-clasificar" con Verify JWT activado.\n4. Tocá "Probar conexión".'}
              </Text>
            </Card>
          ) : (
          <Card>
            <Titulo t="🖥️ Conexión con Ollama" />
            <TextInput
              style={{ backgroundColor: c.card2, color: c.text, borderRadius: 10, padding: 10, fontSize: 16, marginBottom: 8 }}
              placeholder="http://localhost:11434" placeholderTextColor={c.muted} autoCapitalize="none" autoCorrect={false} value={url} onChangeText={setUrl}
            />
            <Pressable onPress={probar} disabled={probando} style={{ backgroundColor: c.card2, borderRadius: 10, padding: 12, alignItems: 'center' }}>
              <Text style={{ color: c.accent, fontWeight: '700' }}>{probando ? 'Conectando…' : 'Conectar y ver modelos'}</Text>
            </Pressable>
            {estado && <Text style={{ color: estado.ok ? c.ingreso : c.gasto, marginTop: 8 }}>{estado.texto}</Text>}
            {instalados && instalados.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
                {instalados.map((m) => <Chip key={m} label={m} on={iaModelo === m} onPress={() => setIaConfig(url, m)} />)}
              </View>
            )}
            {!!iaModelo && <Text style={[s.sub, { marginTop: 6 }]}>Modelo elegido: {iaModelo}</Text>}
            <Text style={[s.sub, { marginTop: 10, lineHeight: 18 }]}>
              {'1. Instalá Ollama (ollama.com).\n2. En una terminal: ollama pull ' + MODELO_SUGERIDO + '\n3. Para usarlo desde esta app web: iniciá Ollama con OLLAMA_ORIGINS=* (si no, el navegador lo bloquea).\n4. Para usarlo desde el celular: iniciá Ollama con OLLAMA_HOST=0.0.0.0 y poné acá la IP de tu compu, ej. http://192.168.1.20:11434 (misma red wifi).'}
            </Text>
          </Card>
          )}

          <Card>
            <Text style={s.titulo}>{porRevisar.length ? `${porRevisar.length} movimiento(s) sin clasificar (últimos 60 días)` : 'No hay movimientos sin clasificar para revisar'}</Text>
            {porRevisar.length > LOTE && <Text style={s.sub}>Se revisan de a {LOTE}; después podés repetir.</Text>}
            <Pressable onPress={revisar} disabled={!porRevisar.length || cargando} style={{ backgroundColor: porRevisar.length && !cargando ? c.accent : c.border, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 10 }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>{cargando ? `Revisando… ${progreso?.hechos ?? 0}/${progreso?.total ?? ''}` : `✨ Revisar ${Math.min(porRevisar.length, LOTE)}`}</Text>
            </Pressable>
            {aviso && <Text style={{ color: c.aviso, marginTop: 8 }}>{aviso}</Text>}
          </Card>

          {sugerenciasIA.length > 0 && (
            <Card>
              <Titulo t={`Sugerencias (${sugerenciasIA.length})`} />
              {altas > 0 && (
                <Pressable onPress={aplicarAltas} style={{ marginBottom: 6 }}>
                  <Text style={{ color: c.accent, fontWeight: '700' }}>Aplicar las {altas} de confianza alta</Text>
                </Pressable>
              )}
              {sugerenciasIA.map((sug) => {
                const m = movDe(sug.id);
                if (!m) return null;
                const esTransf = sug.tipo === 'Transferencia';
                return (
                  <View key={sug.id} style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.titulo} numberOfLines={1}>{m.concepto}</Text>
                        <Text style={s.sub}>{fechaCorta(m.fecha)}{m.metodo ? ` · ${m.metodo}` : ''}</Text>
                      </View>
                      <Text style={{ color: m.valor > 0 ? c.ingreso : c.gasto, fontWeight: '700' }}>{money(m.valor, m.moneda)}</Text>
                    </View>
                    <Text style={{ color: c.text, marginTop: 6 }}>
                      {esTransf ? `↔️ Transferencia a ${sug.cuentaContraria || 'otra cuenta tuya'}` : `${catInfo(sug.categoria).emoji} ${sug.categoria || 'Sin categoría'}`}
                      <Text style={{ color: COLOR[sug.confianza], fontSize: 12 }}>  · confianza {sug.confianza}</Text>
                    </Text>
                    {!!sug.motivo && <Text style={[s.sub, { marginTop: 2 }]}>{sug.motivo}</Text>}
                    <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                      {(esTransf || !!sug.categoria) && <Pressable onPress={() => aplicar(sug)}><Text style={{ color: c.accent, fontWeight: '700' }}>Aplicar</Text></Pressable>}
                      {!esTransf && !!sug.categoria && <Pressable onPress={() => aplicarYRecordar(sug)}><Text style={{ color: c.accent }}>Aplicar y recordar</Text></Pressable>}
                      <Pressable onPress={() => { tap(); descartarSugerenciaIA(sug.id); }}><Text style={{ color: c.muted }}>Descartar</Text></Pressable>
                    </View>
                  </View>
                );
              })}
            </Card>
          )}
        </>
      )}
      <Tip id="ia-ayuda" emoji="💡">Una vez revisado un movimiento no se vuelve a revisar, aunque descartes la sugerencia. Los modelos locales chicos se equivocan más que los grandes: por eso nada se aplica solo. Si va muy lento, usá un modelo más chico; si se equivoca mucho, uno más grande.</Tip>
    </ScrollView>
  );
}
