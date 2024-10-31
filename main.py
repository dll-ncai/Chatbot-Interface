from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import os
from dotenv import load_dotenv
from chat_rag import generate

# Load environment variables
load_dotenv()

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Adjust this to match your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Prompt(BaseModel):
    prompt: str

@app.post("/")
async def chat(prompt: Prompt):
    try:
        response = generate(prompt.prompt)
        return {"bot": response["answer"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    


@app.post("/audio")
async def chat(prompt: Prompt):
    try:
        return
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8989, reload=True)