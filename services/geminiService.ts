// FIX: Import React to resolve "Cannot find namespace 'React'" error.
import React from 'react';
// FIX: Replace non-exported `UploadedFile` with `File` (aliased to avoid name conflicts).
import { GoogleGenAI, Part, File as GeminiFile, Modality, GenerateContentResponse, Tool } from '@google/genai';
import { Language, ChatMessage, TextPart, InlineDataPart } from '../types';

// New system instruction constant for the specific streaming utility function
const STRICT_LATEX_SYSTEM_INSTRUCTION = `
You are an expert technical assistant. You must adhere to the following rules when generating content:

MATH AND FORMULA RULES (STRICT):
- ALWAYS use '$$' for block equations (e.g., when the formula takes up its own line: $$A = \\pi r^2$$).
- ALWAYS use '$' for inline math (e.g., when the formula is within a sentence: The radius is $r$).
- NEVER use the bracket syntax like \\[ ... \\] or \\( ... \\).
- Use **bold** formatting to highlight key variables or terms.
`;

interface StreamHandlers {
  // CHANGED: Now accepts the extracted text as the first argument, and the raw chunk second.
  onChunk: (text: string, chunk?: GenerateContentResponse) => void;
  isCancelledRef: React.MutableRefObject<boolean>;
}

// --- CONFIGURATION ---

// 1. Expanded Google Fallback Models
// Includes all text-out models, plus experimental audio models as requested.
const GEMINI_FALLBACK_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-robotics-er-1.5-preview',
  // Gemma 3 Models (using 'it' for instruct/chat optimized versions where applicable)
  'gemma-3-27b-it',
  'gemma-3-12b-it',
  'gemma-3-4b-it',
  'gemma-3-2b-it',
  'gemma-3-1b-it',
  // Audio/Multimodal Models (Added per request; may fail if model does not support text-to-text, handled by try-catch)
  'gemini-2.5-flash-tts',
  'gemini-2.5-flash-native-audio-dialog'
];

// A safe character limit for transcripts to avoid exceeding the context window.
const TRANSCRIPT_CHAR_LIMIT = 750_000;

const truncateText = (text: string, limit: number) => {
    if (text.length <= limit) {
        return text;
    }
    return text.slice(0, limit) + "\n... (transcript truncated for brevity) ...";
};

// --- UNIVERSAL CONTENT CLEANER ---

/**
 * Filters out model-specific artifacts (Thinking tags, Citations) to ensure clean data.
 * @param text The raw text chunk or full string from the AI.
 * @returns The cleaned string ready for display.
 */
function cleanAIText(text: string): string {
    if (!text) return '';

    // 1. Remove <think>...</think> blocks (handling newlines)
    // Note: In a full stream implementation, this requires state, handled by processStreamChunk below.
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');

    // 2. Remove Citations/Footnotes like [1], [5], [1, 2]
    // Regex explanation: \[ matches [, \d+ matches digits, (?:,\s*\d+)* matches optional comma+digits, \] matches ]
    cleaned = cleaned.replace(/\[\d+(?:,\s*\d+)*\]/g, '');

    return cleaned;
}

/**
 * Helper class to manage streaming state for cleaning (e.g., handling split <think> tags).
 */
class StreamCleaner {
    private inThinkBlock = false;
    private buffer = '';

