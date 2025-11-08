# Architecture Overview

## Data Flow

The application uses the **Nomi API as the single source of truth** for all Nomi and room data.

### Room Management

- **List Rooms**: Fetched directly from `GET /v1/rooms`
- **Create Room**: Created via `POST /v1/rooms`
- **Room Members**: Stored in Nomi API, fetched with room data
- **Add Nomi to Room**: Updated via `PUT /v1/rooms/{roomId}` with updated `nomiUuids` array
- **Remove Nomi from Room**: ⚠️ Workaround implemented
  - The Nomi API doesn't support direct removal (all methods return 404)
  - **Solution**: Delete the room (`DELETE /v1/rooms/{roomId}`) and recreate it (`POST /v1/rooms`) with the remaining Nomis
  - Note: This generates a new room ID; chat history is preserved in the database

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
- For each Nomi in the room:
  - Fetches recent messages via `GET /v1/nomis/{nomiUuid}/chat`
  - Checks if latest message is a question (ends with `?`)
  - If question → get AI answer → send reply via `POST /v1/nomis/{nomiUuid}/chat`
  - If not a question → send "Ask me a question" prompt
- All messages stored in database for history and deduplication

## Database Schema

### `nomi_messages`
```sql
- id (UUID, PK)
- user_id (UUID) - User who owns this message
- nomi_uuid (TEXT) - Nomi identifier
- nomi_name (TEXT) - Nomi display name
- question (TEXT, nullable) - Original question (stripped of inner monologue)
- answer (TEXT, nullable) - AI-generated answer
- message_text (TEXT, nullable) - Full message text (includes inner monologue)
- message_type (TEXT) - 'chatgpt' | 'regular' | 'ai_response'
- created_at (TIMESTAMP)
- processed_at (TIMESTAMP)
```

**Indexes:**
- `idx_nomi_messages_processed_at` on `processed_at DESC`
- `idx_nomi_messages_nomi_uuid` on `nomi_uuid`
- `idx_nomi_messages_user_id` on `user_id`

**RLS Policies:**
- User-specific read access (users can only read their own messages)
- User-specific insert access (users can only insert their own messages)
- User-specific delete access (users can only delete their own messages)

## API Authentication

- **Nomi API**: User-specific API key stored in `user_api_keys` table
- **Lovable AI**: System-wide `LOVABLE_API_KEY` environment variable

### `user_api_keys`
```sql
- id (UUID, PK)
- user_id (UUID, FK to auth.users)
- nomi_api_key (TEXT) - User's Nomi API key
- openai_api_key (TEXT, nullable) - User's OpenAI API key
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

**RLS Policies:**
- User-specific access (users can only access their own API keys)
