// =============================================================
// db.js — Couche d'accès aux données « Hotel Belinga »
//
// Deux moteurs, une seule API (toutes les méthodes sont async) :
//   1. PostgreSQL : si la variable d'environnement DATABASE_URL est
//      définie (Neon / Render). Les données survivent aux
//      redéploiements — le disque de Render est éphémère.
//   2. SQLite local (hotel-belinga.sqlite) : comportement identique à
//      l'ancienne version quand DATABASE_URL est absent (npm start).
// =============================================================

import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Vrai dès que DATABASE_URL est défini (Render, Neon, Docker, tests...).
export const isPostgres = Boolean(
    process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim()
);

const databasePath = path.join(__dirname, "hotel-belinga.sqlite");

// Type de ligne du journal des paiements pour un acompte versé à l'avance.
export const ADVANCE_PAYMENT_KIND = "Paiement par avance";

// Horodatage UTC au format de SQLite CURRENT_TIMESTAMP ("YYYY-MM-DD
// HH:MM:SS"). Les colonnes de dates sont TEXT dans les deux moteurs :
// ce format garantit un tri cohérent (ORDER BY created_at DESC) et des
// exports CSV identiques, quel que soit le moteur.
function timestampUtc() {
    return new Date().toISOString().replace("T", " ").slice(0, 19);
}

// -------------------------------------------------------------
// Configuration métier partagée (tarifs autorisés, 52 chambres).
// Exportée ici pour être réutilisée par server.js et reset.js
// sans dépendance circulaire.
// -------------------------------------------------------------

export function getAllowedPrices(type) {
    const normalized = String(type || "");
    if (normalized === "VIP") return [70000, 60000, 50000];
    if (normalized === "Standard") return [45000, 40000, 35000, 30000];
    if (normalized === "Suite Junior") return [200000, 150000];
    if (normalized === "Suite Ministérielle") return [300000, 250000];
    if (normalized === "Suite Nuptiale") return [350000];
    // Anciens types "Suite" génériques (avant la mise à jour) : on accepte les 5 tarifs
    if (normalized === "Suite") return [350000, 300000, 250000, 200000, 150000];
    return [];
}

