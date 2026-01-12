# n8n-nodes-floyd

n8n community node for [Floyd](https://floyd.run) — atomic booking holds for AI agent workflows.

**Problem:** Voice agents and booking workflows can double-book when two requests race for the same slot. Calendar APIs don't prevent this.

**Solution:** Create a short-lived hold that blocks the slot while your agent confirms with the user. Only one workflow can win; everyone else gets an explicit conflict.

## Installation

```bash
npm install n8n-nodes-floyd
```

Or in n8n: **Settings → Community Nodes → Install → `n8n-nodes-floyd`**

## Quickstart

1. **Get your API key:** [console.floyd.run](https://console.floyd.run) → Organization → API Keys
2. **Get a resource ID:** Console → Resources → Create → Copy ID
3. **Time format:** ISO 8601 with timezone (e.g., `2026-01-12T14:00:00Z`)
4. **On success:** Call Floyd Confirm endpoint to finalize
5. **On conflict:** Branch and offer alternative time

## Nodes

### Floyd Create Hold

Reserve a time slot with a TTL. The hold expires automatically if not confirmed.

#### Inputs

| Field            | Type     | Required | Description                               |
| ---------------- | -------- | -------- | ----------------------------------------- |
| `resourceId`     | string   | Yes      | The resource to book                      |
| `startAt`        | datetime | Yes      | Slot start time (ISO 8601)                |
| `endAt`          | datetime | Yes      | Slot end time (ISO 8601)                  |
| `ttlSeconds`     | number   | No       | Hold expiration in seconds (default: 300) |
| `idempotencyKey` | string   | No       | For retry-safe workflows                  |
| `metadata`       | JSON     | No       | Arbitrary payload (customer info, etc.)   |

#### Options

| Option                       | Default | Description                                                                       |
| ---------------------------- | ------- | --------------------------------------------------------------------------------- |
| `Return conflicts as output` | ON      | If ON, 409 conflicts flow as output (branchable). If OFF, node fails on conflict. |

#### Outputs

**Success:**

```json
{
  "bookingId": "bk_abc123",
  "status": "pending",
  "expiresAt": "2026-01-11T10:05:00Z",
  "requestId": "req_xyz789"
}
```

**Conflict (when another hold/booking exists):**

```json
{
  "outcome": "conflict_overlap",
  "message": "Booking overlaps with existing pending or confirmed booking",
  "requestId": "req_xyz789"
}
```

## Usage Example

**Voice agent booking flow:**

1. Agent asks user for preferred time
2. **Floyd Create Hold** → reserves the slot (5 min TTL)
3. If conflict → offer alternative time
4. If success → confirm with user
5. On confirmation → call Floyd Confirm endpoint
6. On rejection → hold expires automatically

```
┌─────────────────┐   ┌───────────────────┐   ┌─────────────────┐
│ Webhook (Vapi)  │──▶│ Floyd Create Hold │──▶│ IF: conflict?   │
└─────────────────┘   └───────────────────┘   └───────┬─────────┘
                                                      │
                                   ┌──────────────────┴──────────────────┐
                                   │                                     │
                                   ▼                                     ▼
                        ┌─────────────────────┐               ┌─────────────────────┐
                        │ Respond: "Booked!"  │               │ Respond: "Try 3pm?" │
                        └─────────────────────┘               └─────────────────────┘
```

## Why holds instead of check-then-book?

The typical pattern:

1. Check availability
2. Ask user to confirm
3. Book the slot

**The problem:** Between step 1 and step 3, another request can book the same slot. You get double-bookings.

**With Floyd:**

1. Create hold (atomic, blocks the slot)
2. Ask user to confirm (slot is protected)
3. Confirm or let hold expire

Only one workflow can hold a slot. Conflicts are explicit.

## Credentials

1. Sign up at [console.floyd.run](https://console.floyd.run)
2. Create an organization and API key
3. In n8n: **Credentials → New → Floyd API**
4. Paste your API key

## Links

- [Floyd Documentation](https://docs.floyd.run)
- [Voice Agent Booking Guide](https://docs.floyd.run/guides/voice-agent-receptionist)
- [GitHub Issues](https://github.com/floydrun/n8n-nodes-floyd/issues)

## Troubleshooting

| Error            | Cause                                 | Fix                          |
| ---------------- | ------------------------------------- | ---------------------------- |
| 409 Conflict     | Slot already held/booked              | Branch and offer alternative |
| 422 Validation   | Bad date format or `endAt <= startAt` | Check ISO format             |
| 401 Unauthorized | API key missing or wrong              | Check credentials            |

**Need help?** Include the `requestId` from the output when contacting support.

## License

MIT
