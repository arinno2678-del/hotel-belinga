// =====================================================
// RESET COMPLET (CLI uniquement, PAS d'interface web)
// Usage :
//   node reset.js            -> demande confirmation "OUI"
//   node reset.js --force    -> reset sans demander
// Deux modes :
//   - DATABASE_URL défini (PostgreSQL : Render / Neon) :
//     les tables sont vidées directement dans la base distante.
//   - Sinon (SQLite locale) : suppression des fichiers
//     hotel-belinga.sqlite* (le serveur recrée la base au démarrage).
// =====================================================

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const databaseFiles = [
    path.join(__dirname, "hotel-belinga.sqlite"),
    path.join(__dirname, "hotel-belinga.sqlite-shm"),
    path.join(__dirname, "hotel-belinga.sqlite-wal")
];

const force = process.argv.includes("--force");

if (!force) {
    console.log("!!! RESET COMPLET DE L'HOTEL BELINGA !!!");
    console.log("Toutes les chambres repasseront a Libre,");
    console.log("tous les clients, tout l'historique");
    console.log("et tout le journal des paiements seront supprimes.");
    console.log("");

    const rl = createInterface({ input, output });
    const answer = (await rl.question('Tapez OUI (en majuscules) pour confirmer : ')).trim();
    rl.close();

    if (answer !== "OUI") {
        console.log("Reset annule. Rien n'a ete supprime.");
        process.exit(0);
    }
}

// --- Mode PostgreSQL (Render / Neon) : reset direct dans la base ---
if (process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim()) {
    console.log("");
    console.log("Mode PostgreSQL detecte (DATABASE_URL) : reset dans la base distante...");

    try {
        const { createStorage } = await import("./db.js");
        const storage = await createStorage();
        await storage.init();
        await storage.resetAll();
        await storage.close();
        console.log("");
        console.log("Base PostgreSQL reinitialisee : 52 chambres Libres,");
        console.log("historique et journal des paiements vides.");
        process.exit(0);
    } catch (error) {
        console.error("Reset PostgreSQL impossible :", error.message);
        process.exit(1);
    }
}

// --- Mode SQLite local : suppression des fichiers ---
let deleted = 0;

for (const file of databaseFiles) {
    try {
        if (existsSync(file)) {
            await unlink(file);
            deleted += 1;
            console.log("Supprime : " + path.basename(file));
        }
    } catch (error) {
        console.error("Impossible de supprimer " + file + " : " + error.message);
        console.error("Astuce : arretez d'abord le serveur (Ctrl+C dans le terminal npm start), puis relancez ce reset.");
        process.exit(1);
    }
}

console.log("");
console.log("Base effacee (" + deleted + " fichier(s)).");
console.log("Relancez le serveur avec : npm start");
console.log("Il recreera automatiquement 52 chambres Libres.");
