import json
import os
from datetime import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class SaveRequest(BaseModel):
    conversation: list

@app.post("/save")
async def save_conversation(request: SaveRequest):
    # Save to cognitive-trajectory/src/data/
    target_dir = os.path.join(
        os.path.dirname(__file__), 
        "..", "src", "data"
    )
    os.makedirs(target_dir, exist_ok=True)
    
    ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    filename = f"conversation_{ts}.json"
    filepath = os.path.join(target_dir, filename)
    
    with open(filepath, "w") as f:
        json.dump(request.conversation, f, indent=2)
        
    print(f"✅ Saved {filename} to {target_dir}")
    return {"status": "success", "filename": filename, "path": filepath}

if __name__ == "__main__":
    import uvicorn
    # Run on 8001 so it doesn't conflict with stub_api on 8000
    print("🚀 Save API running on http://localhost:8001")
    uvicorn.run(app, host="0.0.0.0", port=8001)
