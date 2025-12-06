import { GoogleGenAI } from "@google/genai";
import { SourceChunk, AppSettings, Conversation, ConversationHeader, AgentStep } from '../types';
import { DEMO_CHUNKS } from '../constants';

const createClient = (apiKey: string) => new GoogleGenAI({ apiKey });

const API_BASE_URL = "http://localhost:5000/api";

export const getConversations = async (): Promise<ConversationHeader[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/conversations`);
    if (!response.ok) {
      // Return empty array on error to be resilient
      return [];
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return [];
  }
};

export const getConversation = async (id: string): Promise<Conversation | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/conversations/${id}`);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching conversation ${id}:`, error);
    return null;
  }
};

export const saveConversation = async (conversation: Conversation): Promise<void> => {
  try {
    await fetch(`${API_BASE_URL}/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(conversation),
    });
  } catch (error) {
    console.error(`Error saving conversation ${conversation.id}:`, error);
  }
}

export const deleteConversation = async (id: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE_URL}/conversations/${id}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error(`Failed to delete: ${response.status}`);
  } catch (e) {
    console.error("Failed to delete conversation:", e);
    throw e;
  }
};

export const searchScriptures = async (query: string, settings: AppSettings): Promise<SourceChunk[]> => {
  if (settings.useMockData) {
    return DEMO_CHUNKS;
  }

  // Use settings.backendUrl if available, otherwise fallback to API_BASE_URL/search
  const url = settings.backendUrl || `${API_BASE_URL}/search`;

  try {
    const isCyrillic = /[а-яА-ЯёЁ]/.test(query);
    const lang = isCyrillic ? 'ru' : (settings.language || 'en');

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: query,
        language: lang,
        top_k: 20,
        api_key: settings.apiKey
      })
    });

    if (!response.ok) {
      console.warn(`Backend search failed: ${response.status}`);
      return [];
    }
    const data = await response.json();

    const results = data.results || [];
    return results.map((item: any) => ({
      id: `${(item.book || 'unknown').replace(/\s+/g, "").toLowerCase()}.${item.chapter}.${item.verse}`,
      bookTitle: item.book || 'Unknown',
      chapter: item.chapter,
      verse: item.verse,
      content: item.text,
      score: item.final_score || item.score || 0,
      sourceUrl: item.html_path
    }));
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
  if (!settings.apiKey) {
    throw new Error("API Key is missing. Please check settings.");
  }

  const client = createClient(settings.apiKey);
  const MAX_STEPS = 25;
  let currentStep = 0;

  let scratchpad = "";

  const SYSTEM_PROMPT = `
You are an intelligent spiritual research assistant. Your goal is to answer the user's question by searching the scripture database.
You have access to a tool called 'search_database'.

INSTRUCTIONS:
1.  Analyze the user's request.
2.  Use the following Thought-Action-Observation loop to gather information:
    
    Thought: <Reasoning about what to search for next>
    Action: search_database("search query")
    Observation: <The results from the database>
    
    (Repeat this loop as necessary until you have enough information)

SEARCH STRATEGY:
When searching for information, strictly follow this tiered approach to avoid overwhelming the search results:

1. **Phase 1: Entity Extraction & Normalization (CRITICAL step)**
   - Identify the main subject (Entity/Name/Concept).
   - **Normalize to Nominative Case (Именительный падеж):** If the user asks about "Камсу" (Accusative), you MUST search for "Камса" (Nominative).
   - **Distinguish Entity vs. Concept:**
     - If it is a *Proper Name* (e.g., Kamsa, Krishna, Vrindavan) -> Search the **Single Word**.
     - If it is a *General Concept* (e.g., Bhakti Yoga, Soul nature) -> Search the **2-3 word phrase** (e.g., "Бхакти йога", "природа души"). Searching single words like "nature" creates too much noise.

2. **Phase 2: The Search Loop**
   - **Step A (Primary Russian Term):** Search the normalized Russian term first (e.g., "Камса"). *Reason: The database is primarily in Russian.*
   - **Step B (Latin/English Term):** If Step A yields poor results, search the transliterated term (e.g., "Kamsa").
   - **Step C (Contextual Query):** If A and B fail, create a specific query (e.g., "Демон Камса история").

3. **Phase 3: Result Analysis**
   - If the search returns > 10 results, look for the most relevant specific chunk before answering.

STRICT RULE FOR FIRST ACTION:
Your FIRST \`search_database\` action MUST use the simplest possible **Nominative** form of the main keyword. Do NOT start with complex questions like "Who killed Kamsa". Start with "Камса".

3.  When you have sufficient information, output the final answer:
    
    Thought: I have enough information.
    Final Answer: <Your comprehensive, detailed response citing the sources found>

4.  If the initial search results are not relevant, refine your search query and try again.
5.  Always cite sources using [[ID]] format when providing the Final Answer.
6.  If you have performed many searches and still haven't found the perfect answer, synthesize the best possible answer from what you HAVE found. Do not give up.

FORMATTING RULES:
When citing verses, use the following special blocks for better readability:

For the verse text:
**📖 [Book] [Chapter].[Verse]**
> [Devanagari text if available]
> *[Transliteration if available]*
>
> "[Translation]"

For the purport (commentary):
**💬 Purport by Srila Prabhupada:**
> [Key parts of the purport...]

Then provide your own analysis without special formatting.

NO DUPLICATION RULE (CRITICAL):
- In your Final Answer, NEVER quote the same verse/text/book reference more than once.
- If you found the same content multiple times in different searches, cite it only ONCE.
- Each [[ID]] citation should appear only ONCE in your response.
- Check your scratchpad for previously cited sources before adding a new citation.
- Synthesize information from duplicate findings, don't repeat them.

LANGUAGE RULES:
- **Output Language:** The \`Final Answer\` MUST be in the same language as the user's query.
  - User Russian -> Final Answer Russian.
  - User English -> Final Answer English.
- **Thinking Process:** You may generate \`Thought:\` traces in English (for better logic) or Russian, but the content sent to the user must match their language.
- **Search Queries:** 
  - ALWAYS prioritize Russian search terms first, even if the user asks in English (assuming the source material is Russian).
  - Use English search terms only as a fallback.
- Do not mix languages unless quoting a text in its original language.

Begin!

EXAMPLES:

User: "Почему Кришна убил Камсу?"
Thought: The user is asking about "Kamsa" (in accusative case "Камсу"). I need to find who Kamsa is and his relation to Krishna.
Step 1: Normalize "Камсу" -> "Камса".
Step 2: Search for the single entity first.
Action: search_database("Камса")

User: "Tell me about the soul"
Thought: The user is asking about "soul". The Russian equivalent is "душа".
Step 1: Simple search for the main concept.
Action: search_database("душа")

User: "What is Karma Yoga?"
Thought: This is a concept, not a single name. A single word search for "Yoga" is too broad. I will search for the phrase.
Action: search_database("карма йога")
`;

  if (initialChunks.length > 0) {
    const formattedContext = initialChunks.map(c => `[ID:${c.id}] ${c.bookTitle} ${c.chapter}:${c.verse} - "${c.content}"`).join('\n');
    scratchpad += `Observation: Found initial relevant verses:\n${formattedContext}\n\n`;
  }

  while (currentStep < MAX_STEPS) {
    currentStep++;
    console.log(`--- Agent Step ${currentStep} ---`);

    if (signal?.aborted) {
      throw new Error("Aborted by user");
    }

    const messages = [
      ...chatHistory.map(msg => ({ role: msg.role, parts: msg.parts })),
      { role: 'user', parts: [{ text: userQuery }] },
      { role: 'model', parts: [{ text: scratchpad }] }
    ];

    try {
      const result = await client.models.generateContent({
        model: settings.model,
        contents: messages,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0.2,
          stopSequences: ["Observation:"],
        }
      });

      if (signal?.aborted) {
        throw new Error("Aborted by user");
      }

      const responseText = result.text || "";
      console.log("Agent Response:", responseText);

      scratchpad += responseText;

      const thoughtMatch = responseText.match(/Thought:\s*(.*?)(?=\nAction:|\nFinal Answer:|$)/si);
      const actionMatch = responseText.match(/Action:\s*search_database\((["'])(.*?)\1\)/i);
      const finalAnswerMatch = responseText.match(/Final Answer:\s*(.*)/si);

      if (thoughtMatch && onStep) {
        onStep({ type: 'thought', content: thoughtMatch[1].trim(), timestamp: Date.now() });
      }

      if (finalAnswerMatch) {
        return finalAnswerMatch[1].trim();
      }

      if (actionMatch) {
        const query = actionMatch[2];
        console.log(`Agent Action: Searching for '${query}'`);

        if (onStep) onStep({ type: 'action', content: `Searching for: "${query}"`, timestamp: Date.now() });

        try {
          const results = await searchScriptures(query, settings);

          if (onSourcesFound) {
            onSourcesFound(results);
          }

          let observation = "";
          if (results.length === 0) {
            observation = "\nObservation: No relevant verses found for this query.\n\n";
          } else {
            const formatted = results.map(c => `[ID:${c.id}] ${c.bookTitle} ${c.chapter}:${c.verse} - "${c.content}"`).join('\n');
            observation = `\nObservation: Found the following verses:\n${formatted}\n\n`;
          }

          scratchpad += observation;
          if (onStep) onStep({ type: 'observation', content: `Found ${results.length} results.`, timestamp: Date.now() });

        } catch (err: any) {
          console.error("Search Error:", err);
          scratchpad += `\nObservation: Error executing search: ${err.message}\n\n`;
        }
      } else {
        console.log("Agent did not output Action or Final Answer. Continuing...");

        if (!responseText.trim()) {
          console.warn("Empty response from agent, breaking loop.");
          break;
        }

        scratchpad += "\n";
      }

    } catch (error) {
      console.error("Agent Loop Error:", error);
      throw error;
    }
  }

  console.warn("Agent reached MAX_STEPS. Forcing a conclusion.");
  if (onStep) onStep({ type: 'thought', content: "Reaching time limit. Synthesizing available information...", timestamp: Date.now() });

  try {
    const finalPrompt = `
      You have reached the maximum number of steps for this research. 
      Please provide the best possible answer based on the information you have gathered so far in your scratchpad. 
      Do not search anymore. Just summarize and answer.
      Start your response with "Final Answer:".
    `;

    const result = await client.models.generateContent({
      model: settings.model,
      contents: [
        ...chatHistory.map(msg => ({ role: msg.role, parts: msg.parts })),
        { role: 'user', parts: [{ text: userQuery }] },
        { role: 'model', parts: [{ text: scratchpad }] },
        { role: 'user', parts: [{ text: finalPrompt }] }
      ],
      config: {
        temperature: 0.3,
      }
    });

    const text = result.text || "";
    const match = text.match(/Final Answer:\s*(.*)/si);
    return match ? match[1].trim() : text;

  } catch (e) {
    return "I pondered the question deeply and gathered much information, but I struggled to synthesize a final answer in time. Please check the retrieved sources.";
  }
};