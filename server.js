import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStorage, getAllowedPrices, ADVANCE_PAYMENT_KIND } from "./db.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// PORT : Render fournit process.env.PORT — on l'écoute s'il existe.
const PORT = Number(process.env.PORT) || 3000;
const publicDir = __dirname;
const allowedStatuses = new Set(["Libre", "Occupée", "Réservée", "Nettoyage"]);


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
        { label: "advance_payment", get: row => Number(row.advance_payment || 0) },
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


// -------------------------------------------------------------
// Base de données : PostgreSQL si DATABASE_URL est défini (Render /
// Neon — les données persistent après chaque redéploiement), sinon
// SQLite locale (npm start, comportement inchangé).
// Schéma, seed des 52 chambres et migrations : voir db.js.
// -------------------------------------------------------------
const db = await createStorage();
await db.init();

if (process.argv.includes("--reset")) {
    await db.resetAll();
    console.log("Base reinitialisee : 52 chambres Libres, historique et journal des paiements vides.");
}


// (Schéma, migrations de colonnes et seed : gérés par db.js)


// (Insertion des chambres par défaut et migration legacy : gérées par db.js)


// (Seed initial et reset complet : gérés par db.js init() / resetAll())


// (Requêtes préparées remplacées par la couche db.js asynchrone)


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

    // Départ anticipé autorisé : le départ peut être avancé mais doit rester
    // strictement après l'arrivée (sinon 0 nuit facturable).
    if ((status === "Occupée" || status === "Réservée") && departureDate <= arrivalDate) {
        return { error: "La date de départ (même anticipée) doit être postérieure à la date d'arrivée." };
    }

    // Prix modifiable : doit faire partie des tarifs autorisés pour le type de chambre.
    // VIP : 70 000, 60 000 ou 50 000 | Standard : 45 000, 40 000, 35 000 ou 30 000 | Suites : leurs tarifs.
    let price = Number(currentRoom?.price || 0);
    if (body?.price !== undefined && body?.price !== null && String(body.price).trim() !== "") {
        const parsed = Number(String(body.price).replace(/[\s\u00A0]/g, ""));
        const allowed = getAllowedPrices(currentRoom?.type);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return { error: "Prix invalide." };
        }
        if (allowed.length > 0 && !allowed.includes(parsed)) {
            return { error: `Prix invalide pour une chambre ${currentRoom?.type}. Choix possibles : ${allowed.map(p => p.toLocaleString("fr-FR") + " FCFA").join(" ou ")}.` };
        }
        price = parsed;
    }

    // Paiement par avance (acompte) : montant entier >= 0, facultatif.
    // Une chambre liberee (Libre / Nettoyage) ne conserve pas d'avance :
    // l'acompte deja recu reste trace dans le journal des paiements.
    let advancePayment = Number(currentRoom?.advance_payment || 0);
    if (body?.advancePayment !== undefined && body?.advancePayment !== null && String(body.advancePayment).trim() !== "") {
        const parsedAdvance = Number(String(body.advancePayment).replace(/[\s\u00A0]/g, ""));
        if (!Number.isFinite(parsedAdvance) || parsedAdvance < 0) {
            return { error: "Montant de paiement par avance invalide (nombre positif attendu)." };
        }
        advancePayment = Math.round(parsedAdvance);
    }
    if (status === "Libre" || status === "Nettoyage") {
        advancePayment = 0;
    }

    const payload = {
        status,
        clientName: status === "Libre" || status === "Nettoyage" ? "" : clientName,
        arrivalDate: status === "Libre" || status === "Nettoyage" ? "" : arrivalDate,
        departureDate: status === "Libre" || status === "Nettoyage" ? "" : departureDate,
        price,
        advancePayment
    };

    if (currentRoom && currentRoom.status === payload.status && currentRoom.client_name === payload.clientName && currentRoom.arrival_date === payload.arrivalDate && currentRoom.departure_date === payload.departureDate && Number(currentRoom.price || 0) === Number(payload.price || 0) && Number(currentRoom.advance_payment || 0) === Number(payload.advancePayment || 0)) {
        return { payload, unchanged: true };
    }

    return { payload };

}


async function roomExportRows() {

    return db.getRooms();

}


