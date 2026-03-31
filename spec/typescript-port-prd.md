# Graphiti Bun/TypeScript Port PRD

## Purpose

This document is the current handoff point for the Bun/TypeScript port.

Use it to answer four questions quickly:

1. What exists today?
2. What is production-relevant versus scaffold-only?
3. What are the main remaining gaps?
4. What should the next session do first?

Current branch:

- `chore/bun-typescript-port-scaffold`

## Product Goal

Port Graphiti from Python to a Bun/TypeScript monorepo that can eventually replace:

- `graphiti_core/`
- `server/graph_service/`
- `mcp_server/`

without breaking the existing Python release line before TypeScript parity exists.

The TypeScript port must preserve the core product concepts:

- Graphiti client
- entity nodes
- entity edges
- episodic nodes
- episodic mention edges
- temporal search
- HTTP service
- MCP service

## Current Scope

### In Active TypeScript Scope

- Bun workspaces
- shared validation/errors/time helpers
- core graph client and driver layer
- Neo4j backend
- FalkorDB backend
- Bun-native server package
- search parity work
- ingestion/extraction parity work

### Explicitly Deferred

- MCP port
- Neptune/OpenSearch port
- community graph support
- full provider matrix

### Removed From Active Scope

- `Kuzu`

Reason:

- archived upstream, no longer worth carrying as an active TS target

## Workspace Layout

Active TS packages under `packages/`:

- `packages/shared`
- `packages/core`
- `packages/server`
- `packages/mcp`
- `packages/testkit`

Important root files:

- `package.json`
- `bun.lock`
- `tsconfig.base.json`
- `tsconfig.json`
- `spec/bun-typescript-port-plan.md`
- `spec/typescript-port-prd.md`

## Current Status Summary

The TypeScript port is no longer scaffold-only.

There is now a functioning TS core with:

- Neo4j and FalkorDB driver paths
- a usable `Graphiti` client
- reusable backend operation layers
- working search execution and reranking
- server-wired non-community search filters and center-node reranking controls
- a real raw-text ingestion path
- a Bun-native HTTP server with the current route surface implemented

## Implemented Today

### Shared Package

Implemented:

- shared errors
- group id validation
- node label validation
- graph provider helpers
- time utilities

### Core Package

Implemented:

- domain models for nodes and edges
- search config/filter/recipe layer
- Graphiti client
- Neo4j driver adapter
- FalkorDB driver adapter
- reusable operations for:
  - entity nodes
  - entity edges
  - episode nodes
  - episodic mention edges

Implemented `Graphiti` methods:

- `addTriplet(...)`
- `addEpisode(...)`
- `ingestEpisode(...)`
- `ingestEpisodes(...)`
- `search(...)`
- `retrieveEpisodes(...)`
- `deleteEntityEdge(...)`
- `deleteEpisode(...)`
- `deleteGroup(...)`
- `clear()`
- `buildIndicesAndConstraints(...)`
- `close()`

### Search

Implemented:

- node BM25-style search
- edge BM25-style search
- episode BM25-style search
- BFS traversal for nodes
- BFS traversal for edges
- reciprocal-rank fusion
- node-distance reranking
- episode-mentions reranking
- cosine similarity search for nodes and edges
- MMR reranking for nodes and edges
- cross-encoder reranking for nodes and edges
- cross-encoder reranking for episodes
- Neo4j-backed search operations
- FalkorDB-backed search operations
- Graphiti-level `search_filter` support for non-community search
- server `/search` support for `center_node_uuid` and structured non-community search filters

Not implemented:

- community search
- full Python search parity
- broader non-community result-shape parity beyond the current fact-oriented server routes

### Ingestion

Implemented:

