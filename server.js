import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const publicDir = __dirname;
const databasePath = path.join(__dirname, "hotel-belinga.sqlite");
const allowedStatuses = new Set(["Libre", "Occupée", "Réservée", "Nettoyage"]);


function buildDefaultRooms() {

    const rooms = [];

    for (let i = 1; i <= 35; i++) {
        rooms.push({
            number: i,
            type: "Standard",
            price: 25000,
            status: "Libre",
            client_name: "",
            arrival_date: "",
            departure_date: "",
            updated_at: null
        });
    }

    for (let i = 36; i <= 49; i++) {
        rooms.push({
            number: i,
            type: "VIP",
            price: 50000,
            status: "Libre",
            client_name: "",
            arrival_date: "",
            departure_date: "",
            updated_at: null
        });
    }

    for (let i = 50; i <= 52; i++) {
        rooms.push({
            number: i,
            type: "Suite",
            price: 80000,
            status: "Libre",
            client_name: "",
            arrival_date: "",
            departure_date: "",
            updated_at: null
        });
    }

    return rooms;

}


function escapeCsv(value) {

    const text = value === null || value === undefined ? "" : String(value);

    if (/[",\r\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }

    return text;

}


function toCsv(rows, columns) {

    const header = columns.map(column => escapeCsv(column.label)).join(",");
    const lines = rows.map(row => columns.map(column => escapeCsv(column.get(row))).join(","));

    return [header, ...lines].join("\r\n");

}


function sendJson(res, statusCode, data) {

    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
    });

    res.end(JSON.stringify(data));

}


function sendText(res, statusCode, text, contentType = "text/plain; charset=utf-8") {

    res.writeHead(statusCode, {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
    });

    res.end(text);

}


function sendCsv(res, filename, csv) {

    // BOM UTF-8 pour Excel + separateur explicite
    const csvWithBom = "﻿sep=,\r\n" + csv;

    res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=\"" + filename + "\"",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
    });

    res.end(csvWithBom);

}


function getContentType(filePath) {

    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
        case ".html":
            return "text/html; charset=utf-8";
        case ".css":
            return "text/css; charset=utf-8";
        case ".js":
            return "application/javascript; charset=utf-8";
        case ".json":
            return "application/json; charset=utf-8";
        case ".svg":
            return "image/svg+xml";
        case ".png":
            return "image/png";
        case ".jpg":
        case ".jpeg":
            return "image/jpeg";
        case ".webp":
            return "image/webp";
        case ".ico":
            return "image/x-icon";
        case ".woff":
            return "font/woff";
        case ".woff2":
            return "font/woff2";
        default:
            return "application/octet-stream";
    }

}


async function readJsonBody(req) {

    const chunks = [];

    for await (const chunk of req) {
        chunks.push(chunk);
    }

    if (chunks.length === 0) {
        return {};
    }

    const raw = Buffer.concat(chunks).toString("utf8");

    try {
        return JSON.parse(raw);
    } catch {
        throw new Error("Corps JSON invalide.");
    }

}


function resolveStaticFile(requestPath) {

    const safePath = requestPath === "/" ? "/index.html" : requestPath;
    const resolvedPath = path.resolve(publicDir, `.${safePath}`);
    const relativePath = path.relative(publicDir, resolvedPath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        return null;
    }

    return resolvedPath;

}


function roomColumns() {

    return [
        { label: "number", get: row => row.number },
        { label: "type", get: row => row.type },
        { label: "price", get: row => row.price },
        { label: "status", get: row => row.status },
        { label: "client_name", get: row => row.client_name || "" },
        { label: "arrival_date", get: row => row.arrival_date || "" },
        { label: "departure_date", get: row => row.departure_date || "" },
        { label: "updated_at", get: row => row.updated_at || "" }
    ];

}


function historyColumns() {

    return [
        { label: "id", get: row => row.id },
        { label: "room_number", get: row => row.room_number },
        { label: "previous_status", get: row => row.previous_status || "" },
        { label: "new_status", get: row => row.new_status },
        { label: "client_name", get: row => row.client_name || "" },
        { label: "arrival_date", get: row => row.arrival_date || "" },
        { label: "departure_date", get: row => row.departure_date || "" },
        { label: "changed_at", get: row => row.changed_at || "" }
    ];

}


function parsePositiveInt(value, fallback) {

    const parsed = Number.parseInt(value, 10);

    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;

}