async function historyExportRows(limit = 500) {

    return db.getHistory(limit);

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


async function loadPaymentsOrdered(limit = 500) {

    return db.getPayments(limit);

}


async function recordStayPayment({ roomNumber, roomType, clientName, arrivalDate, departureDate, pricePerNight, kind, note }) {

    const nights = calculateNights(arrivalDate, departureDate);
    const price = Number(pricePerNight || 0);
    const amount = nights > 0 && price > 0 ? nights * price : 0;

    if (nights <= 0 || amount <= 0) return null;

    await db.insertPayment({
        roomNumber,
        roomType: roomType || "",
        clientName: clientName || "",
        arrivalDate: arrivalDate || "",
        departureDate: departureDate || "",
        nights,
        pricePerNight: price,
        amount,
        kind: kind || "Séjour",
        note: note || ""
    });

    return { nights, price, amount };

}


// Enregistre une avance (acompte) dans le journal des paiements.
// Contrairement a un sejour, on ne l'annule pas si les nuits valent 0 :
// l'argent reellement recu doit rester trace.
async function recordAdvancePayment({ roomNumber, roomType, clientName, arrivalDate, departureDate, pricePerNight, amount, note }) {

    const paid = Math.round(Number(amount || 0));

    if (!Number.isFinite(paid) || paid <= 0) return null;

    const nights = calculateNights(arrivalDate, departureDate);
    const price = Number(pricePerNight || 0);

    await db.insertPayment({
        roomNumber,
        roomType: roomType || "",
        clientName: clientName || "",
        arrivalDate: arrivalDate || "",
        departureDate: departureDate || "",
        nights,
        pricePerNight: price,
        amount: paid,
        kind: ADVANCE_PAYMENT_KIND,
        note: note || ""
    });

    return { nights, price, amount: paid };

}


// Crée une facture municipée : ligne "Facture" (total) + ligne
// "Paiement par avance" (avance), le reste à payer restant calculable
// comme total - avance. Les deux lignes restent dans le journal des
// paiements même si la chambre est ensuite libérée.
async function createInvoicePayment({
    roomNumber,
    roomType,
    clientName,
    arrivalDate,
    departureDate,
    pricePerNight,
    total,
    advance,
    receptionist,
    notePrefix = ""
}) {

    const nights = calculateNights(arrivalDate, departureDate);
    const price = Number(pricePerNight || 0);
    const totalAmount = Math.round(Number(total || 0));
    const advanceAmount = Math.round(Number(advance || 0));

    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
        throw new Error("Montant total de la facture invalide (nombre > 0 attendu).");
    }

    if (!Number.isFinite(advanceAmount) || advanceAmount < 0) {
        throw new Error("Montant de l'avance invalide (nombre >= 0 attendu).");
    }

    if (advanceAmount > totalAmount) {
        throw new Error("L'avance ne peut pas dépasser le montant total de la facture.");
    }

    const note = [notePrefix, `Réceptionniste : ${receptionist || "-"}`]
        .filter(Boolean)
        .join(" — ")
        .trim();

    const invoiceNote = note ? `Facture — ${note}` : "Facture";
    const advanceNote = note ? `Avance (${note})` : "Paiement par avance";

    await db.insertPayment({
        roomNumber,
        roomType: roomType || "",
        clientName: clientName || "",
        arrivalDate: arrivalDate || "",
        departureDate: departureDate || "",
        nights,
        pricePerNight: price,
        amount: totalAmount,
        kind: "Facture",
        note: invoiceNote
    });

    let advanceRecord = null;
    if (advanceAmount > 0) {
        advanceRecord = await db.insertPayment({
            roomNumber,
            roomType: roomType || "",
            clientName: clientName || "",
            arrivalDate: arrivalDate || "",
            departureDate: departureDate || "",
            nights,
            pricePerNight: price,
            amount: advanceAmount,
            kind: ADVANCE_PAYMENT_KIND,
            note: advanceNote
        });
    }

    // Report de l'avance sur la chambre : la fiche et le reçu affichent
    // l'avance réellement versée dès la création de la facture.
    if (advanceAmount > 0 && Number(roomNumber) > 0) {
        await db.reportAdvance(roomNumber, advanceAmount);
    }

    const created_at = new Date().toISOString();
    const invoiceRow = {
        id: null,
        room_number: roomNumber,
        room_type: roomType || "",
        client_name: clientName || "",
        arrival_date: arrivalDate || "",
        departure_date: departureDate || "",
        nights,
        price_per_night: price,
        amount: totalAmount,
        kind: "Facture",
        note: invoiceNote,
        created_at
    };

    return {
        invoice: {
            ...invoiceRow,
            total: totalAmount,
            advance: advanceAmount,
            balance: totalAmount - advanceAmount
        },
        advance_payment: advanceRecord
            ? {
                id: advanceRecord.lastInsertRowid,
                room_number: roomNumber,
                amount: advanceAmount,
                note: advanceNote,
                created_at
            }
            : null
    };

}


