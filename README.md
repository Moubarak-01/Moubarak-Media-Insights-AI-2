# Moubarak Media Insights - AI Edition

## 📖 Overview

**Moubarak Media Insights AI Edition** is a sophisticated, multimodal AI assistant built with React, TypeScript, and the Google Gemini API. It's designed as a versatile, single-page application that provides specialized AI-powered tools through a clean, modern, and dark-themed interface.

The application features a multi-section architecture, allowing users to switch between different AI personas—a general conversationalist, a powerful file summarizer, and a detailed file analyzer—each with its own persistent chat history.

## ✨ Key Features

- **Multi-Section AI Personas**: Seamlessly switch between different AI modes for specialized tasks:
  - **🤖 General Chat**: An all-purpose conversational AI for questions, brainstorming, coding help, and more.
  - **📄 Summarizer**: A dedicated interface to generate concise summaries from text, documents, or media files.
  - **🖼️ File Analyzer**: A powerful tool to analyze and answer questions about the content of uploaded images, PDFs, and other documents.
- **Comprehensive File Handling**: Upload and interact with a wide variety of file types, including:
  - **Images**: JPG, PNG, and automatic **HEIC to JPEG** conversion.
  - **Documents**: PDF, DOCX, XLSX, TXT with client-side text extraction.
  - **Media**: Audio and video files for summarization and analysis.
- **Advanced AI Capabilities**:
  - **Image & Video Generation**: Create AI-generated images and premium videos directly from text prompts.
  - **Context-Aware AI**: The Summarizer and File Analyzer modes are context-locked to only discuss the relevant uploaded file.
  - **Text-to-Speech (TTS)**: Listen to AI responses with a choice between a default and a female voice.
- **Modern & Interactive UI**:
  - **Persistent Input Bar**: The chat input bar remains fixed and interactive at the bottom, just like ChatGPT.
  - **Real-time Streaming**: AI responses stream in token-by-token with intelligent auto-scrolling.
  - **Non-Intrusive Feedback**: Get clear, non-blocking feedback with an interactive **Stop Generation** button.
  - **Rich Content Rendering**: Full support for **Markdown**, **LaTeX** math equations, and syntax-highlighted code blocks with a "Copy Code" button.
- **Robust & User-Friendly**:
  - **Local Authentication**: A simple, client-side sign-up and sign-in system.
  - **Persistent History**: Chat history is saved per-section to `localStorage`, tied to the user's email.
  - **Responsive Design**: A fluid layout that works beautifully on both desktop and mobile devices.

## 🔧 Recent Updates & Engineering Challenges

We recently overhauled the core rendering engine, UI stability, and backend resilience to support advanced mathematical discourse and uninterrupted service.

### 1. Advanced Math Rendering (The "Flashing" Fix)
* **The Challenge**: Initially, using `marked` with a manual `KaTeX` render pass caused math formulas to "flash" between raw LaTeX (`$$...$$`) and rendered output during real-time streaming. The renderer couldn't keep up with the token stream, leading to visual artifacts.
* **The Solution**: We migrated the entire markdown engine to **`react-markdown`** with `remark-math` and `rehype-katex`. This processes math *during* the parse phase rather than after, ensuring equations render instantly and stay stable, even while the AI is still typing.

### 2. Viewport & Scroll Stabilization
* **The Challenge**: As chat history grew, the entire page body would scroll, pushing the header off-screen. Additionally, the auto-scroll logic (`scrollIntoView`) was too aggressive, causing the whole browser window to jitter during generation.
* **The Solution**: 
    * Locked the main application container to `h-screen overflow-hidden` to prevent body scroll.
    * Replaced `scrollIntoView` with direct DOM manipulation (`scrollTop = scrollHeight`) to constrain scrolling strictly to the chat bubble container.

### 3. Strict LaTeX Enforcement
* **The Update**: Implemented a "Strict Math" system prompt layer that forces the AI models to adhere to standard `$$` block and `$` inline syntax, ensuring flawless compatibility with our new rendering engine.

