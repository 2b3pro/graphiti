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
- MCP server port

### Explicitly Deferred

- Neptune/OpenSearch port
- community graph support
- saga support
- full provider matrix (only OpenAI implemented)
- bulk operations (`addEpisodeBulk`, `saveBulk`, `deleteByUuids`)
- LLM-assisted deduplication
- content chunking
- token tracking and LLM response caching

### Removed From Active Scope

- `Kuzu`

Reason:

- archived upstream, no longer worth carrying as an active TS target

## Workspace Layout

Active TS packages under `packages/`:

- `packages/shared` — 7 source files
- `packages/core` — 55 source files
- `packages/server` — 7 source files
- `packages/mcp` — 3 source files
- `packages/testkit` — 6 source files

Important root files:

- `package.json`
- `bun.lock`
- `tsconfig.base.json`
- `tsconfig.json`
- `spec/bun-typescript-port-plan.md`
- `spec/typescript-port-prd.md`

## Current Status Summary

The TypeScript port is production-relevant for core operations.

There is now a functioning TS core with:

- Neo4j and FalkorDB driver paths
- a usable `Graphiti` client with all primary CRUD and search methods
- reusable backend operation layers
- working search execution with all non-community rerankers
- server-wired non-community search filters and center-node reranking controls
- a real raw-text ingestion path with heuristic and model-backed extractors/hydrators
- a Bun-native HTTP server with the current route surface implemented
- an MCP server with all 9 tools ported from Python
- OpenAI providers for LLM, embedder, and cross-encoder

## Implemented Today

### Shared Package

Implemented:

- shared errors (`GraphitiError` and subclasses)
- group id validation
- node label validation
- graph provider helpers
- time utilities (`utcNow`)
- migration status types

### Core Package

Implemented:

- domain models for nodes and edges (entity, episodic, community types defined)
- search config/filter/recipe layer
- Graphiti client
- Neo4j driver adapter
- FalkorDB driver adapter
- reusable operations for:
  - entity nodes
  - entity edges
  - episode nodes
  - episodic mention edges
- OpenAI LLM provider (with reasoning model detection, retry logic, tracer integration)
- OpenAI embedder provider (text-embedding-3-small/large, multi-dimension)
- OpenAI cross-encoder/reranker provider

Implemented `Graphiti` methods:

- `addTriplet(...)`
- `addEpisode(...)`
- `ingestEpisode(...)`
- `ingestEpisodes(...)`
- `search(...)`
- `searchEdges(...)` — convenience method returning `EntityEdge[]`
- `getNodesAndEdgesByEpisode(...)` — load edges and nodes by episode UUIDs
- `retrieveEpisodes(...)`
- `deleteEntityEdge(...)`
- `deleteEpisode(...)`
- `deleteGroup(...)`
- `clear()`
- `buildIndicesAndConstraints(...)`
- `close()`

### Namespace Operations

#### `graphiti.nodes.entity`

| Method | Status |
| --- | --- |
| `save(node)` | Working |
| `saveBulk(nodes)` | Working |
| `getByUuid(uuid)` | Working |
| `getByUuids(uuids)` | Working |
| `getByGroupIds(groupIds)` | Working |
| `deleteByGroupId(groupId)` | Working |
| `deleteByUuids(uuids)` | Missing |

#### `graphiti.nodes.episode`

| Method | Status |
| --- | --- |
| `save(node)` | Working |
| `saveBulk(nodes)` | Working |
| `getByUuid(uuid)` | Working |
| `getByUuids(uuids)` | Working |
| `getByGroupIds(groupIds, lastN, referenceTime)` | Working |
| `deleteByUuid(uuid)` | Working |
| `deleteByGroupId(groupId)` | Working |
| `deleteByUuids(uuids)` | Missing |

#### `graphiti.edges.entity`

| Method | Status |
| --- | --- |
| `save(edge)` | Working |
| `saveBulk(edges)` | Working |
| `getByUuid(uuid)` | Working |
| `getByUuids(uuids)` | Working |
| `deleteByUuid(uuid)` | Working |
| `deleteByGroupId(groupId)` | Working |
| `deleteByUuids(uuids)` | Missing |

#### `graphiti.edges.episodic`

| Method | Status |
| --- | --- |
| `save(edge)` | Working |
| `saveBulk(edges)` | Working |

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
- cross-encoder reranking for nodes, edges, and episodes
- Neo4j-backed search operations
- FalkorDB-backed search operations
- Graphiti-level `search_filter` support for non-community search
- property filters in edge search filter query constructor
- Parallel search execution via `Promise.all` for node/edge/episode search
- server `/search` support for `center_node_uuid` and structured non-community search filters

