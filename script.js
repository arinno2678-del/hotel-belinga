// ==========================================
// HOTEL MANAGER
// NHA CREATION © 2026
// ==========================================


// --------------------------
// DATE
// --------------------------

const currentDate = document.getElementById("currentDate");

const today = new Date();

currentDate.textContent = today.toLocaleDateString("fr-FR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
});


// --------------------------
// ELEMENTS
// --------------------------

const roomsGrid = document.getElementById("roomsGrid");

const searchRoom = document.getElementById("searchRoom");

const filterType = document.getElementById("filterType");

const filterStatus = document.getElementById("filterStatus");

const pageTitle = document.getElementById("pageTitle");

const pageDescription = document.getElementById("pageDescription");

const navButtons = document.querySelectorAll(".nav-btn[data-view]");

const appSections = document.querySelectorAll(".app-section[data-view]");

const syncBadge = document.getElementById("syncBadge");

const alertBanner = document.getElementById("alertBanner");

const alertBannerText = document.getElementById("alertBannerText");

const refreshRoomsButton = document.getElementById("refreshRooms");

const exportRoomsButton = document.getElementById("exportRoomsCsv");

const exportSingleRoomButton = document.getElementById("exportSingleRoomCsv");

const printReceiptButton = document.getElementById("printReceiptBtn");

const exportHistoryButton = document.getElementById("exportHistoryCsv");

const profileButton = document.getElementById("profileButton");

const totalRoomsEl = document.getElementById("totalRooms");

const availableRoomsEl = document.getElementById("availableRooms");

const occupiedRoomsEl = document.getElementById("occupiedRooms");

const reservedRoomsEl = document.getElementById("reservedRooms");

const arrivalsCountEl = document.getElementById("arrivalsCount");

const departuresCountEl = document.getElementById("departuresCount");

const historyCountEl = document.getElementById("historyCount");

const dashboardArrivals = document.getElementById("dashboardArrivals");

const dashboardDepartures = document.getElementById("dashboardDepartures");

const dashboardHistory = document.getElementById("dashboardHistory");

const planningList = document.getElementById("planningList");

const clientsList = document.getElementById("clientsList");

const reservationsList = document.getElementById("reservationsList");

const paymentsList = document.getElementById("paymentsList");

const paymentsTotal = document.getElementById("paymentsTotal");

const paymentsRecordedTotal = document.getElementById("paymentsRecordedTotal");

const paymentsHistoryList = document.getElementById("paymentsHistoryList");

const paymentsHistoryCount = document.getElementById("paymentsHistoryCount");

const exportPaymentsButton = document.getElementById("exportPaymentsCsv");

const statisticsHistory = document.getElementById("statisticsHistory");

const occupancyRateEl = document.getElementById("occupancyRate");

const activeClientsEl = document.getElementById("activeClients");

const activeReservationsEl = document.getElementById("activeReservations");

const upcomingDeparturesEl = document.getElementById("upcomingDepartures");


// MODAL

const roomModal = document.getElementById("roomModal");

const closeModal = document.getElementById("closeModal");

const statusButtons = document.querySelectorAll(".status-btn");

const modalRoomNumber = document.getElementById("modalRoomNumber");

const modalRoomType = document.getElementById("modalRoomType");

const modalStatus = document.getElementById("modalStatus");

const modalPrice = document.getElementById("modalPrice");

const modalPriceSelect = document.getElementById("modalPriceSelect");

const modalUpdatedAt = document.getElementById("modalUpdatedAt");

const modalClientName = document.getElementById("modalClientName");

const modalArrivalDate = document.getElementById("modalArrivalDate");

const modalDepartureDate = document.getElementById("modalDepartureDate");

const modalHelperText = document.getElementById("modalHelperText");

const modalReceptionist = document.getElementById("modalReceptionist");

const RECEPTIONIST_STORAGE_KEY = "hotelBelingaReceptionist";

function getReceptionistName() {
    const typed = modalReceptionist && typeof modalReceptionist.value === "string"
        ? modalReceptionist.value.trim()
        : "";
    if (typed) return typed;
    try {
        return (localStorage.getItem(RECEPTIONIST_STORAGE_KEY) || "").trim();
    } catch (error) {
        return "";
    }
}

function rememberReceptionistName() {
    try {
        const typed = modalReceptionist && typeof modalReceptionist.value === "string"
            ? modalReceptionist.value.trim().slice(0, 120)
            : "";
        if (typed) {
            localStorage.setItem(RECEPTIONIST_STORAGE_KEY, typed);
        }
    } catch (error) {
        // Stockage local indisponible : on ignore, la facture utilisera le champ saisi.
    }
}

if (modalReceptionist) {
    try {
        const saved = (localStorage.getItem(RECEPTIONIST_STORAGE_KEY) || "").trim();
        if (saved) modalReceptionist.value = saved;
    } catch (error) {
        // Stockage local indisponible : le champ reste vide.
    }
    modalReceptionist.addEventListener("input", rememberReceptionistName);
}

const saveRoomChangesBtn = document.getElementById("saveRoomChangesBtn");

const earlyCheckoutBtn = document.getElementById("earlyCheckoutBtn");

const modalHistoryList = document.getElementById("modalHistoryList");

const modalHistoryCount = document.getElementById("modalHistoryCount");


// --------------------------
// ETAT
// --------------------------

let rooms = [];

let historyEntries = [];

let selectedRoom = null;

let isSaving = false;

let isRefreshing = false;

let currentView = "dashboard";

const statusClassMap = {
    "Libre": "status-libre",
    "Occupée": "status-occupée",
    "Réservée": "status-réservée",
    "Nettoyage": "status-nettoyage"
};

const viewMeta = {
    dashboard: {
        title: "Tableau de bord",
        description: "Vue générale et activité en temps réel"
    },
    rooms: {
        title: "Chambres",
        description: "Gestion des chambres, clients et statuts"
    },
    planning: {
        title: "Planning",
        description: "Arrivées et départs programmés"
    },
    clients: {
        title: "Clients",
        description: "Clients actuellement enregistrés"
    },
    reservations: {
        title: "Réservations",
        description: "Chambres occupées et réservées"
    },
    payments: {
        title: "Paiements",
        description: "Montants estimés des séjours actifs"
    },
    statistics: {
        title: "Statistiques",
        description: "Exports et historique des changements"
    }
};


