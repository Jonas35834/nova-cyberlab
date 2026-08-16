// ==================================================
// APPLICATION STATE & STORAGE
// ==================================================
const gameState = {
  xp: 0,
  level: 1,
  completedLessons: [],
  currentLessonIndex: 0,
  activeHintIndex: 0,
  labDevices: [
    { name: "ROUTER-01", ip: "10.0.0.1", type: "Router" },
    { name: "PC-01", ip: "10.0.0.10", type: "PC" }
  ]
};

function loadState() {
  const saved = localStorage.getItem("cyberlab_state");
  if (saved) {
    const parsed = JSON.parse(saved);
    gameState.xp = parsed.xp || 0;
    gameState.level = parsed.level || 1;
    gameState.completedLessons = parsed.completedLessons || [];
  }
  updateUIStats();
}

function saveState() {
  localStorage.setItem("cyberlab_state", JSON.stringify({
    xp: gameState.xp,
    level: gameState.level,
    completedLessons: gameState.completedLessons
  }));
  updateUIStats();
}

function addXP(amount) {
  gameState.xp += amount;
  gameState.level = Math.floor(gameState.xp / 100) + 1;
  saveState();
}

function resetProgress() {
  localStorage.removeItem("cyberlab_state");
  gameState.xp = 0;
  gameState.level = 1;
  gameState.completedLessons = [];
  gameState.currentLessonIndex = 0;
  saveState();
  location.reload();
}

// ==================================================
// VIRTUELLES DATEISYSTEM (VFS)
// ==================================================
class VirtualFileSystem {
  constructor() {
    this.fs = {
      name: "/",
      type: "dir",
      children: {
        "home": {
          type: "dir",
          children: {
            "user": {
              type: "dir",
              children: {
                "notes.txt": { type: "file", content: "Willkommen beim CYBERLAB Training!" },
                "Documents": { type: "dir", children: {} },
                "Downloads": { type: "dir", children: {} }
              }
            }
          }
        },
        "etc": {
          type: "dir",
          children: {
            "hostname": { type: "file", content: "cyberlab-node1" }
          }
        },
        "var": {
          type: "dir",
          children: {
            "log": {
              type: "dir",
              children: {
                "syslog": { type: "file", content: "SYSTEM OK - All services simulated." }
              }
            }
          }
        }
      }
    };
    this.currentPath = ["home", "user"];
  }

  getCurrentNode() {
    let curr = this.fs;
    for (const part of this.currentPath) {
      if (curr.children && curr.children[part]) {
        curr = curr.children[part];
      }
    }
    return curr;
  }

  getPWD() {
    return "/" + this.currentPath.join("/");
  }

  ls() {
    const node = this.getCurrentNode();
    if (node.type !== "dir") return "";
    return Object.keys(node.children).join("  ");
  }

  cd(target) {
    if (!target || target === "~") {
      this.currentPath = ["home", "user"];
      return "";
    }
    if (target === "..") {
      if (this.currentPath.length > 0) this.currentPath.pop();
      return "";
    }
    const node = this.getCurrentNode();
    if (node.children && node.children[target] && node.children[target].type === "dir") {
      this.currentPath.push(target);
      return "";
    }
    return `cd: no such file or directory: ${target}`;
  }

  cat(filename) {
    const node = this.getCurrentNode();
    if (node.children && node.children[filename]) {
      if (node.children[filename].type === "file") {
        return node.children[filename].content;
      }
      return `cat: ${filename}: Is a directory`;
    }
    return `cat: ${filename}: No such file or directory`;
  }

  mkdir(dirname) {
    if (!dirname) return "mkdir: missing operand";
    const node = this.getCurrentNode();
    if (!node.children[dirname]) {
      node.children[dirname] = { type: "dir", children: {} };
      return "";
    }
    return `mkdir: cannot create directory '${dirname}': File exists`;
  }

  touch(filename) {
    if (!filename) return "touch: missing file operand";
    const node = this.getCurrentNode();
    if (!node.children[filename]) {
      node.children[filename] = { type: "file", content: "" };
    }
    return "";
  }

