import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { BarrasMeses, Dona, type Porcion } from '../../src/charts';
import { useConversor, useFinanzas } from '../../src/store';
import { c, catInfo, metInfo } from '../../src/theme';
import { Barra, Card, Chip, Columnas, SelectorMoneda, Tip, Titulo, centrado, s } from '../../src/ui';
import { MESES, etiquetaMes, money, pct } from '../../src/util';

const p2 = (n: number) => String(n).padStart(2, '0');

export default function Estadisticas() {
  const { mes, setMes, porAnio, sincronizando, sincronizar, setMonedaVista } = useFinanzas();
  const { vista, cot, conv } = useConversor();
  const [selMetodo, setSelMetodo] = useState<string | null>(null);
  const [vistaCat, setVistaCat] = useState<'anio' | 'mes'>('anio');
  const anio = mes.slice(0, 4);
  const $ = (n: number) => money(n, vista);

  const d = useMemo(() => {
    const lista = porAnio[anio] ?? [];
    const meses = Array.from({ length: 12 }, (_, i) => ({ ym: `${anio}-${p2(i + 1)}`, ingresos: 0, gastos: 0, ahorro: 0 }));
    const cat: Record<string, number> = {};
    const catMes: Record<string, number> = {};
    const met: Record<string, number> = {};
    for (const m of lista) {
      const v = conv(m.valor, m.moneda);
      const b = meses[+m.fecha.slice(5, 7) - 1];
      if (m.tipo === 'Ingreso') b.ingresos += v;
      if (m.tipo === 'Ahorro') b.ahorro -= v;
      if (m.tipo === 'Egreso') {
        b.gastos -= v;
        const k = m.categoria || 'Sin categoría';
        cat[k] = (cat[k] ?? 0) - v;
        if (m.fecha.startsWith(mes)) {
          catMes[k] = (catMes[k] ?? 0) - v;
          met[m.metodo || 'Otro'] = (met[m.metodo || 'Otro'] ?? 0) - v;
        }
      }
    }
    const tot = meses.reduce((a, x) => ({ ingresos: a.ingresos + x.ingresos, gastos: a.gastos + x.gastos, ahorro: a.ahorro + x.ahorro }), { ingresos: 0, gastos: 0, ahorro: 0 });
    const conDatos = meses.filter((x) => x.ingresos || x.gastos);
    const peor = [...conDatos].sort((a, b) => b.gastos - a.gastos)[0];
    const mejor = [...conDatos].sort((a, b) => b.ingresos - b.gastos - b.ahorro - (a.ingresos - a.gastos - a.ahorro))[0];
    const orden = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]);
    return { meses, tot, conDatos, peor, mejor, cat: orden(cat), catMes: orden(catMes), met: orden(met) };
  }, [porAnio, anio, mes, vista, cot]); // eslint-disable-line react-hooks/exhaustive-deps

  const sel = d.meses[+mes.slice(5) - 1];
  const metodos: Porcion[] = d.met.map(([label, valor]) => ({ label, valor, ...metInfo(label) }));
  const cats = vistaCat === 'anio' ? d.cat : d.catMes;
  const totalCats = cats.reduce((a, x) => a + x[1], 0);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40, ...centrado() }} refreshControl={<RefreshControl refreshing={sincronizando} onRefresh={sincronizar} tintColor={c.text} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text style={{ color: c.text, fontSize: 22, fontWeight: '800' }}>Año {anio}</Text>
        <SelectorMoneda valor={vista} onChange={setMonedaVista} chico />
      </View>

      <Columnas izq={<>
      <Card>
        <View style={{ flexDirection: 'row' }}>
          {[
            { t: 'Ingresos', v: d.tot.ingresos, col: c.ingreso },
            { t: 'Gastos', v: d.tot.gastos, col: c.gasto },
            { t: 'Ahorro', v: d.tot.ahorro, col: c.ahorro },
          ].map((x) => (
            <View key={x.t} style={{ flex: 1 }}>
              <Text style={s.h}>{x.t}</Text>
              <Text style={{ color: x.col, fontWeight: '800' }} numberOfLines={1} adjustsFontSizeToFit>{$(x.v)}</Text>
            </View>
          ))}
        </View>
        {d.tot.ingresos > 0 && (
          <Text style={{ color: c.muted, marginTop: 10 }}>
            Tasa de ahorro del año: <Text style={{ color: c.ahorro, fontWeight: '700' }}>{pct(d.tot.ahorro, d.tot.ingresos)}%</Text>
            {d.conDatos.length > 0 && <> · gasto promedio por mes: <Text style={{ color: c.text, fontWeight: '700' }}>{$(d.tot.gastos / d.conDatos.length)}</Text></>}
          </Text>
        )}
      </Card>

      <Card>
        <Titulo t="📊 Mes a mes" sub="Verde: ingresos · Rojo: gastos. Tocá un mes para verlo." />
        <BarrasMeses data={d.meses} sel={mes} onSel={setMes} moneda={vista} />
        <View style={{ backgroundColor: c.card2, borderRadius: 12, padding: 12, marginTop: 12 }}>
          <Text style={{ color: c.text, fontWeight: '700', marginBottom: 6 }}>{etiquetaMes(mes)}</Text>
          <Text style={{ color: c.muted }}>Ingresos <Text style={{ color: c.ingreso }}>{$(sel.ingresos)}</Text></Text>
          <Text style={{ color: c.muted }}>Gastos <Text style={{ color: c.gasto }}>{$(sel.gastos)}</Text></Text>
          <Text style={{ color: c.muted }}>Ahorro <Text style={{ color: c.ahorro }}>{$(sel.ahorro)}</Text></Text>
          <Text style={{ color: c.muted, marginTop: 4 }}>
            Resultado <Text style={{ color: sel.ingresos - sel.gastos - sel.ahorro < 0 ? c.gasto : c.text, fontWeight: '700' }}>{$(sel.ingresos - sel.gastos - sel.ahorro)}</Text>
          </Text>
        </View>
        {d.peor && d.mejor && d.conDatos.length > 1 && (
          <Text style={{ color: c.muted, marginTop: 10, lineHeight: 19 }}>
            🏆 Tu mejor mes fue <Text style={{ color: c.text }}>{MESES[+d.mejor.ym.slice(5) - 1]}</Text>. 💸 El de más gastos fue{' '}
            <Text style={{ color: c.text }}>{MESES[+d.peor.ym.slice(5) - 1]}</Text> ({$(d.peor.gastos)}).
          </Text>
        )}
      </Card>
      <Tip id="estadisticas" emoji="📚">Mirar el año completo te ayuda a ver patrones: meses con gastos fijos altos (seguros, vacaciones, aguinaldo) se pueden planear con tiempo.</Tip>

      </>} der={<>
      <Card>
        <Titulo t="🏷️ Ranking de categorías" />
        <View style={{ flexDirection: 'row', marginBottom: 4 }}>
          <Chip label="Todo el año" on={vistaCat === 'anio'} onPress={() => setVistaCat('anio')} />
          <Chip label={MESES[+mes.slice(5) - 1]} on={vistaCat === 'mes'} onPress={() => setVistaCat('mes')} />
        </View>
        {cats.length === 0 && <Text style={{ color: c.muted }}>Sin gastos</Text>}
        {cats.map(([cat, v], i) => (
          <View key={cat} style={{ marginTop: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ color: c.muted, width: 22 }}>{i + 1}.</Text>
              <Text style={{ fontSize: 16, marginRight: 8 }}>{catInfo(cat).emoji}</Text>
              <Text style={{ color: c.text, flex: 1 }}>{cat}</Text>
              <Text style={{ color: c.muted, marginRight: 8 }}>{pct(v, totalCats)}%</Text>
              <Text style={{ color: c.text, fontWeight: '700' }}>{$(v)}</Text>
            </View>
            <Barra valor={pct(v, cats[0][1])} color={catInfo(cat).color} alto={6} />
          </View>
        ))}
      </Card>

      <Card>
        <Titulo t="💳 ¿Con qué pagaste?" sub={`Gastos de ${etiquetaMes(mes)} por método`} />
        {metodos.length === 0 ? (
          <Text style={{ color: c.muted }}>Sin gastos este mes</Text>
        ) : (
          <>
            <Dona data={metodos} sel={selMetodo} onSel={setSelMetodo} moneda={vista} size={180} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
              {metodos.map((m) => (
                <Chip key={m.label} label={`${m.emoji} ${m.label}`} on={selMetodo === m.label} color={m.color} onPress={() => setSelMetodo(selMetodo === m.label ? null : m.label)} />
              ))}
            </View>
          </>
        )}
      </Card>
      </>} />
    </ScrollView>
  );
}
