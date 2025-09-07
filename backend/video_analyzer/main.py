from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import subprocess
import os
import whisper
import scenedetect
from scenedetect import VideoManager, SceneManager
from scenedetect.detectors import ContentDetector
import easyocr
import chromadb
from sentence_transformers import SentenceTransformer
import requests
import shutil

app = FastAPI()

# --- Model and DB Initialization ---
# Initialize Whisper model
try:
    whisper_model = whisper.load_model("base")
except Exception as e:
    print(f"Could not load Whisper model: {e}. Some features might be unavailable.")
    whisper_model = None

# Initialize EasyOCR reader
reader = easyocr.Reader(['en', 'ko'])

# Initialize SentenceTransformer for embeddings
try:
    embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
except Exception as e:
    print(f"Could not load embedding model: {e}. Embedding generation will be skipped.")
    embedding_model = None

# Initialize ChromaDB client
chroma_client = chromadb.PersistentClient(path="./chroma_db")
try:
    video_collection = chroma_client.get_or_create_collection(name="video_insights")
except Exception as e:
    print(f"Could not connect to ChromaDB or get collection: {e}. Vector DB features might be unavailable.")
    video_collection = None

# --- Pydantic Models ---
class VideoAnalysisRequest(BaseModel):
    video_url: str
    video_id: str # YouTube video ID

class EmbeddingRequest(BaseModel):
    text: str
    metadata: dict = {}
    id: str

class QueryRequest(BaseModel):
    query: str
    n_results: int = 5

class LLMRequest(BaseModel):
    prompt: str
    max_tokens: int = 512
    temperature: float = 0.7

# --- Helper Functions ---
def generate_embedding(text: str):
    if embedding_model:
        return embedding_model.encode(text).tolist()
    return None

async def call_lm_studio_llm(prompt: str, max_tokens: int = 512, temperature: float = 0.7):
    lm_studio_base_url = os.getenv("LM_STUDIO_URL", "http://localhost:1234") # Get base URL
    lm_studio_api_endpoint = f"{lm_studio_base_url}/v1/chat/completions" # Construct full API endpoint
    headers = {"Content-Type": "application/json"}
    data = {
        "model": "local-llm", # This should match the model name in LM Studio
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    try:
        response = requests.post(lm_studio_api_endpoint, headers=headers, json=data)
        response.raise_for_status() # Raise an exception for HTTP errors
        return response.json()["choices"][0]["message"]["content"]
    except requests.exceptions.RequestException as e:
        print(f"Error calling LM Studio LLM: {e}")
        raise HTTPException(status_code=500, detail=f"Error calling LM Studio LLM: {e}")

# --- API Endpoints ---
@app.get("/")
async def read_root():
    return {"message": "Video Analyzer Service is running"}

@app.post("/analyze_video")
async def analyze_video(request: VideoAnalysisRequest):
    video_url = request.video_url
    video_id = request.video_id
    
    temp_dir = f"temp_videos/{video_id}"
    os.makedirs(temp_dir, exist_ok=True)
    video_path = os.path.join(temp_dir, f"{video_id}.mp4")

    try:
        # 1. Download video
        print(f"Downloading video: {video_url}")
        subprocess.run(["yt-dlp", "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best", "-o", video_path, video_url], check=True)
        print(f"Video downloaded to: {video_path}")

        # 2. Scene Detection
        print("Performing scene detection...")
        video_manager = VideoManager([video_path])
        scene_manager = SceneManager()
        scene_manager.add_detector(ContentDetector())
        video_manager.set_downscale_factor()
        video_manager.start()
        scene_manager.detect_scenes(video_frame_source=video_manager)
        scene_list = scene_manager.get_scene_list()
        scene_cuts = [{"start_time": str(s.start_time), "end_time": str(s.end_time), "duration": str(s.duration)} for s in scene_list]
        print(f"Detected {len(scene_cuts)} scenes.")

        # 3. Audio Transcription (Whisper)
        transcript = ""
        if whisper_model:
            print("Performing audio transcription...")
            result = whisper_model.transcribe(video_path)
            transcript = result["text"]
            print("Transcription complete.")
        else:
            print("Whisper model not loaded, skipping transcription.")

        # 4. OCR (Simplified - would typically run on keyframes or specific segments)
        ocr_text = "OCR functionality to be implemented on video frames."
        print("OCR placeholder executed.")

        # Return analysis results
        return {
            "video_id": video_id,
            "scene_cuts": scene_cuts,
            "transcript": transcript,
            "ocr_text": ocr_text,
            "message": "Video analysis complete."
        }

    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Video download failed: {e.stderr}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Video analysis failed: {str(e)}")
    finally:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir) # Use shutil.rmtree for directories
            print(f"Cleaned up temporary directory: {temp_dir}")

@app.post("/generate_embeddings")
async def generate_embeddings_api(request: EmbeddingRequest):
    embedding = generate_embedding(request.text)
    if embedding is None:
        raise HTTPException(status_code=500, detail="Embedding model not loaded.")
    return {"embedding": embedding}

@app.post("/store_embeddings")
async def store_embeddings_api(request: EmbeddingRequest):
    if video_collection is None:
        raise HTTPException(status_code=500, detail="ChromaDB collection not initialized.")
    
    embedding = generate_embedding(request.text)
    if embedding is None:
        raise HTTPException(status_code=500, detail="Embedding model not loaded.")
    
    try:
        video_collection.add(
            embeddings=[embedding],
            metadatas=[request.metadata],
            ids=[request.id]
        )
        return {"message": "Embeddings stored successfully.", "id": request.id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error storing embeddings: {e}")

@app.post("/query_embeddings")
async def query_embeddings_api(request: QueryRequest):
    if video_collection is None:
        raise HTTPException(status_code=500, detail="ChromaDB collection not initialized.")
    
    query_embedding = generate_embedding(request.query)
    if query_embedding is None:
        raise HTTPException(status_code=500, detail="Embedding model not loaded.")
    
    try:
        results = video_collection.query(
            query_embeddings=[query_embedding],
            n_results=request.n_results,
            include=['documents', 'metadatas', 'distances']
        )
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error querying embeddings: {e}")

@app.post("/ask_llm")
async def ask_llm_api(request: QueryRequest):
    # 1. Query ChromaDB for relevant context
    query_results = await query_embeddings_api(request)
    
    context = ""
    if query_results and query_results['documents']:
        for doc_list in query_results['documents']:
            context += " ".join(doc_list) + "\n"

    if not context:
        context = "No relevant context found."

    # 2. Construct prompt for LLM
    prompt = f"Context: {context}\n\nQuestion: {request.query}\n\nAnswer:"

    # 3. Call LM Studio LLM
    try:
        llm_response = await call_lm_studio_llm(prompt, max_tokens=request.max_tokens)
        return {"answer": llm_response}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get response from LLM: {e}")