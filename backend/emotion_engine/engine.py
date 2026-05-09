from __future__ import annotations

import base64
import random
from typing import Any, Dict, Optional, Tuple

from backend.models.schemas import CognitiveState, EmotionAnalysisResponse
from backend.utils.math import clamp, weighted_choice


class EmotionAnalysisEngine:
    def __init__(self) -> None:
        self._cv2 = self._safe_import("cv2")
        self._np = self._safe_import("numpy")
        self._mediapipe = self._safe_import("mediapipe")
        self._fer_detector = None
        try:
            from fer import FER  # type: ignore

            self._fer_detector = FER(mtcnn=False)
        except Exception:
            self._fer_detector = None

        self._mp_face_detection = None
        if self._mediapipe is not None:
            try:
                self._mp_face_detection = self._mediapipe.solutions.face_detection.FaceDetection(
                    model_selection=0,
                    min_detection_confidence=0.45,
                )
            except Exception:
                self._mp_face_detection = None

    def analyze(self, image_base64: Optional[str], current_state: CognitiveState, simulate: bool = True, metadata: Optional[Dict[str, Any]] = None) -> EmotionAnalysisResponse:
        metadata = metadata or {}
        if image_base64 and self._cv2 is not None and self._np is not None:
            image = self._decode_image(image_base64)
            if image is not None:
                return self._analyze_frame(image, current_state)

        if not simulate:
            return EmotionAnalysisResponse(
                emotion="unknown",
                confidence=0.0,
                attention_score=0.0,
                fatigue_level=0.0,
                stress_probability=0.0,
                face_detected=False,
                landmarks_detected=False,
                source="unavailable",
            )

        return self._simulate(current_state, metadata)

    def _analyze_frame(self, image: Any, current_state: CognitiveState) -> EmotionAnalysisResponse:
        cv2 = self._cv2
        np = self._np
        frame_h, frame_w = image.shape[:2]
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        face_box = None
        face_confidence = 0.55
        landmarks_detected = False

        if self._mp_face_detection is not None:
            try:
                result = self._mp_face_detection.process(rgb)
                if result.detections:
                    detection = result.detections[0]
                    bbox = detection.location_data.relative_bounding_box
                    face_box = (
                        max(0, int(bbox.xmin * frame_w)),
                        max(0, int(bbox.ymin * frame_h)),
                        max(1, int(bbox.width * frame_w)),
                        max(1, int(bbox.height * frame_h)),
                    )
                    face_confidence = float(detection.score[0])
                    landmarks_detected = True
            except Exception:
                face_box = None

        if face_box is None:
            face_box = self._detect_face_with_cv2(image)

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        brightness = float(np.mean(gray)) / 255.0
        sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        fatigue_level = clamp((0.62 - brightness) * 0.9 + (90.0 - min(90.0, sharpness)) / 140.0, 0.0, 1.0)

        if face_box:
            x, y, w, h = face_box
            center_x = (x + w / 2.0) / max(1, frame_w)
            center_y = (y + h / 2.0) / max(1, frame_h)
            center_distance = abs(center_x - 0.5) + abs(center_y - 0.45)
            area_ratio = (w * h) / max(1, frame_w * frame_h)
            attention_score = clamp(1.0 - center_distance * 1.2 + min(area_ratio * 2.2, 0.22), 0.0, 1.0)
        else:
            attention_score = clamp(0.32 + random.random() * 0.18, 0.0, 1.0)

        emotion, emotion_confidence = self._detect_emotion_with_fer(image)
        if emotion == "unknown":
            stress_probability = clamp(
                (current_state.stress_level / 100.0) * 0.55
                + (current_state.cognitive_load / 100.0) * 0.25
                + fatigue_level * 0.2
                + random.uniform(-0.08, 0.08),
                0.0,
                1.0,
            )
            emotion = self._emotion_from_state(attention_score, fatigue_level, stress_probability)
            emotion_confidence = clamp(face_confidence * 0.7 + 0.18, 0.0, 1.0)
        else:
            stress_probability = self._stress_from_emotion(emotion, fatigue_level, current_state)

        return EmotionAnalysisResponse(
            emotion=emotion,
            confidence=round(emotion_confidence, 3),
            attention_score=round(attention_score, 3),
            fatigue_level=round(fatigue_level, 3),
            stress_probability=round(stress_probability, 3),
            face_detected=face_box is not None,
            landmarks_detected=landmarks_detected,
            source="webcam",
        )

    def _decode_image(self, image_base64: str) -> Optional[Any]:
        try:
            raw = image_base64.split(",", 1)[-1] if "," in image_base64[:80] else image_base64
            data = base64.b64decode(raw)
            array = self._np.frombuffer(data, dtype=self._np.uint8)
            return self._cv2.imdecode(array, self._cv2.IMREAD_COLOR)
        except Exception:
            return None

    def _detect_face_with_cv2(self, image: Any) -> Optional[Tuple[int, int, int, int]]:
        cv2 = self._cv2
        try:
            cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            cascade = cv2.CascadeClassifier(cascade_path)
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(48, 48))
            if len(faces) == 0:
                return None
            faces = sorted(faces, key=lambda box: box[2] * box[3], reverse=True)
            x, y, w, h = faces[0]
            return int(x), int(y), int(w), int(h)
        except Exception:
            return None

    def _detect_emotion_with_fer(self, image: Any) -> Tuple[str, float]:
        if self._fer_detector is None:
            return "unknown", 0.0
        try:
            result = self._fer_detector.top_emotion(image)
            if not result or result[0] is None:
                return "unknown", 0.0
            emotion, confidence = result
            if emotion == "fear":
                emotion = "stressed"
            return str(emotion), float(confidence or 0.0)
        except Exception:
            return "unknown", 0.0

    def _simulate(self, state: CognitiveState, metadata: Dict[str, Any]) -> EmotionAnalysisResponse:
        stress_probability = clamp(
            (state.stress_level * 0.55 + state.cognitive_load * 0.25 + state.fatigue * 0.2) / 100.0
            + random.uniform(-0.06, 0.06),
            0.0,
            1.0,
        )
        attention_score = clamp(
            (state.focus_level * 0.72 + state.intent_confidence * 0.18 + (100 - state.distraction_probability) * 0.1) / 100.0
            + random.uniform(-0.05, 0.05),
            0.0,
            1.0,
        )
        fatigue_level = clamp(state.fatigue / 100.0 + random.uniform(-0.04, 0.04), 0.0, 1.0)
        emotion = self._emotion_from_state(attention_score, fatigue_level, stress_probability)
        confidence = clamp(0.72 + abs(stress_probability - 0.5) * 0.24 + random.uniform(-0.05, 0.06), 0.45, 0.96)
        source = "simulated"
        if metadata.get("source"):
            source = f"simulated:{metadata['source']}"
        return EmotionAnalysisResponse(
            emotion=emotion,
            confidence=round(confidence, 3),
            attention_score=round(attention_score, 3),
            fatigue_level=round(fatigue_level, 3),
            stress_probability=round(stress_probability, 3),
            face_detected=bool(metadata.get("face_detected", True)),
            landmarks_detected=False,
            source=source,
        )

    def _emotion_from_state(self, attention_score: float, fatigue_level: float, stress_probability: float) -> str:
        return weighted_choice(
            (
                ("stressed", stress_probability * 1.2),
                ("focused", attention_score * (1.1 - stress_probability)),
                ("fatigued", fatigue_level * 0.9),
                ("distracted", max(0.0, 0.7 - attention_score)),
                ("calm", max(0.0, 0.75 - stress_probability) * max(0.2, attention_score)),
            )
        )

    def _stress_from_emotion(self, emotion: str, fatigue_level: float, state: CognitiveState) -> float:
        emotion_weight = {
            "angry": 0.82,
            "stressed": 0.86,
            "fear": 0.84,
            "sad": 0.66,
            "neutral": 0.43,
            "happy": 0.24,
            "surprise": 0.58,
            "calm": 0.2,
            "focused": 0.32,
        }.get(emotion, 0.46)
        return round(clamp(emotion_weight * 0.62 + fatigue_level * 0.16 + state.stress_level / 100.0 * 0.22, 0.0, 1.0), 3)

    def _safe_import(self, module_name: str) -> Any:
        try:
            return __import__(module_name)
        except Exception:
            return None

