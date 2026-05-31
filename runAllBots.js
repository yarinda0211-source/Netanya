require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { fork } = require("child_process");
const { Client, GatewayIntentBits } = require("discord.js");

// ================= CONFIG =================
const config = require("./config.json");

DISCORD_TOKEN="MTQ4MTYxMDE0MDY5NTEzNDM1Mg.GdUlwy.eXeyuOIEdlo3l_YZQ2AMQkSUDEEwAQoHywzR3A"
OWNER_ID="1033361658682277959"
BASE_DIR="C:/Users/USER/Downloads/בוט של נתניה סיטי"

// ================= STATE =================
const processes = new Map();
const historyFile = "./history.json";
let history = fs.existsSync(historyFile) ? JSON.parse(fs.readFileSync(historyFile)) : [];

// ================= LOGGER =================
const time = () => new Date().toLocaleTimeString("he-IL");

function log(type, bot, msg) {
  const prefix = bot ? `[${bot}]` : "[SYSTEM]";
  console.log(`[${time()}] ${prefix} ${msg}`);
}

function saveHistory() {
  fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
}

function addHistory(bot, action) {
  history.push({ time: new Date(), bot, action });
  if (history.length > 200) history.shift();
  saveHistory();
}

// ================= CORE =================
function getEntry(dirPath) {
  const files = fs.readdirSync(dirPath);
  return files.find(f => config.allowedFiles.includes(f));
}

function startBot(name) {
  if (processes.has(name)) return false;

  const dirPath = path.join(baseDir, name);
  if (!fs.existsSync(dirPath)) return false;

  const entry = getEntry(dirPath);
  if (!entry) return false;

  let retries = 0;

  const spawn = () => {
    const proc = fork(path.join(dirPath, entry), [], {
      cwd: dirPath,
      env: { ...process.env, TOKEN }
    });

    processes.set(name, { proc, retries });

    log("green", name, "✅ הופעל");
    addHistory(name, "STARTED");

    proc.on("exit", (code) => {
      log("yellow", name, `⛔ נסגר (${code})`);
      processes.delete(name);
      addHistory(name, `EXIT ${code}`);

      if (!config.autoRestart) return;

      if (retries < config.maxRetries) {
        retries++;
        log("magenta", name, `♻️ Restart ניסיון ${retries}`);
        setTimeout(spawn, config.restartDelay);
      } else {
        log("red", name, "❌ הגיע למקסימום ריסטארטים");
      }
    });

    proc.on("error", err => {
      log("red", name, `❌ שגיאה: ${err.message}`);
      addHistory(name, `ERROR ${err.message}`);
    });
  };

  spawn();
  return true;
}

function stopBot(name) {
  const p = processes.get(name);
  if (!p) return false;

  p.proc.kill();
  processes.delete(name);

  log("cyan", name, "🛑 נעצר");
  addHistory(name, "STOPPED");
  return true;
}

function restartBot(name) {
  stopBot(name);
  setTimeout(() => startBot(name), 1500);
  addHistory(name, "RESTARTED");
}

// ================= BOOT =================
log("blue", null, "🚀 מפעיל בוטים...");
for (const dir of config.selectedDirs) startBot(dir);
log("green", null, "✅ מערכת עלתה");

// ================= DISCORD =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.on("ready", () => {
  log("green", "DISCORD", `🤖 מחובר כ-${client.user.tag}`);
});

client.on("messageCreate", msg => {
  if (msg.author.bot) return;
  if (msg.author.id !== OWNER_ID) return;

  const [cmd, action, ...args] = msg.content.split(" ");

  if (cmd === "!bots") {
    return msg.reply([...processes.keys()].join(", ") || "אין בוטים");
  }

  if (cmd === "!bot") {
    const name = args.join(" ");

    if (action === "start") startBot(name);
    if (action === "stop") stopBot(name);
    if (action === "restart") restartBot(name);

    return msg.reply(`בוצע: ${action} ${name}`);
  }

  if (cmd === "!stopall") {
    for (const b of processes.keys()) stopBot(b);
    return msg.reply("🛑 הכל נעצר");
  }

  if (cmd === "!startall") {
    for (const b of config.selectedDirs) startBot(b);
    return msg.reply("▶️ הכל הופעל");
  }

  if (cmd === "!history") {
    const last = history.slice(-10).map(h =>
      `${h.bot}: ${h.action}`
    ).join("\n");

    return msg.reply("📜 היסטוריה:\n" + (last || "ריק"));
  }
});

client.login(TOKEN);

// ================= STATUS =================
setInterval(() => {
  log("gray", null,
    `📊 פעילים: ${processes.size}/${config.selectedDirs.length}`
  );
}, config.statusInterval);

// ================= CLEAN SHUTDOWN =================
process.on("SIGINT", () => {
  log("cyan", null, "✋ כיבוי מערכת...");

  for (const b of processes.keys()) stopBot(b);

  process.exit();
});

process.on("uncaughtException", err => {
  log("red", null, `💥 קריסה: ${err.message}`);
});
