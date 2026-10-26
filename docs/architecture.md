# QuickNotes service architecture

## Functional requirements

- Users can register, authenticate, and access only their own notes.
- Users can create, list, retrieve, update, and delete notes.
- Users can tag notes and find notes by tag.
- The API validates input and returns consistent JSON responses and errors.
- Note creation and other slow side effects can be processed asynchronously
  without delaying the API response.

## Non-functional requirements

- Support 1 million registered users with horizontal application scaling.
- Target 99.9% monthly availability for the notes API.
- Serve reads within 300 ms at the 95th percentile and writes within 500 ms
  at the 95th percentile under the design load.
- Protect user data with TLS, authenticated access, authorization checks, and
  encryption at rest.
- Preserve committed writes and recover from an individual app server, cache,
  queue worker, or database replica failure.
- Monitor latency, error rates, saturation, queue depth, and database
  replication lag; scale stateless app servers and workers as needed.

## Capacity estimate for 1 million users

These are initial planning assumptions, not measured production traffic:

- Each registered user averages 10 note reads and 1 note write per day.
- Average request rate is total daily requests divided by 86,400 seconds;
  peak traffic is estimated at 10 times the average.
- Each stored note, including its row and indexes, averages 2 KiB. Users
  create one note per day. This estimate excludes backups, replicas, and
  operational headroom.

| Measure          |                  Average estimate | Peak planning estimate |
| ---------------- | --------------------------------: | ---------------------: |
| Reads            | 10,000,000/day = 116 reads/second |     1,160 reads/second |
| Writes           |  1,000,000/day = 12 writes/second |      120 writes/second |
| New note storage |               1,000,000 notes/day |      2,000,000 KiB/day |

At 2 KiB per note, one year of new notes is approximately
`365,000,000 × 2 KiB = 730,000,000 KiB`, or about **748 GB decimal (697 GiB)**
before backups, replicas, and growth reserve. Provisioning should include
headroom and be revisited with real payload sizes and usage telemetry.

## Architecture diagram

```text
                         +----------------------+
                         | Managed DNS + health |
                         | checks / failover    |
                         +----------+-----------+
                                    |
+--------+     +-------------------v--+       +----------------------+
| Client |---->| CDN / WAF / TLS edge |------>| Load balancer        |
+--------+     +----------------------+       +----------+-----------+
                                                         |
                                    +--------------------+------------------+
                                    |                                       |
                         +----------v---------+                 +-----------v--------+
                         | App server A       |                 | App server B       |
                         | stateless API      |                 | stateless API      |
                         +---+------------+---+                 +---+------------+---+
                             |            |                         |            |
                       +-----v----+  +----v--------------------------v----+  +--v-----------+
                       | Cache    |  | Primary database                   |  | Queue        |
                       | cluster  |  | (writes, transactions)             |  | (durable)    |
                       +----+-----+  +----------------+-------------------+  +------+-------+
                            |                         |                           |
                            |               replication                          |
                            |                         v                           v
                            |              +----------------------+       +-------------+
                            +------------->| Read replica         |       | Worker pool |
                                           | (eligible reads)     |       | >= 2 workers|
                                           +----------------------+       +------+------+
                                                                                   |
                                                                                   +--> Primary DB
                                                                                        (when needed)
```

## Component responsibilities

- **Client:** Provides the user interface and sends authenticated API requests
  without being trusted to enforce authorization or data ownership.
- **Managed DNS:** Resolves the service name and routes users away from
  unhealthy regions or endpoints.
- **CDN / WAF / TLS edge:** Caches static assets near users, terminates TLS,
  and filters common malicious or abusive traffic before it reaches the API.
- **Load balancer:** Distributes API requests across healthy application
  instances and removes unhealthy instances from rotation.
- **App servers A and B:** Run identical stateless API instances so capacity
  can scale horizontally and one instance can fail without taking the API
  offline.
- **Cache cluster:** Reduces repeated database reads and latency for hot
  results, while using expiry and invalidation so stale values are bounded.
- **Primary database:** Provides the authoritative transactional store for
  users, notes, tags, and their relationships.
- **Read replica:** Serves eligible read traffic and reduces load on the
  primary, with replication lag monitored to avoid stale reads where
  read-after-write consistency is required.
- **Durable queue:** Buffers retryable background work so temporary worker or
  downstream slowness does not block API request processing.
- **Worker pool:** Processes queued work such as notifications and cleanup
  asynchronously, with retries and idempotency to handle transient failures
  and duplicate delivery.

## Request flows

### `GET /notes`

1. The client resolves the API hostname through managed DNS and sends an
   HTTPS request with its bearer token.
2. The CDN/WAF edge terminates TLS, applies edge protections, and forwards
   the dynamic API request to the load balancer.
3. The load balancer selects a healthy app server; the server validates the
   token, derives the user identity, and validates pagination parameters.
4. The app server checks the cache using a key scoped to the authenticated
   user and requested page.
5. On a cache hit, it returns the cached notes. On a miss, it queries the
   read replica for that user's notes, ordered by update time, and populates
   the cache with a bounded expiry.
6. If the replica is unavailable or the request requires read-after-write
   consistency, the app server reads from the primary database instead.
7. The app server returns the JSON page and cursor to the client; the response
   travels through the edge and load balancer.

### `POST /notes`

1. The client sends an HTTPS request with a bearer token and JSON note body;
   DNS, the CDN/WAF edge, and load balancer route it to a healthy app server.
2. The app server validates the token and request body, derives the owner from
   the token, and rejects invalid titles or oversized payloads.
3. The app server inserts the note into the primary database in a
   transaction and returns the committed note with `201 Created`.
4. After commit, the server invalidates or updates the relevant user-scoped
   cache entries so subsequent lists do not return stale data.
5. The server publishes any non-critical follow-up work to the durable queue;
   workers process it asynchronously and retry transient failures.

## Trade-offs and resilience

- **Read replicas improve read capacity but can lag behind the primary.**
  Use the primary for read-after-write requests, monitor replication lag, and
  keep cache expiry bounded so eventual consistency is explicit and limited.
- **Caching reduces database load and latency but introduces invalidation
  complexity.** Scope cache keys by user, use short TTLs, invalidate after
  writes, and fall back to the database when the cache is unavailable.
- **Asynchronous queue processing isolates slow work but is not immediate and
  can deliver messages more than once.** Make handlers idempotent, retry with
  backoff, monitor queue age/depth, and send repeatedly failing messages to a
  dead-letter queue.
- **A primary database simplifies transactional writes but concentrates write
  load.** Size it for peak writes, use connection pooling and backups, and
  define tested failover to a promoted replica; add partitioning or sharding
  only when observed limits justify the operational cost.

No single app server, cache node, worker, or database replica is a service
single point of failure: app servers and workers run as multiple instances
across failure domains; the cache and queue use replicated, managed clusters;
the database has backups and monitored replica promotion; and DNS, load
balancing, and health checks route around unhealthy instances. Database
failover may still cause a brief write interruption, so recovery objectives
and promotion procedures must be tested rather than assumed.