function escapeHtml(value) {

    return String(value ?? "").replace(/[&<>"']/g, character => {
        switch (character) {
            case "&":
                return "&amp;";
            case "<":
                return "&lt;";
            case ">":
                return "&gt;";
            case "\"":
                return "&quot;";
            case "'":
                return "&#39;";
            default:
                return character;
        }
    });

}


function normalizeText(value) {

    return String(value ?? "").trim().toLowerCase();

}


function formatRoomNumber(number) {

    return String(number).padStart(2, "0");

}


function formatMoney(amount) {

    return `${Number(amount || 0).toLocaleString("fr-FR")} FCFA`;

}


function getAllowedPrices(type) {
    const normalized = String(type || "");
    if (normalized === "VIP") return [70000, 60000, 50000];
    if (normalized === "Standard") return [45000, 40000, 35000, 30000];
    if (normalized === "Suite Junior") return [200000, 150000];
    if (normalized === "Suite Ministérielle") return [300000, 250000];
    if (normalized === "Suite Nuptiale") return [350000];
    if (normalized === "Suite") return [350000, 300000, 250000, 200000, 150000];
    return [];
}


function refreshModalPriceOptions(room) {
    if (!modalPriceSelect) return;
    const allowed = getAllowedPrices(room?.type);
    const current = Number(room?.price || 0);
    const options = allowed.length > 0 ? allowed : (current > 0 ? [current] : []);
    modalPriceSelect.innerHTML = options
        .map(price => `<option value="${price}"${Number(price) === current ? " selected" : ""}>${formatMoney(price)}</option>`)
        .join("");
    modalPriceSelect.disabled = options.length <= 1;
    modalPriceSelect.onchange = () => {
        if (modalPrice) {
            modalPrice.textContent = `${formatMoney(modalPriceSelect.value)} / nuit`;
        }
    };
}


function formatDateOnly(value) {

    if (!value) {
        return "-";
    }

    const parts = String(value).split("-");

    if (parts.length !== 3) {
        return String(value);
    }

    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;

}


function getDateValue(value) {

    if (!value) {
        return Number.POSITIVE_INFINITY;
    }

    const date = new Date(`${value}T12:00:00`);

    return Number.isNaN(date.getTime()) ? Number.POSITIVE_INFINITY : date.getTime();

}


function formatDateTime(value) {

    if (!value) {
        return "-";
    }

    const normalized = String(value).replace(" ", "T");
    const date = new Date(normalized.endsWith("Z") ? normalized : `${normalized}Z`);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });

}


function getLocalDateKey(date = new Date()) {

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;

}


function toInputDate(date) {

    return getLocalDateKey(date instanceof Date ? date : new Date(date));

}


function calculateNights(arrivalDate, departureDate) {

    const start = getDateValue(arrivalDate);
    const end = getDateValue(departureDate);

    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return 1;
    }

    const nights = Math.round((end - start) / 86400000);

    return Math.max(1, nights);

}


function isActiveStay(room) {

    return (
        (room.status === "Occupée" || room.status === "Réservée") &&
        normalizeText(room.client_name)
    );

}


function isUpcomingDeparture(room) {

    const todayKey = getLocalDateKey();
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() + 7);
    const limitKey = getLocalDateKey(limitDate);
    const roomKey = String(room.departure_date || "");

    return roomKey >= todayKey && roomKey <= limitKey;

}


function getStatusBadge(status) {

    const className = statusClassMap[status] || "status-libre";
    return `<span class="status-pill ${className}">${escapeHtml(status)}</span>`;

}


function createEmptyState(message) {

    return `<div class="section-empty">${escapeHtml(message)}</div>`;

}


function renderCompactList(container, items, emptyMessage, renderItem) {

    if (!container) {
        return;
    }

    if (!items.length) {
        container.innerHTML = createEmptyState(emptyMessage);
        return;
    }

    container.innerHTML = items.map(renderItem).join("");

}


function renderTableSection(container, columns, rows, emptyMessage) {

    if (!container) {
        return;
    }

    if (!rows.length) {
        container.innerHTML = createEmptyState(emptyMessage);
        return;
    }

    const thead = columns.map(column => `<th>${escapeHtml(column.label)}</th>`).join("");
    const tbody = rows.map(row => {
        const cells = columns.map(column => `<td>${column.render(row)}</td>`).join("");
        return `<tr>${cells}</tr>`;
    }).join("");

    container.innerHTML = `
        <div class="table-shell">
            <table class="data-table">
                <thead>
                    <tr>${thead}</tr>
                </thead>
                <tbody>
                    ${tbody}
                </tbody>
            </table>
        </div>
    `;

}


function updateHeaderForView(view) {

    const meta = viewMeta[view] || viewMeta.dashboard;

    if (pageTitle) {
        pageTitle.textContent = meta.title;
    }

    if (pageDescription) {
        pageDescription.textContent = meta.description;
    }

    document.title = `${meta.title} | Hotel Manager`;

}


function setActiveView(view) {

    currentView = view;

    navButtons.forEach(button => {
        button.classList.toggle("active", button.dataset.view === view);
    });

    appSections.forEach(section => {
        section.classList.toggle("active", section.dataset.view === view);
    });

    updateHeaderForView(view);

}


// Compatible http://localhost:3000 ET http://127.0.0.1:3000 :
// quand la page est servie en http, on appelle l'API sur la meme origine
// (pas de CORS). En fichier local, on retombe sur 127.0.0.1:3000.
const API_BASE = window.location.protocol.startsWith("http")
    ? window.location.origin
    : "http://127.0.0.1:3000";

const APP_VERSION = "v7-refresh-fix";

console.log("[Hotel Belinga " + APP_VERSION + "] API_BASE =", API_BASE);


function apiUrl(path) {

    return API_BASE + path;

}


function downloadFile(url, filename) {

    const anchor = document.createElement("a");
    anchor.href = apiUrl(url);
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

}


