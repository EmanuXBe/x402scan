# PRD — StellarScan

**Stellar Summit São Paulo 2026** · Sub-lane 3A, Agentic Payments · 1,750 USDC
Fork de `Merit-Systems/x402scan` (Apache 2.0) · Entrega: 5 de agosto

---

## Problema

Stellar no aparece en ninguna herramienta de observabilidad de pagos agénticos. x402scan cubre Base y Solana; MPPscan cubre Tempo. La ausencia no se debe a falta de actividad, sino a que nadie escribió el adaptador.

**One-liner:** Stellar deja de ser invisible en el mapa de la economía agéntica.

## Por qué es viable en 48h

El modelo de datos de x402scan ya es agnóstico de cadena. `TransferEvent` no asume EVM en ningún campo: `chain` y `provider` son texto libre, no hay tipos `Bytes` ni longitudes fijas. Las direcciones `G…`/`C…` y los hashes de 64 caracteres entran sin tocar el esquema.

**Cero migraciones de base de datos.** El trabajo es un adaptador, no un refactor.

## El hallazgo: por qué MPP no entra

El modelo de atribución de x402scan identifica pagos por **dirección de facilitator**: un transfer cuenta como pago x402 si lo tocó un facilitator registrado.

Para **x402 en Stellar eso funciona** — existen facilitators con dirección identificable (OpenZeppelin Relayer, Coinbase testnet). Registrar direcciones en una estructura que ya existe.

Para **MPP no funciona**. MPP opera sin facilitator externo: liquida transfers SAC directos entre agente y servicio. Sin facilitator que emparejar, un pago MPP es indistinguible de cualquier transferencia de tokens.

La excepción es el modo sesión: el contrato `one-way-channel` sí tiene un ID identificable, lo que abre atribución **por contrato en lugar de por dirección**.

> Este diagnóstico es el activo intelectual del proyecto. Explica algo que ni Merit ni SDF tenían documentado. Se presenta como hallazgo, no como limitación.

## Alcance

**Fase 1 (esta entrega).** Stellar como cadena seleccionable, con pagos x402 vía facilitator indexados y visibles en el explorador.

**Fase 2 (post-bounty).** Atribución de MPP por ID de contrato, empezando por `one-way-channel`. Métricas de sesión: micro-llamadas por settlement, costo por llamada.

**Fuera de alcance.** Wallet embebida · onramp · chat de agente · registro de recursos · alertas · analytics · cobertura de MPP · paridad total de funcionalidades · mainnet si testnet basta para demostrar.

## Requerimientos

Cada requerimiento es su propio criterio de aceptación.

| ID | Requerimiento | Verificación | Prio |
|---|---|---|---|
| RF-01 | Stellar aparece en el selector de cadenas | `pnpm dev` levanta y Stellar es seleccionable | Must |
| RF-02 | Los transfers de USDC originados por un facilitator registrado se indexan | ≥1 fila con `chain = 'stellar'` en `TransferEvent`, de un facilitator real | Must |
| RF-03 | El dashboard muestra volumen, nº de transacciones y compradores únicos | Métricas correctas — verificadas contra stellar.expert, sin errores de render | Must |
| RF-04 | Los hashes enlazan a un explorador de Stellar | Un hash abre la transacción correcta en stellar.expert | Must |
| RF-05 | Documento del problema de atribución de MPP | Presente en el repo | Must |
| RF-06 | **PR abierto contra `Merit-Systems/x402scan`** | PR existe y es revisable | Must |
| RF-07 | Al menos un facilitator de Stellar visible con sus estadísticas | Aparece en la vista de facilitators | Should |
| RF-08 | Direcciones `G…`/`C…` formateadas y truncadas · filtro por cadena funcional | Correcto en las vistas que ya lo soportan | Should |

**RF-06 es el que convierte la submission de demo a contribución.** Vale más que cualquier funcionalidad adicional.

**Restricción transversal:** ningún cambio puede degradar Base ni Solana. Es condición del PR upstream.

## Entregables

- Repositorio del fork, público, con README que explique qué se añadió y por qué
- PR upstream a `Merit-Systems/x402scan`
- Documento técnico sobre atribución de pagos agénticos en Stellar
- Video demo (~3 min)
