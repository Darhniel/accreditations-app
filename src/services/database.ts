import * as SQLite from 'expo-sqlite';
import { GuestSummary } from '@/types';

const DB_NAME = 'guest_accreditation.db';
let dbInstance: SQLite.SQLiteDatabase | null = null;

// ==========================================
// DATABASE INITIALIZATION
// ==========================================

export const initDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
    if (dbInstance) return dbInstance;

    dbInstance = await SQLite.openDatabaseAsync(DB_NAME);

    // Drop the old table to apply the new composite Primary Key schema
    await dbInstance.execAsync(`DROP TABLE IF EXISTS local_guests;`);

    await dbInstance.execAsync(`
    PRAGMA journal_mode = WAL;
    
    CREATE TABLE IF NOT EXISTS local_guests (
      event_id INTEGER NOT NULL,
      id INTEGER NOT NULL,
      adult_names TEXT NOT NULL,
      ticket_number TEXT NOT NULL,
      category_name TEXT,
      category_color TEXT,
      kids_count INTEGER DEFAULT 0,
      is_checked_in INTEGER DEFAULT 0,
      last_synced INTEGER,
      PRIMARY KEY (event_id, id)
    );
    
    CREATE TABLE IF NOT EXISTS pending_checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_identifier TEXT NOT NULL,
      event_id INTEGER NOT NULL,
      location_id INTEGER,
      timestamp INTEGER NOT NULL,
      sync_status TEXT DEFAULT 'pending',
      server_message TEXT
    );
    
    CREATE INDEX IF NOT EXISTS idx_guests_event ON local_guests(event_id);
    CREATE INDEX IF NOT EXISTS idx_guests_ticket ON local_guests(ticket_number);
    CREATE INDEX IF NOT EXISTS idx_guests_names ON local_guests(adult_names);
    CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_checkins(sync_status);
  `);

    return dbInstance;
};

const getDb = async () => {
    if (!dbInstance) return initDatabase();
    return dbInstance;
};

// ==========================================
// GUEST CACHE OPERATIONS
// ==========================================

// ==========================================
// GUEST CACHE OPERATIONS
// ==========================================

// ✅ Changed parameter type to 'any' to prevent TypeScript errors from the api() helper
export const cacheGuestList = async (eventId: number, guestsResponse: any): Promise<void> => {
    const db = await getDb();
    const now = Date.now();

    // 1. Safely extract the array (handles direct arrays, paginated { results: [] }, or invalid data)
    const guestArray = Array.isArray(guestsResponse)
        ? guestsResponse
        : (guestsResponse?.results || guestsResponse?.data || []);

    if (!Array.isArray(guestArray)) {
        console.warn('⚠️ cacheGuestList: Invalid guests data received', guestsResponse);
        return;
    }

    // 2. Use a transaction for massive performance gains and atomicity
    await db.withTransactionAsync(async () => {
        // Clear old guests for this event FIRST
        await db.runAsync('DELETE FROM local_guests WHERE event_id = ?', [eventId]);

        // If the new list is empty, we're done (the table is now empty for this event)
        if (guestArray.length === 0) return;

        // Insert new guests
        for (const guest of guestArray) {
            await db.runAsync(
                // ✅ Changed to INSERT OR REPLACE to prevent UNIQUE constraint crashes
                `INSERT OR REPLACE INTO local_guests 
           (id, event_id, adult_names, ticket_number, category_name, category_color, kids_count, is_checked_in, last_synced)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    guest.id,
                    eventId,
                    guest.adult_names || 'Unknown Guest', // ✅ Safe fallback
                    guest.ticket_number || 'UNKNOWN',     // ✅ Safe fallback
                    guest.category_name || null,
                    guest.category_color || null,
                    guest.kids_count ?? 0,                // ✅ Nullish coalescing for 0 values
                    guest.is_checked_in_today ? 1 : 0,
                    now,
                ]
            );
        }
    });
};

export const searchLocalGuests = async (eventId: number, query: string): Promise<any[]> => {
    const db = await getDb();
    const results = await db.getAllAsync(
        `SELECT * FROM local_guests 
     WHERE event_id = ? AND adult_names LIKE ?
     ORDER BY adult_names ASC
     LIMIT 10`,
        eventId, `%${query}%`
    );
    return results;
};

export const findLocalGuestByTicket = async (ticketNumber: string): Promise<any | null> => {
    const db = await getDb();
    const results = await db.getAllAsync(
        'SELECT * FROM local_guests WHERE ticket_number = ? LIMIT 1',
        ticketNumber
    );
    return results.length > 0 ? results[0] : null;
};

export const markLocalGuestCheckedIn = async (guestId: number): Promise<void> => {
    const db = await getDb();
    await db.runAsync(
        'UPDATE local_guests SET is_checked_in = 1 WHERE id = ?',
        guestId
    );
};

export const getEventLastSynced = async (eventId: number): Promise<number | null> => {
    const db = await getDb();
    const result = await db.getFirstAsync(
        'SELECT MAX(last_synced) as last_synced FROM local_guests WHERE event_id = ?',
        eventId
    ) as any;
    return result?.last_synced || null;
};

// ==========================================
// PENDING CHECK-IN QUEUE OPERATIONS
// ==========================================

export const queueCheckIn = async (
    guestIdentifier: string,
    eventId: number,
    locationId: number | null
): Promise<void> => {
    const db = await getDb();
    await db.runAsync(
        `INSERT INTO pending_checkins (guest_identifier, event_id, location_id, timestamp, sync_status)
     VALUES (?, ?, ?, ?, 'pending')`,
        guestIdentifier,
        eventId,
        locationId,
        Date.now()
    );
};

export const getPendingCheckIns = async (): Promise<any[]> => {
    const db = await getDb();
    return db.getAllAsync(
        "SELECT * FROM pending_checkins WHERE sync_status = 'pending' ORDER BY timestamp ASC"
    );
};

export const getPendingCount = async (eventId?: number): Promise<number> => {
    const db = await getDb();
    const result = eventId
        ? await db.getFirstAsync(
            "SELECT COUNT(*) as count FROM pending_checkins WHERE sync_status = 'pending' AND event_id = ?",
            eventId
        )
        : await db.getFirstAsync(
            "SELECT COUNT(*) as count FROM pending_checkins WHERE sync_status = 'pending'"
        );
    return (result as any)?.count || 0;
};

export const markCheckInSynced = async (id: number): Promise<void> => {
    const db = await getDb();
    await db.runAsync(
        "UPDATE pending_checkins SET sync_status = 'synced' WHERE id = ?",
        id
    );
};

export const markCheckInConflict = async (id: number, serverMessage: string): Promise<void> => {
    const db = await getDb();
    await db.runAsync(
        "UPDATE pending_checkins SET sync_status = 'conflict', server_message = ? WHERE id = ?",
        serverMessage,
        id
    );
};

export const getRecentConflicts = async (): Promise<any[]> => {
    const db = await getDb();
    return db.getAllAsync(
        "SELECT * FROM pending_checkins WHERE sync_status = 'conflict' ORDER BY timestamp DESC LIMIT 10"
    );
};

export const clearConflicts = async (): Promise<void> => {
    const db = await getDb();
    await db.runAsync("DELETE FROM pending_checkins WHERE sync_status = 'conflict'");
};