async function printRoomReceipt(roomNumber) {

    try {

        const response = await fetch(apiUrl("/api/receipts/" + roomNumber), { cache: "no-store" });

        if (!response.ok) {
            alert("Impossible de charger le reçu de la chambre " + roomNumber + ".");
            return;
        }

        const data = await response.json();
        const room = data.room || {};
        const nights = Number(data.nights || 0);
        const total = Number(data.total || 0);
        const generatedAt = data.generated_at ? formatDateTime(data.generated_at) : formatDateTime(new Date().toISOString());
        const paddedNumber = formatRoomNumber(room.number || roomNumber);
        const clientName = room.client_name || "-";
        const arrival = formatDateOnly(room.arrival_date);
        const departure = formatDateOnly(room.departure_date);

        const printWindow = window.open("", "_blank", "width=800,height=900");

        if (!printWindow) {
            alert("Autorisez les fenêtres pop-up pour imprimer le reçu.");
            return;
        }

        const receptionistName = getReceptionistName();
        rememberReceptionistName();

        printWindow.document.write(
            "<!DOCTYPE html><html lang=\"fr\"><head><meta charset=\"UTF-8\">" +
            "<title>Recu - Chambre " + paddedNumber + "</title>" +
            "<style>" +
            "body{font-family:Arial,sans-serif;margin:40px;color:#111;}" +
            ".header{text-align:center;border-bottom:3px solid #111;padding-bottom:15px;margin-bottom:20px;}" +
            ".header h1{margin:0;font-size:26px;letter-spacing:1px;}" +
            ".header p{margin:4px 0;color:#555;}" +
            ".box{border:1px solid #ccc;border-radius:10px;padding:16px;margin:12px 0;}" +
            ".row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px dashed #ddd;}" +
            ".row:last-child{border-bottom:none;}" +
            ".total{font-size:20px;font-weight:bold;text-align:right;margin-top:10px;}" +
            ".signatures{display:flex;justify-content:space-between;gap:30px;margin-top:45px;}" +
            ".sign-box{flex:1;text-align:center;}" +
            ".sign-box .label{font-size:13px;color:#444;margin-bottom:45px;}" +
            ".sign-box .name{font-size:16px;font-weight:bold;}" +
            ".sign-box .line{border-top:1px solid #111;margin-top:6px;padding-top:6px;font-size:12px;color:#555;}" +
            ".footer{text-align:center;color:#666;font-size:12px;margin-top:25px;}" +
            "@media print{.no-print{display:none;}}" +
            "</style></head><body>" +
            "<div class=\"header\"><h1>HOTEL BELINGA</h1><p>Recu de sejour — Chambre " + escapeHtml(paddedNumber) + "</p><p>Edite le " + escapeHtml(generatedAt) + "</p></div>" +
            "<div class=\"box\">" +
            "<div class=\"row\"><span><strong>Chambre</strong></span><span>" + escapeHtml(paddedNumber) + " (" + escapeHtml(room.type || "-") + ")</span></div>" +
            "<div class=\"row\"><span><strong>Client</strong></span><span>" + escapeHtml(clientName) + "</span></div>" +
            "<div class=\"row\"><span><strong>Statut</strong></span><span>" + escapeHtml(room.status || "-") + "</span></div>" +
            "<div class=\"row\"><span><strong>Arrivee</strong></span><span>" + escapeHtml(arrival) + "</span></div>" +
            "<div class=\"row\"><span><strong>Depart</strong></span><span>" + escapeHtml(departure) + "</span></div>" +
            "<div class=\"row\"><span><strong>Nuits</strong></span><span>" + String(nights) + "</span></div>" +
            "<div class=\"row\"><span><strong>Prix / nuit</strong></span><span>" + escapeHtml(formatMoney(room.price)) + "</span></div>" +
            "</div>" +
            "<div class=\"total\">Total : " + escapeHtml(formatMoney(total)) + "</div>" +
            "<div class=\"signatures\">" +
            "<div class=\"sign-box\"><div class=\"label\">Signature du client</div><div class=\"name\">" + escapeHtml(clientName) + "</div><div class=\"line\">Signature</div></div>" +
            "<div class=\"sign-box\"><div class=\"label\">Le réceptionniste</div><div class=\"name\">" + escapeHtml(receptionistName || "................................") + "</div><div class=\"line\">Nom & signature</div></div>" +
            "</div>" +
            "<div class=\"footer\"><p>Merci de votre sejour a l'Hotel Belinga.</p><p>Document genere automatiquement — NHA CREATION (c) 2026</p></div>" +
            "<div class=\"no-print\" style=\"text-align:center;margin-top:20px;\"><button onclick=\"window.print()\" style=\"padding:10px 20px;font-size:15px;cursor:pointer;\">Imprimer / Enregistrer en PDF</button></div>" +
            "</body></html>"
        );

        printWindow.document.close();
        printWindow.focus();

    } catch (error) {

        console.error(error);
        alert("Erreur lors de l'impression du reçu.");

    }

}


function updateModalHelper(status) {

    if (!modalHelperText) return;

    if (status === "Occupée" || status === "Réservée") {
        modalHelperText.textContent = "Le nom du client et les dates sont obligatoires pour une chambre occupée ou réservée.";
        return;
    }

    modalHelperText.textContent = "Les champs client et dates seront vidés si la chambre passe en libre ou en nettoyage.";

}


function renderModalHistory(roomNumber) {

    loadModalHistory(roomNumber);

}


async function loadModalHistory(roomNumber) {

    if (!modalHistoryList || !modalHistoryCount) {
        return;
    }

    try {

        const response = await fetch(apiUrl("/api/rooms/" + roomNumber + "/history?limit=20"), { cache: "no-store" });

        if (response.ok) {
            paintModalHistory(await response.json());
            return;
        }

    } catch (error) {

        console.warn("Historique chambre non charge :", error);

    }

    paintModalHistory(
        historyEntries
            .filter(entry => Number(entry.room_number) === Number(roomNumber))
            .slice(0, 8)
    );

}


function paintModalHistory(entries) {

    if (!modalHistoryList || !modalHistoryCount) {
        return;
    }

    const safeEntries = Array.isArray(entries) ? entries : [];

    modalHistoryCount.textContent = safeEntries.length;

    renderCompactList(
        modalHistoryList,
        safeEntries,
        "Aucun historique pour cette chambre.",
        entry => {
            const transition = `${escapeHtml(entry.previous_status || "Aucun")} → ${escapeHtml(entry.new_status)}`;
            const period = entry.arrival_date || entry.departure_date
                ? `${formatDateOnly(entry.arrival_date)} → ${formatDateOnly(entry.departure_date)}`
                : "-";

            return `
                <article class="history-entry">
                    <div class="history-entry-head">
                        <strong>Chambre ${formatRoomNumber(entry.room_number)}</strong>
                        <span>${formatDateTime(entry.changed_at)}</span>
                    </div>
                    <p>${transition}</p>
                    <small>${escapeHtml(entry.client_name || "Aucun client")}</small>
                    <small>Période : ${escapeHtml(period)}</small>
                </article>
            `;
        }
    );

}