### 4. UI Refinements
* **New Feature**: Added a "Copy Prompt" button next to user messages.
* **Layout Fix**: Solved a spacing issue where the copy button floated too far from short messages by optimizing the message container width (`w-fit` instead of `w-full`).

### 5. Multi-Provider Resilience (Perplexity Fallback)
* **The Feature**: To ensure high availability, we implemented a robust waterfall fallback system.
* **The Logic**: If the primary Google Gemini models (`gemini-2.5-flash`, `gemma-3`, etc.) are rate-limited, overloaded, or fail, the system automatically and seamlessly switches to the **Perplexity API** (using the `sonar` model) to generate the response, maintaining the same strict formatting rules.

## 🛠️ Tech Stack

- **Frontend**: [React](https://reactjs.org/) 19, [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
- **AI Backend**: 
  - [Google Gemini API](https://ai.google.dev/) (`@google/genai`) - *Primary Provider*
  - [Perplexity API](https://docs.perplexity.ai/) - *Fallback Provider*
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Client-Side File Processing**:
  - **PDF**: `pdfjs-dist`
  - **DOCX**: `mammoth.js`
  - **XLSX**: `xlsx`
  - **HEIC**: `heic2any`
- **Markdown & Syntax Highlighting**:
  - `react-markdown` & `remark-math` for parsing.
  - `rehype-katex` & `KaTeX` for math rendering.
  - `rehype-highlight` for code block syntax highlighting.
- **State Management**: React Hooks (`useState`, `useEffect`, `useRef`, `useCallback`)
- **Storage**: Browser `localStorage` for user data and chat history.

## 🚀 Getting Started Locally

Follow these instructions to set up and run the project on your local machine.

### Prerequisites

- [Node.js](https://nodejs.org/) (version 18.x or higher is recommended)
- [npm](https://www.npmjs.com/) (usually comes with Node.js)

### Installation

1.  **Clone the repository (or download the source files):**
    ```bash
    git clone [https://github.com/Moubarak-01/Moubarak-Media-Insights-AI-2.git](https://github.com/Moubarak-01/Moubarak-Media-Insights-AI-2.git)
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

### Environment Variables

The application requires API keys to function.

1.  **Get your API Keys**:
    - **Google Gemini**: Visit [Google AI Studio](https://aistudio.google.com/app/apikey).
    - **Perplexity AI** (Optional, for backup): Visit [Perplexity API Settings](https://www.perplexity.ai/settings/api).

2.  **Create an environment file**:
    - In the root of the project, create a file named `.env.local`.

3.  **Add your API keys to the file**:
    - Open `.env.local` and add your keys like this:
    ```env
    GEMINI_API_KEY=YOUR_GEMINI_KEY_HERE
    PERPLEXITY_API_KEY=YOUR_PERPLEXITY_KEY_HERE
    ```
    > **Note**: Vite requires environment variables exposed to the client to be prefixed with `VITE_`. The application code expects `process.env.API_KEY`, which Vite will handle correctly via the config.

### Running the Application

1.  **Start the development server:**
    ```bash
    npm run dev
    ```

2.  **Open in your browser:**
    - Navigate to the URL provided by Vite (usually `http://localhost:5173`).

### Building for Production

To create a production-ready build of the app:
```bash
npm run build
This will generate a dist folder with optimized and minified static assets that can be deployed to any web hosting service.

📁 Project Structure
/
├── components/         # Reusable React components
│   ├── GeneralChat.tsx     # Main chat interface with strict math & streaming
│   ├── MarkdownRenderer.tsx # New robust markdown & math engine
│   ├── HistorySidebar.tsx  # Sidebar for chat history and section navigation
│   ├── AuthScreen.tsx      # Login/Signup component
│   └── ...               # Other UI components
├── hooks/              # Custom React hooks (e.g., useAudioRecorder)
├── services/           # API interaction logic (geminiService.ts)
├── prompts.ts          # Contains strict system prompts for AI personas
├── types.ts            # TypeScript type definitions for the application
├── App.tsx             # Main application component and state management
├── index.html          # HTML entry point
└── README.md           # You are here!