// Historique des avances enregistrees pour une chambre (utilise sur la facture).
async function loadRoomAdvancePayments(roomNumber, limit = 20) {

    return db.getRoomAdvancePayments(roomNumber, limit);

}




async function handleExport(res, type) {

    if (type === "rooms") {
        const csv = toCsv(await roomExportRows(), roomColumns());
        return sendCsv(res, "hotel-belinga-chambres.csv", csv);
    }

    if (type === "history") {
        const csv = toCsv(await historyExportRows(), historyColumns());
        return sendCsv(res, "hotel-belinga-historique.csv", csv);
    }

    if (type === "payments") {
        const rows = await loadPaymentsOrdered(2000);
        const csv = toCsv(rows, [
            { label: "ID", get: row => row.id },
            { label: "Chambre", get: row => row.room_number },
            { label: "Type", get: row => row.room_type },
            { label: "Client", get: row => row.client_name },
            { label: "Arrivée", get: row => row.arrival_date },
            { label: "Départ", get: row => row.departure_date },
            { label: "Nuits", get: row => row.nights },
            { label: "Prix / nuit", get: row => row.price_per_night },
            { label: "Montant", get: row => row.amount },
            { label: "Type de paiement", get: row => row.kind },
            { label: "Note", get: row => row.note },
            { label: "Enregistré le", get: row => row.created_at }
        ]);
        return sendCsv(res, "hotel-belinga-paiements.csv", csv);
    }

    return sendText(res, 404, "Export introuvable.");

}


