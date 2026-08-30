# Run graphs (`lib/runGraph` + `stores/useRunGraphStore.ts` + `components/rungraph/`)

Multi-run graphs are a dataflow DAG builder: each run node holds one prompt
template, named inputs, and 1..5 model instances; upstream outputs connect
into a named input, and templates reference them as `{{name}}` variables.
Form nodes declare fields (text, textarea, number, date, time, select,
slider, checkbox, unlimited count); each field is an output port whose value
can be wired into run inputs. Definitions persist per project in the
client-owned `openchamberConfig` JSON (`multiRunGraphs` section).

## Module map

| File | Owns |
|---|---|
| `types/runGraph.ts` | `RunGraphDefinition` shape, `RunGraphNode` union (`kind: 'run' | 'form'`), `RunGraphNodeInput` + name pattern, form field types, `resolveInstancePlacement` precedence (instance override → node binding → project root) |
| `template.ts` | The only template language: `{{name}}`, `{{name[N]}}`, `{{name.join("sep")}}` where `name` is a declared input. Multiple edges into one input produce ordered values, `{{name}}` joins them with the default separator. No JS evaluation, ever. Unknown names and out-of-range indexes fail render. |
| `validate.ts` | Static analysis: cycles (Kahn, instance-level edges), unique titles, dangling edge/port/instance refs, input names (missing/invalid/duplicate), template references vs declared inputs (unknown name, unconnected input, index range), form field issues (missing/duplicate titles, select options, slider bounds), shared-worktree warnings, orphan worktrees. Emits `RunGraphIssueCode` values consumed by the i18n panel. |
| `executor.ts` | `RunGraphExecutor`: ready-queue scheduler. An instance starts when every feeding instance is `done` and its worktree is ready; values are gathered per named input in edge order. Form nodes pause the run: a form is requested (via `deps.requestFormValues`) only once a consumer run is otherwise ready, submitted values become the field outputs, cancel fails the form and blocks its consumers. Completion is derived from the global live session-status index (absence = idle); a finished session with no assistant text is `failed` and blocks only its descendants. All dependency calls are injected via `RunGraphExecutorDeps`. |
| `sanitize.ts` | The persisted-JSON boundary. Zod schemas parse `multiRunGraphs`, then pure steps enforce caps (50 graphs / 32 nodes / 16 worktrees / 5 instances per node / 20 select options) and referential cleanup (dangling edges, ports, bindings, and pool overrides are dropped). Nodes persisted without `kind` read back as run nodes. Legacy graphs (edges without a target port) are migrated to an input literally named `inputs`, so old templates keep working. Keep runtime-garbage tolerance here and nowhere else. |
| `editorGraph.ts` | Pure graph-editing operations used by the store; cascade deletes (node removal drops its edges/bindings, instance/input/field removal drops its edges, worktree removal strips pool overrides). |
| `slug.ts`, `ids.ts` | Worktree name slugs and prefixed entity ids. |

## Form nodes

- Edges carry explicit ports: `sourceInstanceId` (model output) or
  `sourceFieldId` (field value); edges into a run node set `targetInputId`
  (the declared input receiving the value); edges into a form node set
  `targetFieldId` to inject the source output as that field's default.
  Exactly one source port is set; a target port is always required.
- Forms surface only on demand: the executor requests input when at least one
  consumer run has all non-form inputs done and is still runnable. Forms with
  no outgoing edges are never shown; forms whose consumers all fail or get
  blocked are marked `skipped`.
- The store owns the user-interaction channel: `requestFormValues` registers
  a resolver keyed by node id, `RunGraphFormDialog` (`components/rungraph/`)
  renders the pending request, and `submitRunForm` / `cancelRunForm` resolve
  it. When a run stops or settles, the store cancels outstanding resolvers
  (resolved `null` → the executor ignores the late response).
- Field values are plain strings (checkbox: `'true' | 'false'`; date/time and
  slider/number use their input encodings) so they flow through templates
  unchanged.

## Named inputs

- Run nodes start with zero inputs; users declare them in the inspector and
  the canvas renders one target handle per input. Input names must match
  `RUN_GRAPH_INPUT_NAME_PATTERN` (no whitespace or placeholder-grammar
  characters) and are unique per node; validation enforces both.
- The executor gathers values per input in edge-definition order; templates
  read `{{name}}` (all values, default-joined), `{{name[N]}}` (single value),
  or `{{name.join("sep")}}`.
- Legacy persisted graphs are migrated on load: edges without a target port
  get an input named `inputs` created on the target run node, keeping old
  `{{inputs}}` templates working unchanged.

## Invariants

- The template whitelist is the whole language. Do not add dynamic expressions
  without revisiting validation, sanitization, and the i18n hint strings.
- Instance identity is stable (`RunModelInstance.id`); field identity is
  stable (`RunGraphFormField.id`); input identity is stable
  (`RunGraphNodeInput.id`); edges reference ids, never indexes. Template
  placeholders reference inputs by *name*; values within one input follow the
  stored edge order.
- Run state is published only on instance/worktree/form lifecycle transitions.
  The executor subscribes to `useGlobalSessionStatusStore` (absence = idle)
  and never polls. Do not move completion detection to persisted history.
- Session creation goes through `registerCreatedSession` (shared with
  `useMultiRunStore`) so directory routing, child-store seeding, and global
  cache upsert stay in one owner. Prompt dispatch goes through `routeMessage`.
- `existing` worktree nodes store machine-local paths; validation warns at run
  time when the path is missing from `listProjectWorktrees`. `new` worktrees
  reuse-by-name before creating.
- Shared worktrees run concurrently by design; `validate.ts` emits the
  `shared-worktree` warning that the UI surfaces.

## Tests

`bun test src/lib/runGraph` covers template rendering (named placeholders),
validation, sanitization round-trips (including legacy graphs without `kind`
and legacy edges migrated to the named `inputs` input), editor cascades, and
executor scheduling (fake harness, no module mocks), including form gating,
default injection, cancellation, and stop behavior. The executor harness
finishes sessions by removing them from the active index; a run only settles
once every session goes idle.