export function defaultPriceFor(type, fallback = 0) {
    const allowed = getAllowedPrices(type);
    if (allowed.length > 0) return allowed[0];
    const numeric = Number(fallback);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

export function buildDefaultRooms() {

    const rooms = [];

    const pushRange = (start, end, type, price) => {
        for (let i = start; i <= end; i++) {
            rooms.push({
                number: i,
                type,
                price,
                status: "Libre",
                client_name: "",
                arrival_date: "",
                departure_date: "",
                advance_payment: 0,
                // Chaîne vide (et non null) : la colonne updated_at est
                // NOT NULL, une chambre neuve ne doit pas afficher une
                // fausse "dernière modification".
                updated_at: ""
            });
        }
    };

    // VIP : chambres 01 à 14 (70 000, 60 000 ou 50 000 FCFA)
    pushRange(1, 7, "VIP", 70000);
    pushRange(8, 14, "VIP", 60000);

    // Standard : 45 000, 40 000, 35 000 ou 30 000 FCFA (35 chambres : 15 -> 49)
    pushRange(15, 32, "Standard", 45000);
    pushRange(33, 49, "Standard", 35000);

    // 3 Suites uniquement :
    // 50 = Suite Junior (choix 200 000 ou 150 000)
    // 51 = Suite Ministérielle (choix 300 000 ou 250 000)
    // 52 = Suite Nuptiale (350 000 fixe)
    pushRange(50, 50, "Suite Junior", 200000);
    pushRange(51, 51, "Suite Ministérielle", 300000);
    pushRange(52, 52, "Suite Nuptiale", 350000);

    return rooms;
}

// -------------------------------------------------------------
// Fabrique : choisit le moteur selon l'environnement.
//   - DATABASE_URL défini            -> PostgreSQL (Render / Neon)
//   - DATABASE_URL absent            -> SQLite local (npm start)
// `overrides.pgModule`     : injecte un module pg de test (pg-mem).
// `overrides.forceDriver`  : force "postgres" ou "sqlite" (tests).
// -------------------------------------------------------------

export async function createStorage(overrides = {}) {

    const forced = overrides.forceDriver;
    const usePg = forced === "postgres" || (!forced && isPostgres);

    if (usePg) {
        return createPostgresStorage(overrides.pgModule || pg);
    }

    return createSqliteStorage();
}

// -------------------------------------------------------------
// Moteur SQLite local (npm start, sans DATABASE_URL).
// Comportement strictement identique à l'ancien server.js.
// -------------------------------------------------------------

async function createSqliteStorage() {

    // Import dynamique : node:sqlite n'est chargé qu'en mode SQLite, ce qui
    // permet au mode PostgreSQL (Render) de tourner sur n'importe quel Node.
    const { DatabaseSync } = await import("node:sqlite");

    const db = new DatabaseSync(databasePath);

    // PRAGMA critiques, exécutés UN PAR UN : db.exec() peut ignorer les
    // instructions suivantes dans certaines versions. synchronous = FULL
    // => aucune écriture perdue si le PC s'éteint brutalement.
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA synchronous = FULL;");
    db.exec("PRAGMA busy_timeout = 5000;");
    db.exec("PRAGMA foreign_keys = ON;");

    try {
        const journalMode = db.prepare("PRAGMA journal_mode;").get();
        const syncMode = db.prepare("PRAGMA synchronous;").get();
        console.log(
            "SQLite : journal_mode=" + (journalMode && journalMode.journal_mode) +
            " | synchronous=" + (syncMode && syncMode.synchronous) + " (2 = FULL)"
        );
    } catch (error) {
        console.error("Vérification des PRAGMA impossible :", error.message);
    }

    function ensureSchema() {
        db.exec(`
            CREATE TABLE IF NOT EXISTS rooms (
                number INTEGER PRIMARY KEY,
                type TEXT NOT NULL,
                price INTEGER NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('Libre', 'Occupée', 'Réservée', 'Nettoyage')),
                client_name TEXT NOT NULL DEFAULT '',
                arrival_date TEXT NOT NULL DEFAULT '',
                departure_date TEXT NOT NULL DEFAULT '',
                advance_payment INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS room_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_number INTEGER NOT NULL,
                previous_status TEXT NOT NULL DEFAULT '',
                new_status TEXT NOT NULL,
                client_name TEXT NOT NULL DEFAULT '',
                arrival_date TEXT NOT NULL DEFAULT '',
                departure_date TEXT NOT NULL DEFAULT '',
                changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_number INTEGER NOT NULL,
                room_type TEXT NOT NULL DEFAULT '',
                client_name TEXT NOT NULL DEFAULT '',
                arrival_date TEXT NOT NULL DEFAULT '',
                departure_date TEXT NOT NULL DEFAULT '',
                nights INTEGER NOT NULL DEFAULT 0,
                price_per_night INTEGER NOT NULL DEFAULT 0,
                amount INTEGER NOT NULL DEFAULT 0,
                kind TEXT NOT NULL DEFAULT 'Séjour',
                note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);
    }

    // Anciennes bases : ajout des colonnes manquantes (migration douce).
    function ensureColumns() {
        const roomColumns = new Set(db.prepare("PRAGMA table_info(rooms)").all().map(row => row.name));
        for (const [columnName, columnDefinition] of [
            ["client_name", "TEXT NOT NULL DEFAULT ''"],
            ["arrival_date", "TEXT NOT NULL DEFAULT ''"],
            ["departure_date", "TEXT NOT NULL DEFAULT ''"],
            ["advance_payment", "INTEGER NOT NULL DEFAULT 0"]
        ]) {
            if (!roomColumns.has(columnName)) {
                db.exec(`ALTER TABLE rooms ADD COLUMN ${columnName} ${columnDefinition};`);
            }
        }

        const paymentColumns = new Set(db.prepare("PRAGMA table_info(payments)").all().map(row => row.name));
        for (const [columnName, columnDefinition] of [
            ["room_type", "TEXT NOT NULL DEFAULT ''"],
            ["kind", "TEXT NOT NULL DEFAULT 'Séjour'"],
            ["note", "TEXT NOT NULL DEFAULT ''"]
        ]) {
            if (!paymentColumns.has(columnName)) {
                db.exec(`ALTER TABLE payments ADD COLUMN ${columnName} ${columnDefinition};`);
            }
        }
    }

    const ROOM_COLUMNS = "number, type, price, status, client_name, arrival_date, departure_date, advance_payment, updated_at";

    function insertDefaultRooms() {
        const insertRoom = db.prepare(`
            INSERT OR REPLACE INTO rooms (${ROOM_COLUMNS})
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const room of buildDefaultRooms()) {
            insertRoom.run(
                room.number, room.type, room.price, room.status,
                room.client_name, room.arrival_date, room.departure_date,
                Number(room.advance_payment || 0), room.updated_at
            );
        }
    }

    function seedAndNormalize() {
        const currentRooms = db.prepare(`SELECT ${ROOM_COLUMNS} FROM rooms ORDER BY number`).all();

        if (currentRooms.length === 0) {
            insertDefaultRooms();
            return;
        }

        if (currentRooms.some(room => room.number < 1 || room.number > 52)) {
            migrateLegacyRooms(currentRooms);
            return;
        }

        const desiredRooms = buildDefaultRooms();
        const insertRoom = db.prepare(`
            INSERT OR IGNORE INTO rooms (${ROOM_COLUMNS})
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const updateRoomType = db.prepare("UPDATE rooms SET type = ? WHERE number = ?");
        const updateRoomPrice = db.prepare("UPDATE rooms SET price = ? WHERE number = ?");

        for (const room of desiredRooms) {
            insertRoom.run(
                room.number, room.type, room.price, room.status,
                room.client_name, room.arrival_date, room.departure_date,
                Number(room.advance_payment || 0), room.updated_at
            );

            const existing = db.prepare("SELECT type, price FROM rooms WHERE number = ?").get(room.number);
            if (existing && existing.type !== room.type) {
                updateRoomType.run(room.type, room.number);
            }
            // Prix : on corrige seulement si le prix actuel n'est pas un tarif
            // autorisé pour ce type (ex : anciens 25 000 / 50 000 / 80 000).
            if (existing) {
                const allowed = getAllowedPrices(room.type);
                if (allowed.length > 0 && !allowed.includes(Number(existing.price))) {
                    updateRoomPrice.run(room.price, room.number);
                }
            }
        }
    }

    function migrateLegacyRooms(currentRooms) {
        const desiredRooms = buildDefaultRooms();
        const sortedLegacyRooms = [...currentRooms].sort((a, b) => a.number - b.number);

        const mapping = new Map();
        sortedLegacyRooms.forEach((room, index) => {
            const target = desiredRooms[index];
            if (target) mapping.set(room.number, target.number);
        });

        db.exec("BEGIN IMMEDIATE TRANSACTION");
        try {
            db.exec("DELETE FROM rooms");
            const insertRoom = db.prepare(`
                INSERT INTO rooms (${ROOM_COLUMNS})
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            desiredRooms.forEach((desiredRoom, index) => {
                const legacyRoom = sortedLegacyRooms[index] || {};
                insertRoom.run(
                    desiredRoom.number, desiredRoom.type, desiredRoom.price,
                    legacyRoom.status || desiredRoom.status,
                    legacyRoom.client_name || "",
                    legacyRoom.arrival_date || "",
                    legacyRoom.departure_date || "",
                    Number(legacyRoom.advance_payment || 0),
                    legacyRoom.updated_at || ""
                );
            });
            if (mapping.size > 0) {
                const caseSql = Array.from(mapping.entries())
                    .map(([oldNumber, newNumber]) => `WHEN ${oldNumber} THEN ${newNumber}`)
                    .join(" ");
                const inClause = Array.from(mapping.keys()).join(",");
                if (inClause.length > 0) {
                    db.exec(`
                        UPDATE room_history
                        SET room_number = CASE room_number ${caseSql} ELSE room_number END
                        WHERE room_number IN (${inClause})
                    `);
                }
            }
            db.exec("COMMIT");
        } catch (error) {
            db.exec("ROLLBACK");
            throw error;
        }
    }

    const storage = {
        driver: "sqlite",

        async init() {
            ensureSchema();
            ensureColumns();
            seedAndNormalize();
            console.log("SQLite locale prete (52 chambres attendues, donnees existantes preservees).");
        },

        async roomCount() {
            return db.prepare("SELECT COUNT(*) AS count FROM rooms").get().count;
        },

        async getRooms() {
            return db.prepare(`SELECT ${ROOM_COLUMNS} FROM rooms ORDER BY number`).all();
        },

        async getRoom(number) {
            return db.prepare(`SELECT ${ROOM_COLUMNS} FROM rooms WHERE number = ?`).get(number) || null;
        },

        async updateRoom(number, payload) {
            db.prepare(`
                UPDATE rooms
                SET status = ?, client_name = ?, arrival_date = ?, departure_date = ?, price = ?, advance_payment = ?, updated_at = CURRENT_TIMESTAMP
                WHERE number = ?
            `).run(
                payload.status, payload.clientName, payload.arrivalDate,
                payload.departureDate, payload.price,
                Number(payload.advancePayment || 0), number
            );
        },

        async getHistory(limit = 100) {
            return db.prepare(`
                SELECT id, room_number, previous_status, new_status, client_name, arrival_date, departure_date, changed_at
                FROM room_history
                ORDER BY changed_at DESC, id DESC
                LIMIT ?
            `).all(limit);
        },

        async getRoomHistory(number, limit = 100) {
            return db.prepare(`
                SELECT id, room_number, previous_status, new_status, client_name, arrival_date, departure_date, changed_at
                FROM room_history
                WHERE room_number = ?
                ORDER BY changed_at DESC, id DESC
                LIMIT ?
            `).all(number, limit);
        },

        async insertHistory(entry) {
            const result = db.prepare(`
                INSERT INTO room_history (room_number, previous_status, new_status, client_name, arrival_date, departure_date)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(
                entry.roomNumber, entry.previousStatus, entry.newStatus,
                entry.clientName, entry.arrivalDate, entry.departureDate
            );
            return { lastInsertRowid: Number(result.lastInsertRowid) };
        },

        async insertPayment(entry) {
            const result = db.prepare(`
                INSERT INTO payments (room_number, room_type, client_name, arrival_date, departure_date, nights, price_per_night, amount, kind, note)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                entry.roomNumber, entry.roomType, entry.clientName,
                entry.arrivalDate, entry.departureDate, entry.nights,
                entry.pricePerNight, entry.amount, entry.kind, entry.note
            );
            return { lastInsertRowid: Number(result.lastInsertRowid) };
        },

        async getPayments(limit = 500) {
            return db.prepare(`
                SELECT id, room_number, room_type, client_name, arrival_date, departure_date,
                       nights, price_per_night, amount, kind, note, created_at
                FROM payments
                ORDER BY created_at DESC, id DESC
                LIMIT ?
            `).all(limit);
        },

        async getRoomAdvancePayments(number, limit = 20) {
            return db.prepare(`
                SELECT id, amount, note, created_at
                FROM payments
                WHERE room_number = ? AND kind = ?
                ORDER BY created_at DESC, id DESC
                LIMIT ?
            `).all(number, ADVANCE_PAYMENT_KIND, limit);
        },

        async sumAdvances(number) {
            const row = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) AS total
                FROM payments
                WHERE room_number = ? AND kind = ?
            `).get(number, ADVANCE_PAYMENT_KIND);
            return Number(row ? row.total : 0);
        },

        async reportAdvance(number, amount) {
            db.prepare(`
                UPDATE rooms
                SET advance_payment = MAX(advance_payment, ?), updated_at = CURRENT_TIMESTAMP
                WHERE number = ? AND status IN ('Occupée', 'Réservée')
            `).run(amount, number);
        },

        async resetAll() {
            db.exec("DELETE FROM room_history");
            db.exec("DELETE FROM payments");
            db.exec("DELETE FROM rooms");
            insertDefaultRooms();
        },

        async maintenance() {
            try {
                db.exec("PRAGMA wal_checkpoint(PASSIVE);");
            } catch (error) {
                console.error("Checkpoint WAL impossible :", error.message);
            }
        },

        async close() {
            try {
                db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
                db.close();
                console.log("Base SQLite sauvegardee et fermee proprement.");
            } catch (error) {
                console.error("Fermeture de la base impossible :", error.message);
            }
        }
    };

    return storage;
}

// -------------------------------------------------------------
// Moteur PostgreSQL (Render + Neon). Activé dès que DATABASE_URL
// est défini : les données survivent à chaque redéploiement, car
// la base vit chez Neon — pas sur le disque éphémère de Render.
// -------------------------------------------------------------

async function createPostgresStorage(pgModule) {

    const connectionString = String(process.env.DATABASE_URL).trim();

    // Neon / Render exigent SSL ; en local (localhost) on le désactive.
    const needsSsl = !/localhost|127\.0\.0\.1/.test(connectionString);

    const pool = new pgModule.Pool({
        connectionString,
        ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {})
    });

    // Horodatage PostgreSQL au même format que SQLite CURRENT_TIMESTAMP
    // (UTC, "YYYY-MM-DD HH24:MI:SS") : colonnes TEXT, tris identiques.
    const PG_NOW_TEXT = "(to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD HH24:MI:SS'))";
    const ROOM_COLUMNS = "number, type, price, status, client_name, arrival_date, departure_date, advance_payment, updated_at";

    async function run(sql, params = []) {
        let index = 0;
        const text = sql.replace(/\?/g, () => `$${++index}`);
        return pool.query(text, params);
    }

    async function all(sql, params = []) {
        let index = 0;
        const text = sql.replace(/\?/g, () => `$${++index}`);
        const result = await pool.query(text, params);
        return result.rows;
    }

    async function get(sql, params = []) {
        const rows = await all(sql, params);
        return rows[0] || null;
    }

    async function createTables() {
        await run(`CREATE TABLE IF NOT EXISTS rooms (
            number INTEGER PRIMARY KEY,
            type TEXT NOT NULL,
            price INTEGER NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('Libre', 'Occupée', 'Réservée', 'Nettoyage')),
            client_name TEXT NOT NULL DEFAULT '',
            arrival_date TEXT NOT NULL DEFAULT '',
            departure_date TEXT NOT NULL DEFAULT '',
            advance_payment INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL DEFAULT ${PG_NOW_TEXT}
        )`);
        await run(`CREATE TABLE IF NOT EXISTS room_history (
            id BIGSERIAL PRIMARY KEY,
            room_number INTEGER NOT NULL,
            previous_status TEXT NOT NULL DEFAULT '',
            new_status TEXT NOT NULL,
            client_name TEXT NOT NULL DEFAULT '',
            arrival_date TEXT NOT NULL DEFAULT '',
            departure_date TEXT NOT NULL DEFAULT '',
            changed_at TEXT NOT NULL DEFAULT ${PG_NOW_TEXT}
        )`);
        await run(`CREATE TABLE IF NOT EXISTS payments (
            id BIGSERIAL PRIMARY KEY,
            room_number INTEGER NOT NULL,
            room_type TEXT NOT NULL DEFAULT '',
            client_name TEXT NOT NULL DEFAULT '',
            arrival_date TEXT NOT NULL DEFAULT '',
            departure_date TEXT NOT NULL DEFAULT '',
            nights INTEGER NOT NULL DEFAULT 0,
            price_per_night INTEGER NOT NULL DEFAULT 0,
            amount INTEGER NOT NULL DEFAULT 0,
            kind TEXT NOT NULL DEFAULT 'Séjour',
            note TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT ${PG_NOW_TEXT}
        )`);
    }

    async function insertDefaultRooms() {
        for (const room of buildDefaultRooms()) {
            await run(`
                INSERT INTO rooms (${ROOM_COLUMNS})
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (number) DO UPDATE SET
                    type = EXCLUDED.type,
                    price = EXCLUDED.price,
                    status = EXCLUDED.status,
                    client_name = EXCLUDED.client_name,
                    arrival_date = EXCLUDED.arrival_date,
                    departure_date = EXCLUDED.departure_date,
                    advance_payment = EXCLUDED.advance_payment,
                    updated_at = EXCLUDED.updated_at
            `, [
                room.number, room.type, room.price, room.status,
                room.client_name, room.arrival_date, room.departure_date,
                Number(room.advance_payment || 0), room.updated_at
            ]);
        }
    }

    async function seedAndNormalize() {
        const currentRooms = await all(`SELECT ${ROOM_COLUMNS} FROM rooms ORDER BY number`);

        if (currentRooms.length === 0) {
            await insertDefaultRooms();
            return;
        }

        if (currentRooms.some(room => room.number < 1 || room.number > 52)) {
            await migrateLegacyRooms(currentRooms);
            return;
        }

        const desiredRooms = buildDefaultRooms();

        for (const room of desiredRooms) {
            const existing = await get("SELECT type, price FROM rooms WHERE number = ?", [room.number]);

            if (!existing) {
                await run(`
                    INSERT INTO rooms (${ROOM_COLUMNS})
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (number) DO NOTHING
                `, [
                    room.number, room.type, room.price, room.status,
                    room.client_name, room.arrival_date, room.departure_date,
                    Number(room.advance_payment || 0), room.updated_at
                ]);
                continue;
            }

            if (existing.type !== room.type) {
                await run("UPDATE rooms SET type = ? WHERE number = ?", [room.type, room.number]);
            }
            // Prix : on corrige seulement si le prix actuel n'est pas un tarif
            // autorisé pour ce type. On ne touche pas aux choix déjà faits.
            const allowed = getAllowedPrices(room.type);
            if (allowed.length > 0 && !allowed.includes(Number(existing.price))) {
                await run("UPDATE rooms SET price = ? WHERE number = ?", [room.price, room.number]);
            }
        }
    }

    async function migrateLegacyRooms(currentRooms) {
        const desiredRooms = buildDefaultRooms();
        const sortedLegacyRooms = [...currentRooms].sort((a, b) => a.number - b.number);

        const mapping = new Map();
        sortedLegacyRooms.forEach((room, index) => {
            const target = desiredRooms[index];
            if (target) mapping.set(room.number, target.number);
        });

        // Transaction sur UNE connexion dédiée : pool.query seul ne garantit
        // pas la même connexion d'une requête à l'autre.
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            await client.query("DELETE FROM rooms");
            for (let index = 0; index < desiredRooms.length; index++) {
                const desiredRoom = desiredRooms[index];
                const legacyRoom = sortedLegacyRooms[index] || {};
                await client.query(`
                    INSERT INTO rooms (${ROOM_COLUMNS})
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `, [
                    desiredRoom.number, desiredRoom.type, desiredRoom.price,
                    legacyRoom.status || desiredRoom.status,
                    legacyRoom.client_name || "",
                    legacyRoom.arrival_date || "",
                    legacyRoom.departure_date || "",
                    Number(legacyRoom.advance_payment || 0),
                    legacyRoom.updated_at || ""
                ]);
            }
            if (mapping.size > 0) {
                const caseSql = Array.from(mapping.entries())
                    .map(([oldNumber, newNumber]) => `WHEN ${oldNumber} THEN ${newNumber}`)
                    .join(" ");
                const inClause = Array.from(mapping.keys()).join(",");
                if (inClause.length > 0) {
                    await client.query(`
                        UPDATE room_history
                        SET room_number = CASE room_number ${caseSql} ELSE room_number END
                        WHERE room_number IN (${inClause})
                    `);
                }
            }
            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    const storage = {
        driver: "postgres",

        async init() {
            await createTables();
            await seedAndNormalize();
            console.log("PostgreSQL connecte : les donnees persistent apres chaque redeployement.");
        },

        async roomCount() {
            const row = await get("SELECT COUNT(*)::int AS count FROM rooms");
            return Number(row ? row.count : 0);
        },

        async getRooms() {
            return all(`SELECT ${ROOM_COLUMNS} FROM rooms ORDER BY number`);
        },

        async getRoom(number) {
            return get(`SELECT ${ROOM_COLUMNS} FROM rooms WHERE number = ?`, [number]);
        },

        async updateRoom(number, payload) {
            await run(`
                UPDATE rooms
                SET status = ?, client_name = ?, arrival_date = ?, departure_date = ?, price = ?, advance_payment = ?, updated_at = ${PG_NOW_TEXT}
                WHERE number = ?
            `, [
                payload.status, payload.clientName, payload.arrivalDate,
                payload.departureDate, payload.price,
                Number(payload.advancePayment || 0), number
            ]);
        },

        async getHistory(limit = 100) {
            return all(`
                SELECT id::int AS id, room_number, previous_status, new_status, client_name, arrival_date, departure_date, changed_at
                FROM room_history
                ORDER BY changed_at DESC, id DESC
                LIMIT ?
            `, [limit]);
        },

        async getRoomHistory(number, limit = 100) {
            return all(`
                SELECT id::int AS id, room_number, previous_status, new_status, client_name, arrival_date, departure_date, changed_at
                FROM room_history
                WHERE room_number = ?
                ORDER BY changed_at DESC, id DESC
                LIMIT ?
            `, [number, limit]);
        },

        async insertHistory(entry) {
            const result = await run(`
                INSERT INTO room_history (room_number, previous_status, new_status, client_name, arrival_date, departure_date)
                VALUES (?, ?, ?, ?, ?, ?)
                RETURNING id::int AS id
            `, [
                entry.roomNumber, entry.previousStatus, entry.newStatus,
                entry.clientName, entry.arrivalDate, entry.departureDate
            ]);
            return { lastInsertRowid: Number(result.rows[0].id) };
        },

        async insertPayment(entry) {
            const result = await run(`
                INSERT INTO payments (room_number, room_type, client_name, arrival_date, departure_date, nights, price_per_night, amount, kind, note)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id::int AS id
            `, [
                entry.roomNumber, entry.roomType, entry.clientName,
                entry.arrivalDate, entry.departureDate, entry.nights,
                entry.pricePerNight, entry.amount, entry.kind, entry.note
            ]);
            return { lastInsertRowid: Number(result.rows[0].id) };
        },

        async getPayments(limit = 500) {
            return all(`
                SELECT id::int AS id, room_number, room_type, client_name, arrival_date, departure_date,
                       nights, price_per_night, amount, kind, note, created_at
                FROM payments
                ORDER BY created_at DESC, id DESC
                LIMIT ?
            `, [limit]);
        },

        async getRoomAdvancePayments(number, limit = 20) {
            return all(`
                SELECT id::int AS id, amount, note, created_at
                FROM payments
                WHERE room_number = ? AND kind = ?
                ORDER BY created_at DESC, id DESC
                LIMIT ?
            `, [number, ADVANCE_PAYMENT_KIND, limit]);
        },

        async sumAdvances(number) {
            const row = await get(`
                SELECT COALESCE(SUM(amount), 0)::int AS total
                FROM payments
                WHERE room_number = ? AND kind = ?
            `, [number, ADVANCE_PAYMENT_KIND]);
            return Number(row ? row.total : 0);
        },

        async reportAdvance(number, amount) {
            await run(`
                UPDATE rooms
                SET advance_payment = GREATEST(advance_payment, ?), updated_at = ${PG_NOW_TEXT}
                WHERE number = ? AND status IN ('Occupée', 'Réservée')
            `, [amount, number]);
        },

        async resetAll() {
            const client = await pool.connect();
            try {
                await client.query("BEGIN");
                await client.query("DELETE FROM room_history");
                await client.query("DELETE FROM payments");
                await client.query("DELETE FROM rooms");
                for (const room of buildDefaultRooms()) {
                    await client.query(`
                        INSERT INTO rooms (${ROOM_COLUMNS})
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    `, [
                        room.number, room.type, room.price, room.status,
                        room.client_name, room.arrival_date, room.departure_date,
                        Number(room.advance_payment || 0), room.updated_at
                    ]);
                }
                await client.query("COMMIT");
            } catch (error) {
                await client.query("ROLLBACK");
                throw error;
            } finally {
                client.release();
            }
        },

        async maintenance() { /* PostgreSQL gère ses checkpoints lui-même. */ },

        async close() {
            try {
                await pool.end();
                console.log("Connexion PostgreSQL fermee proprement.");
            } catch (error) {
                console.error("Fermeture PostgreSQL impossible :", error.message);
            }
        }
    };

    return storage;
}