  rm(target) {
    if (!target) return "rm: missing operand";
    const node = this.getCurrentNode();
    if (node.children[target]) {
      delete node.children[target];
      return "";
    }
    return `rm: cannot remove '${target}': No such file or directory`;
  }

  echo(args) {
    return args.join(" ");
  }
}

const vfs = new VirtualFileSystem();

// ==================================================
// VIRTUELLES NETZWERK & BEFEHLE
// ==================================================
const virtualNetwork = {
  "10.0.0.1": { host: "ROUTER-01", ports: [22, 53] },
  "10.0.0.10": { host: "PC-01", ports: [22] },
  "10.0.0.20": { host: "WEB-01", ports: [22, 80, 443] }
};

function executeCommand(input) {
  const parts = input.trim().split(" ");
  const cmd = parts[0];
  const arg = parts[1];
  const restArgs = parts.slice(1);

  switch (cmd) {
    case "pwd":
      return vfs.getPWD();
    case "ls":
      return vfs.ls();
    case "cd":
      return vfs.cd(arg);
    case "cat":
      return vfs.cat(arg);
    case "mkdir":
      return vfs.mkdir(arg);
    case "touch":
      return vfs.touch(arg);
    case "rm":
      return vfs.rm(arg);
    case "echo":
      return vfs.echo(restArgs);
    case "whoami":
      return "user";
    case "clear":
      return "__CLEAR__";
    case "help":
      return "Verfügbare Befehle: pwd, ls, cd, cat, mkdir, touch, rm, echo, whoami, clear, ping, scan, network";
    case "ping":
      if (!arg) return "Usage: ping <IP>";
      return virtualNetwork[arg] 
        ? `PING ${arg}: 64 bytes from ${arg}: icmp_seq=1 ttl=64 time=0.04 ms`
        : `PING ${arg}: Destination Host Unreachable`;
    case "scan":
      if (!arg) return "Usage: scan <IP>";
      const target = virtualNetwork[arg];
      if (!target) return `Scan error: Host ${arg} not responding.`;
      return `Scanning ${arg} (${target.host})...\nOpen Ports: ${target.ports.join(", ")}/tcp`;
    case "network":
      return Object.entries(virtualNetwork)
        .map(([ip, dev]) => `${ip} -> ${dev.host} (Ports: ${dev.ports.join(", ")})`)
        .join("\n");
    default:
      return `${cmd}: command not found`;
  }
}

