const chatEl = document.getElementById("chat");
const inputEl = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");

let history = [];

// --------- Helpers UI ---------
function scrollToBottom(smooth = true) {
  chatEl.scrollTo({
    top: chatEl.scrollHeight,
    behavior: smooth ? "smooth" : "auto",
  });
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Markdown básico (sem lib):
 * - **negrito**
 * - *itálico*
 * - ### título
 * - listas com "- " ou "* "
 * - separador "---"
 */
function renderMarkdown(text) {
  let t = escapeHtml(text);

  // separador
  t = t.replace(/^\s*---\s*$/gm, "<hr/>");

  // títulos
  t = t.replace(/^###\s(.+)$/gm, "<h3>$1</h3>");

  // negrito e itálico
  t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // listas simples
  // converte blocos que começam com "- " em <ul>
  const lines = t.split("\n");
  let out = [];
  let inList = false;

  for (const line of lines) {
    const m = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (m) {
      if (!inList) {
        inList = true;
        out.push("<ul>");
      }
      out.push(`<li>${m[2]}</li>`);
    } else {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push(line);
    }
  }
  if (inList) out.push("</ul>");

  // quebras de linha
  return out.join("<br/>");
}

function addMessage({ who, text }) {
  const isUser = who === "user";

  const row = document.createElement("div");
  row.className = `row ${isUser ? "row--user" : "row--bot"}`;

  const avatar = document.createElement("div");
  avatar.className = `avatar ${isUser ? "avatar--user" : "avatar--bot"}`;
  avatar.textContent = isUser ? "🙂" : "📍";

  const bubble = document.createElement("div");
  bubble.className = `bubble ${isUser ? "bubble--user" : "bubble--bot"}`;
  bubble.innerHTML = renderMarkdown(text);

  const meta = document.createElement("div");
  meta.className = `meta ${isUser ? "" : "meta--bot"}`;
  meta.textContent = isUser ? "Você" : "PIN";

  bubble.appendChild(meta);

  if (isUser) {
    row.appendChild(bubble);
    row.appendChild(avatar);
  } else {
    row.appendChild(avatar);
    row.appendChild(bubble);
  }

  chatEl.appendChild(row);
  scrollToBottom(true);
}

function showTyping() {
  const row = document.createElement("div");
  row.className = "row row--bot";
  row.id = "typingRow";

  const avatar = document.createElement("div");
  avatar.className = "avatar avatar--bot";
  avatar.textContent = "📍";

  const typing = document.createElement("div");
  typing.className = "typing";

  const dots = document.createElement("div");
  dots.className = "dots";
  dots.innerHTML = `<span class="dot"></span><span class="dot"></span><span class="dot"></span>`;

  typing.appendChild(dots);
  row.appendChild(avatar);
  row.appendChild(typing);

  chatEl.appendChild(row);
  scrollToBottom(true);
}

function hideTyping() {
  const el = document.getElementById("typingRow");
  if (el) el.remove();
}

// Auto-resize textarea
function autoresize() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + "px";
}

// --------- API Call ---------
async function sendMessage() {
  const message = inputEl.value.trim();
  if (!message) return;

  addMessage({ who: "user", text: message });
  inputEl.value = "";
  autoresize();

  showTyping();

  try {
    const res = await fetch("http://localhost:8787/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history }),
    });

    const data = await res.json();

    hideTyping();

    if (!res.ok) {
      addMessage({
        who: "bot",
        text: `**Erro:** ${data?.error || "Falha ao chamar o backend."}`,
      });
      return;
    }

    if (data?.text) {
      addMessage({ who: "bot", text: data.text });

      // mantém histórico para contexto
      history.push({ role: "user", content: message });
      history.push({ role: "assistant", content: data.text });
    } else {
      addMessage({ who: "bot", text: "**Erro:** resposta inválida." });
    }
  } catch (err) {
    hideTyping();
    addMessage({
      who: "bot",
      text: "**Erro:** não consegui conectar com o backend (localhost:8787).",
    });
    console.error(err);
  }
}

// --------- Events ---------
sendBtn.addEventListener("click", sendMessage);

inputEl.addEventListener("input", autoresize);

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

clearBtn.addEventListener("click", () => {
  chatEl.innerHTML = "";
  history = [];
  addMessage({
    who: "bot",
    text: "Oi! Eu sou o **PIN**. Me diga sua cidade e quanto tempo você tem (ex: 2h, 1 dia, 3 dias) 😉",
  });
});

// Boot message
addMessage({
  who: "bot",
  text: "Oi! Eu sou o **PIN**. Me diga sua cidade e quanto tempo você tem (ex: 2h, 1 dia, 3 dias) 😉",
});
autoresize();