    process(chunk: string): string {
        this.buffer += chunk;
        let output = '';

        // If we are stuck in a think block, look for the closer
        if (this.inThinkBlock) {
            const endTagIndex = this.buffer.indexOf('</think>');
            if (endTagIndex !== -1) {
                this.inThinkBlock = false;
                // Discard the think block, keep the rest
                this.buffer = this.buffer.substring(endTagIndex + 8); // 8 is length of </think>
            } else {
                // Still in think block, output nothing, keep buffering to find the end
                return '';
            }
        }

        // Check for new think block start
        const startTagIndex = this.buffer.indexOf('<think>');
        if (startTagIndex !== -1) {
            // Output everything before the tag
            output += this.buffer.substring(0, startTagIndex);
            
            // Check if it closes in the same chunk
            const endTagIndex = this.buffer.indexOf('</think>', startTagIndex);
            if (endTagIndex !== -1) {
                // It opened and closed. Discard the middle.
                this.buffer = this.buffer.substring(endTagIndex + 8);
                // Recursively process the rest of the buffer in case there are more tags
                return output + this.process(''); 
            } else {
                // It opened but didn't close. Enter think mode.
                this.inThinkBlock = true;
                this.buffer = ''; // Buffer consumed (discarded)
                return output; 
            }
        }

        // No think tags? Just output the buffer and clear it
        // We run standard cleaning (citations) on the output
        output += this.buffer;
        this.buffer = ''; 
        return cleanAIText(output);
    }
}


