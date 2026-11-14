/* ================= PART 1: NAVIGATION ================= */
const nav = document.getElementById("nav");
const menuBtn = document.getElementById("menuBtn");
const menu = document.getElementById("menu");

// Change the navbar style after scrolling 50px
function updateNav() {
    nav.classList.toggle("scrolled", window.scrollY > 50);
}
window.addEventListener("scroll", updateNav);
updateNav();

// Open and close the mobile menu
menuBtn.addEventListener("click", () => {
    const isOpen = menu.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", isOpen);
});

// Close the mobile menu after a section link is clicked
menu.querySelectorAll("ul a").forEach(link => {
    link.addEventListener("click", () => {
        menu.classList.remove("open");
        menuBtn.setAttribute("aria-expanded", "false");
    });
});

// Highlight the current section in the menu
const links = document.querySelectorAll(".menu ul a");
const observer = new IntersectionObserver(
    entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            links.forEach(link => {
                const isCurrent = link.getAttribute("href") === "#" + entry.target.id;
                link.classList.toggle("active", isCurrent);
            });
        });
    },
    { rootMargin: "-45% 0px -50% 0px" }
);
links.forEach(link => {
    const section = document.querySelector(link.getAttribute("href"));
    if (section) observer.observe(section);
});


/* ================= PART 2: LOGIN / REGISTER ================= */
// Accounts are stored in this browser only (localStorage).
const USERS_KEY = "ttt_users";
const SESSION_KEY = "ttt_session";

const authDialog = document.getElementById("authDialog");
const authForm = document.getElementById("authForm");
const authUser = document.getElementById("authUser");
const authPass = document.getElementById("authPass");
const authPass2 = document.getElementById("authPass2");
const authError = document.getElementById("authError");
const authSubmit = document.getElementById("authSubmit");
const confirmRow = document.getElementById("confirmRow");
const tabLogin = document.getElementById("tabLogin");
const tabRegister = document.getElementById("tabRegister");
const authBox = document.getElementById("authBox");
const userBox = document.getElementById("userBox");
const userNameEl = document.getElementById("userName");

let authMode = "login";
let currentUser = null;   // { key, name } when logged in

function getUsers() {
    try {
        return JSON.parse(localStorage.getItem(USERS_KEY)) || {};
    } catch (error) {
        return {};
    }
}

function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function makeSalt() {
    return Array.from(crypto.getRandomValues(new Uint32Array(2))).join("-");
}

// Passwords are never stored as plain text: we store a salted SHA-256 hash
async function hashPassword(password, salt) {
    const data = new TextEncoder().encode(salt + password);

    if (window.crypto && crypto.subtle) {
        const buffer = await crypto.subtle.digest("SHA-256", data);
        return Array.from(new Uint8Array(buffer))
            .map(byte => byte.toString(16).padStart(2, "0"))
            .join("");
    }

    return btoa(salt + password);   // fallback for very old browsers
}

function restoreSession() {
    const key = localStorage.getItem(SESSION_KEY);
    const users = getUsers();

    if (key && users[key]) {
        currentUser = { key, name: users[key].name };
    }
}

function setAuthMode(mode) {
    authMode = mode;
    tabLogin.classList.toggle("active", mode === "login");
    tabRegister.classList.toggle("active", mode === "register");
    confirmRow.hidden = mode === "login";
    authSubmit.textContent = mode === "login" ? "Login" : "Create account";
    authPass.autocomplete = mode === "login" ? "current-password" : "new-password";
    authError.textContent = "";
}

function openAuth(mode) {
    setAuthMode(mode);
    authForm.reset();
    authDialog.showModal();
    authUser.focus();
}

function updateAuthUI() {
    authBox.hidden = !!currentUser;
    userBox.hidden = !currentUser;
    userNameEl.textContent = currentUser ? currentUser.name : "";

    refreshOnlinePanel();

    // If the player is on the Online tab, refresh the board message
    if (mode === "online" && !peer) newGame();
}

authForm.addEventListener("submit", async event => {
    event.preventDefault();

    const name = authUser.value.trim();
    const password = authPass.value;
    const key = name.toLowerCase();
    const users = getUsers();
    let displayName = name;

    if (!/^[A-Za-z0-9_]{3,15}$/.test(name)) {
        authError.textContent = "Username: 3-15 letters, numbers or underscores.";
        return;
    }

    if (password.length < 6) {
        authError.textContent = "Password must be at least 6 characters.";
        return;
    }

    if (authMode === "register") {
        if (password !== authPass2.value) {
            authError.textContent = "Passwords do not match.";
            return;
        }

        if (users[key]) {
            authError.textContent = "That username is already taken.";
            return;
        }

        const salt = makeSalt();
        users[key] = { name, salt, hash: await hashPassword(password, salt) };
        saveUsers(users);
    } else {
        const user = users[key];

        if (!user || user.hash !== await hashPassword(password, user.salt)) {
            authError.textContent = "Wrong username or password.";
            return;
        }

        displayName = user.name;
    }

    localStorage.setItem(SESSION_KEY, key);
    currentUser = { key, name: displayName };
    authDialog.close();
    updateAuthUI();
});

