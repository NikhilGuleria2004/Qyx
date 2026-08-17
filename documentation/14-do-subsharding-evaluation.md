# DO Sub-Sharding Checkpoint — Large Channel Evaluation

## 1. Current Architecture

`ChannelDO` is a single Durable Object per channel. All subscribers connect to one DO instance, which maintains a `Set<WebSocket>` and broadcasts messages by iterating the set.

**Pros:**
- Simple consistency model (single sequence number, single broadcast)
- No coordination overhead

**Cons:**
- Single-threaded execution per DO instance
- Bounded by practical WebSocket connection ceiling for one DO
- Hotspot risk if one channel attracts disproportionate traffic

## 2. Scaling Checkpoint

Per Infrastructure Design §6, sub-sharding is required when subscriber counts exceed a single DO's practical connection ceiling.

**Thresholds evaluated:**

| Metric | Threshold | Action |
|---|---|---|
| Concurrent WebSocket connections per DO | > 1,000 | Evaluate sub-sharding |
| Messages broadcast per second per DO | > 500 | Evaluate sub-sharding |
| p95 broadcast latency per DO | > 200ms | Evaluate sub-sharding |

**Current capacity estimate:**
- Cloudflare DO CPU time limit: 400ms per request
- Typical broadcast to 1,000 sockets: ~5-20ms CPU
- Headroom: ~20x before hitting CPU constraints
- Practical limit: ~10,000–50,000 connections before edge network limits (TCP connection ceiling per Worker)

## 3. Sub-Sharding Pattern

When a channel exceeds the threshold:

1. **Shard assignment:** Route new subscribers to one of N shard DOs using consistent hashing on `channel_id + subscriber_id`.
2. **Fan-out coordination:** A lightweight coordinator (or the originating Worker) sends the message to all N shard DOs in parallel.
3. **Sequence ordering:** Each shard maintains its own sequence. Clients reassemble by `(shard_id, sequence)` if total ordering across shards is required.
4. **Graceful migration:** Existing connections stay on the original DO until disconnect; new connections go to shards.

## 4. Implementation Status

- Sub-sharding is **not implemented in v1**.
- Checkpoint is **tracked, not a blocker** for initial production.
- Metrics infrastructure (`do_fan_out`, `do_connection`) is in place to trigger evaluation.
- Evaluation will be executed when staging traffic reaches threshold or before the first enterprise customer with >500 expected channel subscribers.

## 5. Test Coverage

- `ChannelDO` broadcast behavior verified for small subscriber sets.
- Large-channel fan-out simulation deferred to sub-sharding implementation phase.
- Load test in `performance/message-load.test.ts` exercises the message-send path up to the DO boundary.