// Helper to safely extract text from a chunk, handling the "chunk.text is not a function" error.
const safeGetText = (chunk: any): string => {
    try {
        if (typeof chunk.text === 'function') {
            return chunk.text();
        }
        // Fallback for plain objects or different SDK response structures
        return chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (e) {
        console.warn("Failed to extract text from chunk:", e);
        return '';
    }
};

// Helper for retrying API calls with exponential backoff to handle rate limiting.
const withRetry = async <T>(apiCall: () => Promise<T>, maxRetries = 3, initialDelay = 1000): Promise<T> => {
    let retries = 0;
    let delay = initialDelay;

    while (retries < maxRetries) {
        try {
            return await apiCall();
        } catch (error: any) {
            // Check for 429 Resource Exhausted (rate limiting)
            const isRateLimitError = error?.message?.includes('429') || 
                                     error?.error?.status === 'RESOURCE_EXHAUSTED' ||
                                     (error instanceof Error && error.message.toLowerCase().includes('resource has been exhausted'));
            
            if (isRateLimitError && retries < maxRetries - 1) {
                console.warn(`Rate limit hit. Retrying in ${delay}ms... (Attempt ${retries + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                retries++;
                delay *= 2; // Exponential backoff
            } else {
                throw error; // Re-throw other errors or if max retries are reached
            }
        }
    }
    // This line should not be reachable if maxRetries > 0, but is a fallback.
    throw new Error('Max retries reached for API call.');
};

// --- PERPLEXITY FALLBACK HANDLER ---
const callPerplexityFallback = async (
    messages: { role: string; content: string }[],
    onChunk: (text: string) => void,
    isCancelledRef: React.MutableRefObject<boolean>
) => {
    console.log("Switching to Perplexity API fallback...");
    
    // Ensure the application has the necessary key
    if (!process.env.PERPLEXITY_API_KEY) {
        throw new Error("Perplexity API Key is missing. Please add PERPLEXITY_API_KEY to your .env.local file.");
    }

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'sonar-reasoning-pro', // Using the reasoning model as requested
            messages: messages,
            stream: true
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Perplexity API Error: ${response.status} - ${errorText}`);
    }

    if (!response.body) throw new Error("Perplexity response body is empty.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    
    // Instantiate cleaner for this stream
    const cleaner = new StreamCleaner();

    while (true) {
        if (isCancelledRef.current) {
            reader.cancel();
            break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Parse SSE (Server-Sent Events)
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep the last incomplete line in buffer

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            
            const dataStr = trimmed.slice(6);
            if (dataStr === "[DONE]") return;

            try {
                const json = JSON.parse(dataStr);
                const content = json.choices?.[0]?.delta?.content;
                if (content) {
                    const cleanContent = cleaner.process(content);
                    if (cleanContent) {
                        onChunk(cleanContent);
                    }
                }
            } catch (e) {
                console.warn("Failed to parse Perplexity chunk", e);
            }
        }
    }
};


export const uploadAndPollFile = async (
    ai: GoogleGenAI,
    file: File,
    onProgress: (message: string) => void,
    isCancelledRef: React.MutableRefObject<boolean>
): Promise<GeminiFile> => {
    onProgress(`Uploading "${file.name}"...`);
    if (isCancelledRef.current) throw new Error("Upload cancelled.");

    const uploadResponse = await ai.files.upload({ file });
    if (isCancelledRef.current) throw new Error("Upload cancelled.");

    onProgress(`Processing "${file.name}" on server...`);
    let uploadedFile = uploadResponse;

    while (uploadedFile.state === 'PROCESSING') {
        if (isCancelledRef.current) throw new Error("Processing cancelled.");
        await new Promise(resolve => setTimeout(resolve, 3000));
        const getFileResponse = await ai.files.get({ name: uploadedFile.name });
        uploadedFile = getFileResponse;
    }

    if (uploadedFile.state === 'FAILED') {
        console.error('File processing failed:', uploadedFile);
        throw new Error(`Processing failed for file: ${file.name}.`);
    }

    onProgress(`File "${file.name}" is ready!`);
    return uploadedFile;
};


export const generateChatStream = async (
    ai: GoogleGenAI,
    prompt: (TextPart | InlineDataPart)[],
    history: ChatMessage[],
    systemInstruction: string,
    { onChunk, isCancelledRef }: StreamHandlers,
    tools?: Tool[]
): Promise<void> => {
    
    // Prepare history once for Gemini
    const historyForModel = history.reduce((acc, msg) => {
        const apiPartsForThisTurn = msg.parts.flatMap((part): (TextPart | InlineDataPart)[] => {
            if ('text' in part) return [{ text: part.text }];
            if ('inlineData' in part) return [{ inlineData: part.inlineData }];
            return [];
        });

        if (apiPartsForThisTurn.length > 0) {
            acc.push({
                role: msg.role === 'ai' ? 'model' : 'user',
                parts: apiPartsForThisTurn
            });
        }
        return acc;
    }, [] as { role: string; parts: (TextPart | InlineDataPart)[] }[]);

    const config: any = { systemInstruction };
    if (tools) {
        config.tools = tools;
    }

    // 2. Waterfall Fallback Logic
    let lastError: any = null;

    // A. Try Google Models first (using all specified models as fallback chain)
    for (const modelName of GEMINI_FALLBACK_MODELS) {
        if (isCancelledRef.current) return;
        
        try {
            console.log(`Attempting to generate with Google model: ${modelName}`);
            
            const stream = await ai.models.generateContentStream({
                model: modelName,
                contents: [...historyForModel, { role: 'user', parts: prompt }],
                config,
            });

            // Instantiate cleaner for this stream
            const cleaner = new StreamCleaner();

            for await (const chunk of stream) {
                if (isCancelledRef.current) break;
                const text = safeGetText(chunk);
                if (text) {
                    const cleanText = cleaner.process(text);
                    if (cleanText) onChunk(cleanText, chunk); 
                }
            }
            return; // Success!

        } catch (error: any) {
            console.warn(`Google Model ${modelName} failed.`, error);
            lastError = error;
            // Continue to the next Google model
        }
    }

    // B. Try Perplexity Fallback if all Google models fail
    if (isCancelledRef.current) return;
    try {
        // Convert history for Perplexity (OpenAI format)
        const perplexityMessages = [
            { role: 'system', content: systemInstruction },
            ...history.map(msg => ({
                role: msg.role === 'ai' ? 'assistant' : 'user',
                content: msg.parts.map(p => 'text' in p ? p.text : '').join('') 
            })),
            { role: 'user', content: prompt.map(p => 'text' in p ? p.text : '').join('') }
        ];

        // The onChunk for Perplexity only accepts text, so we call it with just text.
        await callPerplexityFallback(perplexityMessages, (text) => onChunk(text), isCancelledRef);
        return; // Success!

    } catch (perplexityError: any) {
        console.error("Perplexity fallback also failed.", perplexityError);
        lastError = perplexityError;
    }

    // 5. Final Output: If absolutely everything fails
    throw new Error(`Failed to get response from any AI provider (Google & Perplexity failed). Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
};

const getSummarizationPrompt = (language: Language): string => {
    switch (language) {
        case 'English':
            return `Please provide a concise, well-structured summary of the following file in English. The summary should be clear and easy to understand.`;
        case 'French':
            return `Veuillez fournir un résumé concis et bien structuré du fichier suivant en français. Le résumé doit être clair et facile à comprendre.`;
        case 'Chinese':
            return `请用中文为以下文件提供一个简洁、结构良好的摘要。摘要应清晰易懂。`;
        case 'Japanese':
            return `以下のファイルについて、簡潔で分かりやすく構成された要約を日本語で提供してください。要約は明確で理解しやすいものである必要があります。`;
        default:
            return `Please provide a concise, well-structured summary of the following file in ${language}.`;
    }
};

export const summarizeFileStream = async (
    ai: GoogleGenAI,
    file: File,
    language: Language,
    { onChunk, onProgress, isCancelledRef }: { 
        onChunk: (chunk: string) => void;
        onProgress: (message: string) => void;
        isCancelledRef: React.MutableRefObject<boolean>;
    }
): Promise<void> => {
    let uploadedFile: GeminiFile | null = null;
    try {
        uploadedFile = await uploadAndPollFile(ai, file, onProgress, isCancelledRef);

        if (isCancelledRef.current) throw new Error("Summarization cancelled.");
        onProgress("Generating summary...");

        const filePart: Part = {
            fileData: {
                mimeType: uploadedFile.mimeType,
                fileUri: uploadedFile.uri,
            },
        };
        const textPart: Part = {
            text: getSummarizationPrompt(language),
        };

        const stream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [filePart, textPart] }],
        });

        const cleaner = new StreamCleaner();

        for await (const chunk of stream) {
            if (isCancelledRef.current) break;
            const text = safeGetText(chunk);
            if (text) {
                const cleanText = cleaner.process(text);
                if (cleanText) onChunk(cleanText);
            }
        }
    } catch (error) {
        console.error("Summarization pipeline failed:", error);
        throw error; 
    } finally {
        if (uploadedFile) {
            ai.files.delete({ name: uploadedFile.name }).catch(err => console.error(`Failed to clean up file ${uploadedFile?.name}:`, err));
        }
    }
};

export const generateTitle = async (ai: GoogleGenAI, content: string): Promise<string> => {
    return withRetry(async () => {
        const prompt = `Generate a concise and descriptive title (5 words or less) for the following text. The title should capture the main topic. Only return the title text.

        Text:
        ---
        ${content.slice(0, 1000)}
        ---

        Title:`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        
        // Clean up the title - remove quotes and trim whitespace
        return safeGetText(response).replace(/["'*]/g, '').trim();
    }).catch((error) => {
        console.error("Title generation failed after retries:", error);
        // Fallback title if all retries fail
        return content.split(' ').slice(0, 5).join(' ') + '...';
    });
};

export const generateImageFromPrompt = async (ai: GoogleGenAI, prompt: string): Promise<string> => {
  return withRetry(async () => {
    try {
      const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
              parts: [{ text: prompt }],
          },
          config: {
              responseModalities: [Modality.IMAGE],
          },
      });
      
      const candidate = response.candidates?.[0];
      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData) {
            return part.inlineData.data;
          }
        }
      }
      
      throw new Error("Image generation failed: No image data was returned by the API. This could be due to safety filters or an API issue.");

    } catch (error) {
      let detailedMessage = "An unknown error occurred during image generation.";
      const potentialError = error as any;
      if (potentialError?.error?.message) {
          detailedMessage = potentialError.error.message;
      } else if (error instanceof Error) {
          detailedMessage = error.message;
      }
      if (detailedMessage.includes("API key not valid")) {
          detailedMessage = "Your API key is not valid. Please check your credentials.";
      } else if (detailedMessage.toLowerCase().includes("permission denied")) {
          detailedMessage = "The API key lacks permissions for this model. Please check your Google Cloud project settings.";
      }
      // Re-throw for withRetry to catch
      throw new Error(detailedMessage);
    }
  });
};


// --- PREMIUM FEATURE: VIDEO GENERATION ---
export const generateVideoFromPrompt = async (
  prompt: string,
  onProgress: (message: string) => void
): Promise<string> => {
    try {
        // Re-create the AI instance to ensure the latest API key from the aistudio dialog is used.
        if (!process.env.API_KEY) throw new Error("API_KEY environment variable not set.");
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        onProgress("Starting video generation... This may take a few minutes.");
        let operation = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt,
            config: {
                numberOfVideos: 1,
                resolution: '720p',
                aspectRatio: '16:9'
            }
        });

        const progressMessages = [
            "Your video is being created by our AI...",
            "Analyzing the prompt and preparing scenes...",
            "Rendering frames... this is the longest step.",
            "Almost there, finalizing the video...",
            "Applying finishing touches..."
        ];
        let messageIndex = 0;

        while (!operation.done) {
            onProgress(progressMessages[messageIndex % progressMessages.length]);
            messageIndex++;
            await new Promise(resolve => setTimeout(resolve, 10000)); // Poll every 10 seconds
            operation = await ai.operations.getVideosOperation({ operation: operation });
        }

        if (operation.error) {
            throw new Error(`Video generation failed: ${operation.error.message}`);
        }

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) {
            throw new Error("Video generation completed, but no download link was returned.");
        }
        
        onProgress("Video generated! Preparing for display...");

        return downloadLink;
    } catch (error) {
        console.error("Video generation pipeline failed:", error);
        let errorMessage = error instanceof Error ? error.message : "An unknown error occurred during video generation.";

        // Special check for API key errors to trigger re-selection in the UI.
        if (errorMessage.includes("Requested entity was not found")) {
            errorMessage = "It seems your API key is invalid or lacks permissions for the Veo API. Please select a valid key and try again.";
            // The special suffix signals the UI to reset the API key state.
            throw new Error(errorMessage + "||RESET_API_KEY_STATE");
        }
        if (errorMessage.toLowerCase().includes("permission denied")) {
            errorMessage = "The API key lacks permissions for the Veo API. Please enable the 'Vertex AI API' in your Google Cloud project.";
        }
        throw new Error(errorMessage);
    }
};

/**
 * Implements the requested function for strict, streaming chat response.
 * This function uses the STRICT_LATEX_SYSTEM_INSTRUCTION and a simple streaming API call.
 * @param prompt The user's text prompt.
 * @param onToken A callback function to be called with each incoming text token.
 * @returns A promise that resolves with the final, complete response string.
 */
export const streamChatResponse = async (
    prompt: string,
    onToken: (token: string) => void
): Promise<string> => {
    let finalResponse = '';
    
    // Check for API Key and initialize AI instance
    if (!process.env.API_KEY) throw new Error("API_KEY environment variable not set.");
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    try {
        // 1. Configure the API call to enable streaming
        const stream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                // Use the strict prompt to ensure math formatting
                systemInstruction: STRICT_LATEX_SYSTEM_INSTRUCTION,
            },
        });

        const cleaner = new StreamCleaner();

        for await (const chunk of stream) {
            const token = safeGetText(chunk);
            if (token) {
                const cleanToken = cleaner.process(token);
                if (cleanToken) {
                    onToken(cleanToken);
                    finalResponse += cleanToken;
                }
            }
        }
        
        return finalResponse; 
    } catch (error) {
        console.error("Streaming chat response failed:", error);
        throw new Error(`Failed to get response from AI. Details: ${error instanceof Error ? error.message : String(error)}`);
    }
};