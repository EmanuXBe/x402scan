# Sprint Plan — StellarScan

2 personas · ~36h útiles (4 ago tarde → 5 ago noche) · Doc padre: [PRD.md](PRD.md)

---

## Restricciones técnicas verificadas

Cuatro hechos medidos sobre el código. Son load-bearing: los tickets asumen esto.

1. **Stellar entra en la ruta de lectura, no en la de wallet.** `Chain.SOLANA` aparece en 49 archivos, casi todos wallet/onramp/withdraw — fuera de alcance. Se separa `WALLET_CHAINS` de `SUPPORTED_CHAINS` (ticket B-6). Sin esa línea, el cambio se filtra a 40+ archivos y el sprint muere. La cascada de `EvmChain` en sí es menor: 7 archivos, 13 referencias.

2. **Hubble no necesita un `QueryProvider` nuevo.** [fetch/bigquery/fetch.ts](sync/transfers/trigger/fetch/bigquery/fetch.ts) es genérico — el dataset vive dentro del SQL que devuelve `buildQuery`. Hubble es otro dataset de BigQuery. Se reusa `QueryProvider.BIGQUERY`; el adaptador son dos archivos nuevos.

3. **`normalizeAddress` corrompe direcciones de Stellar.** [sync.ts:17](sync/transfers/trigger/sync.ts#L17) pasa a minúsculas todo lo que no es Solana; las direcciones Stellar son base32 case-sensitive. Alimenta la clave de sync state → el cursor nunca casaría y el sync re-consultaría la misma ventana en loop. Ticket B-7.

4. **El adaptador plantilla está apagado.** `solana/bigquery/config.ts` tiene `enabled: false`; la ruta viva es bitquery. Puede estar bit-rotted. Ticket A-5 lo enciende para validar la ruta BigQuery end-to-end antes de escribir nada de Stellar.

---

## Roles

| | **S — Sistemas** | **I — Industrial** |
|---|---|---|
| Dominio | Repo, TypeScript, adaptador de sync, frontend, PR | SQL, verificación de datos, narrativa, submission |
| Ruta crítica | Sí | No — trabaja en paralelo y desbloquea a S |

**Asignación clave:** el riesgo #1 (¿Hubble expone eventos SAC?) se resuelve con SQL en la consola de BigQuery, sin tocar el repo. Es trabajo de I. Mientras S levanta el entorno, I explora el esquema y entrega una query que devuelve filas reales. Eso saca el riesgo #1 de la ruta crítica.

---

## Backlog

### A · Hora 0–4 — Desbloqueo paralelo

| ID | Tarea | Dueño | Gate |
|---|---|---|---|
| A-1 | Fork + `pnpm install` + `pnpm dev` | S | La app carga |
| A-2 | DB local + Prisma + credenciales Trigger.dev | S | `TransferEvent` consultable |
| A-3 | **Esquema de Hubble en consola BigQuery** | **I** | Query que devuelve ≥1 transfer de USDC SAC |
| A-4 | **Direcciones de facilitators Stellar** (Discord SDF, docs OZ Relayer) | **I** | ≥1 dirección `G…` verificable en stellar.expert |
| A-5 | Encender `solana/bigquery` y correrlo | S | La ruta BigQuery escribe filas, o falla con error conocido |

**A-3 y A-4 son los dos únicos bloqueantes duros del proyecto.**

*A-3 — qué buscar en `crypto-stellar.crypto_stellar`:* `history_contract_events` (eventos SAC), `history_transactions` (hash), `enriched_history_operations`. La query debe devolver, para una dirección de facilitator: `tx_hash`, `sender`, `recipient`, `amount`, `block_timestamp`, `contract_id`. Es decir, las columnas de `TransferEventData`.

### B · Hora 4–10 — Cimientos declarativos

| ID | Tarea | Dueño | Gate |
|---|---|---|---|
| B-1 | `Network.STELLAR` en `facilitators/src/types.ts` | S | Compila |
| B-2 | `USDC_STELLAR_TOKEN` — **7 decimales, no 6** | S | Compila |
| B-3 | Facilitator `openzeppelin.ts` + bloque Stellar en `coinbase.ts` + export | S | Aparece en la lista |
| B-4 | `Chain.STELLAR` + labels + icons + `CHAIN_ID: 0` | S | `pnpm build` verde |
| B-5 | `EvmChain = Exclude<Chain, Chain.SOLANA \| Chain.STELLAR>` + los ~4 sitios | S | `tsc` limpio |
| B-6 | **Separar `WALLET_CHAINS` de `SUPPORTED_CHAINS`** | S | La wallet sigue funcionando sin Stellar |
| B-7 | **Fix `normalizeAddress`: preservar case en Stellar** | S | `G…` sobrevive el round-trip |
| B-8 | `stellar.png` en `apps/scan/public/` | I | El ícono renderiza |
| B-9 | **Documento de atribución de MPP — borrador** | **I** | Completo |

### C · Hora 10–20 — El adaptador

| ID | Tarea | Dueño | Gate |
|---|---|---|---|
| C-1 | `chains/stellar/hubble/query.ts` — `buildQuery` con el SQL de A-3 | S | Se ejecuta contra Hubble |
| C-2 | `chains/stellar/hubble/config.ts` — `SyncConfig`, `QueryProvider.BIGQUERY` | S | El sync arranca |
| C-3 | `transformResponse` → `TransferEventData`, decimales a 7 | S | Tipos correctos |
| C-4 | `FACILITATORS_BY_CHAIN(Network.STELLAR)` | S | El sync resuelve direcciones |
| C-5 | **Correr el sync** | S | **★ ≥1 fila con `chain = 'stellar'`** (RF-02) |
| C-6 | **Verificación cruzada contra stellar.expert** | **I** | Monto, hash y direcciones coinciden |
| C-7 | Generar tráfico x402 en testnet | I + S | ≥10 transacciones propias indexadas |

**C-5 es el gate del proyecto.** Si a H+20 no hay una fila, se ejecuta el fallback sin debatir.

**C-6 es donde el perfil de I paga:** verificar que los números son *correctos*, no solo que existen. Un dashboard con montos mal escalados por el error de 7-vs-6 decimales es peor que uno vacío — y es el error más probable del sprint.

### D · Hora 20–28 — Frontend visible

| ID | Tarea | Dueño | RF |
|---|---|---|---|
| D-1 | Stellar en el selector del navbar | S | RF-01 |
| D-2 | `tx_hash` → stellar.expert | S | RF-04 |
| D-3 | Formateo/truncado de `G…` y `C…` · filtro por cadena | S | RF-08 |
| D-4 | `chain-mapping.ts` — CAIP-2 `stellar:pubnet` / `stellar:testnet` | S | RF-08 |
| D-5 | Facilitator de Stellar con estadísticas | S | RF-07 |
| D-6 | **QA de dashboard** con Stellar y con "todas las cadenas" | **I** | RF-03 |

*D-6, el caso que rompe:* agregaciones que suman montos de 6 y 7 decimales sin normalizar.

### E · Hora 28–34 — Entrega

| ID | Tarea | Dueño | RF |
|---|---|---|---|
| E-1 | README del fork: qué se añadió, por qué, cómo correrlo | I | — |
| E-2 | Documento de atribución de MPP — final | I | RF-05 |
| E-3 | Video demo (~3 min) | I | — |
| E-4 | **PR upstream** — se abre en draft apenas pasa C-5 | S + I | RF-06 |
| E-5 | Limpieza de diff: sin secretos, sin `console.log`, commits legibles | S | — |
| E-6 | Submission enviada | I | — |

**E-4 no se deja para el final.** Un PR en draft desde la hora 20 es evidencia de contribución; uno abierto a las 23:50 parece apurado.

---

## Ruta crítica

```
S:  A-1 A-2 ── A-5 ── B-1..B-7 ── C-1..C-4 ── C-5 ★ ── D-1..D-5 ── E-4 E-5
                                     ▲
                                     │ SQL validado
I:  A-3 ── A-4 ─────────────────────┘  B-9 ── C-6 ── C-7 ── D-6 ── E-1 E-2 E-3 E-6
```

**Solo hay tres dependencias reales:** C-1 ← A-3 · C-4 ← A-4 · D-6 ← C-5.
Todo lo demás de I es independiente. Si S se atasca 4h en el entorno, I no pierde tiempo.

**Sueño desfasado:** S duerme en el tramo 20–26 (tras C-5). I duerme en el tramo 10–16 (tras entregar el SQL).

---

## Escalera de fallbacks

**Cada fallback tiene hora de disparo. Si llega la hora, se ejecuta sin debatir.**

| Si falla | Disparo | Fallback |
|---|---|---|
| Hubble no expone eventos SAC | **H+4** | RPC de Soroban `getEvents`, ventana 24h. ~3h extra. Se declara: histórico limitado por retención de RPC |
| Sin direcciones de facilitator | **H+6** | Desplegar facilitator propio en testnet (OZ Relayer) o usar Coinbase testnet. La dirección la controlamos → deja de ser bloqueante |
| La cascada de tipos desborda | **H+12** | Aislar Stellar en el pipeline de sync + vista dedicada `/stellar`, sin tocar componentes compartidos. Cumple RF-02/03/04 |
| Sin volumen real de x402 | **H+20** | C-7: generar el tráfico nosotros. **Etiquetado como datos de demostración** en UI y README |
| El sync no escribe ni una fila | **H+24** | Inserción manual verificada, adaptador igual en el PR, documentando explícitamente que el sync automatizado quedó sin validar |
| Todo lo técnico se cae | **H+30** | Entregar el documento de atribución + cambios declarativos en el PR. Sigue siendo contribución real |

**Sobre el fallback de H+24:** existe como red, no como plan. Si se usa, el README y la demo lo dicen con todas las letras. Presentar datos insertados a mano como indexación funcionando es la única forma de convertir un proyecto honesto en uno descalificable.

---

## Definition of Done

- `pnpm build` y `tsc` sin errores nuevos
- Commiteado con mensaje descriptivo
- Si toca datos: verificado contra stellar.expert por I
- Si toca UI: probado con Stellar **y** con la cadena por defecto — no romper Base/Solana

---

## Checklist de submission

- [ ] RF-01 · Stellar en el selector
- [ ] RF-02 · ≥1 fila `chain = 'stellar'` de facilitator real
- [ ] RF-03 · Dashboard con métricas verificadas
- [ ] RF-04 · Hash enlazando a stellar.expert
- [ ] RF-05 · Documento de atribución de MPP
- [ ] RF-06 · **PR abierto contra `Merit-Systems/x402scan`**
- [ ] README del fork · repo público · video demo
- [ ] Datos de demostración etiquetados como tales, si los hay
- [ ] Atribución Apache 2.0 preservada · sin secretos en el diff
