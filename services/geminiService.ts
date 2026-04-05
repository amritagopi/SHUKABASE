import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { SourceChunk, AppSettings, Conversation, ConversationHeader, AgentStep } from '../types';
import { DEMO_CHUNKS } from '../constants';
import { resolveApiBaseUrl, resolveSearchUrl } from '../utils/apiUrl';

const createClient = (apiKey: string, baseUrl?: string) => baseUrl ? new GoogleGenAI({ apiKey, httpOptions: { baseUrl } }) : new GoogleGenAI({ apiKey });

const API_BASE_URL = "http://localhost:5000/api";

export const getConversations = async (backendUrl?: string): Promise<ConversationHeader[]> => {
  const apiBaseUrl = resolveApiBaseUrl(backendUrl || API_BASE_URL);
  try {
    const response = await fetch(`${apiBaseUrl}/conversations`);
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return [];
  }
};

export const getConversation = async (id: string, backendUrl?: string): Promise<Conversation | null> => {
  const apiBaseUrl = resolveApiBaseUrl(backendUrl || API_BASE_URL);
  try {
    const response = await fetch(`${apiBaseUrl}/conversations/${id}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error(`Error fetching conversation ${id}:`, error);
    return null;
  }
};

export const saveConversation = async (conversation: Conversation, backendUrl?: string): Promise<void> => {
  const apiBaseUrl = resolveApiBaseUrl(backendUrl || API_BASE_URL);
  try {
    await fetch(`${apiBaseUrl}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(conversation),
    });
  } catch (error) {
    console.error(`Error saving conversation ${conversation.id}:`, error);
  }
}

export const deleteConversation = async (id: string, backendUrl?: string): Promise<void> => {
  const apiBaseUrl = resolveApiBaseUrl(backendUrl || API_BASE_URL);
  try {
    const response = await fetch(`${apiBaseUrl}/conversations/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(`Failed to delete: ${response.status}`);
  } catch (e) {
    console.error("Failed to delete conversation:", e);
    throw e;
  }
};

// --- OpenRouter (OpenAI Compatible) Helper with Tool Support ---
const SEARCH_TOOL_DEF = {
  type: "function",
  function: {
    name: "search_database",
    description: "Search for spiritual knowledge in the database (Srimad Bhagavatam, Bhagavad Gita, etc). Use this to find verses, purports, or concepts.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query. Concepts (e.g. 'dharma'), Names (e.g. 'Krishna'), or Verses (e.g. 'SB 1.1.1'). Prioritize Russian terms if user asks in Russian."
        }
      },
      required: ["query"]
    }
  }
};

const callOpenAICompatibleApi = async (
  messages: any[],
  settings: AppSettings,
  temperature: number = 0,
  signal?: AbortSignal
): Promise<any> => {
  const config = {
    url: "https://openrouter.ai/api/v1/chat/completions",
    apiKey: settings.openrouterApiKey,
    model: settings.openrouterModel,
    headers: {
      'HTTP-Referer': 'https://shukabase.app',
      'X-Title': 'Shukabase AI'
    }
  };
  console.group(`🚀 [OpenRouter] Request Debugger`);
  try {
    const { url, apiKey, model, headers } = config;

    if (!apiKey) {
      console.error(`❌ API Key is missing inside callOpenRouterAPI!`);
      throw new Error(`OpenRouter API Key is missing (client-side check).`);
    }

    console.log("📍 Target URL:", url);
    console.log("🔑 API Key Status:", apiKey ? "Present" : "Missing", `(${apiKey.substring(0, 8)}...)`);
    console.log("🧠 Model:", model);

    const requestBody = {
      model: model,
      messages: messages,
      temperature: temperature,
      tools: [SEARCH_TOOL_DEF],
      tool_choice: "auto"
    };

    const bodyString = JSON.stringify(requestBody);
    console.log(`📦 Payload Size: ${bodyString.length} chars`);
    console.log("📄 Request Messages Preview:", messages.map(m => `[${m.role}] ${m.content?.substring(0, 50)}...`));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...headers
      },
      body: bodyString,
      signal
    });

    console.log(`📡 Response Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`❌ [OPENROUTER] HTTP Error Body:`, errText);

      let errMsg = errText;
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error?.message || JSON.stringify(errJson);
      } catch { }
      throw new Error(`OPENROUTER API Error: ${errMsg}`);
    }

    const data = await response.json();
    console.log(`✅ [OPENROUTER] Success! Response Data:`, data);
    console.groupEnd();
    return data.choices?.[0]?.message;

  } catch (error) {
    console.error(`🔥 [OPENROUTER] CRITICAL FAILURE:`, error);
    console.groupEnd();
    throw error;
  }
};