function renderAllViews() {

    updateStats();
    renderDashboard();
    renderRooms();
    renderPlanning();
    renderClients();
    renderReservations();
    renderPayments();
    renderStatistics();

    if (selectedRoom) {
        loadModalHistory(selectedRoom.number);
    }

}


function formatSyncTime(date = new Date()) {

    return date.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit"
    });

}


function formatUpdatedAt(value) {

    if (!value) {
        return "Jamais";
    }

    const normalized = value.replace(" ", "T") + "Z";
    const date = new Date(normalized);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });

}


function setSyncBadge(message, isError = false) {

    if (!syncBadge) return;

    syncBadge.textContent = message;
    syncBadge.classList.toggle("error", isError);

    // Bannière visible : évite de croire que les données sont perdues alors
    // que seul le serveur Node n'est pas joignable.
    if (isError) {
        setAlertBanner(
            "Serveur non connecté : les données restent enregistrées dans la base SQLite. " +
            "Ouvrez la page via http://localhost:3000 (lancez « npm start ») puis actualisez.",
            true
        );
    } else {
        setAlertBanner("");
    }

}


function setAlertBanner(message, isError = false) {

    if (!alertBanner || !alertBannerText) return;

    alertBanner.classList.toggle("show", Boolean(message));
    alertBanner.classList.toggle("error", Boolean(isError));
    alertBannerText.textContent = message || "";

}


// --------------------------
// API
// --------------------------