document.getElementById("loginBtn").addEventListener("click", () => openAuth("login"));
document.getElementById("registerBtn").addEventListener("click", () => openAuth("register"));
document.getElementById("onlineLoginBtn").addEventListener("click", () => openAuth("login"));
document.getElementById("closeDialog").addEventListener("click", () => authDialog.close());
tabLogin.addEventListener("click", () => setAuthMode("login"));
tabRegister.addEventListener("click", () => setAuthMode("register"));

// Click on the dark area outside the dialog to close it
authDialog.addEventListener("click", event => {
    if (event.target === authDialog) authDialog.close();
});

document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem(SESSION_KEY);
    currentUser = null;
    leaveOnline();
    updateAuthUI();
});


/* ================= PART 3: GAME ================= */
const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const modePvp = document.getElementById("modePvp");
const modeCpu = document.getElementById("modeCpu");
const modeOnline = document.getElementById("modeOnline");
const levelRow = document.getElementById("levelRow");
const levelSel = document.getElementById("level");
const nameX = document.getElementById("nameX");
const nameO = document.getElementById("nameO");
const scoreEls = {
    X: document.getElementById("scoreX"),
    O: document.getElementById("scoreO"),
    D: document.getElementById("scoreD")
};

const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],   // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8],   // columns
    [0, 4, 8], [2, 4, 6]               // diagonals
];

let mode = "pvp";           // "pvp", "cpu" or "online"
let board;                  // 9 squares: "X", "O" or null
let current;                // whose turn it is
let gameOver;
let locked = false;         // blocks clicks (computer thinking / waiting for friend)
const scores = { X: 0, O: 0, D: 0 };

// Build the 9 cells
const cells = [];
for (let i = 0; i < 9; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cell";
    btn.setAttribute("aria-label", "Cell " + (i + 1));
    btn.addEventListener("click", () => handleClick(i));
    boardEl.appendChild(btn);
    cells.push(btn);
}

// Returns { winner, line } if the game is over, otherwise null
function getResult(b) {
    for (const line of LINES) {
        const [a, c, d] = line;
        if (b[a] && b[a] === b[c] && b[a] === b[d]) {
            return { winner: b[a], line };
        }
    }
    // No winner: it is a draw only when the board is full
    return b.includes(null) ? null : { winner: "D", line: [] };
}

function setStatus(text, cssClass) {
    statusEl.textContent = text;
    statusEl.className = "status " + (cssClass || "");
}

function showTurn() {
    if (mode === "online") {
        if (!currentUser) return setStatus("Log in to play online", "");
        if (!peer) return setStatus("Create a room or join with a code", "");
        if (!connected) return setStatus("Waiting for your friend...", "");

        const isMine = current === myMark;
        return setStatus(
            isMine ? "Your turn" : opponentName + "\u2019s turn",
            current.toLowerCase()
        );
    }

    const name = current === "O" && mode === "cpu" ? "Computer" : "Player " + current;
    setStatus(name + "\u2019s turn", current.toLowerCase());
}

// Names shown above the scores
function setNames() {
    let x = "Player X";
    let o = "Player O";

    if (mode === "cpu") o = "Computer";

    if (mode === "online" && connected) {
        const me = currentUser.name + " (you)";
        x = myMark === "X" ? me : opponentName;
        o = myMark === "X" ? opponentName : me;
    }

    nameX.textContent = x;
    nameO.textContent = o;
}

function newGame() {
    board = Array(9).fill(null);
    current = "X";
    gameOver = false;
    locked = mode === "online" && !connected;

    cells.forEach(cell => {
        cell.textContent = "";
        cell.disabled = locked;
        cell.className = "cell";
    });

    showTurn();
}

function place(index, mark) {
    board[index] = mark;
    cells[index].textContent = mark;
    cells[index].classList.add(mark.toLowerCase(), "pop");
    cells[index].disabled = true;
}

function handleClick(index) {
    if (gameOver || locked || board[index]) return;

    // Online: you can only play on your own turn
    if (mode === "online" && current !== myMark) return;

    place(index, current);
    if (mode === "online") conn.send({ type: "move", index });
    if (finishIfOver()) return;

    current = current === "X" ? "O" : "X";
    showTurn();

    // Computer plays after a short pause
    if (mode === "cpu" && current === "O") {
        locked = true;
        setTimeout(computerMove, 500);
    }
}

