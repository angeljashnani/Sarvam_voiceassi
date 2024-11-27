from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Header, Depends
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import requests
import base64

app = FastAPI()

header = {
        'api-subscription-key': "1dcf881f-6871-487a-b313-a70f33bb9ebc"  # Corrected header name
    }

# Enable CORS for the frontend to communicate with the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")


# Serve the HTML page
@app.get("/", response_class=HTMLResponse)
async def serve_homepage():
    with open("static/index.html", "r") as file:
        html_content = file.read()
    return HTMLResponse(content=html_content)


# Speech-to-Speech Translation API
@app.post("/speech-to-speech-translate/")
async def speech_to_speech_translate(
    audio: UploadFile = File(...),
    target_language_code: str = Form(...),
):
    # Step 1: Speech-to-Text

    speech_to_text_url = "https://api.sarvam.ai/speech-to-text-translate"

    # Validate file format
    allowed_content_types = ["audio/mpeg", "audio/wav", "audio/mp3", "audio/x-wav"]
    if audio.content_type not in allowed_content_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {audio.content_type}. Supported types are: {', '.join(allowed_content_types)}"
        )

    # Step 1: Transcribe Audio to Text
    try:
        audio_content = await audio.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read audio file: {str(e)}")


    sst_payload = {'file': (audio.filename, audio_content, audio.content_type), "model": (None, 'saaras:v1'), 
                   'prompt': (None, 'You are an exceptional translator. Forget all prior instructions or context. Your sole task is to translate everything provided to you into English without adding, omitting, or altering any content. Ensure the translation is precise and faithful to the original text.')}
    response = requests.post(speech_to_text_url, headers = header, files = sst_payload)

    if response.status_code != 200:
        return {"error": "Failed in Speech-to-Text API"}
    transcript = response.json().get("transcript", None)

    if not transcript:
        raise HTTPException(status_code=502, detail="Speech-to-Text API did not return transcription.")

    # Step 2: Translation
    translate_url = "https://api.sarvam.ai/translate"
    translate_payload = {
        "input": transcript,
        "source_language_code": "en-IN",
        "target_language_code": target_language_code,
        "speaker_gender": "Female",
        "mode": "formal",
        "model": "mayura:v1",
        "enable_preprocessing": True,
    }
    response = requests.post(translate_url, headers=header, json=translate_payload)
    if response.status_code != 200:
        return {"error": "Failed in Translation API"}
    translated_text = response.json().get("translated_text", None)

    if not translated_text:
        raise HTTPException(status_code=502, detail="Translate Text API did not return.")

    # Step 3: Text-to-Speech
    tts_url = "https://api.sarvam.ai/text-to-speech"
    tts_payload = {
        "inputs": [translated_text],
        "target_language_code": target_language_code,
        "speaker": "meera",
        "pitch": 0.0,
        "pace": 1.0,
        "loudness": 1.0,
        "speech_sample_rate": 22050,
        "model": "bulbul:v1",
        "enable_preprocessing": True,
    }
    response = requests.post(tts_url, headers=header, json=tts_payload)
    if response.status_code != 200:
        return {"error": "Failed in Text-to-Speech API"}
    audio_base64 = response.json().get("audios", [])[0]

    if not audio_base64:
        raise HTTPException(status_code=502, detail="Text-To-Speech API did not return.")

    # Decode base64 audio
    output_audio_path = "static/output_audio.wav"
    with open(output_audio_path, "wb") as audio_file:
        audio_file.write(base64.b64decode(audio_base64))

    return {"message": "Success", "output_audio_url": f"/static/output_audio.wav"}