- pluggable episode extractor interface
- default heuristic extractor
- model-backed extractor with heuristic fallback
- pluggable node hydrator interface
- default heuristic hydrator
- model-backed hydrator with heuristic baseline merge and fallback
- resolution/dedupe pipeline
- conflicting-edge invalidation
- embedder-assisted semantic resolution
- stricter validation for model extraction and hydration responses
- alias-aware entity resolution for common name variants
- attribute-driven alias resolution from stored entity metadata
- alias propagation from extraction into persisted entity metadata
- relationship-context disambiguation for ambiguous entity candidates
- time-aware contradiction handling for out-of-order episode ingest
- sequential bulk ingest with chronological ordering
- cumulative maintenance-aware hydration for mention counts, source history, and first/last seen timestamps
- history-aware updates for changing model-derived string attributes such as roles
- time-aware non-regression for historical updates to string attributes
- explicit string-set accumulation for selected attributes such as `skills` and `tags`
- stateful timestamp tracking for selected string fields such as `role_updated_at`
- server message ingestion wired through the TS ingestion pipeline

Current ingest stages:

1. load recent episode context
2. extract entities and edges from episode text
3. enrich extracted names/facts with embeddings when an embedder is configured
4. resolve entities against existing graph state
5. resolve or invalidate edges against existing graph state
6. hydrate entity summaries and basic attributes
7. persist episode, entities, active edges, invalidated edges, and mention edges

Current extraction/hydration/resolution quality:

- extraction supports:
  - heuristic extraction
  - model-backed extraction through `LLMClient.generateText(...)`
  - alias extraction and canonicalization for heuristic and model-backed entity extraction
  - heuristic fallback when model output is invalid or parseable-but-invalid
- hydration supports:
  - heuristic hydration
  - model-backed hydration through `LLMClient.generateText(...)`
  - heuristic baseline merge plus fallback when model output is invalid or parseable-but-invalid
  - cumulative maintenance updates for `mention_count`, `edge_count`, `first_seen_at`, `last_seen_at`, and source history
  - latest-value plus `${key}_history` tracking for changing model-derived string attributes
  - historical episodes enrich string-attribute history without overwriting newer values
  - configured string-set accumulation for attributes such as `aliases`, `skills`, `teams`, and `tags`
  - per-field timestamp tracking for selected stateful strings such as `role_updated_at`
  - explicit TS-side attribute policy registry in `packages/core/src/ingest/hydrator.ts`
  - current policy table:
    - non-historical maintenance fields:
      - `source_description`
      - `first_seen_at`
      - `last_seen_at`
    - cumulative string-set fields:
      - `aliases`
      - `skills`
      - `teams`
      - `tags`
    - temporal latest-plus-history string fields with `${key}_updated_at` support:
      - `role`
      - `title`
      - `status`
      - `location`
      - `company`
      - `department`
    - default behavior for other attributes:
      - changing non-null string values still use latest-value plus `${key}_history`
      - uncategorized strings do not get `${key}_updated_at` unless they are added to the temporal policy set
      - non-string scalars overwrite with the incoming non-null value
      - incoming `null` is ignored so model uncertainty does not erase maintained state
    - current validation status:
      - temporal latest-plus-history behavior is covered in unit, orchestration, and live Neo4j/Falkor tests for:
        - `role`
        - `title`
        - `status`
        - `location`
        - `company`
        - `department`
      - string-set accumulation is covered in unit, orchestration, and live Neo4j/Falkor tests for:
        - `aliases`
        - `skills`
        - `teams`
        - `tags`
      - the currently implemented policy registry now has direct field coverage for every temporal field and every configured string-set field
    - practical extension rule for new attributes:
      - add a field to the temporal policy set only when newer-versus-older evidence should preserve a single latest value and timestamped transition history
      - add a field to the string-set policy set only when evidence should accumulate rather than replace
      - otherwise rely on the default non-null merge behavior until Python parity or public API requirements justify a stronger contract
