import { GoogleGenAI } from "@google/genai";
import { SourceChunk, AppSettings, Conversation, ConversationHeader } from '../types';
import { INITIAL_SYSTEM_INSTRUCTION } from '../constants';

const createClient = (apiKey: string) => new GoogleGenAI({ apiKey });

const API_BASE_URL = "http://localhost:5000/api";

export const getConversations = async (): Promise<ConversationHeader[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/conversations`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching conversations:", error);
    throw error;
  }
};

export const getConversation = async (id: string): Promise<Conversation> => {
  try {
    const response = await fetch(`${API_BASE_URL}/conversations/${id}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching conversation ${id}:`, error);
    throw error;
  }
};

export const saveConversation = async (conversation: Conversation): Promise<{ success: boolean; id: string }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(conversation),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error saving conversation ${conversation.id}:`, error);
    throw error;
  }
}

export const searchScriptures = async (query: string, settings: AppSettings): Promise<SourceChunk[]> => {
  if (settings.useMockData) {
    // Mock data for demo purposes
    await new Promise(resolve => setTimeout(resolve, 500));
    return [
      { id: 'mock1', bookTitle: 'Bhagavad Gita', chapter: 2, verse: 47, content: 'You have a right to perform your prescribed duties, but you are not entitled to the fruits of your actions.', score: 0.95 },
      { id: 'mock2', bookTitle: 'Yoga Sutras', chapter: 1, verse: 2, content: 'Yoga is the cessation of the fluctuations of the mind.', score: 0.92 },
      { id: 'mock3', bookTitle: 'Upanishads', pageNumber: 42, content: 'Truth alone triumphs; not falsehood.', score: 0.88 }
    ];
  }

  if (!settings.backendUrl) throw new Error("Backend URL missing");

  try {
    // Use the language from settings, fallback to 'en' if not set
    const lang = settings.language || 'en';

    const response = await fetch(settings.backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: query,
        language: lang,
        top_k: 5 // Fetch top 5 for the agent to read
      })
    });

    if (!response.ok) throw new Error(`Backend Error: ${response.status}`);
    const data = await response.json();

    if (!data.success) throw new Error(data.error || "Unknown error from backend");

    return (data.results || []).map((item: any) => ({
      id: `${(item.book || 'unknown').replace(/\s+/g, "").toLowerCase()}.${item.chapter}.${item.verse}`,
      bookTitle: item.book || 'Unknown',
      chapter: item.chapter,
      verse: item.verse,
      content: item.text,
      score: item.final_score || item.score || 0
    }));
  } catch (err: any) {
    console.error("Retrieval error", err);
    throw err;
  }
};

export const generateRAGResponse = async (
  userQuery: string,
  initialChunks: SourceChunk[], // We might ignore these in agentic mode or use them as initial context
  settings: AppSettings,
  chatHistory: { role: string; parts: { text: string }[] }[] = [],
  onStep?: (step: any) => void,
  onSourcesFound?: (chunks: SourceChunk[]) => void
) => {
  if (!settings.apiKey) {
    throw new Error("API Key is missing. Please check settings.");
  }

  const client = createClient(settings.apiKey);
  const MAX_STEPS = 25; // Increased for deep philosophical research
  let currentStep = 0;

  // We maintain a "scratchpad" of the agent's internal monologue and actions
  let scratchpad = "";

  const languageInstruction = settings.language === 'ru'
    ? "IMPORTANT: The user prefers Russian. You MUST search the database using Russian queries (translate if necessary) and your Final Answer MUST be in Russian."
    : "IMPORTANT: The user prefers English. You MUST search the database using English queries and your Final Answer MUST be in English.";

  const SYSTEM_PROMPT = `
You are an intelligent spiritual research assistant. Your goal is to answer the user's question by searching the scripture database.
You have access to a tool called 'search_database'.

${languageInstruction}

INSTRUCTIONS:
1.  Analyze the user's request.
2.  Use the following Thought-Action-Observation loop to gather information:
    
    Thought: <Reasoning about what to search for next>
    Action: search_database("search query")
    Observation: <The results from the database>
    
    (Repeat this loop as necessary until you have enough information)

3.  When you have sufficient information, output the final answer:
    
    Thought: I have enough information.
    Final Answer: <Your comprehensive, detailed response citing the sources found>

4.  If the initial search results are not relevant, refine your search query and try again.
5.  Always cite sources using [[ID]] format when providing the Final Answer.
6.  If you have performed many searches and still haven't found the perfect answer, synthesize the best possible answer from what you HAVE found. Do not give up.

Begin!
`;

  // Initial context from the first search (if provided by App.tsx, though we might want the agent to do it)
  // To be efficient, if initialChunks are provided, we can treat them as the first Observation.
  if (initialChunks.length > 0) {
    const formattedContext = initialChunks.map(c => `[ID:${c.id}] ${c.bookTitle} ${c.chapter}:${c.verse} - "${c.content}"`).join('\n');
    scratchpad += `Observation: Found initial relevant verses:\n${formattedContext}\n\n`;
  }

  while (currentStep < MAX_STEPS) {
    currentStep++;
    console.log(`--- Agent Step ${currentStep} ---`);

    // Construct the full prompt with history and scratchpad
    const messages = [
      ...chatHistory.map(msg => ({ role: msg.role, parts: msg.parts })),
      { role: 'user', parts: [{ text: userQuery }] }, // The current question
      { role: 'model', parts: [{ text: scratchpad }] } // The agent's current state/memory
    ];

    try {
      const result = await client.models.generateContent({
        model: settings.model,
        contents: messages,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0.2, // Low temperature for precise reasoning
          stopSequences: ["Observation:"], // Stop before hallucinating an observation
        }
      });

      const responseText = result.text || "";
      console.log("Agent Response:", responseText);

      scratchpad += responseText; // Append the model's output to the scratchpad

      // Parse the response for Thought and Action
      // Improved regex to handle different quote styles and potential formatting issues
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
        const query = actionMatch[2]; // The second capture group contains the query inside quotes
        console.log(`Agent Action: Searching for '${query}'`);

        if (onStep) onStep({ type: 'action', content: `Searching for: "${query}"`, timestamp: Date.now() });

        // Execute the search
        try {
          const results = await searchScriptures(query, settings);

          if (onSourcesFound) {
            onSourcesFound(results);
          }

          // Format results for the model
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
        // If no action and no final answer, the model might be just thinking or confused.
        console.log("Agent did not output Action or Final Answer. Continuing...");

        // If it didn't output anything useful, we might break.
        if (!responseText.trim()) {
          console.warn("Empty response from agent, breaking loop.");
          break;
        }

        // If it didn't output an Action but didn't finish, maybe it's just rambling. 
        // We append a newline and hope it continues or we force a stop if it's too long.
        scratchpad += "\n";
      }

    } catch (error) {
      console.error("Agent Loop Error:", error);
      throw error;
    }
  }

  // Fallback if MAX_STEPS reached
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