Pre-configured search recipes:

- `COMBINED_HYBRID_SEARCH_RRF` / `_MMR` / `_CROSS_ENCODER`
- `EDGE_HYBRID_SEARCH_RRF` / `_MMR` / `_NODE_DISTANCE` / `_EPISODE_MENTIONS` / `_CROSS_ENCODER`
- `NODE_HYBRID_SEARCH_RRF` / `_MMR` / `_NODE_DISTANCE` / `_EPISODE_MENTIONS` / `_CROSS_ENCODER`
- `COMMUNITY_HYBRID_SEARCH_RRF` / `_MMR` / `_CROSS_ENCODER`

Not implemented:

- community search (config exists, but no community operations to back it)
- broader parity beyond the current fact-oriented server routes

### Ingestion

Implemented:

- pluggable episode extractor interface
- default heuristic extractor (capitalized names, 7 relation patterns, alias via parenthetical)
- model-backed extractor with heuristic fallback (LLM-powered JSON extraction)
- pluggable node hydrator interface
- default heuristic hydrator (mention count, edge count, timestamps, source tracking)
- model-backed hydrator with heuristic baseline merge and fallback
- resolution/dedupe pipeline (lexical, semantic, alias-aware, relationship-context)
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

Still missing for ingestion parity:

- `addEpisodeBulk()` — Python's sophisticated bulk extraction/dedup pipeline (~200 LOC)
- LLM-assisted node and edge deduplication (Python has dedicated prompts)
- content chunking
- semantic entity linking beyond names
- community maintenance
- saga support

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

The server uses Bun's native `fetch` handler and can run from:

- `bun run packages/server/src/start.ts`
- `bun run start` from `packages/server`

### MCP Package

Implemented via `@modelcontextprotocol/sdk` with Zod schema validation:

- `add_memory` — Ingest episode into graph via `ingestEpisode()`
- `search_nodes` — Search entities using `NODE_HYBRID_SEARCH_RRF`
- `search_memory_facts` — Search edges via `searchEdges()`
- `delete_entity_edge` — Delete edge by UUID
- `delete_episode` — Delete episode by UUID
- `get_entity_edge` — Fetch edge by UUID
- `get_episodes` — List recent episodes by group
- `clear_graph` — Delete data for specified group IDs
- `get_status` — Health check via database ping

Transport: stdio (via `StdioServerTransport`).

Config: `McpServerConfig` with `default_group_id`.

All tools delegate to the `Graphiti` core client — no business logic duplication.

Not implemented:

- HTTP/streamable transport
- async queue processing (Python uses background episode queuing per group)

## Backend Strategy

### Active Order

1. Neo4j
2. FalkorDB

### Deferred

- Neptune/OpenSearch

### Removed

- Kuzu

## Provider Support

### LLM Providers

| Provider | Python | TypeScript | Status |
| --- | --- | --- | --- |
| OpenAI | Yes | Yes | Parity |
| Anthropic | Yes | No | Missing |
| Gemini | Yes | No | Missing |
| Groq | Yes | No | Missing |
| Azure OpenAI | Yes | No | Missing |
| OpenAI-compatible (generic) | Yes | No | Missing |
| GLiNER2 | Yes | No | Missing |

### Embedder Providers

| Provider | Python | TypeScript | Status |
| --- | --- | --- | --- |
| OpenAI | Yes | Yes | Parity |
| Gemini | Yes | No | Missing |
| Azure OpenAI | Yes | No | Missing |
| Voyage AI | Yes | No | Missing |

### Cross-Encoder / Reranker Providers

| Provider | Python | TypeScript | Status |
| --- | --- | --- | --- |
| OpenAI | Yes | Yes | Parity |
| Gemini | Yes | No | Missing |
| BGE Reranker | Yes | No | Missing |

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
| Ingest raw episode text | Yes | Yes | Working, heuristic + model |
| Ingest episode batches | Yes | Yes | Working, sequential |
| Search edges (convenience) | Yes | Yes | Working |
| Get nodes/edges by episode | Yes | Yes | Working |
| Retrieve episodes by group | Generic query path | Generic query path | Working |
| Build indices | Yes | Minimal | Working |
| Add episode bulk | No | No | Missing |
| Build communities | No | No | Missing |

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
| Property filters (edge) | Yes | Yes | Working |
| Parallel search execution | Yes | Yes | Working |
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

