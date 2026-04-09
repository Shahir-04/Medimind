import os
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.append(str(Path(__file__).parent.parent))

from backend.rag import extract_pdf_chunks
from backend.pinecone_helper import get_pinecone_kb
from dotenv import load_dotenv

load_dotenv()

KB_DIR = Path(__file__).parent.parent / "knowledge_base"

def index_all_pdfs():
    if not KB_DIR.exists():
        print(f"Directory {KB_DIR} does not exist. Please create it.")
        return

    pdf_files = list(KB_DIR.glob("*.pdf"))
    if not pdf_files:
        print(f"No PDF files found in {KB_DIR}. Please add your medical PDFs there.")
        return

    kb_helper = get_pinecone_kb()

    for pdf_path in pdf_files:
        print(f"Processing {pdf_path.name}...")
        try:
            with open(pdf_path, "rb") as f:
                file_bytes = f.read()
            
            chunks = extract_pdf_chunks(file_bytes)
            print(f"Extracted {len(chunks)} chunks. Upserting to Pinecone...")
            
            kb_helper.upsert_chunks(chunks, pdf_path.name)
            print(f"Successfully indexed {pdf_path.name}")
            
        except Exception as e:
            print(f"Failed to index {pdf_path.name}: {e}")

if __name__ == "__main__":
    index_all_pdfs()
