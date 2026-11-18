import * as SQLite from 'expo-sqlite';
import { GuestSummary } from '@/types';
import { getCurrentUserId } from './current-user';

const DB_NAME = 'guest_accreditation.db';
let dbInstance: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// ==========================================
// DATABASE INITIALIZATION
// ==========================================

export const initDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
    if (dbInstance) return dbInstance;

    // Share ONE pending initialization across all concurrent callers.
    // Opening the same DB twice at once (which the event screen does when
    // its init effect and first focus collide) crashes the Android native
    // module with a NullPointerException inside prepareAsync.
    if (!initPromise) {
        initPromise = openAndMigrate().catch((error) => {
            initPromise = null; // allow a fresh attempt on the next call
            throw error;
        });
    }
    return initPromise;
};

const openAndMigrate = async (): Promise<SQLite.SQLiteDatabase> => {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    dbInstance = db;

    // Versioned migrations, tracked with the database's user_version pragma so
    // each step runs exactly once per device instead of on every launch.
    //
    // v2: rebuild the guest cache after the API's adult_names -> names rename
    //     and the composite-PK change (the cache is disposable).
    // v3: add `user_id` to the offline queue so queued scans belong to the
    //     ambassador who made them and are only replayed under that account.
    const schema = await db.getFirstAsync<{ user_version: number }>(
        'PRAGMA user_version;'
    );
    const version = schema?.user_version ?? 0;

    if (version > 0 && version < 2) {
        await db.execAsync(`DROP TABLE IF EXISTS local_guests;`);
    }

    if (version > 0 && version < 3) {
        // `ADD COLUMN` has no IF NOT EXISTS in SQLite, so guard against a
        // partially-applied migration.
        const columns = await db.getAllAsync<{ name: string }>(
            'PRAGMA table_info(pending_checkins);'
        );
        if (!columns.some((column) => column.name === 'user_id')) {
            await db.execAsync(
                `ALTER TABLE pending_checkins ADD COLUMN user_id INTEGER;`
            );
        }
    }

    await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA user_version = 3;

    CREATE TABLE IF NOT EXISTS local_guests (
      event_id INTEGER NOT NULL,
      id INTEGER NOT NULL,
      names TEXT NOT NULL,
      ticket_number TEXT NOT NULL,
      category_name TEXT,
      category_color TEXT,
      is_checked_in INTEGER DEFAULT 0,
      last_synced INTEGER,
      PRIMARY KEY (event_id, id)
    );
    
    CREATE TABLE IF NOT EXISTS pending_checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_identifier TEXT NOT NULL,
      event_id INTEGER NOT NULL,
      location_id INTEGER,
      user_id INTEGER,
      timestamp INTEGER NOT NULL,
      sync_status TEXT DEFAULT 'pending',
      server_message TEXT
    );
    
    CREATE INDEX IF NOT EXISTS idx_guests_event ON local_guests(event_id);
    CREATE INDEX IF NOT EXISTS idx_guests_ticket ON local_guests(ticket_number);
    CREATE INDEX IF NOT EXISTS idx_guests_names ON local_guests(names);
    CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_checkins(sync_status);
    CREATE INDEX IF NOT EXISTS idx_pending_user ON pending_checkins(user_id, sync_status);
  `);

    return dbInstance;
};

// Every operation goes through the shared, promise-memoized initializer —
// at most one openDatabaseAsync exists per app session.
const getDb = (): Promise<SQLite.SQLiteDatabase> => initDatabase();

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
           (id, event_id, names, ticket_number, category_name, category_color, is_checked_in, last_synced)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    guest.id,
                    eventId,
                    // `adult_names` is the pre-rename field; accept it from an
                    // older API for one release so the cache never blanks out.
                    guest.names || guest.adult_names || 'Unknown Guest',
                    guest.ticket_number || 'UNKNOWN',     // ✅ Safe fallback
                    guest.category_name || null,
                    guest.category_color || null,
                    guest.is_checked_in_today ? 1 : 0,
                    now,
                ]
            );
        }
    });
};

export const searchLocalGuests = async (eventId: number, query: string): Promise<GuestSummary[]> => {
    const db = await getDb();
    const results = await db.getAllAsync(
        `SELECT * FROM local_guests 
     WHERE event_id = ? AND names LIKE ?
     ORDER BY names ASC
     LIMIT 10`,
        eventId, `%${query}%`
    );

    // Cached rows store check-in status as `is_checked_in` (0/1), while the
    // UI reads `is_checked_in_today` from server results — normalize here so
    // offline guests show the checked-in badge and can't be re-queued.
    return results.map((row: any) => ({
        ...row,
        is_checked_in_today: Boolean(row.is_checked_in),
    }));
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
    const userId = await getCurrentUserId();

    await db.runAsync(
        `INSERT INTO pending_checkins (guest_identifier, event_id, location_id, user_id, timestamp, sync_status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
        guestIdentifier,
        eventId,
        locationId,
        userId,
        Date.now()
    );
};

// Rows queued before v3 have no owner. Attach them to the first account that
// uses the queue after the upgrade so those scans are not silently dropped.
// This runs at most once per legacy row.
const claimLegacyQueueForUser = async (userId: number): Promise<void> => {
    const db = await getDb();
    await db.runAsync(
        'UPDATE pending_checkins SET user_id = ? WHERE user_id IS NULL',
        userId
    );
};

const getScopedUserId = async (): Promise<number | null> => {
    const userId = await getCurrentUserId();
    if (userId !== null) {
        await claimLegacyQueueForUser(userId);
    }
    return userId;
};

export const getPendingCheckIns = async (): Promise<any[]> => {
    const userId = await getScopedUserId();
    if (userId === null) return [];

    const db = await getDb();
    return db.getAllAsync(
        "SELECT * FROM pending_checkins WHERE sync_status = 'pending' AND user_id = ? ORDER BY timestamp ASC",
        userId
    );
};

export const getPendingCount = async (eventId?: number): Promise<number> => {
    const userId = await getScopedUserId();
    if (userId === null) return 0;

    const db = await getDb();
    const result = eventId
        ? await db.getFirstAsync(
            "SELECT COUNT(*) as count FROM pending_checkins WHERE sync_status = 'pending' AND user_id = ? AND event_id = ?",
            userId,
            eventId
        )
        : await db.getFirstAsync(
            "SELECT COUNT(*) as count FROM pending_checkins WHERE sync_status = 'pending' AND user_id = ?",
            userId
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
    const userId = await getScopedUserId();
    if (userId === null) return [];

    const db = await getDb();
    return db.getAllAsync(
        "SELECT * FROM pending_checkins WHERE sync_status = 'conflict' AND user_id = ? ORDER BY timestamp DESC LIMIT 10",
        userId
    );
};

export const clearConflicts = async (): Promise<void> => {
    const userId = await getScopedUserId();
    if (userId === null) return;

    const db = await getDb();
    await db.runAsync(
        "DELETE FROM pending_checkins WHERE sync_status = 'conflict' AND user_id = ?",
        userId
    );
};