- entity resolution supports:
  - exact lexical matching
  - approximate token/name matching
  - alias-aware matching for common name variants
  - alias-aware matching from stored entity `attributes.aliases`
  - relationship-context disambiguation when multiple candidates have similar lexical scores
  - semantic cosine matching when embeddings are present
- edge resolution supports:
  - exact fact reuse
  - semantic fact reuse when embeddings are present
  - conflicting-edge invalidation when facts differ materially
  - historical contradiction handling when older evidence arrives after newer facts

Still missing for ingestion parity:

- semantic entity linking beyond names
- richer attribute extraction beyond the current maintenance fields
- community maintenance
- Python-level temporal maintenance behavior

### Server Package

Implemented Bun-native routes:

- `GET /healthcheck`
- `POST /search`
- `GET /entity-edge/:uuid`
- `GET /episodes/:group_id`
- `POST /get-memory`
- `POST /entity-node`
- `POST /messages`
- `DELETE /entity-edge/:uuid`
- `DELETE /group/:group_id`
- `DELETE /episode/:uuid`
- `POST /clear`

The server uses Bun’s native `fetch` handler and can run from:

- `bun run packages/server/src/start.ts`
- `bun run start` from `packages/server`

## Backend Strategy

### Active Order

1. Neo4j
2. FalkorDB

### Deferred

- Neptune/OpenSearch

### Removed

- Kuzu

## Feature Matrix

### Core Client

| Capability | Neo4j | FalkorDB | Status |
| --- | --- | --- | --- |
| Save entity node | Yes | Yes | Working |
| Get entity node by uuid | Yes | Yes | Working |
| Save entity edge | Yes | Yes | Working |
| Get entity edge by uuid | Yes | Yes | Working |
| Delete entity edge by uuid | Yes | Yes | Working |
| Save episode node | Yes | Yes | Working |
| Get episode node by uuid | Yes | Yes | Working |
| Delete episode node by uuid | Yes | Yes | Working |
| Save episodic mention edge | Yes | Yes | Working |
| Add triplet | Yes | Yes | Working |
| Add episode | Yes | Yes | Working |
| Ingest raw episode text | Yes | Yes | Working, heuristic |
| Ingest episode batches | Yes | Yes | Working, sequential |
| Retrieve episodes by group | Generic query path | Generic query path | Working |
| Build indices | Yes | Minimal | Working |

### Search

| Capability | Neo4j | FalkorDB | Status |
| --- | --- | --- | --- |
| Node BM25-style search | Yes | Yes | Working |
| Edge BM25-style search | Yes | Yes | Working |
| Episode BM25-style search | Yes | Yes | Working |
| Node BFS search | Yes | Yes | Working |
| Edge BFS search | Yes | Yes | Working |
| RRF | Yes | Yes | Working |
| Node-distance reranking | Yes | Yes | Working |
| Episode-mentions reranking | Yes | Yes | Working |
| Cosine similarity | Yes | Yes | Working |
| MMR | Yes | Yes | Working |
| Cross-encoder reranking | Yes | Yes | Working |
| Community search | No | No | Missing |

### Server

| Route | Status |
| --- | --- |
| `GET /healthcheck` | Working |
| `POST /search` | Working |
| `GET /entity-edge/:uuid` | Working |
| `GET /episodes/:group_id` | Working |
| `POST /get-memory` | Working |
| `POST /entity-node` | Working |
| `POST /messages` | Working |
| `DELETE /entity-edge/:uuid` | Working |
| `DELETE /episode/:uuid` | Working |
| `DELETE /group/:group_id` | Working |
| `POST /clear` | Working |

## Tests And Verification

Use this exact clean verification flow:

```bash
rm -rf packages/*/dist packages/*/tsconfig.tsbuildinfo
~/.bun/bin/bun test packages
~/.bun/bin/bunx tsc -b --pretty false
```

Current status:

- `159 pass`
- `0 fail`

Notable coverage:

