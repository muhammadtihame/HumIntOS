# HumIntOS: Cinematic Adaptive AI Interface

HumIntOS is a hackathon-ready, real-time platform that creates a responsive and intelligent interface by simulating and ingesting cognitive, emotional, and behavioral signals. It computes adaptive UI modes dynamically and streams the state of the entire system over WebSockets, allowing the interface to respond to the user's focus, stress, or cognitive load in real-time.

## 🚀 Key Features

- **Real-Time Telemetry & Emotion Analysis:** Uses computer vision to track user focus, stress markers, gaze deviation, and micro-expressions.
- **Cognitive State Engine:** Fuses webcam data, behavioral updates (typing speed, mouse movement), and AI emotion tracking to estimate the user's cognitive state continuously.
- **Adaptive UI Modes:** The interface seamlessly shifts into `focus_mode`, `stress_mode`, `cognitive_overload_mode`, or `normal_mode` to provide optimal user support and aesthetic experience.
- **Hume AI Integration:** Incorporates Hume EVI for voice-based emotion measurement and Hume Expression Measurement for text/audio analysis.
- **Context-Aware Assistant:** An integrated assistant that tailors its response tone (calm, direct, simplified) based on the user's current stress and cognitive load.
- **Interactive Demo Capabilities:** Ready-to-use demo triggers that transition the system into specific cognitive states instantly for presentations.

## 🏗️ Architecture

The project is structured into two main components:

### 1. [Backend Engine](./backend)
A high-performance Python application built with FastAPI. It handles intensive tasks such as signal fusion, inference, emotion analysis, and WebSocket stream management.

- **Stack:** Python, FastAPI, Uvicorn, OpenCV, MediaPipe, Hume SDK.
- **Documentation:** See the [Backend README](./backend/README.md) for detailed API and WebSocket event documentation.

### 2. [Frontend Dashboard](./frontend)
A responsive React dashboard built with Vite that visually represents the real-time telemetry, cognitive state, and adaptive UI modes.

- **Stack:** React, Vite, WebSockets.
- **Documentation:** See the [Frontend README](./frontend/README.md) for setup and configuration details.

---

## 💻 Quick Start Guide

To get HumIntOS running locally, you need to start both the backend server and the frontend development server.

### Prerequisites

- Node.js (v18+)
- Python (3.9+)
- (Optional) Hume API Key for advanced emotional intelligence features.

### Setting up the Backend

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment (optional but recommended):
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows use `.venv\Scripts\activate`
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create your `.env` file from the example:
   ```bash
   cp .env.example .env
   ```
5. Start the backend server:
   ```bash
   uvicorn main:app --reload
   ```
The backend will be available at `http://localhost:8000`. You can explore the interactive API docs at `http://localhost:8000/docs`.

### Setting up the Frontend

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Create your `.env` file from the example (if applicable) or setup environment variables:
   ```bash
   # VITE_HUMINTOS_API_URL=http://localhost:8000
   # VITE_HUMINTOS_WS_URL=ws://localhost:8000
   ```
3. Install Node dependencies:
   ```bash
   npm install
   ```
4. Start the Vite development server:
   ```bash
   npm run dev
   ```
The frontend will typically be available at `http://localhost:5173`.

---

## 📡 Core API & WebSocket Endpoints

HumIntOS relies heavily on WebSockets for real-time telemetry and state synchronization.

### WebSockets
- `ws://localhost:8000/ws/realtime`: Main telemetry stream for frontend UI updates.
- `ws://localhost:8000/ws/hume/evi`: Hume EVI voice and TTS stream.

### REST APIs
- `GET /health`: Health check endpoint.
- `GET /state/current`: Fetch the snapshot of the current cognitive/emotional state.
- `POST /emotion/analyze`: Analyze an image frame (base64) for emotion detection.
- `POST /emotion/text`: Analyze text for emotional content.
- `POST /behavior/update`: Submit behavioral telemetry (mouse movement, typing speed).
- `POST /assistant/respond`: Get a context-aware response from the assistant.

### Demo Triggers
Use these endpoints to force the system into specific states during demonstrations:
- `POST /demo/focus`: Triggers high-focus state.
- `POST /demo/stress`: Triggers stress mode.
- `POST /demo/overload`: Triggers cognitive overload.
- `POST /demo/normalize`: Returns the system to a baseline state.

---

## 📚 Comprehensive Documentation

For an in-depth understanding of the system, please refer to the detailed component documentation:

- **[Backend Architecture & API Docs](./backend/README.md)**: Detailed breakdown of the Cognitive Engine, Hume integration, Event Payloads, and API parameters.
- **[Frontend Setup & Configuration](./frontend/README.md)**: Details on environment variables, component structure, and deployment.
