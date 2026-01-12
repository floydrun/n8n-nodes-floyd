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
4. **Create a hold:** Use Floyd Create Hold to reserve the slot
5. **Confirm or cancel:** Use Floyd Confirm Booking (finalize) or Floyd Cancel Booking (release)

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

---

### Floyd Confirm Booking

Finalize a pending hold to convert it to a confirmed booking. Clears the expiration timer.

#### Inputs

| Field       | Type   | Required | Description                           |
| ----------- | ------ | -------- | ------------------------------------- |
| `bookingId` | string | Yes      | The booking ID from Floyd Create Hold |

#### Outputs

**Success:**

```json
{
  "bookingId": "bk_abc123",
  "status": "confirmed",
  "resourceId": "res_xyz",
  "startAt": "2026-01-13T10:00:00Z",
  "endAt": "2026-01-13T11:00:00Z",
  "confirmedAt": "2026-01-12T16:00:00Z",
  "requestId": "req_xyz789"
}
```

**Errors:**

- **404**: Booking not found
- **409**: Hold expired or already confirmed

---

### Floyd Cancel Booking

Cancel a pending hold or confirmed booking. Releases the time slot and makes it available.

#### Inputs

| Field       | Type   | Required | Description              |
| ----------- | ------ | -------- | ------------------------ |
| `bookingId` | string | Yes      | The booking ID to cancel |

#### Outputs

**Success:**

```json
{
  "bookingId": "bk_abc123",
  "status": "cancelled",
  "resourceId": "res_xyz",
  "startAt": "2026-01-13T10:00:00Z",
  "endAt": "2026-01-13T11:00:00Z",
  "cancelledAt": "2026-01-12T16:00:00Z",
  "requestId": "req_xyz789"
}
```

**Errors:**

- **404**: Booking not found
- **409**: Already cancelled or cannot cancel

## Usage Examples

### Voice Agent Booking Flow

Complete workflow with user confirmation:

```
┌────────────────────────┐
│ Webhook (Vapi/Retell)  │
└────────────┬───────────┘
             │  User: "Book me at 2pm"
             ▼
┌────────────────────────┐
│ Floyd Create Hold      │
└────────────┬───────────┘
             │  Reserve slot (TTL: 5 min)
             ▼
┌────────────────────────┐
│ IF: conflict?          │
└────────────┬──────┬────┘
             │      │
             No     Yes
             │      │                ┌────────────────────────┐
             │      └──────────────▶ │ Respond: "Try 3pm?"    │
             │                       └────────────────────────┘
             ▼
┌────────────────────────┐
│ Ask user to confirm    │
└────────────┬──────┬────┘
             │      │
             Yes    No
             │      │                ┌────────────────────────┐
             │      └──────────────▶ │ Floyd Cancel Booking   │
             │                       └────────────┬───────────┘
             │                                    │
             │                                    ▼
             │                       ┌────────────────────────┐
             │                       │ Respond: "Cancelled"   │
             │                       └────────────────────────┘
             ▼
┌────────────────────────┐
│ Floyd Confirm Booking  │
└────────────┬───────────┘
             │
             ▼
┌────────────────────────┐
│ Respond: "Confirmed!"  │
└────────────────────────┘
```

### Simple Confirmation Flow

1. **Floyd Create Hold** → Get `bookingId`
2. User confirms → **Floyd Confirm Booking** with `bookingId`
3. User cancels → **Floyd Cancel Booking** with `bookingId`

### Hold Expiration (No Action)

If you don't confirm or cancel within `ttlSeconds`, the hold expires automatically:

```
Floyd Create Hold (ttlSeconds: 300)
    │
    └─ 5 minutes pass...
    └─ Hold expires (no action needed)
```

## Why holds instead of check-then-book?

### The Problem with Check-Then-Book

The typical pattern:

1. Check availability
2. Ask user to confirm
3. Book the slot

**The problem:** Between step 1 and step 3, another request can book the same slot. You get double-bookings.

### The Floyd Solution

**Three-phase lifecycle:**

1. **Create Hold** (atomic, blocks the slot) → `status: "pending"`
2. **Ask user to confirm** (slot is protected for `ttlSeconds`)
3. **Confirm** (finalize) → `status: "confirmed"` OR **Cancel** (release) → `status: "cancelled"`

**Benefits:**

- ✅ Only one workflow can hold a slot
- ✅ Conflicts are explicit (409 responses)
- ✅ Automatic cleanup (holds expire after TTL)
- ✅ Retry-safe (idempotency keys)
- ✅ Works with voice agents, forms, multi-step workflows

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

| Error                            | Node            | Cause                                 | Fix                               |
| -------------------------------- | --------------- | ------------------------------------- | --------------------------------- |
| 409 Conflict (overlap)           | Create Hold     | Slot already held/booked              | Branch and offer alternative      |
| 409 Conflict (hold expired)      | Confirm Booking | Hold TTL expired                      | Create new hold                   |
| 409 Conflict (already confirmed) | Confirm Booking | Booking already finalized             | Check booking status              |
| 409 Conflict (already cancelled) | Cancel Booking  | Booking already cancelled             | No action needed                  |
| 404 Not Found                    | Confirm/Cancel  | Invalid booking ID                    | Verify bookingId from Create Hold |
| 422 Validation                   | Create Hold     | Bad date format or `endAt <= startAt` | Check ISO 8601 format             |
| 401 Unauthorized                 | All             | API key missing or wrong              | Check credentials                 |

**Need help?** Include the `requestId` from the output when contacting support.

## License

MIT