async function loadRooms() {

    const tried = new Set();
    const candidates = [apiUrl("/api/rooms"), "http://127.0.0.1:3000/api/rooms", "http://localhost:3000/api/rooms"];
    let lastError = null;

    for (const url of candidates) {
        if (tried.has(url)) continue;
        tried.add(url);
        try {
            const response = await fetch(url, { cache: "no-store" });
            if (response.ok) return response.json();
            lastError = new Error("Impossible de charger les chambres (" + response.status + ").");
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error("Impossible de charger les chambres.");

}


async function loadHistory() {

    const tried = new Set();
    const candidates = [apiUrl("/api/history?limit=200"), "http://127.0.0.1:3000/api/history?limit=200", "http://localhost:3000/api/history?limit=200"];
    let lastError = null;

    for (const url of candidates) {
        if (tried.has(url)) continue;
        tried.add(url);
        try {
            const response = await fetch(url, { cache: "no-store" });
            if (response.ok) return response.json();
            lastError = new Error("Impossible de charger l'historique (" + response.status + ").");
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error("Impossible de charger l'historique.");

}


async function saveRoomUpdate(roomNumber, payload) {

    // On tente d'abord l'origine courante, puis 127.0.0.1:3000 / localhost:3000.
    // Ça évite de perdre une saisie si la page a été ouverte via Live Server
    // ou un fichier local pendant que le serveur tourne.
    const tried = new Set();
    const candidates = [
        apiUrl(`/api/rooms/${roomNumber}`),
        `http://127.0.0.1:3000/api/rooms/${roomNumber}`,
        `http://localhost:3000/api/rooms/${roomNumber}`
    ];
    let lastError = null;

    for (const url of candidates) {
        if (tried.has(url)) continue;
        tried.add(url);
        try {
            const response = await fetch(url, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) return response.json();

            const errorText = await response.text();
            // Erreur métier (400) : inutile de réessayer ailleurs.
            if (response.status >= 400 && response.status < 500) {
                throw new Error(errorText || "Impossible d'enregistrer la chambre.");
            }
            lastError = new Error(errorText || "Impossible d'enregistrer la chambre.");
        } catch (error) {
            lastError = error;
            if (error && error.message && !error.message.includes("Failed to fetch") && !error.message.includes("NetworkError") && !error.message.includes("Load failed")) {
                throw error;
            }
        }
    }

    throw lastError || new Error("Impossible d'enregistrer la chambre.");

}


// --------------------------
// UI HELPERS
// --------------------------

function showRoomsMessage(message) {

    roomsGrid.innerHTML = "";

    const emptyState = document.createElement("div");
    emptyState.className = "rooms-empty";
    emptyState.textContent = message;

    roomsGrid.appendChild(emptyState);

}


function closeRoomModal() {

    roomModal.classList.remove("show");
    selectedRoom = null;
    document.body.style.overflow = "";

}


async function refreshRooms({ showLoading = false } = {}) {

    if (isRefreshing) return;

    isRefreshing = true;

    if (refreshRoomsButton) {
        refreshRoomsButton.disabled = true;
    }

    if (showLoading) {
        showRoomsMessage("Chargement des chambres...");
    }

    const previousRooms = rooms;
    const previousHistory = historyEntries;

    try {

        const [roomsResult, historyResult] = await Promise.allSettled([
            loadRooms(),
            loadHistory()
        ]);

        let failed = false;

        if (roomsResult.status === "fulfilled") {
            rooms = roomsResult.value;
        } else {
            failed = true;
            console.error(roomsResult.reason);
            rooms = previousRooms;
        }

        if (historyResult.status === "fulfilled") {
            historyEntries = historyResult.value;
        } else {
            failed = true;
            console.error(historyResult.reason);
            historyEntries = previousHistory;
        }

        renderAllViews();

        if (failed) {
            setSyncBadge("Synchronisation partielle", true);
        } else {
            setSyncBadge(`Synchronisé à ${formatSyncTime()}`);
        }

    } catch (error) {

        console.error(error);
        setSyncBadge("Synchronisation impossible", true);

        if (showLoading) {
            showRoomsMessage("Impossible de charger les données. Lance le serveur avec npm start.");
        } else {
            alert("Impossible de rafraîchir les données. Vérifie que le serveur Node est lancé.");
        }

    } finally {

        isRefreshing = false;

        if (refreshRoomsButton) {
            refreshRoomsButton.disabled = false;
        }

    }

}


// --------------------------
// AFFICHER LES CHAMBRES
// --------------------------

function renderRooms() {

    roomsGrid.innerHTML = "";

    const searchValue = searchRoom.value.toLowerCase();

    const typeValue = filterType.value;

    const statusValue = filterStatus.value;


    const filteredRooms = rooms.filter(room => {

        const matchSearch =
            formatRoomNumber(room.number).includes(searchValue) ||
            room.number.toString().includes(searchValue) ||
            room.type.toLowerCase().includes(searchValue) ||
            room.status.toLowerCase().includes(searchValue) ||
            (room.client_name || "").toLowerCase().includes(searchValue);


        const matchType =
            typeValue === "all" ||
            room.type === typeValue ||
            (typeValue === "Suite" && String(room.type || "").startsWith("Suite"));


        const matchStatus =
            statusValue === "all" ||
            room.status === statusValue;


        return matchSearch && matchType && matchStatus;

    });


    if (filteredRooms.length === 0) {
        showRoomsMessage("Aucune chambre ne correspond à ces filtres.");
        return;
    }


    filteredRooms.forEach(room => {

        const card = document.createElement("div");

        card.classList.add("room-card");


        if (room.status === "Occupée") {

            card.classList.add("occupée");

        }

        if (room.status === "Réservée") {

            card.classList.add("réservée");

        }

        if (room.status === "Nettoyage") {

            card.classList.add("nettoyage");

        }


        const statusClass = statusClassMap[room.status] || "status-libre";
        const clientName = room.client_name ? escapeHtml(room.client_name) : "Aucun client";
        const hasDates = room.arrival_date || room.departure_date;


        card.innerHTML = `

            <div class="room-top">

                <div class="room-number">
                    Chambre ${formatRoomNumber(room.number)}
                </div>

                <div class="room-icon">
                    <i class="fa-solid fa-bed"></i>
                </div>

            </div>


            <div class="room-type">

                ${room.type}

            </div>


            <div class="room-price">

                ${formatMoney(room.price)} / nuit

            </div>


            <div class="room-guest ${room.client_name ? "" : "muted"}">
                <span>Client</span>
                <strong>${clientName}</strong>
            </div>


            ${hasDates ? `
                <div class="room-dates">
                    <span>Arrivée ${escapeHtml(formatDateOnly(room.arrival_date))}</span>
                    <span>Départ ${escapeHtml(formatDateOnly(room.departure_date))}</span>
                </div>
            ` : ""}


            <div class="room-status ${statusClass}">

                ${escapeHtml(room.status)}

            </div>

        `;


        card.addEventListener("click", () => {

            openRoomModal(room);

        });

        // Accessibilité tactile + clavier : la carte est activable au doigt et à Entrée/Espace.
        card.setAttribute("tabindex", "0");
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", `Ouvrir la chambre ${formatRoomNumber(room.number)}`);
        card.addEventListener("keydown", (event) => {

            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openRoomModal(room);
            }

        });


        roomsGrid.appendChild(card);

    });

}


// --------------------------
// OUVRIR MODAL
// --------------------------

function openRoomModal(room) {

    selectedRoom = room;

    modalRoomNumber.textContent = `Chambre ${formatRoomNumber(room.number)}`;
    modalRoomType.textContent = room.type;
    modalStatus.textContent = room.status;
    modalPrice.textContent = `${formatMoney(room.price)} / nuit`;
    refreshModalPriceOptions(room);
    modalUpdatedAt.textContent = formatDateTime(room.updated_at);
    modalClientName.value = room.client_name || "";
    modalArrivalDate.value = room.arrival_date || "";
    modalDepartureDate.value = room.departure_date || "";

    // Pre-remplissage : si les dates sont vides, proposer
    // arrivee = aujourd'hui / depart = demain. Ca evite le blocage
    // "dates obligatoires" quand on clique sur Occupee / Reservee.
    if (!modalArrivalDate.value) {
        modalArrivalDate.value = toInputDate(new Date());
    }

    if (!modalDepartureDate.value) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        modalDepartureDate.value = toInputDate(tomorrow);
    }

    updateModalHelper(room.status);
    renderModalHistory(room.number);


    roomModal.classList.add("show");
    document.body.style.overflow = "hidden";

    // Sur mobile on ne force pas le focus (sinon le clavier s'ouvre tout seul
    // et cache la fiche). Focus seulement sur desktop à pointeur fin.
    const canFocus = window.matchMedia
        ? window.matchMedia("(pointer: fine)").matches && window.innerWidth > 900
        : window.innerWidth > 900;

    if (canFocus) {
        requestAnimationFrame(() => {

            if (document.activeElement && document.activeElement.blur) {
                document.activeElement.blur();
            }

            if (!modalClientName.value) {
                modalClientName.focus({ preventScroll: true });
            }

        });
    }

}


// --------------------------
// FERMER MODAL
// --------------------------

closeModal.addEventListener("click", closeRoomModal);


roomModal.addEventListener("click", (event) => {

    if (event.target === roomModal) {

        closeRoomModal();

    }

});


// --------------------------
// CHANGER LE STATUT
// --------------------------

function getModalPayload() {

    return {
        clientName: modalClientName.value.trim(),
        arrivalDate: modalArrivalDate.value,
        departureDate: modalDepartureDate.value,
        price: modalPriceSelect ? modalPriceSelect.value : undefined
    };

}


function validateModalPayload(status, payload) {

    if (status === "Occupée" || status === "Réservée") {
        if (!payload.clientName) {
            return "Le nom du client est obligatoire pour une chambre occupée ou réservée.";
        }

        if (!payload.arrivalDate || !payload.departureDate) {
            return "Les dates d'arrivée et de départ sont obligatoires.";
        }

        // Départ anticipé autorisé : le départ peut être avancé mais doit
        // rester strictement après l'arrivée (sinon 0 nuit facturable).
        if (payload.departureDate <= payload.arrivalDate) {
            return "La date de départ (même anticipée) doit être postérieure à la date d'arrivée.";
        }
    }

    return null;

}


function isSameAsSelectedRoom(status, payload) {

    if (!selectedRoom) return false;

    // Le serveur efface client + dates pour Libre / Nettoyage : on compare pareil
    const expectedClient = (status === "Libre" || status === "Nettoyage") ? "" : payload.clientName;
    const expectedArrival = (status === "Libre" || status === "Nettoyage") ? "" : payload.arrivalDate;
    const expectedDeparture = (status === "Libre" || status === "Nettoyage") ? "" : payload.departureDate;
    const expectedPrice = payload.price !== undefined && String(payload.price).trim() !== ""
        ? Number(String(payload.price).replace(/[\s ]/g, ""))
        : Number(selectedRoom.price || 0);

    return selectedRoom.status === status &&
        (selectedRoom.client_name || "") === expectedClient &&
        (selectedRoom.arrival_date || "") === expectedArrival &&
        (selectedRoom.departure_date || "") === expectedDeparture &&
        Number(selectedRoom.price || 0) === Number(expectedPrice || 0);

}


function setStatusButtonsDisabled(disabled) {

    statusButtons.forEach(button => {
        button.disabled = disabled;
    });

    if (saveRoomChangesBtn) {
        saveRoomChangesBtn.disabled = disabled;
    }

    if (typeof earlyCheckoutBtn !== "undefined" && earlyCheckoutBtn) {
        earlyCheckoutBtn.disabled = disabled;
    }

}


async function persistRoomUpdate(nextStatus, payload, { keepOpen = false, successMessage = null } = {}) {

    if (!selectedRoom || isSaving) return null;

    const roomNumber = selectedRoom.number;

    isSaving = true;
    setStatusButtonsDisabled(true);

    try {

        const updatedRoom = await saveRoomUpdate(roomNumber, {
            status: nextStatus,
            ...payload
        });

        // Si on libère ou on met en nettoyage, on vide visuellement les champs
        if (nextStatus === "Libre" || nextStatus === "Nettoyage") {
            modalClientName.value = "";
            modalArrivalDate.value = "";
            modalDepartureDate.value = "";
        }

        if (modalPriceSelect && updatedRoom && updatedRoom.price) {
            refreshModalPriceOptions(updatedRoom);
            if (modalPrice) {
                modalPrice.textContent = `${formatMoney(updatedRoom.price)} / nuit`;
            }
        }

        selectedRoom = updatedRoom;

        if (keepOpen) {
            modalStatus.textContent = updatedRoom.status;
            modalUpdatedAt.textContent = formatDateTime(updatedRoom.updated_at);
            modalClientName.value = updatedRoom.client_name || "";
            modalArrivalDate.value = updatedRoom.arrival_date || "";
            modalDepartureDate.value = updatedRoom.departure_date || "";
            updateModalHelper(updatedRoom.status);
            renderModalHistory(updatedRoom.number);
        } else {
            closeRoomModal();
        }

        await refreshRooms();

        // Le journal des paiements a pu changer (réservation, modification,
        // départ anticipé, check-out) : on le recharge aussitôt.
        await renderPaymentsHistory();

        if (successMessage) {
            alert(successMessage);
        }

        return updatedRoom;

    } catch (error) {

        console.error(error);
        alert(error && error.message ? error.message : "Impossible d'enregistrer. Vérifie que le serveur Node est lancé.");
        return null;

    } finally {

        isSaving = false;
        setStatusButtonsDisabled(false);

    }

}


if (saveRoomChangesBtn) {

    saveRoomChangesBtn.addEventListener("click", async () => {

        if (!selectedRoom || isSaving) return;

        // Modification sans changer le statut : on garde le statut actuel.
        // Cas typique : le client part plus tôt -> on change la date de départ
        // et/ou le tarif, puis on enregistre.
        const nextStatus = selectedRoom.status;
        const payload = getModalPayload();
        const validationMessage = validateModalPayload(nextStatus, payload);

        if (validationMessage) {
            alert(validationMessage);
            return;
        }

        if (isSameAsSelectedRoom(nextStatus, payload)) {
            alert("Aucune modification à enregistrer (dates / prix identiques).");
            return;
        }

        await persistRoomUpdate(nextStatus, payload, {
            keepOpen: true,
            successMessage: `Chambre ${selectedRoom.number} mise à jour : dates / prix enregistrés sans changer le statut (${nextStatus}).`
        });

    });

}


if (typeof earlyCheckoutBtn !== "undefined" && earlyCheckoutBtn) {

    earlyCheckoutBtn.addEventListener("click", async () => {

        if (!selectedRoom || isSaving) return;

        if (selectedRoom.status !== "Occupée" && selectedRoom.status !== "Réservée") {
            alert("Le départ anticipé concerne une chambre Occupée ou Réservée.");
            return;
        }

        // Départ anticipé : date de départ = aujourd'hui (jamais avant l'arrivée + 1 jour).
        const today = toInputDate(new Date());
        const arrival = modalArrivalDate.value || selectedRoom.arrival_date || today;
        let earlyDeparture = today;
        if (arrival && earlyDeparture <= arrival) {
            const minDeparture = new Date(`${arrival}T00:00:00`);
            minDeparture.setDate(minDeparture.getDate() + 1);
            earlyDeparture = toInputDate(minDeparture);
        }

        modalDepartureDate.value = earlyDeparture;

        const payload = getModalPayload();
        payload.departureDate = earlyDeparture;
        const validationMessage = validateModalPayload(selectedRoom.status, payload);

        if (validationMessage) {
            alert(validationMessage);
            return;
        }

        if (!confirm(`Confirmer le départ anticipé de la chambre ${selectedRoom.number} au ${earlyDeparture} ? Le montant estimé sera recalculé.`)) {
            return;
        }

        await persistRoomUpdate(selectedRoom.status, payload, {
            keepOpen: true,
            successMessage: `Départ anticipé enregistré : chambre ${selectedRoom.number} → départ le ${earlyDeparture}.`
        });

    });

}


statusButtons.forEach(button => {

    button.addEventListener("click", async () => {

        if (!selectedRoom || isSaving) return;

        const nextStatus = button.dataset.status;
        const payload = getModalPayload();
        const validationMessage = validateModalPayload(nextStatus, payload);

        if (validationMessage) {
            alert(validationMessage);
            return;
        }

        if (isSameAsSelectedRoom(nextStatus, payload)) {
            alert("La chambre " + selectedRoom.number + " est déjà \"" + nextStatus + "\" — aucune modification à enregistrer.");
            return;
        }

        await persistRoomUpdate(nextStatus, payload);

    });

});


// --------------------------
// STATISTIQUES
// --------------------------

function updateStats() {

    const total = rooms.length;

    const available =
        rooms.filter(room => room.status === "Libre").length;

    const occupied =
        rooms.filter(room => room.status === "Occupée").length;

    const reserved =
        rooms.filter(room => room.status === "Réservée").length;


    document.getElementById("totalRooms").textContent =
        total;

    document.getElementById("availableRooms").textContent =
        available;

    document.getElementById("occupiedRooms").textContent =
        occupied;

    document.getElementById("reservedRooms").textContent =
        reserved;

}


function getActiveRooms() {

    return rooms.filter(isActiveStay);

}


function renderDashboard() {

    const activeRooms = getActiveRooms();
    const arrivals = activeRooms
        .filter(room => room.arrival_date)
        .slice()
        .sort((a, b) => getDateValue(a.arrival_date) - getDateValue(b.arrival_date));

    const departures = activeRooms
        .filter(room => room.departure_date)
        .slice()
        .sort((a, b) => getDateValue(a.departure_date) - getDateValue(b.departure_date));

    const recentHistory = historyEntries.slice(0, 8);

    if (arrivalsCountEl) arrivalsCountEl.textContent = arrivals.length;
    if (departuresCountEl) departuresCountEl.textContent = departures.length;
    if (historyCountEl) historyCountEl.textContent = recentHistory.length;

    renderCompactList(
        dashboardArrivals,
        arrivals.slice(0, 5),
        "Aucune arrivée programmée.",
        room => `
            <article class="compact-item">
                <div class="compact-item-head">
                    <strong>Chambre ${formatRoomNumber(room.number)}</strong>
                    ${getStatusBadge(room.status)}
                </div>
                <p>${escapeHtml(room.client_name || "Client à définir")}</p>
                <small>Arrivée : ${escapeHtml(formatDateOnly(room.arrival_date))}</small>
            </article>
        `
    );

    renderCompactList(
        dashboardDepartures,
        departures.slice(0, 5),
        "Aucun départ programmé.",
        room => `
            <article class="compact-item">
                <div class="compact-item-head">
                    <strong>Chambre ${formatRoomNumber(room.number)}</strong>
                    ${getStatusBadge(room.status)}
                </div>
                <p>${escapeHtml(room.client_name || "Client à définir")}</p>
                <small>Départ : ${escapeHtml(formatDateOnly(room.departure_date))}</small>
            </article>
        `
    );

    renderCompactList(
        dashboardHistory,
        recentHistory,
        "Aucun changement récent.",
        entry => `
            <article class="compact-item compact-item-history">
                <div class="compact-item-head">
                    <strong>Chambre ${formatRoomNumber(entry.room_number)}</strong>
                    <span class="history-transition">${escapeHtml(entry.previous_status || "Aucun")} → ${escapeHtml(entry.new_status)}</span>
                </div>
                <p>${escapeHtml(entry.client_name || "Aucun client")}</p>
                <small>${formatDateTime(entry.changed_at)}</small>
            </article>
        `
    );

}


function renderPlanning() {

    const plannedRooms = getActiveRooms()
        .filter(room => room.arrival_date || room.departure_date)
        .slice()
        .sort((a, b) => {
            const arrivalDiff = getDateValue(a.arrival_date) - getDateValue(b.arrival_date);
            if (arrivalDiff !== 0) return arrivalDiff;
            return getDateValue(a.departure_date) - getDateValue(b.departure_date);
        });

    renderTableSection(
        planningList,
        [
            { label: "Chambre", render: room => `Chambre ${formatRoomNumber(room.number)}` },
            { label: "Client", render: room => escapeHtml(room.client_name || "-") },
            { label: "Arrivée", render: room => escapeHtml(formatDateOnly(room.arrival_date)) },
            { label: "Départ", render: room => escapeHtml(formatDateOnly(room.departure_date)) },
            { label: "Statut", render: room => getStatusBadge(room.status) },
            { label: "Nuits", render: room => String(calculateNights(room.arrival_date, room.departure_date)) }
        ],
        plannedRooms,
        "Aucun séjour planifié pour le moment."
    );

}


function renderClients() {

    const activeRooms = getActiveRooms();
    const uniqueClientCount = new Set(
        activeRooms
            .map(room => room.client_name.trim())
            .filter(Boolean)
    ).size;

    const rows = activeRooms.slice().sort((a, b) => {
        const nameA = normalizeText(a.client_name);
        const nameB = normalizeText(b.client_name);
        return nameA.localeCompare(nameB, "fr");
    });

    renderTableSection(
        clientsList,
        [
            { label: "Client", render: room => escapeHtml(room.client_name || "-") },
            { label: "Chambre", render: room => `Chambre ${formatRoomNumber(room.number)}` },
            { label: "Statut", render: room => getStatusBadge(room.status) },
            { label: "Arrivée", render: room => escapeHtml(formatDateOnly(room.arrival_date)) },
            { label: "Départ", render: room => escapeHtml(formatDateOnly(room.departure_date)) }
        ],
        rows,
        "Aucun client enregistré."
    );

    if (activeClientsEl) {
        activeClientsEl.textContent = String(uniqueClientCount);
    }

}


function renderReservations() {

    const rows = rooms
        .filter(room => room.status === "Occupée" || room.status === "Réservée")
        .slice()
        .sort((a, b) => Number(a.number) - Number(b.number));

    renderTableSection(
        reservationsList,
        [
            { label: "Chambre", render: room => `Chambre ${formatRoomNumber(room.number)}` },
            { label: "Client", render: room => escapeHtml(room.client_name || "-") },
            { label: "Arrivée", render: room => escapeHtml(formatDateOnly(room.arrival_date)) },
            { label: "Départ", render: room => escapeHtml(formatDateOnly(room.departure_date)) },
            { label: "Statut", render: room => getStatusBadge(room.status) }
        ],
        rows,
        "Aucune réservation active."
    );

    if (activeReservationsEl) {
        activeReservationsEl.textContent = String(rows.length);
    }

}


function renderPayments() {

    const rows = getActiveRooms()
        .slice()
        .sort((a, b) => Number(a.number) - Number(b.number))
        .map(room => {
            const nights = calculateNights(room.arrival_date, room.departure_date);
            const total = nights * Number(room.price || 0);

            return {
                ...room,
                nights,
                total
            };
        });

    const totalAmount = rows.reduce((sum, room) => sum + room.total, 0);

    if (paymentsTotal) {
        paymentsTotal.textContent = formatMoney(totalAmount);
    }

    renderTableSection(
        paymentsList,
        [
            { label: "Chambre", render: room => `Chambre ${formatRoomNumber(room.number)}` },
            { label: "Client", render: room => escapeHtml(room.client_name || "-") },
            { label: "Nuits", render: room => String(room.nights) },
            { label: "Prix / nuit", render: room => escapeHtml(formatMoney(room.price)) },
            { label: "Montant estimé", render: room => escapeHtml(formatMoney(room.total)) }
        ],
        rows,
        "Aucun paiement estimé pour le moment."
    );

    renderPaymentsHistory();

}


async function loadPaymentsHistory() {

    // Même origine + fallbacks 127.0.0.1/localhost (cas Live Server).
    const candidates = [
        apiUrl("/api/payments?limit=500"),
        "http://127.0.0.1:3000/api/payments?limit=500",
        "http://localhost:3000/api/payments?limit=500"
    ];
    const tried = new Set();

    for (const url of candidates) {
        if (tried.has(url)) continue;
        tried.add(url);
        try {
            const response = await fetch(url, { cache: "no-store" });
            if (response.ok) return await response.json();
        } catch (error) {
            console.warn("Paiements non chargés via " + url + " :", error);
        }
    }

    console.error("Paiements indisponibles sur toutes les origines.");
    return [];

}


async function renderPaymentsHistory() {

    if (!paymentsHistoryList) return;

    const rows = await loadPaymentsHistory();
    const totalAmount = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

    if (paymentsRecordedTotal) {
        paymentsRecordedTotal.textContent = formatMoney(totalAmount);
    }

    if (paymentsHistoryCount) {
        paymentsHistoryCount.textContent = String(rows.length);
    }

    renderTableSection(
        paymentsHistoryList,
        [
            { label: "Chambre", render: row => `Chambre ${formatRoomNumber(row.room_number)}` },
            { label: "Client", render: row => escapeHtml(row.client_name || "-") },
            { label: "Type", render: row => escapeHtml(row.kind || "Séjour") },
            { label: "Séjour", render: row => `${escapeHtml(formatDateOnly(row.arrival_date))} → ${escapeHtml(formatDateOnly(row.departure_date))} (${Number(row.nights || 0)} nuit(s))` },
            { label: "Prix / nuit", render: row => escapeHtml(formatMoney(row.price_per_night)) },
            { label: "Montant", render: row => `<strong>${escapeHtml(formatMoney(row.amount))}</strong>` },
            { label: "Détail", render: row => escapeHtml(row.note || "-") },
            { label: "Enregistré le", render: row => escapeHtml(formatDateTime(row.created_at)) }
        ],
        rows,
        "Aucun paiement enregistré pour le moment. Les réservations, modifications et départs anticipés y seront conservés."
    );

}


if (typeof exportPaymentsButton !== "undefined" && exportPaymentsButton) {
    exportPaymentsButton.addEventListener("click", () => {
        downloadFile(apiUrl("/api/exports/payments.csv"), "hotel-belinga-paiements.csv");
    });
}


function renderStatistics() {

    const total = rooms.length;
    const activeStayRooms = getActiveRooms();
    const activeReservations = activeStayRooms.length;
    const upcomingDepartures = activeStayRooms.filter(isUpcomingDeparture).length;
    const uniqueClientCount = new Set(
        activeStayRooms.map(room => room.client_name.trim()).filter(Boolean)
    ).size;
    const occupancyRate = total === 0 ? 0 : Math.round((activeReservations / total) * 100);

    if (occupancyRateEl) occupancyRateEl.textContent = `${occupancyRate}%`;
    if (activeClientsEl) activeClientsEl.textContent = String(uniqueClientCount);
    if (activeReservationsEl) activeReservationsEl.textContent = String(activeReservations);
    if (upcomingDeparturesEl) upcomingDeparturesEl.textContent = String(upcomingDepartures);

    renderTableSection(
        statisticsHistory,
        [
            { label: "Date", render: entry => escapeHtml(formatDateTime(entry.changed_at)) },
            { label: "Chambre", render: entry => `Chambre ${formatRoomNumber(entry.room_number)}` },
            { label: "Transition", render: entry => `${escapeHtml(entry.previous_status || "Aucun")} → ${escapeHtml(entry.new_status)}` },
            { label: "Client", render: entry => escapeHtml(entry.client_name || "-") },
            { label: "Période", render: entry => escapeHtml(`${formatDateOnly(entry.arrival_date)} → ${formatDateOnly(entry.departure_date)}`) }
        ],
        historyEntries.slice(0, 20),
        "Aucun historique enregistré."
    );

}


// --------------------------
// RECHERCHE
// --------------------------

searchRoom.addEventListener("input", renderRooms);


// --------------------------
// FILTRES
// --------------------------

filterType.addEventListener("change", renderRooms);

filterStatus.addEventListener("change", renderRooms);


// --------------------------
// RAFRAICHIR
// --------------------------

navButtons.forEach(button => {

    button.addEventListener("click", () => {
        setActiveView(button.dataset.view || "dashboard");
    });

});


if (refreshRoomsButton) {

    refreshRoomsButton.addEventListener("click", async () => {

        await refreshRooms();

    });

}


if (exportRoomsButton) {
    exportRoomsButton.addEventListener("click", () => {
        downloadFile(apiUrl("/api/exports/rooms.csv"), "hotel-belinga-chambres.csv");
    });
}


if (exportSingleRoomButton) {
    exportSingleRoomButton.addEventListener("click", () => {
        if (!selectedRoom) {
            alert("Ouvrez d'abord une chambre en cliquant dessus.");
            return;
        }
        downloadFile(
            apiUrl("/api/exports/rooms/" + selectedRoom.number + ".csv"),
            "hotel-belinga-chambre-" + selectedRoom.number + ".csv"
        );
    });
}


if (printReceiptButton) {
    printReceiptButton.addEventListener("click", async () => {
        if (!selectedRoom) {
            alert("Ouvrez d'abord une chambre en cliquant dessus.");
            return;
        }
        await printRoomReceipt(selectedRoom.number);
    });
}


if (exportHistoryButton) {
    exportHistoryButton.addEventListener("click", () => {
        downloadFile(apiUrl("/api/exports/history.csv"), "hotel-belinga-historique.csv");
    });
}


if (profileButton) {
    profileButton.addEventListener("click", () => {
        refreshRooms();
    });
}


// --------------------------
// INITIALISATION
// --------------------------

setActiveView("dashboard");
refreshRooms({ showLoading: true });
