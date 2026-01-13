import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8787;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (req, res) => res.json({ ok: true }));

function looksCut(text) {
  if (!text) return false;
  const t = text.trim();
  if (t.length < 80) return false;

  if (t.endsWith("...") || t.endsWith("…")) return true;

  const lastChar = t.slice(-1);
  const endsNice = /[.!?…)\]"'\n]/.test(lastChar);

  const suspiciousEnd = /[A-Za-zÀ-ÿ0-9,;:]/.test(lastChar) && !endsNice;

  const lastWord = t.split(/\s+/).slice(-1)[0] || "";
  const midWord = lastWord.length <= 4 && /[A-Za-zÀ-ÿ]/.test(lastWord);

  const endsWithConnector = /[,;:]$/.test(t);

  return suspiciousEnd || midWord || endsWithConnector;
}

async function callGemini({ systemInstruction, contents }) {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      systemInstruction,
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    }),
  });

  const data = await resp.json();

  if (!resp.ok) {
    return {
      ok: false,
      status: resp.status,
      error: data?.error?.message || "Erro na Gemini API",
      raw: data,
    };
  }

  const chunk =
    (data?.candidates?.[0]?.content?.parts || [])
      .map((p) => p?.text || "")
      .join("") || "";

  const finishReason = data?.candidates?.[0]?.finishReason || "UNKNOWN";

  return { ok: true, chunk, finishReason, raw: data };
}

app.post("/chat", async (req, res) => {
  try {
    const { message, history = [] } = req.body || {};

    if (!process.env.GEMINI_API_KEY) {
      return res
        .status(500)
        .json({ error: "GEMINI_API_KEY não configurada no .env" });
    }

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message é obrigatório (string)" });
    }

    const systemInstruction = {
      parts: [
        {
          text: `Você é o PIN, o assistente oficial do NearbyMe.

IDENTIDADE
- Nome: PIN
- Idioma: Português brasileiro
- Tom: humano, próximo, confiante e prático
- Personalidade: amigo inteligente que conhece a cidade e ajuda a decidir melhor

MISSÃO
Ajudar pessoas a transformarem tempo livre em experiências reais, possíveis e agradáveis.
Você cria roteiros equilibrados, executáveis e bem pensados.

ESTILO NEARBYME
- Experiências > listas infinitas
- Qualidade > quantidade
- Ritmo leve > correria
- Lugares que combinem entre si no mesmo dia
- Sempre considerar deslocamento, conforto e pausas naturais

ATUALIDADE / CONFIABILIDADE (IMPORTANTE)
- Presuma que informações podem mudar (horários, nomes, funcionamento).
- Não invente endereços, horários ou lugares.
- Se não tiver certeza, diga que pode variar e recomende confirmar no Google Maps/site oficial.
- Prefira lugares conhecidos, bem avaliados e fáceis de acessar.

COMO RESPONDER
- Sempre em pt-BR
- Seja claro, organizado e acolhedor
- Use títulos e divisões (manhã/tarde/noite) quando fizer sentido
- Inclua pausas (café, almoço, descanso/jantar) quando o usuário pedir roteiro

REGRAS
- Quando o usuário pedir um roteiro, entregue COMPLETO e bem estruturado.
- Nunca corte a resposta no meio.
- Se faltar contexto, faça no máximo 3 perguntas objetivas.
- Adapte ao perfil (criança, idosos, casal, grupo) e ao tempo disponível.
- Você não é um guia turístico genérico, nem um buscador, nem um vendedor.
- Você é o PIN: ajuda pessoas a viverem melhor os lugares onde estão.`,
        },
      ],
    };

    const safeHistory = Array.isArray(history) ? history : [];
    const contents = [];

    for (const h of safeHistory) {
      if (!h || typeof h.content !== "string") continue;

      if (h.role === "assistant") {
        contents.push({ role: "model", parts: [{ text: h.content }] });
      } else {
        contents.push({ role: "user", parts: [{ text: h.content }] });
      }
    }

    contents.push({ role: "user", parts: [{ text: message }] });

    let fullText = "";
    let finishReason = "UNKNOWN";
    let continued = 0;

    const first = await callGemini({ systemInstruction, contents });

    if (!first.ok) {
      return res
        .status(first.status || 500)
        .json({ error: first.error, raw: first.raw });
    }

    fullText += first.chunk;
    finishReason = first.finishReason;

    contents.push({ role: "model", parts: [{ text: first.chunk }] });

    while (continued < 10) {
      const shouldContinue = finishReason !== "STOP" || looksCut(fullText);
      if (!shouldContinue) break;

      continued++;

      contents.push({
        role: "user",
        parts: [
          {
            text:
              "Continue exatamente de onde parou, sem repetir nada. " +
              "Finalize a resposta completa. " +
              "Se estiver em um roteiro, complete TODOS os dias e finalize com uma conclusão curta.",
          },
        ],
      });

      const next = await callGemini({ systemInstruction, contents });
      if (!next.ok) break;

      if (next.chunk && next.chunk.trim().length > 0) {
        fullText += (fullText.endsWith("\n") ? "" : "\n") + next.chunk.trim();
      }

      finishReason = next.finishReason;

      contents.push({ role: "model", parts: [{ text: next.chunk }] });

      if (finishReason === "STOP" && !looksCut(fullText)) break;
    }

    return res.json({
      text: fullText.trim(),
      finishReason,
      continued,
    });
  } catch (err) {
    console.error("Erro /chat:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Backend rodando em http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Chat:   POST http://localhost:${PORT}/chat`);
});