function escapeSqlLikeValue(value) {

    return String(value).replace(/'/g, "''");

}


const db = new DatabaseSync(databasePath);

db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS rooms (
        number INTEGER PRIMARY KEY,
        type TEXT NOT NULL,
        price INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('Libre', 'Occupée', 'Réservée', 'Nettoyage')),
        client_name TEXT NOT NULL DEFAULT '',
        arrival_date TEXT NOT NULL DEFAULT '',
        departure_date TEXT NOT NULL DEFAULT '',
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
`);


function getTableColumns(tableName) {

    return db.prepare(`PRAGMA table_info(${tableName})`).all().map(row => row.name);

}


function ensureRoomColumns() {

    const columns = new Set(getTableColumns("rooms"));
    const requiredColumns = [
        ["client_name", "TEXT NOT NULL DEFAULT ''"],
        ["arrival_date", "TEXT NOT NULL DEFAULT ''"],
        ["departure_date", "TEXT NOT NULL DEFAULT ''"]
    ];

    for (const [columnName, columnDefinition] of requiredColumns) {
        if (!columns.has(columnName)) {
            db.exec(`ALTER TABLE rooms ADD COLUMN ${columnName} ${columnDefinition};`);
        }
    }

}


function roomCount() {

    return db.prepare("SELECT COUNT(*) AS count FROM rooms").get().count;

}


function loadRoomsOrdered() {

    return db.prepare(`
        SELECT number, type, price, status, client_name, arrival_date, departure_date, updated_at
        FROM rooms
        ORDER BY number
    `).all();

}


function loadHistoryOrdered(limit = 100) {

    return db.prepare(`
        SELECT id, room_number, previous_status, new_status, client_name, arrival_date, departure_date, changed_at
        FROM room_history
        ORDER BY changed_at DESC, id DESC
        LIMIT ?
    `).all(limit);

}


function insertDefaultRooms() {

    const insertRoom = db.prepare(`
        INSERT OR REPLACE INTO rooms (
            number, type, price, status, client_name, arrival_date, departure_date, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const room of buildDefaultRooms()) {
        insertRoom.run(
            room.number,
            room.type,
            room.price,
            room.status,
            room.client_name,
            room.arrival_date,
            room.departure_date,
            room.updated_at
        );
    }

}


function needsLegacyMigration(rooms) {

    return rooms.some(room => room.number < 1 || room.number > 52);

}