export const searchScriptures = async (query: string, settings: AppSettings, signal?: AbortSignal): Promise<SourceChunk[]> => {
  if (settings.useMockData) return DEMO_CHUNKS;

  const url = resolveSearchUrl(settings.backendUrl || `${API_BASE_URL}/search`);

  try {
    const isCyrillic = /[а-яА-ЯёЁ]/.test(query);
    const lang = isCyrillic ? 'ru' : (settings.language || 'en');

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: query,
        language: lang,
        multilingual: settings.multilingualSearch, // Pass the new setting
        top_k: 20, 
        api_key: settings.apiKey
      }),
      signal
    });

    if (!response.ok) {
      console.warn(`Backend search failed: ${response.status}`);
      return [];
    }
    const data = await response.json();
    const results = data.results || [];
    const chunks: SourceChunk[] = results.map((item: any) => ({
      id: `${(item.book || 'unknown').replace(/\s+/g, "").toLowerCase()}.${item.chapter}.${item.verse}`,
      bookTitle: item.book || 'Unknown',
      chapter: item.chapter,
      verse: item.verse,
      content: item.text,
      score: item.final_score || item.score || 0,
      sourceUrl: item.html_path,
      lang: item.lang, // Map language
      translation: item.translation // Map translation
    }));

    // Handle Knowledge Graph context
    if (data.graph_context && typeof data.graph_context === 'string' && data.graph_context.trim()) {
      const graphChunk: SourceChunk = {
        id: 'graph-knowledge-summary',
        bookTitle: 'SHUKABASE KNOWLEDGE GRAPH',
        chapter: 'Summary',
        verse: 'Concepts',
        content: data.graph_context,
        score: 1.0,
      };
      // Prepend to show it as a high-priority overview
      chunks.unshift(graphChunk);
    }

    return chunks;
  } catch (err: any) {
    console.error("Retrieval error", err);
    return [];
  }
};

