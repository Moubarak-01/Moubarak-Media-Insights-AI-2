// FIX: Import React to resolve "Cannot find namespace 'React'" error.
import React from 'react';
// FIX: Replace non-exported `UploadedFile` with `File` (aliased to avoid name conflicts).
import { GoogleGenAI, Part, File as GeminiFile, Modality, GenerateContentResponse, Tool } from '@google/genai';
import { Language, ChatMessage, TextPart, InlineDataPart } from '../types';

interface StreamHandlers {
  onChunk: (chunk: GenerateContentResponse) => void;
  isCancelledRef: React.MutableRefObject<boolean>;
}

// A safe character limit for transcripts to avoid exceeding the context window.
// Gemini 2.5 Flash has a large context, but this prevents errors with exceptionally large files.
const TRANSCRIPT_CHAR_LIMIT = 750_000;

const truncateText = (text: string, limit: number) => {
    if (text.length <= limit) {
        return text;
    }
    return text.slice(0, limit) + "\n... (transcript truncated for brevity) ...";
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
     try {
        const historyForModel = history.reduce((acc, msg) => {
          const apiPartsForThisTurn = msg.parts.flatMap((part): (TextPart | InlineDataPart)[] => {
              if ('text' in part) return [{ text: part.text }];
              // The new File API flow sends URIs, not inline data, so we only need to preserve text from history.
              // If inlineData is present from older messages or image generation, keep it.
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

        const stream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: [...historyForModel, { role: 'user', parts: prompt }],
            config,
        });

        for await (const chunk of stream) {
            if (isCancelledRef.current) break;
            onChunk(chunk);
        }
    } catch (error) {
        console.error("Chat generation failed:", error);
        throw new Error(`Failed to get response from AI. Details: ${error instanceof Error ? error.message : String(error)}`);
    }
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

        for await (const chunk of stream) {
            if (isCancelledRef.current) break;
            onChunk(chunk.text);
        }
    } catch (error) {
        console.error("Summarization pipeline failed:", error);
        throw error; // Re-throw to be caught by the UI
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
        return response.text.replace(/["'*]/g, '').trim();
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