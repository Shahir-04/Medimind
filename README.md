# MediMind  - Personalized AI Medical Assistant

MediMind is a state-of-the-art AI medical assistant designed to provide personalized, history-aware healthcare information. By combining long-term memory, authoritative medical knowledge bases, and user-uploaded clinical data, MediMind offers a unified health companion that grows with you.

---

## Screenshots

*(Space reserved for UI screenshots - To be populated)*
![MediMind Chat Interface - Medical Advice]()

![MediMind Chat Interface - Uploaded Case Files Modal]()

![MediMind Create Account Screen]()

![MediMind Google Sign-in Integration]()

![MediMind Email Verification Screen]()

---

##  Key Features

- **Personalized Patient Memory**: Utilizes **Mem0** to maintain a persistent health profile, including allergies, chronic conditions, and past medications, ensuring every response is contextually relevant.
- **Authoritative Medical RAG**: Connects to a high-fidelity medical knowledge base to retrieve factual information from verified healthcare references.
- **Patient Case Analysis**: Support for medical document uploads (PDF). MediMind indexes and analyzes your case files to provide specific insights based on your clinical records.
- **Secure File Scoping**: Advanced document management allowing files to be scoped as **Temporary** (deleted after session) or **In-Chat Only** (restricted to a specific conversation thread).
- **Persistent Chat History**: Scalable conversation management powered by Supabase, enabling users to revisit, rename, and manage past medical consultations.
- **Interactive Symptom Tracking**: Dynamically extracts and visualizes reported symptoms and conditions for easy monitoring.
- **Global Feedback Intelligence**: Implements a global feedback loop where positive and negative interactions improve the AI's empathy and accuracy for the entire community.
- **Responsive Experience**: A premium, glassmorphism-inspired UI designed to work seamlessly on Mobile, Tablet, and Desktop resolutions.

---

## Tech Stack

### AI / Machine Learning
- **Model**: OpenAI GPT (GPT-4o/4o-mini) — *Fine-tuned on medical datasets for clinical accuracy.*
- **Memory**: Mem0 for user-level history persistence and cross-session retrieval.
- **Vector Search**: Pinecone (Reference Knowledge) & Supabase pgvector (Patient Files).

### Backend
- **Framework**: FastAPI (Python 3.10+)
- **Database**: Supabase (PostgreSQL) for user data and chat history.
- **Authentication**: JWT-based secure authentication with Supabase integration.

### Frontend
- **Framework**: React 18 + Vite
- **Styling**: Tailwind CSS with custom animations.
- **Icons**: Lucide-React.
- **UI Components**: Radix UI & Shadcn-inspired minimalist design.

---

## Getting Started

### Prerequisites
- Node.js (v18+)
- Python (3.10+)
- Supabase Account
- OpenAI API Key
- Pinecone Account

### Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment using **uv**:
   ```bash
   uv venv
   source .venv/bin/activate  # Windows: .venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   uv pip install -r requirements.txt
   ```
4. Configure environment variables (see Environment Variables section below).
5. Start the server:
   ```bash
   uvicorn main:app --reload
   ```

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

---

## Environment Variables

Create a `.env` file in the root/backend directory:

```env
# AI Configuration
OPENAI_API_KEY=your_openai_key

# Database (Supabase)
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
DATABASE_URL=your_supabase_postgresql_connection_string

# Vector Search (Pinecone)
PINECONE_API_KEY=your_pinecone_key
PINECONE_INDEX_NAME=your_index_name
```

---

## Disclaimer
**MediMind is an AI assistant and should not be used as a replacement for professional medical advice, diagnosis, or treatment. Always seek the advice of your physician or other qualified health provider with any questions you may have regarding a medical condition.**

---

## License
This project is licensed under the [MIT License](LICENSE).
