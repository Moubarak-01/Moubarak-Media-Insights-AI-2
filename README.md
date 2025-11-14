
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

## 🛠️ Tech Stack

- **Frontend**: [React](https://reactjs.org/) 19, [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
- **AI Backend**: [Google Gemini API](https://ai.google.dev/) (`@google/genai`)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Client-Side File Processing**:
  - **PDF**: `pdfjs-dist`
  - **DOCX**: `mammoth.js`
  - **XLSX**: `xlsx`
  - **HEIC**: `heic2any`
- **Markdown & Syntax Highlighting**:
  - `marked` for Markdown parsing.
  - `KaTeX` for LaTeX math rendering.
  - `highlight.js` for code block syntax highlighting.
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
    git clone https://github.com/Moubarak-01/Moubarak-Media-Insights-AI-2.git
    ```

2.  **Install dependencies:**
    This project uses standard web technologies and leverages a CDN for its dependencies (as seen in `index.html`), so a traditional `npm install` is not required for the library dependencies. However, if you were to manage them with a `package.json`, you would run:
    ```bash
    npm install
    ```

### Environment Variables

The application requires a Google Gemini API key to function.

1.  **Get an API Key**:
    - Visit the [Google AI Studio](https://aistudio.google.com/app/apikey) to generate your free API key.

2.  **Create an environment file**:
    - In the root of the project, create a file named `.env.local`.

3.  **Add your API key to the file**:
    - Open `.env.local` and add your key like this:
    ```
    GEMINI_API_KEY=YOUR_API_KEY_HERE
    ```
    > **Note**: Vite requires environment variables exposed to the client to be prefixed with `VITE_`. The application code expects `process.env.API_KEY`, which Vite will handle correctly.

### Running the Application

1.  **Start the development server:**
    ```bash
    npm run dev
    ```
    (Assuming you have a `package.json` with a `dev` script like `"dev": "vite"`)

2.  **Open in your browser:**
    - Navigate to the URL provided by Vite (usually `http://localhost:5173`).

### Building for Production

To create a production-ready build of the app:
```bash
npm run build
```
This will generate a `dist` folder with optimized and minified static assets that can be deployed to any web hosting service.

## 📁 Project Structure

```
/
├── components/         # Reusable React components
│   ├── GeneralChat.tsx     # Main chat interface
│   ├── HistorySidebar.tsx  # Sidebar for chat history and section navigation
│   ├── AuthScreen.tsx      # Login/Signup component
│   └── ...               # Other UI components
├── hooks/              # Custom React hooks (e.g., useAudioRecorder)
├── services/           # API interaction logic (geminiService.ts)
├── prompts.ts          # Contains all system prompts for the AI personas
├── types.ts            # TypeScript type definitions for the application
├── App.tsx             # Main application component and state management
├── index.html          # HTML entry point
└── README.md           # You are here!
```