export const generateRAGResponse = async (
  userQuery: string,
  initialChunks: SourceChunk[],
  settings: AppSettings,
  chatHistory: { role: string; parts: { text: string }[] }[] = [],
  onStep?: (step: AgentStep) => void,
  onSourcesFound?: (chunks: SourceChunk[]) => void,
  signal?: AbortSignal
) => {
  // --- GOOGLE PROVIDER (ReAct Pattern) ---
  if (settings.provider === 'google' || settings.provider === 'proxyapi') {
    const isProxy = settings.provider === 'proxyapi';
    const activeKey = isProxy ? settings.proxyapiApiKey : settings.apiKey;
    const baseUrl = isProxy ? 'https://api.proxyapi.ru/google' : undefined;

    if (!activeKey) throw new Error(isProxy ? "ProxyAPI Key is missing." : "Google API Key is missing.");
    const client = createClient(activeKey, baseUrl);
    const MAX_STEPS = 10;
    let currentStep = 0;

    // ReAct System Prompt for Google
    const GOOGLE_SYSTEM_PROMPT = `
You are SHUKA, a warm and intelligent spiritual research assistant.
Your goal is to answer the user's question by searching the scripture database using the 'search_database' tool.

PERSONA & TONE:
- **Warm & Friendly**: Speak like a kind, humble, and helpful friend or devotee.
- **Language**: Match the user's language. If they speak Russian, respond in warm, natural Russian.
- **Style**: You can use spiritual terms (like "Prabhu", "Mataji" if context implies, or just polite address). 
- **Politeness (CRITICAL)**: In Russian, ALWAYS address the user as "Вы" (Capitalized). Never use "ты". 
- **Greetings**: You MUST start every conversation by choosing ONE of these specific greetings (do not change them):
  - English: 
    - "Hare Krishna! Please accept my humble obeisances!"
    - "Hare Krishna! My obeisances to you!"
    - "Hare Krishna! My obeisances! All glories to Srila Prabhupada!"
    - "Please accept my obeisances."
    - "Hare Krishna! All glories to Srila Prabhupada!"
  - Russian:
    - "Харе Кришна! Примите, пожалуйста, мои смиренные поклоны!"
    - "Харе Кришна! Мои Вам поклоны!"
    - "Харе Кришна! Мои поклоны! Слава Шриле Прабхупаде!"
    - "Примите мои поклоны."
    - "Харе Кришна! Вся слава Шриле Прабхупаде!"
- **Avoid Stiffness**: Do not be robotic or "corporate". Be human-like and compassionate.
- **Humorous/Witty**: (Optional) You can use specific slang or "Vaishnava humor" if appropriate, but keep it respectful to the philosophy.
- **Conflict**: Never scold the user. If they ask something outside your scope, gently explain your limitations with a smile 😇.

### KNOWLEDGE SOURCES
1. **Scripture Database:** Direct quotes from Srila Prabhupada's books. Used for specific verses and purports.
2. **Knowledge Graph:** Synthesized high-level summaries of entities and theological concepts. Use this to provide broader context and connect different topics.

### INSTRUCTIONS:
1. Analyze the user's request.
2. Use the following Thought-Action-Observation loop strictly:

   Thought: <Reasoning about what to search for next>
   Action: search_database("search query")
   Observation: <The results from the database>

3. **SEARCH STRATEGY (CRITICAL):**
   - **Normalize to Nominative Case:** If user asks "about Kamsa" (accusative), search "Kamsa".
   - **Language Priority:** If query is Russian, search RUSSIAN terms first.
   - **Entities:** Search single words for names.
   - **Concepts:** Search phrases for concepts.
   - **Scripture References (IMPORTANT):** If the user provides a reference (e.g., "SB 7.5.23", "BG 2.13", "ШБ 1.1.1"), search for that exact reference string. Standard abbreviations: SB (ШБ), BG (БГ), CC (ЧЧ).

4. **DATABASE LIMITATIONS / CITATIONS:**
   - The database contains **Srila Prabhupada's books ONLY**.
   - It DOES NOT contain outside bhajans/songs.
   - If asked for a song not in the text: ADMIT IT gently.
   - **INTERNAL SOURCES (CRITICAL)**: You may use info from "SHUKABASE KNOWLEDGE GRAPH" or "PRIORITY RAG LAYER", but **NEVER CITE THEM**. Only cite verses using [[id]].
   - DO NOT INVENT TITLES OR LYRICS.

5. When you have sufficient information OR if you fail to find info after 2-3 attempts:
   Thought: I have enough information.
   Final Answer: <Your comprehensive, warm response citing sources with [[ID]]>

RULES:
- **NO HALLUCINATIONS:** Answer ONLY based on Observations.
- **CITATIONS:** Use [[BookChunkID]] for every claim.
- **NO DUPLICATION:** Never cite the same ID twice.
- **LANGUAGE:** Respond in the user's language.
- **EFFICIENCY**: Try to find the answer in as few steps as possible.
`;

    let scratchpad = "";
    if (initialChunks.length > 0) {
      const formattedContext = initialChunks.map(c => `[[${c.id}]] ${c.bookTitle} ${c.chapter}:${c.verse} - "${c.content}"`).join('\n');
      scratchpad += `Observation: Found initial relevant verses: \n${formattedContext} \n\n`;
    }

    while (currentStep < MAX_STEPS) {
      currentStep++;
      if (signal?.aborted) throw new Error("Aborted");

      const messages: any[] = [
        ...chatHistory.map(msg => ({ role: msg.role, parts: msg.parts })),
        { role: 'user', parts: [{ text: userQuery }] },
        { role: 'model', parts: [{ text: scratchpad }] }
      ];

      console.log(`[Google Agent] Sending request to model '${settings.model}'...`);
      const result = await client.models.generateContent({
        model: settings.model,
        contents: messages,
        config: {
          systemInstruction: GOOGLE_SYSTEM_PROMPT,
          temperature: 0,
          stopSequences: ["Observation:"],
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
          ]
        }
      });
      const responseText = result.text || "";
      console.log(`[Google Agent] Step ${currentStep} Response:`, responseText);
      scratchpad += responseText;

      // SAFETY: If model output is empty/broken, break loop to prevent hang
      if (!responseText || responseText.trim().length === 0) {
        console.warn("[Google Agent] Empty response from model. Breaking loop.");
        break;
      }

      // ... Parsing logic (same as before) ...
      const actionMatch = responseText.match(/Action:\s*search_database\((["'])(.*?)\1\)/i);
      const finalAnswerMatch = responseText.match(/Final Answer:\s*(.*)/si);

      const thoughtMatch = responseText.match(/Thought:\s*(.*?)(?=\nAction:|\nFinal Answer:|$)/si);
      if (thoughtMatch && onStep) onStep({ type: 'thought', content: thoughtMatch[1].trim(), timestamp: Date.now() });

      if (finalAnswerMatch) return finalAnswerMatch[1].trim();

      if (actionMatch) {
        const query = actionMatch[2];
        if (onStep) onStep({ type: 'action', content: `Searching: ${query} `, timestamp: Date.now() });
        const results = await searchScriptures(query, settings, signal);
        if (onSourcesFound) onSourcesFound(results);

        const obs = results.length > 0
          ? `\nObservation: Found ${results.length} results: \n${results.map(c => {
              let text = `[[${c.id}]] (${c.lang || 'unknown'}) ${c.content}`;
              if (c.translation) {
                text += `\n[Translation in ${c.translation.lang}]: ${c.translation.text}`;
              }
              return text;
            }).join('\n')} \n`
          : `\nObservation: No results.\n`;
        scratchpad += obs;
      } else {
        // If no action and no final answer, check if we are just "thinking" too long
        console.log("[Google Agent] No Action/Final Answer detected. Continuing...");
        if (!responseText.trim()) break;
        scratchpad += "\n";
      }
    }
    return scratchpad || "No response generated (Loop ended)."; // Fallback
  }

  // --- OPENROUTER PROVIDER (Native Tool Calling) ---
  if (settings.provider === 'openrouter') {
    const apiKey = settings.openrouterApiKey;

    if (!apiKey) throw new Error(`OpenRouter API Key is missing.`);

    const SYSTEM_PROMPT = `
You are SHUKA, an intelligent and warm-hearted spiritual research assistant dedicated to helping users study the books of His Divine Grace A.C. Bhaktivedanta Swami Prabhupada.

PERSONA:
- **Warm & Friendly**: You are a helpful companion on the spiritual path. Be kind, encouraging, and humble.
- **Tone**: Conversational and natural. Avoid dry, robotic responses. "Be human".
- **Language**: If the user speaks Russian, respond in **Russian**. Use a warm style.
- **Politeness (CRITICAL)**: In Russian, ALWAYS address the user as "Вы" (Capitalized). Never use "ты".
- **Greetings**: You MUST start every conversation by choosing ONE of these specific greetings (do not change them):
  - English: 
    - "Hare Krishna! Please accept my humble obeisances!"
    - "Hare Krishna! My obeisances to you!"
    - "Hare Krishna! My obeisances! All glories to Srila Prabhupada!"
    - "Please accept my obeisances."
    - "Hare Krishna! All glories to Srila Prabhupada!"
  - Russian:
    - "Харе Кришна! Примите, пожалуйста, мои смиренные поклоны!"
    - "Харе Кришна! Мои Вам поклоны!"
    - "Харе Кришна! Мои поклоны! Слава Шриле Прабхупаде!"
    - "Примите мои поклоны."
    - "Харе Кришна! Вся слава Шриле Прабхупаде!"
- **Conflict**: If the user is frustrated or asks for something impossible, respond with empathy and kindness, not sharp refusals.

### KNOWLEDGE SOURCES:
1. **Scripture Database:** Direct quotes from Srila Prabhupada's books. These provide specific authoritative evidence.
2. **Knowledge Graph:** Synthesized high-level summaries of entities and theological concepts. Use this context to connect different topics and provide an overview.

SEARCH STRATEGY (CRITICAL):
1. **Normalization**: Convert search terms to their simplest **Nominative Case** (Именительный падеж).
   - User: "Про Камсу" -> Search: "Камса" (NOT "Про Камсу")
   - User: "О души" -> Search: "душа"
2. **Entities vs Concepts**: 
   - For proper names (Krishna, Arjuna), search the single word.
   - For concepts (Bhakti Yoga), search the phrase to avoid noise.
3. **Language Priority**: If the user asks in Russian, **ALWAYS search in Russian first**.
4. **Scripture References (IMPORTANT)**: If the user provides a reference (e.g., "SB 7.5.23", "BG 2.13", "ШБ 1.1.1"), search for that exact reference string using the 'search_database' tool. Standard abbreviations: SB (ШБ), BG (БГ), CC (ЧЧ).
5. **Tool Usage**: Use the 'search_database' tool multiple times if needed to gather full context.

IMPORTANT LIMITATIONS (MUST FOLLOW):
- **DATABASE SCOPE**: This database contains **Srila Prabhupada's books ONLY**. It does NOT contain the full songbook of previous Acharyas unless quoted inside the books.
- **NO INVENTION**: If the user asks for a specific song/bhajan and you find "mentions" but NOT the full lyrics in the chunks, **DO NOT INVENT** lyrics.
- **HONESTY**: If text is missing, say something like: "К сожалению, в моих книгах нет полного текста этого бхаджана, но вот что я нашел по теме: ..."

CITATION RULES:
- Every major statement must be backed by a source.
- Use the format **[[BookChunkID]]** (e.g., [[sb.1.1.1]]).
- **NO DUPLICATION**: Do not cite the same Chunk ID twice.
- **INTERNAL SOURCES (CRITICAL)**: You may use information from "SHUKABASE KNOWLEDGE GRAPH" or "PRIORITY RAG LAYER", but **DO NOT CITE THEM** using [[id]] tags. Only cite official scripture books.

Be Shuka - wise, kind, and devoted to truth.
`;

    // Prepare message history
    const messages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...chatHistory.map(msg => ({
        role: msg.role === 'model' ? 'assistant' : 'user',
        content: msg.parts[0].text
      })),
      { role: 'user', content: userQuery }
    ];

    if (initialChunks.length > 0) {
      messages.push({
        role: 'system',
        content: `Initial Context: \n${initialChunks.map(c => `[[${c.id}]] ${c.bookTitle} ${c.chapter}:${c.verse} - "${c.content}"`).join('\n')} `
      });
    }

    let currentStep = 0;
    const MAX_STEPS = 10;

    while (currentStep < MAX_STEPS) {
      currentStep++;
      if (signal?.aborted) throw new Error("Aborted");

      const responseMessage = await callOpenAICompatibleApi(messages, settings, 0, signal);

      // Add the Assistant's response to history immediately
      messages.push(responseMessage);

      const content = responseMessage.content;
      const toolCalls = responseMessage.tool_calls;

      if (content) {
        console.log("Assistant Thought/Content:", content);
        if (onStep) onStep({ type: 'thought', content: content, timestamp: Date.now() });
      }

      if (toolCalls && toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          if (toolCall.function.name === 'search_database') {
            const args = JSON.parse(toolCall.function.arguments);
            const query = args.query;

            if (onStep) onStep({ type: 'action', content: `Searching: "${query}"`, timestamp: Date.now() });
            console.log(`[OpenRouter] Tool Call: Searching '${query}'`);

            const results = await searchScriptures(query, settings, signal);
            console.log(`[OpenRouter] Found ${results.length} results.`);

            if (onSourcesFound) onSourcesFound(results);

            const toolResultContent = results.length > 0
              ? `Found ${results.length} verses: \n${results.map(c => {
                  let text = `[[${c.id}]] (${c.lang || 'unknown'}) ${c.bookTitle} ${c.chapter}:${c.verse} - "${c.content}"`;
                  if (c.translation) {
                    text += `\n[Translation in ${c.translation.lang}]: "${c.translation.text}"`;
                  }
                  return text;
                }).join('\n')} `
              : "No relevant verses found.";

            // Push Tool Result to history
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: toolResultContent
            });
            if (onStep) onStep({ type: 'observation', content: `Found ${results.length} results.`, timestamp: Date.now() });
          }
        }
      } else {
        // No tool calls -> Final Answer
        return content || "I could not generate a response.";
      }
    }
  }

  return "Response generation failed.";
};