### MCP

| Tool | Status |
| --- | --- |
| `add_memory` | Working |
| `search_nodes` | Working |
| `search_memory_facts` | Working |
| `delete_entity_edge` | Working |
| `delete_episode` | Working |
| `get_entity_edge` | Working |
| `get_episodes` | Working |
| `clear_graph` | Working |
| `get_status` | Working |

## Tests And Verification

Use this exact clean verification flow:

```bash
rm -rf packages/*/dist packages/*/tsconfig.tsbuildinfo
~/.bun/bin/bun test packages
~/.bun/bin/bunx tsc -b --pretty false
```

Current status:

- `173 pass`
- `21 skip` (integration tests without database connections)
- `0 fail`
- `359 expect() calls`
- `194 tests across 18 files`

Test file inventory:

| Package | File | Tests | Type |
| --- | --- | --- | --- |
| core | `graphiti.test.ts` | 41 | Unit (orchestration) |
| core | `extractor.test.ts` | 10 | Unit |
| core | `hydrator.test.ts` | 26 | Unit |
| core | `resolver.test.ts` | 4 | Unit |
| core | `search.test.ts` | 8 | Unit |
| core | `recipes.test.ts` | 3 | Unit |
| core | `neo4j-driver.test.ts` | 2 | Unit |
| core | `falkordb-driver.test.ts` | 5 | Unit |
| core | `falkordb-search-operations.test.ts` | 3 | Unit |
| core | `openai-client.test.ts` | 9 | Unit |
| core | `openai-embedder.test.ts` | 5 | Unit |
| core | `openai-reranker.test.ts` | 5 | Unit |
| core | `neo4j-driver.integration.test.ts` | 21 | Integration (Neo4j) |
| core | `falkordb-driver.integration.test.ts` | 20 | Integration (FalkorDB) |
| server | `server.test.ts` | 9 | Unit |
| core | `batch-operations.test.ts` | 16 | Unit |
| server | `service.test.ts` | 3 | Unit |
| shared | `validation.test.ts` | 5 | Unit |

Notable integration coverage:

- live Neo4j and FalkorDB ingest with temporal contradiction behavior
- alias-propagation
- same-name disambiguation via relationship context
- attribute-history for model-style fields
- historical attribute non-regression
- configured string-set accumulation
- stateful string timestamp tracking

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

Ingestion is built around pluggable interfaces:

- `EpisodeExtractor`
- `NodeHydrator`

This allows heuristic and model-backed implementations to coexist without rewriting the orchestration layer.

### 5. Server Design

The TS server uses Bun's native `fetch` handler instead of layering another web framework on top.

### 6. MCP Design

The MCP server uses `@modelcontextprotocol/sdk` with Zod schemas for tool parameter validation. All tools delegate to the `Graphiti` core client. Transport is stdio via `StdioServerTransport`.

## Remaining Gaps

### Gap Category 1: Missing Python Client Methods

These Python `Graphiti` methods have no TS equivalent:

| Method | Complexity | Notes |
| --- | --- | --- |
| `add_episode_bulk()` | High | ~200 LOC bulk extraction/dedup pipeline |
| `build_communities()` | High | Community detection + LLM summarization |
| `remove_episode()` | Medium | Python version has cleanup logic (edge invalidation) |
| `_get_or_create_saga()` | Medium | Saga node lifecycle |
| `_extract_and_dedupe_nodes_bulk()` | Medium | Bulk dedup with LLM prompts |
| `_resolve_nodes_and_edges_bulk()` | Medium | Bulk resolution pipeline |

### Gap Category 2: Missing Namespace Operations

Remaining batch operations:

- `deleteByUuids()` — nodes.entity, nodes.episode, edges.entity

Community and saga namespaces:

- `nodes.community` — entire namespace missing
- `nodes.saga` — entire namespace missing
- `edges.community` — entire namespace missing
- `edges.hasEpisode` — entire namespace missing
- `edges.nextEpisode` — entire namespace missing

### Gap Category 3: Provider Coverage

Only OpenAI is implemented. Python supports 7 LLM providers, 4 embedder providers, and 3 reranker providers. The highest-value additions would be:

1. Anthropic LLM client (most requested)
2. Gemini LLM + embedder + reranker
3. Azure OpenAI LLM + embedder (enterprise deployments)