// Checks for a win or draw. Returns true if the game has ended.
function finishIfOver() {
    const result = getResult(board);
    if (!result) return false;

    gameOver = true;
    scores[result.winner]++;
    scoreEls[result.winner].textContent = scores[result.winner];
    cells.forEach(cell => (cell.disabled = true));

    if (result.winner === "D") {
        setStatus("It\u2019s a draw!", "");
        return true;
    }

    result.line.forEach(i => cells[i].classList.add("win"));

    let who;
    if (mode === "online") {
        who = result.winner === myMark ? "You win!" : opponentName + " wins!";
    } else if (mode === "cpu" && result.winner === "O") {
        who = "Computer wins!";
    } else {
        who = "Player " + result.winner + " wins!";
    }

    setStatus(who + " \uD83C\uDF89", "win");
    return true;
}

// Computer player (plays O)
function computerMove() {
    const emptySquares = board
        .map((value, index) => (value ? null : index))
        .filter(index => index !== null);

    const move = levelSel.value === "hard"
        ? bestMove()
        : emptySquares[Math.floor(Math.random() * emptySquares.length)];

    place(move, "O");
    locked = false;
    if (finishIfOver()) return;

    current = "X";
    showTurn();
}

// Minimax: tries every possible game to find the best move
function minimax(b, isO) {
    const result = getResult(b);
    if (result) {
        if (result.winner === "O") return 1;
        if (result.winner === "X") return -1;
        return 0;
    }

    let best = isO ? -Infinity : Infinity;
    for (let i = 0; i < 9; i++) {
        if (b[i]) continue;
        b[i] = isO ? "O" : "X";
        const score = minimax(b, !isO);
        b[i] = null;
        best = isO ? Math.max(best, score) : Math.min(best, score);
    }
    return best;
}

function bestMove() {
    let bestScore = -Infinity;
    let move = null;
    for (let i = 0; i < 9; i++) {
        if (board[i]) continue;
        board[i] = "O";
        const score = minimax(board, false);
        board[i] = null;
        if (score > bestScore) {
            bestScore = score;
            move = i;
        }
    }
    return move;
}

// Mode switch and buttons
function resetScores() {
    scores.X = 0;
    scores.O = 0;
    scores.D = 0;
    Object.values(scoreEls).forEach(el => (el.textContent = "0"));
    newGame();
}

function setMode(newMode) {
    if (newMode === mode) return;

    if (mode === "online") leaveOnline();

    mode = newMode;
    modePvp.classList.toggle("active", mode === "pvp");
    modeCpu.classList.toggle("active", mode === "cpu");
    modeOnline.classList.toggle("active", mode === "online");
    levelRow.hidden = mode !== "cpu";
    document.getElementById("onlinePanel").hidden = mode !== "online";
    document.getElementById("onlineMsg").textContent = "";

    setNames();
    refreshOnlinePanel();
    resetScores();
}

modePvp.addEventListener("click", () => setMode("pvp"));
modeCpu.addEventListener("click", () => setMode("cpu"));
modeOnline.addEventListener("click", () => setMode("online"));
levelSel.addEventListener("change", resetScores);

document.getElementById("newBtn").addEventListener("click", () => {
    if (mode === "online" && connected) conn.send({ type: "restart" });
    newGame();
});

document.getElementById("resetBtn").addEventListener("click", () => {
    if (mode === "online" && connected) conn.send({ type: "reset" });
    resetScores();
});


/* ================= PART 4: ONLINE PLAY (PeerJS) ================= */
const PEER_PREFIX = "skillcraft-ttt-";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const onlineLocked = document.getElementById("onlineLocked");
const onlineMenu = document.getElementById("onlineMenu");
const roomInfo = document.getElementById("roomInfo");
const roomCodeEl = document.getElementById("roomCode");
const roomInput = document.getElementById("roomInput");
const onlineMsg = document.getElementById("onlineMsg");

let peer = null;            // our connection to the PeerJS server
let conn = null;            // the connection to our friend
let connected = false;      // true when both players are in the room
let myMark = null;          // "X" for the room creator, "O" for the joiner
let opponentName = "";

function makeCode() {
    return Array.from(
        crypto.getRandomValues(new Uint8Array(5)),
        n => CODE_CHARS[n % CODE_CHARS.length]
    ).join("");
}

function hasPeerJs() {
    if (typeof Peer === "undefined") {
        onlineMsg.textContent = "Online play could not load. Check your internet and refresh.";
        return false;
    }
    return true;
}

// Shows the right part of the online panel
function refreshOnlinePanel() {
    onlineLocked.hidden = !!currentUser;
    onlineMenu.hidden = !currentUser || !!peer;
    roomInfo.hidden = !peer;
}