// ==================================================
// LEKTIONEN & ÜBUNGSMODUS DATA
// ==================================================
const lessons = [
  {
    id: 1,
    title: "Lektion 01: Das Terminal",
    category: "Linux Grundlagen",
    explanation: "Ein Terminal ermöglicht es dir, einen Computer über Textbefehle zu bedienen. Der Befehl 'pwd' gibt dein aktuelles Verzeichnis aus.",
    task: "Finde heraus, in welchem Verzeichnis du dich befindest.",
    expectedCmd: "pwd",
    hints: [
      "Du brauchst Informationen über dein aktuelles Verzeichnis.",
      "Der gesuchte Befehl besteht aus 3 Buchstaben.",
      "Tippe: pwd"
    ],
    quiz: {
      question: "Was bedeutet die Abkürzung 'pwd'?",
      options: ["Print Working Directory", "Process Web Data", "Path With Details", "Private Word Drive"],
      correct: 0,
      explanation: "'pwd' steht für Print Working Directory."
    }
  },
  {
    id: 2,
    title: "Lektion 02: Dateisystem auflisten",
    category: "Linux Grundlagen",
    explanation: "Mit dem Befehl 'ls' (list) kannst du dir anzeigen lassen, welche Dateien und Ordner sich im aktuellen Verzeichnis befinden.",
    task: "Liste den Inhalt des aktuellen Verzeichnisses auf.",
    expectedCmd: "ls",
    hints: [
      "Der Befehl besteht aus 2 Buchstaben.",
      "Tippe: ls"
    ],
    quiz: {
      question: "Welcher Befehl zeigt Dateien im Ordner an?",
      options: ["cd", "ls", "cat", "mkdir"],
      correct: 1,
      explanation: "'ls' listet Verzeichnisinhalte auf."
    }
  },
  {
    id: 3,
    title: "Lektion 03: Datei-Inhalt anzeigen",
    category: "Linux Grundlagen",
    explanation: "Der Befehl 'cat' (concatenate) wird häufig genutzt, um den Inhalt einer Textdatei direkt im Terminal auszugeben.",
    task: "Lies den Inhalt der Datei 'notes.txt' aus.",
    expectedCmd: "cat notes.txt",
    hints: [
      "Kombiniere den Befehl zum Anzeigen von Dateien mit dem Dateinamen.",
      "Syntax: cat <Dateiname>",
      "Tippe: cat notes.txt"
    ],
    quiz: {
      question: "Was passiert, wenn du 'cat' auf ein Verzeichnis anwendest?",
      options: ["Der Ordner wird gelöscht", "Es gibt eine Fehlermeldung", "Der Inhalt wird aufgelistet", "Eine neue Datei wird erstellt"],
      correct: 1,
      explanation: "'cat' funktioniert nur mit Dateien, nicht mit Verzeichnissen."
    }
  },
  {
    id: 4,
    title: "Lektion 04: Ordner erstellen",
    category: "Linux Grundlagen",
    explanation: "Um Struktur im Dateisystem zu schaffen, kannst du neue Verzeichnisse anlegen. Dafür verwendet man 'mkdir' (make directory).",
    task: "Erstelle ein neues Verzeichnis mit dem Namen 'Projects'.",
    expectedCmd: "mkdir Projects",
    hints: [
      "Der Befehl lautet 'mkdir'.",
      "Hänge das Argument 'Projects' an.",
      "Tippe: mkdir Projects"
    ],
    quiz: {
      question: "Wofür steht die Abkürzung 'mkdir'?",
      options: ["Make Directory", "Move Kernel Directory", "Main Key Directory", "Manage Disk Remote"],
      correct: 0,
      explanation: "'mkdir' steht für Make Directory."
    }
  },
  {
    id: 5,
    title: "Lektion 05: Netzwerk-Scan",
    category: "Netzwerk Grundlagen",
    explanation: "In Cyber-Netzwerken ist es wichtig, aktive Hosts und offene Ports zu identifizieren. Nutze den Befehl 'scan <IP>'.",
    task: "Scanne den Router mit der IP-Adresse 10.0.0.1 auf offene Ports.",
    expectedCmd: "scan 10.0.0.1",
    hints: [
      "Verwende den 'scan'-Befehl.",
      "Die IP des Routers lautet 10.0.0.1.",
      "Tippe: scan 10.0.0.1"
    ],
    quiz: {
      question: "Welcher Port wird standardmäßig für SSH-Verbindungen genutzt?",
      options: ["80", "22", "443", "53"],
      correct: 1,
      explanation: "Port 22 ist der Standardport für SSH."
    }
  }
];

// ==================================================
// UI LOGIC & EVENT HANDLERS
// ==================================================
document.addEventListener("DOMContentLoaded", () => {
  loadState();
  setupNavigation();
  setupTerminals();
  loadLesson(gameState.currentLessonIndex);
  renderLab();
});

