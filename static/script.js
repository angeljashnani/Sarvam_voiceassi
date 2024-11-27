// Configuration Parameters
const apiBaseURL = window.location.origin; // Dynamically set API base URL
const targetLanguage = document.getElementById("targetLanguage");
const status = document.getElementById("status");
const outputAudio = document.getElementById("outputAudio");

// VAD Parameters
const START_THRESHOLD = 30; // Threshold to start recording (adjust as needed)
const STOP_THRESHOLD = 25;  // Threshold to stop recording (adjust as needed)
const MIN_SPEECH_DURATION = 500; // Minimum duration to confirm speech (ms)
const MIN_SILENCE_DURATION = 2000; // Minimum duration to confirm silence (ms)

let mediaRecorder;
let audioChunks = [];
let audioContext;
let analyser;
let sourceNode;
let isRecording = false;
let speechStartTime = null;
let silenceStartTime = null;

// Audio analysis data array
let dataArray;

// Initialize Voice Activity Detection (VAD)
async function startVAD() {
  try {
    // Request access to the microphone
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    // Connect the audio stream to the analyser
    sourceNode = audioContext.createMediaStreamSource(stream);
    sourceNode.connect(analyser);

    // Initialize MediaRecorder
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = handleRecordingStop;

    // Start analyzing audio levels
    checkAudioLevel();
    status.textContent = "Voice Activity Detection Initialized. Speak to start recording.";
  } catch (error) {
    status.textContent = `Error accessing microphone: ${error.message}`;
  }
}

// Handle recording stop and send audio to server
function handleRecordingStop() {
  const blob = new Blob(audioChunks, { type: "audio/wav" });
  audioChunks = [];
  const formData = new FormData();
  formData.append("audio", blob, "audio.wav");
  formData.append("target_language_code", targetLanguage.value);

  status.textContent = "Uploading and translating...";
  outputAudio.style.display = "none";

  fetch(`${apiBaseURL}/speech-to-speech-translate/`, {
    method: "POST",
    body: formData,
  })
    .then(async (response) => {
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Translation failed: ${response.status} - ${errorText}`);
      }
      return response.json();
    })
    .then((data) => {
      status.textContent = "Translation complete! Playing audio...";
      
      // Append unique query parameter to force audio reload
      const uniqueSrc = `${data.output_audio_url}?t=${new Date().getTime()}`;
      outputAudio.src = uniqueSrc;
      outputAudio.style.display = "block";
      outputAudio.play();
    })
    .catch((error) => {
      status.textContent = `Error: ${error.message}`;
    });
}

// Analyze audio levels to determine speech or silence
function checkAudioLevel() {
  analyser.getByteFrequencyData(dataArray);

  // Calculate the average volume
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    sum += dataArray[i];
  }
  const average = sum / dataArray.length;

  const currentTime = Date.now();

  if (average > START_THRESHOLD) {
    if (!isRecording) {
      if (!speechStartTime) {
        speechStartTime = currentTime;
      } else if (currentTime - speechStartTime > MIN_SPEECH_DURATION) {
        // Start recording
        mediaRecorder.start();
        isRecording = true;
        status.textContent = "Recording...";
        speechStartTime = null;
        silenceStartTime = null;
      }
    } else {
      // Reset silence timer if currently recording
      silenceStartTime = null;
    }
  } else {
    if (isRecording) {
      if (!silenceStartTime) {
        silenceStartTime = currentTime;
      } else if (currentTime - silenceStartTime > MIN_SILENCE_DURATION) {
        // Stop recording
        mediaRecorder.stop();
        isRecording = false;
        status.textContent = "Processing...";
        silenceStartTime = null;
      }
    } else {
      // Reset speech timer if not recording
      speechStartTime = null;
    }
  }

  requestAnimationFrame(checkAudioLevel);
}

// Start the VAD process on page load
startVAD();
