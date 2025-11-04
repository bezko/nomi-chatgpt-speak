# Architecture Overview

## Data Flow

The application uses the **Nomi API as the single source of truth** for all Nomi and room data.

### Room Management

- **List Rooms**: Fetched directly from `GET /v1/rooms`
- **Create Room**: Created via `POST /v1/rooms`
- **Room Members**: Stored in Nomi API, fetched with room data
- **Add Nomi to Room**: Updated via `PUT /v1/rooms/{roomId}` with updated `nomiUuids` array
- **Remove Nomi from Room**: ⚠️ **NOT SUPPORTED** - The Nomi API returns 404 EndpointNotFound for all removal methods (DELETE, PATCH, PUT)

### Message Storage

The `nomi_messages` table in Supabase is used to:
- **Store message history** for display in UI
- **Prevent duplicate processing** via deduplication checks
- **Enable real-time updates** via Supabase subscriptions

This is a **cache/audit log**, not the source of truth for room membership.

### What's NOT Used

- ~~`selected_nomis` table~~ - **REMOVED** (unused, redundant)
  - The Nomi API already tracks which Nomis are in which rooms
  - No application code referenced this table

## Question Detection

Messages ending with `?` are automatically:
1. Detected by the polling system
2. Sent to Lovable AI (Gemini 2.5 Flash) for answer
3. Response sent back to the Nomi in the room
4. Stored in `nomi_messages` table

## Polling Strategy

**Frontend Polling** (`Index.tsx`):
- Polls every 60 seconds (configurable via `POLL_INTERVAL`)
- For each Nomi in room:
  - Requests chat via `POST /v1/rooms/{roomId}/chat/request`
  - If response is a question → get AI answer → send reply
  - If not a question → send "Ask me a question" prompt

**Backend Function** (`poll-nomi-messages`):
- Can be called independently to process all Nomis
- Checks database for deduplication before processing
- Stores all processed messages

## Database Schema

### `nomi_messages`
```sql
- id (UUID, PK)
- nomi_uuid (TEXT) - Nomi identifier
- nomi_name (TEXT) - Nomi display name
- question (TEXT, nullable) - Original question
- answer (TEXT, nullable) - AI-generated answer
- message_text (TEXT, nullable) - Full message text
- message_type (TEXT) - 'chatgpt' | 'regular' | 'ai_response'
- created_at (TIMESTAMP)
- processed_at (TIMESTAMP)
```

**Indexes:**
- `idx_nomi_messages_processed_at` on `processed_at DESC`
- `idx_nomi_messages_nomi_uuid` on `nomi_uuid`

**RLS Policies:**
- Public read access (FOR SELECT)
- Public insert access (FOR INSERT)

## API Authentication

- **Nomi API**: `Authorization: {NOMI_API_KEY}` header
- **Lovable AI**: `Authorization: Bearer {LOVABLE_API_KEY}` header