function updateUIStats() {
  const statLevel = document.getElementById("stat-level");
  const statXp = document.getElementById("stat-xp");
  const dashLevel = document.getElementById("dash-level");
  const dashXp = document.getElementById("dash-xp");

  if (statLevel) statLevel.innerText = gameState.level;
  if (statXp) statXp.innerText = gameState.xp;
  if (dashLevel) dashLevel.innerText = gameState.level;
  if (dashXp) dashXp.innerText = gameState.xp;
  
  const nextXP = gameState.level * 100;
  const dashNextXp = document.getElementById("dash-next-xp");
  if (dashNextXp) dashNextXp.innerText = nextXP;

  const pct = Math.min(100, Math.floor((gameState.xp / nextXP) * 100));
  const dashXpBar = document.getElementById("dash-xp-bar");
  if (dashXpBar) dashXpBar.style.width = pct + "%";

  const progCount = document.getElementById("prog-completed-count");
  const progXp = document.getElementById("prog-total-xp");
  if (progCount) progCount.innerText = gameState.completedLessons.length;
  if (progXp) progXp.innerText = gameState.xp;

  // Skills
  const linuxPct = Math.min(100, Math.floor((gameState.completedLessons.length / lessons.length) * 100));
  const skillText = document.getElementById("skill-linux-text");
  const skillBar = document.getElementById("skill-linux-bar");
  if (skillText) skillText.innerText = linuxPct + "%";
  if (skillBar) skillBar.style.width = linuxPct + "%";
}

function switchView(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));

  const targetView = document.getElementById(`view-${viewId}`);
  if (targetView) targetView.classList.add("active");

  const activeBtn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
  if (activeBtn) activeBtn.classList.add("active");
}

function setupNavigation() {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      switchView(btn.getAttribute("data-view"));
    });
  });
}

// TERMINAL SETUP
function setupTerminals() {
  // Practice Terminal
  const pInput = document.getElementById("terminal-input");
  const pOutput = document.getElementById("terminal-output");

  if (pInput) {
    pInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const val = pInput.value;
        pInput.value = "";
        handleTerminalInput(val, pOutput, true);
      }
    });
  }

  // Freemode Terminal
  const fInput = document.getElementById("freemode-terminal-input");
  const fOutput = document.getElementById("freemode-terminal-output");

  if (fInput) {
    fInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const val = fInput.value;
        fInput.value = "";
        handleTerminalInput(val, fOutput, false);
      }
    });
  }
}

function handleTerminalInput(cmdText, outputElem, isPractice) {
  if (!cmdText.trim() || !outputElem) return;

  const prompt = `user@cyberlab:${vfs.getPWD()}$ ${cmdText}\n`;
  const result = executeCommand(cmdText);

  if (result === "__CLEAR__") {
    outputElem.innerText = "";
  } else {
    outputElem.innerText += prompt + (result ? result + "\n" : "");
  }
  outputElem.scrollTop = outputElem.scrollHeight;

  // Practice Task Verification
  if (isPractice) {
    const currentLesson = lessons[gameState.currentLessonIndex];
    if (currentLesson && cmdText.trim() === currentLesson.expectedCmd) {
      outputElem.innerText += "\n✓ Aufgabe erfolgreich abgeschlossen!\n";
      outputElem.scrollTop = outputElem.scrollHeight;
      onTaskCompleted(currentLesson);
    }
  }
}

// LESSON SYSTEM
function loadLesson(index) {
  const catElem = document.getElementById("lesson-category");
  const titleElem = document.getElementById("lesson-title");
  const expElem = document.getElementById("lesson-explanation");
  const taskElem = document.getElementById("lesson-task");

  if (index >= lessons.length) {
    if (titleElem) titleElem.innerText = "Alle Lektionen abgeschlossen!";
    if (expElem) expElem.innerText = "Hervorragend! Du hast alle Basis-Lektionen durchgearbeitet.";
    if (taskElem) taskElem.innerText = "Nutze den Freien Modus zum Weiterüben.";
    return;
  }

  const lesson = lessons[index];
  if (catElem) catElem.innerText = lesson.category;
  if (titleElem) titleElem.innerText = lesson.title;
  if (expElem) expElem.innerText = lesson.explanation;
  if (taskElem) taskElem.innerText = lesson.task;

  // Reset Hints & Quiz
  const hintSec = document.getElementById("hint-section");
  const quizBox = document.getElementById("quiz-box");
  const nextBtn = document.getElementById("btn-next-lesson");

  if (hintSec) hintSec.classList.add("hidden");
  if (quizBox) quizBox.classList.add("hidden");
  if (nextBtn) nextBtn.classList.add("hidden");
  gameState.activeHintIndex = 0;
}