function leaveOnline() {
    const oldConn = conn;
    const oldPeer = peer;

    // Clear first so old events from these connections are ignored
    conn = null;
    peer = null;
    connected = false;
    myMark = null;
    opponentName = "";

    if (oldConn) oldConn.close();
    if (oldPeer) oldPeer.destroy();

    setNames();
    refreshOnlinePanel();
}

function failOnline(error) {
    let message = "Connection problem (" + error.type + "). Please try again.";

    if (error.type === "peer-unavailable") {
        message = "Room not found. Check the code and try again.";
    } else if (["network", "server-error", "socket-error", "socket-closed"].includes(error.type)) {
        message = "Cannot reach the connection server. Check your internet.";
    }

    leaveOnline();
    resetScores();
    onlineMsg.textContent = message;
}

// ----- Create a room (you play X) -----
function createRoom() {
    if (!currentUser) return openAuth("login");
    if (!hasPeerJs()) return;

    leaveOnline();

    const code = makeCode();
    const p = new Peer(PEER_PREFIX + code);
    peer = p;
    myMark = "X";
    roomCodeEl.textContent = code;
    onlineMsg.textContent = "Starting room...";
    refreshOnlinePanel();

    p.on("open", () => {
        if (p !== peer) return;
        onlineMsg.textContent = "Share the code with your friend and wait for them to join.";
        newGame();
    });

    p.on("connection", incoming => {
        if (p !== peer) return;
        if (conn) {
            incoming.close();   // room already has two players
            return;
        }
        setupConnection(incoming);
    });

    p.on("error", error => {
        if (p !== peer) return;
        if (error.type === "unavailable-id") {
            createRoom();       // code already used, try another one
            return;
        }
        failOnline(error);
    });
}

// ----- Join a friend's room (you play O) -----
function joinRoom() {
    if (!currentUser) return openAuth("login");

    const code = roomInput.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(code)) {
        onlineMsg.textContent = "Enter the 5 character room code.";
        return;
    }
    if (!hasPeerJs()) return;

    leaveOnline();

    const p = new Peer();
    peer = p;
    myMark = "O";
    roomCodeEl.textContent = code;
    onlineMsg.textContent = "Connecting...";
    refreshOnlinePanel();
    newGame();

    p.on("open", () => {
        if (p !== peer) return;
        setupConnection(p.connect(PEER_PREFIX + code, { reliable: true }));
    });

    p.on("error", error => {
        if (p !== peer) return;
        failOnline(error);
    });
}

function setupConnection(c) {
    conn = c;

    // The joiner introduces itself first
    c.on("open", () => {
        if (myMark === "O") c.send({ type: "hello", name: currentUser.name });
    });
    c.on("data", message => {
        if (c === conn) onMessage(message);
    });
    c.on("close", () => {
        if (c === conn) onFriendLeft();
    });
    c.on("error", () => {
        if (c === conn) onFriendLeft();
    });
}

// Messages from your friend
function onMessage(message) {
    if (!message || typeof message !== "object") return;

    if (message.type === "hello") {
        opponentName = String(message.name || "Friend").slice(0, 15);

        if (!connected) {
            connected = true;
            if (myMark === "X") conn.send({ type: "hello", name: currentUser.name });

            setNames();
            onlineMsg.textContent = "Connected with " + opponentName + ". X goes first.";
            resetScores();
        }
    } else if (message.type === "move") {
        const index = message.index;
        const validMove = Number.isInteger(index) && index >= 0 && index < 9;

        // Ignore bad moves and moves made on our own turn
        if (!validMove || gameOver || board[index] || current === myMark) return;

        place(index, current);
        if (finishIfOver()) return;

        current = current === "X" ? "O" : "X";
        showTurn();
    } else if (message.type === "restart") {
        newGame();
    } else if (message.type === "reset") {
        resetScores();
    }
}

function onFriendLeft() {
    connected = false;
    locked = true;
    cells.forEach(cell => (cell.disabled = true));
    setStatus(opponentName + " left the game", "");
    onlineMsg.textContent = "Your friend left. Press Leave room to start again.";
}

document.getElementById("createBtn").addEventListener("click", createRoom);
document.getElementById("joinBtn").addEventListener("click", joinRoom);

roomInput.addEventListener("keydown", event => {
    if (event.key === "Enter") joinRoom();
});

document.getElementById("leaveBtn").addEventListener("click", () => {
    leaveOnline();
    onlineMsg.textContent = "";
    resetScores();
});

document.getElementById("copyBtn").addEventListener("click", event => {
    const button = event.currentTarget;

    navigator.clipboard.writeText(roomCodeEl.textContent)
        .then(() => (button.textContent = "Copied!"))
        .catch(() => (button.textContent = "Copy failed"));

    setTimeout(() => (button.textContent = "Copy code"), 1500);
});


/* ================= START ================= */
restoreSession();
newGame();
updateAuthUI();