- unit tests for shared validation
- driver tests for Neo4j and FalkorDB
- live Neo4j integration tests including ingest and temporal contradiction behavior
- live Neo4j alias-propagation integration coverage
- live Neo4j same-name disambiguation coverage using relationship context
- live Neo4j attribute-history coverage for changing model-style fields
- live Neo4j historical attribute non-regression coverage
- live Neo4j configured string-set accumulation coverage
- live Neo4j stateful string timestamp coverage
- live Falkor integration tests for ingest and temporal contradiction behavior through the repo test env
- live Falkor alias-propagation integration coverage
- live Falkor same-name disambiguation coverage using relationship context
- live Falkor attribute-history coverage for changing model-style fields
- live Falkor historical attribute non-regression coverage
- live Falkor configured string-set accumulation coverage
- live Falkor stateful string timestamp coverage
- search execution tests
- ingestion extractor/resolver/hydrator tests
- Graphiti orchestration tests
- server route tests

## Important Environment Notes

- Bun is installed at `~/.bun/bin/bun`
- In this environment, full-path Bun invocation is safer than bare `bun`
- profile exports exist for Bun and local Neo4j defaults
- repo-local test env lives in `.env.test` with a template at `.env.test.example`
- `bun run test:packages`, `bun run test:neo4j`, and `bun run test:falkor` load `.env.test`
- clean `packages/*/dist` and `packages/*/tsconfig.tsbuildinfo` before or after Bun runs when needed
- Bun will discover `dist/*.test.js` if those artifacts exist
- git safe-directory behavior can be flaky in this container; use `git -c safe.directory=/root/graphiti ...`

## Key Technical Decisions Already Made

### 1. Bun-Native Monorepo

The TS port uses:

- Bun workspaces
- TS project references
- Bun test runner

### 2. Backend Order

Build and validate Neo4j first, then FalkorDB.

### 3. Search Design

Search is implemented as:

- backend candidate retrieval
- TS-side fusion/reranking

This keeps reranker behavior shared across Neo4j and FalkorDB.

### 4. Ingestion Design

Ingestion is being built around pluggable interfaces:

- `EpisodeExtractor`
- `NodeHydrator`

This allows heuristic and model-backed implementations to coexist without rewriting the orchestration layer.

### 5. Server Design

The TS server uses Bun’s native `fetch` handler instead of layering another web framework on top.

## Remaining Gaps

### Highest-Value Core Gaps

- no community nodes/edges support
- no MCP implementation
- limited higher-level entity/edge retrieval APIs beyond the current route needs

### Highest-Value Ingestion Gaps

- better semantic entity linking and alias handling
- richer attribute extraction beyond the current maintenance fields
- community maintenance if community support is brought back into active scope

### Highest-Value Search Gaps

- community search
- broader parity with Python `search.py`
- more complete non-community result-shape parity
- live backend validation for newly exposed server search-filter combinations

### Highest-Value Server Gaps

- no packaging/deployment workflow for the TS server yet

### MCP Gaps

- still scaffold-only
- no config port
- no tool/resource/transport implementation

## Recommended Next Steps

### Priority 1: Search Contract Parity

Recommended next work:

1. audit the remaining non-community TS search result shape against the Python `search.py` surface now that `/search` exposes `center_node_uuid` and structured filters
2. implement the highest-value missing result fields or query controls that matter to server and future MCP consumers
3. add live-backend validation for Neo4j and Falkor on the newly exposed server search-filter combinations

Why:

- search execution and reranking are real, and the first server contract gap is now closed, but the returned shape and backend validation still lag Python more than the ingestion maintenance layer does
- this stays inside already-active scope and avoids prematurely expanding into deferred community or MCP work

### Priority 2: Higher-Level Core API Parity

After the next search increment:

1. add the highest-value entity and edge retrieval helpers that Python exposes and the TS server or MCP layer will likely need next
2. keep those helpers backed by the existing reusable operations instead of duplicating query logic
3. validate behavior against both Neo4j and Falkor where the helper semantics are backend-sensitive