// Création d'une facture via POST /api/payments.
// Le body JSON attend : roomNumber, total, advance (facultatif), note (facultatif),
// receptionist (facultatif). Si roomNumber est fourni, on utilise la chambre pour
// remplir type, client, dates et prix/nuit ; sinon ces champs doivent être fournis.
async function createInvoiceRoute(req, res) {

    const body = await readJsonBody(req);

    const roomNumber = Number(body?.roomNumber);
    const total = body?.total;
    const advance = body?.advance ?? 0;
    const note = typeof body?.note === "string" ? body.note.trim() : "";
    const receptionist = typeof body?.receptionist === "string" ? body.receptionist.trim() : "";

    if (!Number.isInteger(roomNumber) || roomNumber <= 0) {
        return sendText(res, 400, "Champs obligatoires : roomNumber (numero de chambre entier > 0).");
    }

    if (total === undefined || total === null || String(total).trim() === "") {
        return sendText(res, 400, "Champs obligatoires : total (montant total de la facture > 0).");
    }

    const totalAmount = Math.round(Number(total));
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
        return sendText(res, 400, "Champs invalides : total doit être un nombre > 0.");
    }

    const advanceAmount = Math.round(Number(advance || 0));
    if (!Number.isFinite(advanceAmount) || advanceAmount < 0) {
        return sendText(res, 400, "Champs invalides : advance doit être un nombre >= 0.");
    }

    if (advanceAmount > totalAmount) {
        return sendText(res, 400, "L'avance ne peut pas dépasser le montant total de la facture.");
    }

    let room = null;
    if (roomNumber) {
        room = await db.getRoom(roomNumber);
        if (!room) {
            return sendText(res, 404, "Chambre introuvable : " + roomNumber + ".");
        }
    }

    const roomType = room ? room.type : (body?.roomType || "");
    const clientName = room ? room.client_name : (body?.clientName || "");
    const arrivalDate = room ? room.arrival_date : (body?.arrivalDate || "");
    const departureDate = room ? room.departure_date : (body?.departureDate || "");
    const pricePerNight = room ? room.price : (Number(body?.pricePerNight) || 0);

    try {
        const result = await createInvoicePayment({
            roomNumber,
            roomType,
            clientName,
            arrivalDate,
            departureDate,
            pricePerNight,
            total: totalAmount,
            advance: advanceAmount,
            receptionist,
            notePrefix: note
        });

        return sendJson(res, 201, result);
    } catch (error) {
        console.error("Facture non creee :", error.message);
        return sendText(res, 400, error.message || "Impossible de creer la facture.");
    }

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

            const rooms = await db.getRooms();
            return sendJson(res, 200, rooms.map(attachRoomMetrics));

        }


        if (req.method === "GET" && pathname === "/api/history") {

            const limit = parsePositiveInt(url.searchParams.get("limit"), 100);
            return sendJson(res, 200, await db.getHistory(limit));

        }


        if (req.method === "GET" && pathname.startsWith("/api/rooms/") && pathname.endsWith("/history")) {

            const parts = pathname.split("/");
            const number = Number.parseInt(parts[3], 10);

            if (!Number.isInteger(number)) {
                return sendText(res, 400, "Numero de chambre invalide.");
            }

            const limit = parsePositiveInt(url.searchParams.get("limit"), 20);
            return sendJson(res, 200, await db.getRoomHistory(number, limit));

        }


        if (req.method === "GET" && pathname === "/api/exports/rooms.csv") {
            return await handleExport(res, "rooms");
        }


        // Export CSV d'UNE SEULE chambre : /api/exports/rooms/12.csv
        if (req.method === "GET" && pathname.startsWith("/api/exports/rooms/") && pathname.endsWith(".csv")) {
            const number = Number.parseInt(pathname.split("/").pop().replace(".csv", ""), 10);

            if (!Number.isInteger(number)) {
                return sendText(res, 400, "Numero de chambre invalide.");
            }

            const room = await db.getRoom(number);

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

            const room = await db.getRoom(number);

            if (!room) {
                return sendText(res, 404, "Chambre introuvable.");
            }

            const nights = calculateNights(room.arrival_date, room.departure_date);
            const total = nights > 0 ? nights * Number(room.price || 0) : 0;
            // Avance du reçu = la plus élevée entre l'avance connue de la
            // chambre et la somme des avances versées dans le journal des
            // paiements (chaque facture avec acompte y inscrit une ligne).
            const journalAdvances = await db.sumAdvances(number, ADVANCE_PAYMENT_KIND);
            const advance = Math.max(
                Number(room.advance_payment || 0),
                Number(journalAdvances || 0)
            );
            const history = await db.getRoomHistory(number, 20);

            return sendJson(res, 200, {
                room,
                nights,
                total,
                advance,
                balance: total - advance,
                advance_payments: await loadRoomAdvancePayments(number, 20),
                history,
                generated_at: new Date().toISOString()
            });
        }


        if (req.method === "GET" && pathname === "/api/exports/history.csv") {
            return await handleExport(res, "history");
        }


        // Journal des paiements enregistrés (ne disparaît jamais quand la
        // chambre passe à Libre : chaque séjour / modification y reste tracé).
        if (req.method === "GET" && pathname === "/api/payments") {
            const limit = parsePositiveInt(url.searchParams.get("limit"), 500);
            return sendJson(res, 200, await loadPaymentsOrdered(limit));
        }


        if (req.method === "GET" && pathname === "/api/exports/payments.csv") {
            return await handleExport(res, "payments");
        }


        // Journal des paiements verrouillé : aucune suppression ligne par ligne
        // depuis le site. Il ne s'efface qu'avec un reset complet
        // (npm run reset / reset:force / reset:server -> reset.js).
        if (req.method === "DELETE" && pathname.startsWith("/api/payments/")) {
            return sendText(res, 403, "Journal des paiements verrouillé : utilisez le reset complet (npm run reset) pour l'effacer.");
        }

        // Création d'une facture (total + avance + reste à payer).
        // Deux lignes sont enregistrées dans le journal : une "Facture" et,
        // si l'avance > 0, un "Paiement par avance". Le reste à payer reste
        // toujours calculable côté client via total - avance.
        if (req.method === "POST" && pathname === "/api/payments") {
            return await createInvoiceRoute(req, res);
        }


        if (req.method === "PUT" && pathname.startsWith("/api/rooms/")) {

            const number = Number.parseInt(pathname.split("/").pop(), 10);

            if (!Number.isInteger(number)) {
                return sendText(res, 400, "Numero de chambre invalide.");
            }

            const currentRoom = await db.getRoom(number);

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
                await db.updateRoom(number, payload);
                await db.insertHistory({
                    roomNumber: number,
                    previousStatus: currentRoom.status,
                    newStatus: payload.status,
                    clientName: payload.clientName,
                    arrivalDate: payload.arrivalDate,
                    departureDate: payload.departureDate
                });

                // --- Paiement par avance : chaque montant saisi ou modifie
                // est trace dans le journal des paiements (jamais efface). ---
                const previousAdvance = Number(currentRoom.advance_payment || 0);
                const nextAdvance = Number(payload.advancePayment || 0);

                if (nextAdvance !== previousAdvance && nextAdvance > 0) {
                    await recordAdvancePayment({
                        roomNumber: number,
                        roomType: currentRoom.type,
                        clientName: payload.clientName || currentRoom.client_name,
                        arrivalDate: payload.arrivalDate || currentRoom.arrival_date,
                        departureDate: payload.departureDate || currentRoom.departure_date,
                        pricePerNight: payload.price,
                        amount: nextAdvance,
                        note: `Avance ${previousAdvance.toLocaleString("fr-FR")} → ${nextAdvance.toLocaleString("fr-FR")} FCFA`
                    });
                }

                // --- Journal des paiements (reste enregistré même après un
                // départ anticipé ou un passage à Libre) ---
                const wasStay =
                    (currentRoom.status === "Occupée" || currentRoom.status === "Réservée") &&
                    currentRoom.client_name && currentRoom.arrival_date && currentRoom.departure_date;
                const isStay =
                    (payload.status === "Occupée" || payload.status === "Réservée") &&
                    payload.clientName && payload.arrivalDate && payload.departureDate;

                if (wasStay || isStay) {

                    const oldNights = calculateNights(currentRoom.arrival_date, currentRoom.departure_date);
                    const oldAmount = oldNights > 0 ? oldNights * Number(currentRoom.price || 0) : 0;
                    const newNights = calculateNights(payload.arrivalDate, payload.departureDate);
                    const newAmount = newNights > 0 ? newNights * Number(payload.price || 0) : 0;

                    const leavingRoom = payload.status === "Libre" || payload.status === "Nettoyage";

                    if (leavingRoom && wasStay) {
                        // Check-out (normal ou anticipé) : on fige le montant final.
                        // Note : pour Libre/Nettoyage le payload a dates vides,
                        // on utilise donc les dates du séjour en cours (+ le départ
                        // anticipé déjà enregistré s'il y en a un).
                        await recordStayPayment({
                            roomNumber: number,
                            roomType: currentRoom.type,
                            clientName: currentRoom.client_name,
                            arrivalDate: currentRoom.arrival_date,
                            departureDate: currentRoom.departure_date,
                            pricePerNight: currentRoom.price,
                            kind: "Check-out",
                            note: `Séjour du ${currentRoom.arrival_date} au ${currentRoom.departure_date}`
                        });
                    } else if (isStay) {
                        const datesChanged =
                            currentRoom.arrival_date !== payload.arrivalDate ||
                            currentRoom.departure_date !== payload.departureDate;
                        const priceChanged = Number(currentRoom.price || 0) !== Number(payload.price || 0);

                        if (!wasStay) {
                            // Nouvelle réservation / occupation.
                            await recordStayPayment({
                                roomNumber: number,
                                roomType: currentRoom.type,
                                clientName: payload.clientName,
                                arrivalDate: payload.arrivalDate,
                                departureDate: payload.departureDate,
                                pricePerNight: payload.price,
                                kind: "Réservation",
                                note: `Enregistré à ${payload.status}`
                            });
                        } else if ((datesChanged || priceChanged) && (oldAmount !== newAmount)) {
                            // Modification en cours de séjour (ex : départ anticipé
                            // sans libérer la chambre) : on trace avant/après.
                            const early = payload.departureDate && currentRoom.departure_date &&
                                payload.departureDate < currentRoom.departure_date;
                            await recordStayPayment({
                                roomNumber: number,
                                roomType: currentRoom.type,
                                clientName: payload.clientName,
                                arrivalDate: payload.arrivalDate,
                                departureDate: payload.departureDate,
                                pricePerNight: payload.price,
                                kind: early ? "Modification (départ anticipé)" : "Modification séjour",
                                note: `${oldNights} nuit(s) x ${Number(currentRoom.price || 0).toLocaleString("fr-FR")} = ${oldAmount.toLocaleString("fr-FR")} FCFA → ${newNights} nuit(s) x ${Number(payload.price || 0).toLocaleString("fr-FR")} = ${newAmount.toLocaleString("fr-FR")} FCFA`
                            });
                        }
                    }
                }
            }

            return sendJson(res, 200, await db.getRoom(number));

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


// Arrêt propre : la connexion à la base est fermée proprement
// (checkpoint SQLite / fermeture du pool PostgreSQL).
let isShuttingDown = false;

async function shutdown(signal) {

    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n${signal} reçu : sauvegarde de la base et arret du serveur...`);

    try {
        await db.close();
        console.log("Base fermee proprement.");
    } catch (error) {
        console.error("Fermeture de la base impossible :", error.message);
    }

    server.close(() => process.exit(0));

    // Sécurité : si le serveur met trop de temps à se fermer.
    setTimeout(() => process.exit(0), 3000).unref();

}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