const reqHintBtn = document.getElementById("btn-request-hint");
if (reqHintBtn) {
  reqHintBtn.addEventListener("click", () => {
    const lesson = lessons[gameState.currentLessonIndex];
    if (!lesson || !lesson.hints) return;

    if (gameState.activeHintIndex < lesson.hints.length) {
      const hintBox = document.getElementById("hint-section");
      if (hintBox) hintBox.classList.remove("hidden");
      
      const hintNum = document.getElementById("hint-number");
      const hintTxt = document.getElementById("hint-text");
      
      if (hintNum) hintNum.innerText = gameState.activeHintIndex + 1;
      if (hintTxt) hintTxt.innerText = lesson.hints[gameState.activeHintIndex];
      gameState.activeHintIndex++;
    }
  });
}

function onTaskCompleted(lesson) {
  if (!gameState.completedLessons.includes(lesson.id)) {
    gameState.completedLessons.push(lesson.id);
    addXP(50);
  }
  
  // Show Quiz
  const quizBox = document.getElementById("quiz-box");
  if (quizBox) quizBox.classList.remove("hidden");
  
  const qElem = document.getElementById("quiz-question");
  if (qElem) qElem.innerText = lesson.quiz.question;
  
  const optionsElem = document.getElementById("quiz-options");
  if (optionsElem) optionsElem.innerHTML = "";
  
  const feedback = document.getElementById("quiz-feedback");
  if (feedback) feedback.innerText = "";

  if (optionsElem) {
    lesson.quiz.options.forEach((opt, idx) => {
      const btn = document.createElement("button");
      btn.className = "quiz-btn";
      btn.innerText = opt;
      btn.onclick = () => checkQuizAnswer(idx, lesson.quiz.correct, lesson.quiz.explanation);
      optionsElem.appendChild(btn);
    });
  }
}

function checkQuizAnswer(selected, correct, explanation) {
  const feedback = document.getElementById("quiz-feedback");
  const nextBtn = document.getElementById("btn-next-lesson");

  if (selected === correct) {
    if (feedback) {
      feedback.style.color = "var(--term-green)";
      feedback.innerText = "✓ Richtig! " + explanation;
    }
    addXP(25);
    if (nextBtn) nextBtn.classList.remove("hidden");
  } else {
    if (feedback) {
      feedback.style.color = "#f85149";
      feedback.innerText = "✗ Falsch. Versuche es nochmal.";
    }
  }
}

const nextLessonBtn = document.getElementById("btn-next-lesson");
if (nextLessonBtn) {
  nextLessonBtn.addEventListener("click", () => {
    gameState.currentLessonIndex++;
    loadLesson(gameState.currentLessonIndex);
  });
}

// LAB SYSTEM
function addLabDevice(type) {
  const id = gameState.labDevices.length + 1;
  const newDev = {
    name: `${type}-${id < 10 ? '0' + id : id}`,
    ip: `10.0.0.${10 + id}`,
    type: type
  };
  gameState.labDevices.push(newDev);
  virtualNetwork[newDev.ip] = { host: newDev.name, ports: [22] };
  renderLab();
}

function renderLab() {
  const container = document.getElementById("lab-network-display");
  if (!container) return;
  
  container.innerHTML = "";

  gameState.labDevices.forEach(dev => {
    const card = document.createElement("div");
    card.className = "lab-device";
    card.innerHTML = `
      <div style="font-size: 1.5rem; margin-bottom: 0.25rem;">🖥️</div>
      <strong>${dev.name}</strong>
      <div style="font-size: 0.8rem; color: var(--text-muted);">${dev.ip}</div>
      <div style="font-size: 0.75rem; margin-top: 0.25rem;" class="badge">${dev.type}</div>
    `;
    container.appendChild(card);
  });
}