### Priority 3: MCP Package

After core/server are stronger:

1. port config
2. port transport and tool registration
3. reuse the existing TS core rather than re-encoding domain logic there

## Proposed Milestones From Here

### Milestone A: Heuristic Ingestion Foundation

Status:

- done

Done means:

- raw-text episode ingest exists
- extraction, resolution, hydration, and persistence are wired
- conflicting edges can be invalidated

### Milestone B: Semantic Ingestion Foundation

Status:

- partially done

Done means:

- extracted names/facts can be enriched with embeddings
- semantic resolution can reuse existing entities/edges when lexical matching is weak

### Milestone C: Model-Backed Ingestion

Status:

- in progress

Done means:

- non-heuristic extractor and hydrator implementations exist behind current interfaces

### Milestone D: Bulk And Maintenance Parity

Status:

- in progress

Done means:

- bulk ingest
- stronger update semantics
- community maintenance or an explicit decision to defer it

### Milestone E: MCP Port

Status:

- pending

Done means:

- MCP package is no longer scaffold-only

## Known Risks

### 1. False Parity Risk

The TS core is real and usable, but it is still not full Python parity.

Main risk areas:

- ingestion sophistication
- community logic
- broader provider support
- MCP support

### 2. Backend Drift

Neo4j and FalkorDB share a TS-side orchestration layer, but still need more live backend validation as behavior broadens.

### 3. Artifact Pollution

If `dist/*.test.js` exists, Bun may run generated tests in addition to source tests.

### 4. Environment Friction

- full-path Bun usage is safer here
- safe-directory handling can be annoying in this container

## Restart Checklist For A Fresh Session

When resuming in a new context:

1. confirm branch is still `chore/bun-typescript-port-scaffold`
2. read this file first
3. read `spec/bun-typescript-port-plan.md`
4. inspect current package state:

```bash
find packages -maxdepth 4 -type f | sort
```

5. run clean verification:

```bash
rm -rf packages/*/dist packages/*/tsconfig.tsbuildinfo
~/.bun/bin/bun test packages
~/.bun/bin/bunx tsc -b --pretty false
```

6. continue with the next milestone:

- recommended immediate target: non-community search result-shape parity plus live validation of exposed search filters

## Files Most Worth Reading Next

### Core

- `packages/core/src/graphiti.ts`
- `packages/core/src/ingest/extractor.ts`
- `packages/core/src/ingest/resolver.ts`
- `packages/core/src/ingest/hydrator.ts`
- `packages/core/src/search/search.ts`
- `packages/core/src/driver/neo4j-driver.ts`
- `packages/core/src/driver/falkordb-driver.ts`

### Server

- `packages/server/src/app.ts`
- `packages/server/src/service.ts`
- `packages/server/src/server.test.ts`
- `packages/server/src/start.ts`

### Planning

- `spec/bun-typescript-port-plan.md`
- `spec/typescript-port-prd.md`

## Recommended Immediate Task For The Next Session

Implement:

- non-community search result-shape parity plus live validation of exposed search filters

Suggested breakdown:

1. compare the current TS `SearchConfig`, `SearchResults`, and server DTOs against the Python non-community search surface
2. choose the highest-value missing result fields or query controls that affect current server or future MCP consumers
3. implement those gaps in the TS core search layer first, then thread them through the server contract if needed
4. add tests for result-shape merging, filter handling, and reranker score stability
5. add backend coverage for server-exposed `center_node_uuid` and search-filter combinations where query behavior depends on Neo4j or Falkor execution
6. run clean workspace verification

That is the highest-value next step because the ingestion orchestration, maintenance semantics, and live backend validation surfaces are now materially stronger, the first server-facing search contract increment is in place, and the remaining visible gap inside active TS scope is search result-shape parity and backend-backed search validation rather than basic ingest correctness.
