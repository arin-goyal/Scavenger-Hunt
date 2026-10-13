import io
import time
import base64
import logging
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
import numpy as np
from PIL import Image

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("yolo_detector")

# COCO target class alias mappings to ensure seamless gameplay
CLASS_ALIASES = {
    "cup": ["cup", "mug", "coffee mug", "teacup", "coffee cup"],
    "bottle": ["bottle", "water bottle", "flask"],
    "book": ["book", "notebook", "novel", "textbook"],
    "cell phone": ["cell phone", "phone", "smartphone", "mobile"],
    "mouse": ["mouse", "computer mouse"],
    "keyboard": ["keyboard", "computer keyboard"],
    "laptop": ["laptop", "computer", "notebook pc"],
    "scissors": ["scissors", "shears"],
    "chair": ["chair", "armchair", "desk chair"],
    "clock": ["clock", "wall clock", "watch", "alarm clock"],
    "backpack": ["backpack", "bag", "schoolbag", "rucksack"],
    "fork": ["fork"],
    "spoon": ["spoon"],
    "knife": ["knife"],
    "bowl": ["bowl"],
    "banana": ["banana"],
    "apple": ["apple"],
    "orange": ["orange", "citrus"],
    "remote": ["remote", "tv remote", "remote control"],
    "toothbrush": ["toothbrush"],
    "potted plant": ["potted plant", "plant", "houseplant"],
    "tie": ["tie", "necktie"],
    "umbrella": ["umbrella"],
}

class YOLODetector:
    _instance: Optional["YOLODetector"] = None

    def __init__(self, model_path: str = "yolov8n.pt"):
        from ultralytics import YOLO
        logger.info(f"Loading YOLO model from {model_path}...")
        self.model_path = model_path
        self.model = YOLO(model_path)
        logger.info(f"YOLO model ready with {len(self.model.names)} classes.")

    @classmethod
    def get_instance(cls, model_path: str = "yolov8n.pt") -> "YOLODetector":
        if cls._instance is None:
            cls._instance = cls(model_path)
        return cls._instance

    def decode_image(self, image_data: str) -> Tuple[np.ndarray, int, int]:
        """Decodes base64 data URL or raw base64 string to RGB numpy array."""
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]
        img_bytes = base64.b64decode(image_data)
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        width, height = img.size
        return np.array(img), width, height

    def detect(
        self,
        image_data: str,
        target_class: Optional[str] = None,
        conf_threshold: float = 0.35,
    ) -> Dict[str, Any]:
        """
        Runs YOLO object detection on the provided base64 frame.
        Returns detected bounding boxes, classes, confidence, and target match status.
        """
        start_time = time.perf_counter()
        img_np, width, height = self.decode_image(image_data)

        results = self.model(img_np, conf=conf_threshold, verbose=False)
        inference_ms = round((time.perf_counter() - start_time) * 1000, 1)

        detections: List[Dict[str, Any]] = []
        target_found = False
        target_match_info = None

        target_aliases = []
        if target_class:
            clean_target = target_class.strip().lower()
            target_aliases = CLASS_ALIASES.get(clean_target, [clean_target])

        for r in results:
            boxes = r.boxes
            if boxes is None:
                continue

            for box in boxes:
                cls_id = int(box.cls[0].item())
                cls_name = self.model.names.get(cls_id, str(cls_id)).lower()
                conf = float(box.conf[0].item())
                xyxy = [float(val) for val in box.xyxy[0].tolist()]

                # Normalized box: [x1/w, y1/h, x2/w, y2/h]
                norm_box = [
                    round(xyxy[0] / width, 4),
                    round(xyxy[1] / height, 4),
                    round(xyxy[2] / width, 4),
                    round(xyxy[3] / height, 4),
                ]

                is_target = False
                if target_class and (
                    cls_name in target_aliases or any(alias in cls_name for alias in target_aliases)
                ):
                    is_target = True
                    target_found = True
                    if target_match_info is None or conf > target_match_info["confidence"]:
                        target_match_info = {
                            "class": cls_name,
                            "confidence": round(conf, 3),
                            "box": [round(c, 1) for c in xyxy],
                            "normalized_box": norm_box,
                        }

                detections.append({
                    "class_id": cls_id,
                    "class": cls_name,
                    "confidence": round(conf, 3),
                    "box": [round(c, 1) for c in xyxy],
                    "normalized_box": norm_box,
                    "is_target": is_target,
                })

        return {
            "detections": detections,
            "target_found": target_found,
            "target_match": target_match_info,
            "target_searched": target_class,
            "inference_ms": inference_ms,
            "image_size": {"width": width, "height": height},
        }