### Gap Category 4: Community Graph Support

The entire community subsystem is absent:

- community node CRUD operations
- community edge CRUD operations
- community detection algorithm
- community summarization via LLM
- community search operations (configs exist, no backend operations)

### Gap Category 5: Advanced Ingestion

- LLM-assisted node deduplication (Python has dedicated prompts)
- LLM-assisted edge deduplication (Python has dedicated prompts)
- content chunking (`graphiti_core/utils/content_chunking.py`)
- temporal metadata extraction
- semantic entity linking beyond name matching

### Gap Category 6: Infrastructure

- no packaging/deployment workflow for the TS server
- no HTTP/streamable transport for MCP server
- no async episode queue processing in MCP (Python processes per-group sequentially in background)
- no token tracking or LLM response caching
- no custom entity/edge type validation

## Python Operation Types Missing From TS Drivers

Both Neo4j and FalkorDB Python drivers implement these additional operation modules that have no TS equivalent:

- `community_node_ops`
- `community_edge_ops`
- `saga_node_ops`
- `has_episode_edge_ops`
- `next_episode_edge_ops`
- `graph_ops` (graph-level utilities)

## Proposed Milestones From Here

### Milestone A: Heuristic Ingestion Foundation

Status: done

### Milestone B: Semantic Ingestion Foundation

Status: done

### Milestone C: Model-Backed Ingestion

Status: done

### Milestone D: Bulk And Maintenance Parity

Status: in progress

Done means:

- bulk ingest (`addEpisodeBulk`)
- LLM-assisted deduplication
- community maintenance or an explicit decision to defer it

### Milestone E: MCP Port

Status: done

The MCP package implements all 9 tools from the Python server, with stdio transport. Tools delegate to the core `Graphiti` client. Dependencies: `@modelcontextprotocol/sdk`, `zod`.

### Milestone F: Provider Parity

Status: pending

Done means:

- at least Anthropic and Gemini LLM clients
- Gemini embedder
- provider factory/registry pattern

### Milestone G: Community Graph Support

Status: pending

Done means:

- community node/edge CRUD
- community detection
- community search backed by real operations

## Known Risks

### 1. False Parity Risk

The TS core is real and usable, but it is still not full Python parity.

Main risk areas:

- bulk ingestion sophistication
- community logic
- broader provider support
- LLM-assisted deduplication

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
find packages -maxdepth 4 -type f -not -path '*/node_modules/*' -not -path '*/dist/*' | sort
```

5. run clean verification:

```bash
rm -rf packages/*/dist packages/*/tsconfig.tsbuildinfo
~/.bun/bin/bun test packages
~/.bun/bin/bunx tsc -b --pretty false
```

6. continue with the next recommended task

## Recommended Next Steps

### Priority 1: Batch Namespace Operations

Status: done

Added `saveBulk()`, `getByUuids()`, and `getByGroupIds()` across entity node, episode node, entity edge, and episodic edge namespaces. `getNodesAndEdgesByEpisode()` refactored to use batch `getByUuids()`. Only `deleteByUuids()` remains.

### Priority 2: Additional LLM/Embedder Providers

Add Anthropic LLM client and Gemini LLM + embedder. These unlock the TS port for non-OpenAI deployments and are straightforward to implement against the existing `LLMClient` / `EmbedderClient` interfaces.

### Priority 3: Bulk Ingestion

Port `addEpisodeBulk()` with the associated extraction and dedup helpers. This is the largest remaining core feature gap.

### Priority 4: Community Graph

Port community node/edge operations, detection algorithm, and search. This is a substantial subsystem.

## Files Most Worth Reading Next

### Core

- `packages/core/src/graphiti.ts`
- `packages/core/src/ingest/extractor.ts`
- `packages/core/src/ingest/resolver.ts`
- `packages/core/src/ingest/hydrator.ts`
- `packages/core/src/search/search.ts`
- `packages/core/src/search/filters.ts`
- `packages/core/src/driver/neo4j-driver.ts`
- `packages/core/src/driver/falkordb-driver.ts`
- `packages/core/src/providers/llm/openai-client.ts`

### Server

- `packages/server/src/app.ts`
- `packages/server/src/service.ts`
- `packages/server/src/server.test.ts`

### MCP

- `packages/mcp/src/server.ts`
- `packages/mcp/src/config.ts`

### Planning

- `spec/bun-typescript-port-plan.md`
- `spec/typescript-port-prd.md`