function migrateLegacyRooms(rooms) {

    const desiredRooms = buildDefaultRooms();
    const sortedLegacyRooms = [...rooms].sort((a, b) => a.number - b.number);

    const mapping = new Map();
    sortedLegacyRooms.forEach((room, index) => {
        const target = desiredRooms[index];
        if (target) {
            mapping.set(room.number, target.number);
        }
    });

    db.exec("BEGIN IMMEDIATE TRANSACTION");

    try {

        db.exec("DELETE FROM rooms");

        const insertRoom = db.prepare(`
            INSERT INTO rooms (
                number, type, price, status, client_name, arrival_date, departure_date, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        desiredRooms.forEach((desiredRoom, index) => {
            const legacyRoom = sortedLegacyRooms[index] || {};

            insertRoom.run(
                desiredRoom.number,
                desiredRoom.type,
                desiredRoom.price,
                legacyRoom.status || desiredRoom.status,
                legacyRoom.client_name || "",
                legacyRoom.arrival_date || "",
                legacyRoom.departure_date || "",
                legacyRoom.updated_at || null
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


function ensureRoomSeed() {

    ensureRoomColumns();

    const currentRooms = loadRoomsOrdered();

    if (currentRooms.length === 0) {
        insertDefaultRooms();
        return;
    }

    if (needsLegacyMigration(currentRooms)) {
        migrateLegacyRooms(currentRooms);
        return;
    }

    const desiredRooms = buildDefaultRooms();
    const insertRoom = db.prepare(`
        INSERT OR IGNORE INTO rooms (
            number, type, price, status, client_name, arrival_date, departure_date, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateRoom = db.prepare(`
        UPDATE rooms
        SET type = ?, price = ?
        WHERE number = ?
    `);

    for (const room of desiredRooms) {
        insertRoom.run(
            room.number,
            room.type,
            room.price,
            room.status,
            room.client_name,
            room.arrival_date,
            room.departure_date,
            room.updated_at
        );

        updateRoom.run(room.type, room.price, room.number);
    }

}


function resetDatabase() {

    db.exec("DELETE FROM room_history");
    db.exec("DELETE FROM rooms");
    insertDefaultRooms();

}


if (process.argv.includes("--reset")) {
    resetDatabase();
    console.log("Base reinitialisee : 52 chambres Libres, historique vide.");
}


ensureRoomSeed();


const selectRooms = db.prepare(`
    SELECT number, type, price, status, client_name, arrival_date, departure_date, updated_at
    FROM rooms
    ORDER BY number
`);

const selectRoomByNumber = db.prepare(`
    SELECT number, type, price, status, client_name, arrival_date, departure_date, updated_at
    FROM rooms
    WHERE number = ?
`);

const selectRoomHistory = db.prepare(`
    SELECT id, room_number, previous_status, new_status, client_name, arrival_date, departure_date, changed_at
    FROM room_history
    WHERE room_number = ?
    ORDER BY changed_at DESC, id DESC
    LIMIT ?
`);

const selectHistory = db.prepare(`
    SELECT id, room_number, previous_status, new_status, client_name, arrival_date, departure_date, changed_at
    FROM room_history
    ORDER BY changed_at DESC, id DESC
    LIMIT ?
`);

const updateRoom = db.prepare(`
    UPDATE rooms
    SET status = ?, client_name = ?, arrival_date = ?, departure_date = ?, updated_at = CURRENT_TIMESTAMP
    WHERE number = ?
`);

const insertHistory = db.prepare(`
    INSERT INTO room_history (
        room_number, previous_status, new_status, client_name, arrival_date, departure_date
    ) VALUES (?, ?, ?, ?, ?, ?)
`);


function validateDate(value) {

    if (!value) return "";

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return null;
    }

    return value;

}


function normalizeStatusPayload(body, currentRoom) {

    const status = body?.status;
    const clientName = typeof body?.clientName === "string" ? body.clientName.trim() : "";
    const arrivalDate = validateDate(typeof body?.arrivalDate === "string" ? body.arrivalDate : "");
    const departureDate = validateDate(typeof body?.departureDate === "string" ? body.departureDate : "");

    if (!allowedStatuses.has(status)) {
        return { error: "Statut invalide." };
    }

    if (arrivalDate === null || departureDate === null) {
        return { error: "Format de date invalide." };
    }

    if ((status === "Occupée" || status === "Réservée") && !clientName) {
        return { error: "Le nom du client est obligatoire pour une chambre occupée ou réservée." };
    }

    if ((status === "Occupée" || status === "Réservée") && (!arrivalDate || !departureDate)) {
        return { error: "Les dates d'arrivée et de départ sont obligatoires pour une chambre occupée ou réservée." };
    }

    const payload = {
        status,
        clientName: status === "Libre" || status === "Nettoyage" ? "" : clientName,
        arrivalDate: status === "Libre" || status === "Nettoyage" ? "" : arrivalDate,
        departureDate: status === "Libre" || status === "Nettoyage" ? "" : departureDate
    };

    if (currentRoom && currentRoom.status === payload.status && currentRoom.client_name === payload.clientName && currentRoom.arrival_date === payload.arrivalDate && currentRoom.departure_date === payload.departureDate) {
        return { payload, unchanged: true };
    }

    return { payload };

}


function roomExportRows() {

    return selectRooms.all();

}


function historyExportRows(limit = 500) {

    return selectHistory.all(limit);

}


function attachRoomMetrics(room) {

    return {
        ...room
    };

}
function calculateNights(arrivalDate, departureDate) {
    if (!arrivalDate || !departureDate) return 0;
    const arrival = new Date(`${arrivalDate}T00:00:00`);
    const departure = new Date(`${departureDate}T00:00:00`);
    if (Number.isNaN(arrival.getTime()) || Number.isNaN(departure.getTime())) return 0;
    return Math.max(0, Math.round((departure - arrival) / 86400000));
}




function handleExport(res, type) {

    if (type === "rooms") {
        const csv = toCsv(roomExportRows(), roomColumns());
        return sendCsv(res, "hotel-belinga-chambres.csv", csv);
    }

    if (type === "history") {
        const csv = toCsv(historyExportRows(), historyColumns());
        return sendCsv(res, "hotel-belinga-historique.csv", csv);
    }

    return sendText(res, 404, "Export introuvable.");

}


const server = http.createServer(async (req, res) => {

    try {

        const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
        const { pathname } = url;


        // Favicon : repondre 204 (pas de contenu) pour eviter le 404
        // dans la console du navigateur
        if ((req.method === "GET" || req.method === "HEAD") && pathname === "/favicon.ico") {
            res.writeHead(204, {
                "Cache-Control": "public, max-age=86400"
            });

            return res.end();
        }


        if (req.method === "GET" && pathname === "/api/rooms") {

            return sendJson(res, 200, selectRooms.all().map(attachRoomMetrics));

        }


        if (req.method === "GET" && pathname === "/api/history") {

            const limit = parsePositiveInt(url.searchParams.get("limit"), 100);
            return sendJson(res, 200, selectHistory.all(limit));

        }


        if (req.method === "GET" && pathname.startsWith("/api/rooms/") && pathname.endsWith("/history")) {

            const parts = pathname.split("/");
            const number = Number.parseInt(parts[3], 10);

            if (!Number.isInteger(number)) {
                return sendText(res, 400, "Numero de chambre invalide.");
            }

            const limit = parsePositiveInt(url.searchParams.get("limit"), 20);
            return sendJson(res, 200, selectRoomHistory.all(number, limit));

        }


        if (req.method === "GET" && pathname === "/api/exports/rooms.csv") {
            return handleExport(res, "rooms");
        }


        // Export CSV d'UNE SEULE chambre : /api/exports/rooms/12.csv
        if (req.method === "GET" && pathname.startsWith("/api/exports/rooms/") && pathname.endsWith(".csv")) {
            const number = Number.parseInt(pathname.split("/").pop().replace(".csv", ""), 10);

            if (!Number.isInteger(number)) {
                return sendText(res, 400, "Numero de chambre invalide.");
            }

            const room = selectRoomByNumber.get(number);

            if (!room) {
                return sendText(res, 404, "Chambre introuvable.");
            }

            const csv = toCsv([room], roomColumns());
            return sendCsv(res, `hotel-belinga-chambre-${number}.csv`, csv);
        }


        // Reçu JSON d'UNE chambre pour impression PDF : /api/receipts/12
        if (req.method === "GET" && pathname.startsWith("/api/receipts/")) {
            const number = Number.parseInt(pathname.split("/").pop(), 10);

            if (!Number.isInteger(number)) {
                return sendText(res, 400, "Numero de chambre invalide.");
            }

            const room = selectRoomByNumber.get(number);

            if (!room) {
                return sendText(res, 404, "Chambre introuvable.");
            }

            const nights = calculateNights(room.arrival_date, room.departure_date);
            const total = nights > 0 ? nights * Number(room.price || 0) : 0;
            const history = selectRoomHistory.all(number, 20);

            return sendJson(res, 200, {
                room,
                nights,
                total,
                history,
                generated_at: new Date().toISOString()
            });
        }


        if (req.method === "GET" && pathname === "/api/exports/history.csv") {
            return handleExport(res, "history");
        }


        if (req.method === "PUT" && pathname.startsWith("/api/rooms/")) {

            const number = Number.parseInt(pathname.split("/").pop(), 10);

            if (!Number.isInteger(number)) {
                return sendText(res, 400, "Numero de chambre invalide.");
            }

            const currentRoom = selectRoomByNumber.get(number);

            if (!currentRoom) {
                return sendText(res, 404, "Chambre introuvable.");
            }

            const body = await readJsonBody(req);
            const normalized = normalizeStatusPayload(body, currentRoom);

            if (normalized.error) {
                return sendText(res, 400, normalized.error);
            }

            const { payload, unchanged } = normalized;

            if (!unchanged) {
                updateRoom.run(payload.status, payload.clientName, payload.arrivalDate, payload.departureDate, number);
                insertHistory.run(
                    number,
                    currentRoom.status,
                    payload.status,
                    payload.clientName,
                    payload.arrivalDate,
                    payload.departureDate
                );
            }

            return sendJson(res, 200, selectRoomByNumber.get(number));

        }


        // Preflight CORS (navigateur qui appelle http://localhost:3000
        // depuis une autre origine : fichier local, Live Server...)
        if (req.method === "OPTIONS") {
            res.writeHead(204, {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
                "Cache-Control": "no-store"
            });

            return res.end();
        }


        if (req.method !== "GET" && req.method !== "HEAD") {
            return sendText(res, 405, "Methode non autorisee.");
        }


        const filePath = resolveStaticFile(pathname);

        if (!filePath) {
            return sendText(res, 403, "Acces refuse.");
        }

        if (!existsSync(filePath)) {
            return sendText(res, 404, "Page introuvable.");
        }

        const fileBuffer = await readFile(filePath);

        res.writeHead(200, {
            "Content-Type": getContentType(filePath),
            "Cache-Control": "no-store"
        });

        if (req.method === "HEAD") {
            return res.end();
        }

        return res.end(fileBuffer);

    } catch (error) {

        console.error(error);
        return sendText(res, 500, "Erreur interne du serveur.");

    }

});


server.listen(PORT, "0.0.0.0", () => {
    console.log(`Hotel Belinga en ecoute sur http://localhost:${PORT} et http://127.0.0.1:${PORT}`);
});
