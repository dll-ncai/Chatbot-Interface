import bot from "./assets/bot.png";
import user from "./assets/user.png";
import microphone from "./assets/microphone2.ico";

const form = document.querySelector("form");
const chatContainer = document.querySelector("#chat_container");

let loadInterval;

function loader(element) {
  element.textContent = "";

  loadInterval = setInterval(() => {
    element.textContent += ".";
    if (element.textContent === "....") {
      element.textContent = "";
    }
  }, 300);
}

function typeText(element, text) {
  let index = 0;

  let interval = setInterval(() => {
    if (index < text.length) {
      element.innerHTML += text.charAt(index);
      chatContainer.scrollTop = chatContainer.scrollHeight;
      ++index;
    } else {
      clearInterval(interval);
    }
  }, 20);
}

function generateUniqueId() {
  const timestamp = Date.now();
  const randomNumber = Math.random();
  const hexadecimalString = randomNumber.toString(16);

  return `id-${timestamp}-${hexadecimalString}`;
}

function chatStripe(isAi, value, uniqueId) {
  return `
    <div class="wrapper ${isAi && "ai"}">
      <div class="chat">
        <div class="profile">
          <img
            src="${isAi ? bot : user}"
            alt="${isAi ? "bot" : "user"}"
          />
        </div>
        <div class="message" id=${uniqueId}>${value}</div>
      </div>
    </div>
  `;
}

let chat_history = [];

const handleSubmit = async (e) => {
  e.preventDefault();

  const data = new FormData(form);
  const prompt = data.get("prompt").trim();

  if (prompt === "") {
    form.reset();
    return;
  }

  // Add user's input to chat
  chatContainer.innerHTML += chatStripe(false, prompt);
  form.reset();

  // Push user's prompt to chat history
  chat_history.push({
    role: "human",
    content: prompt,
  });

  // Bot's placeholder stripe with uniqueId for streaming updates
  const uniqueId = generateUniqueId();
  chatContainer.innerHTML += chatStripe(true, " ", uniqueId);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  const messageDiv = document.getElementById(uniqueId);

  loader(messageDiv);

  try {
    // Make the POST request to stream the response
    const response = await fetch("http://10.3.40.150:8989/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_history: chat_history,
      }),
    });

    // Check if the response is a stream
    if (response.ok) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let isStreaming = true;
      let assistantResponse = "";

      while (isStreaming) {
        const { done, value } = await reader.read();
        if (done) {
          isStreaming = false;
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(line => line.trim() !== "");

        for (const line of lines) {
          try {
            const jsonResponse = JSON.parse(line);
            const token = jsonResponse.content;

            if (token) {
              // Append the streamed token to the assistant's message
              assistantResponse += token;
              messageDiv.innerHTML += token;

              // Scroll to the bottom of chat container
              chatContainer.scrollTop = chatContainer.scrollHeight;
            }

            // If it's the end of the response, add it to chat history
            if (jsonResponse.content === "") {
              chat_history.push({
                role: "assistant",
                content: assistantResponse.trim(),
              });
            }
          } catch (error) {
            console.error("Failed to parse chunk:", error);
          }
        }
      }
    } else {
      const err = await response.json();
      messageDiv.innerHTML = "Something went wrong";
      alert(err.message || "Failed to get response");
    }
  } catch (error) {
    clearInterval(loadInterval);
    messageDiv.innerHTML = "Something went wrong";
    console.error("Error fetching response:", error);
    alert("An error occurred while sending the message.");
  } finally {
    clearInterval(loadInterval);
  }
};


const micBtn = document.querySelector("#micButton");
const playback = document.querySelector(".playback");

let canRec = false;
let isRec = false;

let audio = null;
let chunks = [];

const AudioSetup = () => {
  console.log("rec");
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia()) {
    navigator.mediaDevices
      .getUserMedia({
        audio: true,
      })
      .then(SetupStream)
      .catch((err) => console.error(err));
  }
};

function SetupStream(stream) {
  audio = new MediaRecorder(stream);
  audio.ondataavailable = (e) => {
    chunks.push(e.data);
  };
  audio.onstop = (e) => {
    const blob = new Blob(chunks, { type: "audio/wav; codecs=opus" });
    chunks = [];
    const audioURL = window.URL.createObjectURL(blob);
    playback.src = audioURL;
  };
  canRec = true;
}

function ToggleMic() {
  if (!canRec) return;
  isRec = !isRec;
  if (isRec) {
    audio.start();
    micBtn.classList.add("isRec");
  } else {
    audio.stop();
    micBtn.classList.remove("isRec");

    audio.onstop = async (e) => {
      const blob = new Blob(chunks, { type: "audio/wav; codecs=opus" });
      chunks = [];

      const formData = new FormData();
      formData.append("audio", blob, "recording.wav");

      try {
        const response = await fetch("http://10.3.40.150:8989/v1/audio/transcriptions", {
          method: "POST",
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          console.log("Audio processed: ", data);
          const parsedData = data.transcript || "No response";
          chatContainer.innerHTML += chatStripe(
            true,
            parsedData,
            generateUniqueId()
          );
          chatContainer.scrollTop = chatContainer.scrollHeight;
        } else {
          console.error("Failed to send audio");
          alert("Failed to send audio to server.");
        }
      } catch (error) {
        console.error("Error during fetch:", error);
        alert("An error occurred while sending the audio.");
      }
    };
    const audioURL = window.URL.createObjectURL(blob);
    playback.src = audioURL;
  }
}

form.addEventListener("submit", handleSubmit);

micBtn.addEventListener("click", ToggleMic);
AudioSetup();

form.addEventListener("keyup", (e) => {
  if (e.keyCode === 13) {
    handleSubmit(e);
  }
});
