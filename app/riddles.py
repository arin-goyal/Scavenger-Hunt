import random
import logging
import json
import os
import requests
from typing import List, Dict, Any, Optional

logger = logging.getLogger("riddles")

# Curated catalog of indoor everyday objects strictly supported by YOLOv8
CURATED_RIDDLES: List[Dict[str, Any]] = [
    {
        "yolo_class": "cup",
        "object_name": "A Coffee Mug or Cup",
        "riddle": "I have an open mouth that never speaks, and a single ear that never hears. I hold hot morning fuel or afternoon calm. What am I?",
        "hint_1": "You hold me by my handle while sipping your tea or coffee.",
        "hint_2": "Look in your kitchen or beside your computer—ceramic or glass vessel for drinks.",
    },
    {
        "yolo_class": "bottle",
        "object_name": "A Water Bottle",
        "riddle": "I have a neck but no head, and I wear a tight cap wherever I go. Athletes carry me, students pack me, and I keep thirst away. What am I?",
        "hint_1": "I am a portable container made of plastic, glass, or steel with a screw-on lid.",
        "hint_2": "Look on your desk, gym bag, or fridge—filled with water or hydration.",
    },
    {
        "yolo_class": "book",
        "object_name": "A Book or Notebook",
        "riddle": "I have a spine without a single bone, and hundreds of leaves that never grew on trees. I can transport your mind across centuries without moving an inch. What am I?",
        "hint_1": "You turn my pages to read adventures, facts, or stories.",
        "hint_2": "Found on a bookshelf, nightstand, or desk—paper bound between two covers.",
    },
    {
        "yolo_class": "cell phone",
        "object_name": "A Mobile Phone",
        "riddle": "I light up when touched, speak in endless voices, and carry the sum of human knowledge in your palm. If left behind, people feel lost. What am I?",
        "hint_1": "You tap my glowing glass screen all day for calls and messages.",
        "hint_2": "Your pocket companion or a smartphone lying right near you.",
    },
    {
        "yolo_class": "mouse",
        "object_name": "A Computer Mouse",
        "riddle": "I have a tail or invisible waves, I scurry across a flat pad all day, but cheese would only gum up my gears. What am I?",
        "hint_1": "You click my buttons and scroll my wheel to navigate your screen.",
        "hint_2": "Sits right next to your keyboard or laptop.",
    },
    {
        "yolo_class": "keyboard",
        "object_name": "A Computer Keyboard",
        "riddle": "I have dozens of keys, yet I cannot open a single door. I have space, yet no room. You tap my face to write your thoughts. What am I?",
        "hint_1": "Q, W, E, R, T, Y are among my most famous inhabitants.",
        "hint_2": "The board with alphabet keys in front of your monitor.",
    },
    {
        "yolo_class": "scissors",
        "object_name": "A Pair of Scissors",
        "riddle": "Two blades united at the heart, yet we must part to do our job. Put your fingers in my eyes, and I will divide paper in two. What am I?",
        "hint_1": "You use me to cut paper, ribbon, or craft materials.",
        "hint_2": "Found in a pencil holder, craft box, or desk drawer—twin crossing steel blades.",
    },
    {
        "yolo_class": "clock",
        "object_name": "A Clock or Watch",
        "riddle": "I have a face that never smiles, and two or three hands that never wave. I run perpetually, yet I never take a step. What am I?",
        "hint_1": "I tell you when to wake up, attend class, or go to sleep.",
        "hint_2": "Hangs on the wall, sits on a bedside table, or ticks on a wrist.",
    },
    {
        "yolo_class": "chair",
        "object_name": "A Chair",
        "riddle": "I have four legs but cannot walk. I have a back but cannot bend. I welcome you when you are tired of standing. What am I?",
        "hint_1": "You sit on me when working, studying, or eating meals.",
        "hint_2": "A piece of furniture with a seat and backrest right in your room.",
    },
    {
        "yolo_class": "backpack",
        "object_name": "A Backpack or Bag",
        "riddle": "I hug your shoulders when you wander, swallowing your books, laptops, and gear whole. What am I?",
        "hint_1": "You strap me onto your back for school, travel, or work.",
        "hint_2": "A zippered bag with shoulder straps sitting on a chair or floor.",
    },
    {
        "yolo_class": "spoon",
        "object_name": "A Spoon",
        "riddle": "I have a shallow bowl for a head and a slender handle for a tail. I swim through soup and cereal without ever getting full. What am I?",
        "hint_1": "You use me to eat cereal, soup, or ice cream without stabbing anything.",
        "hint_2": "A rounded metallic or wooden eating utensil found in the kitchen.",
    },
    {
        "yolo_class": "fork",
        "object_name": "A Fork",
        "riddle": "I have three or four silver teeth, but I have no jaws to chew. I spear your dinner so your fingers stay clean. What am I?",
        "hint_1": "You use me to twirl pasta or pierce salad bites.",
        "hint_2": "The pronged utensil next to your dinner plate.",
    },
    {
        "yolo_class": "banana",
        "object_name": "A Banana",
        "riddle": "I wear a yellow jacket that unzips from top to bottom. I curve like a gentle crescent smile, packed with potassium. What am I?",
        "hint_1": "A sweet, peelable fruit loved by runners and primates.",
        "hint_2": "Look in your fruit basket—yellow curved peel with soft white fruit inside.",
    },
    {
        "yolo_class": "apple",
        "object_name": "An Apple",
        "riddle": "I can be ruby red, emerald green, or sunny yellow. A famous doctor-dispeller and gravity's historic muse. What am I?",
        "hint_1": "Crisp and juicy fruit with a core and stem, often red or green.",
        "hint_2": "Found on the kitchen counter or in the fridge crisper drawer.",
    },
    {
        "yolo_class": "remote",
        "object_name": "A TV Remote Control",
        "riddle": "I hold quiet power over black screens from across the room. Packed with rubber buttons, I change channels with invisible beams of light. What am I?",
        "hint_1": "You use me to adjust volume or choose what to watch on Netflix.",
        "hint_2": "Rests on the couch cushion, coffee table, or beside the TV.",
    },
    {
        "yolo_class": "toothbrush",
        "object_name": "A Toothbrush",
        "riddle": "Bristles on my crown, paste on my cheek, twice a day I scrub the pearly gates of your smile. What am I?",
        "hint_1": "Found in the bathroom, keeps your dental hygiene fresh.",
        "hint_2": "A slim handle with soft bristles you use every morning and night.",
    },
    {
        "yolo_class": "laptop",
        "object_name": "A Laptop",
        "riddle": "I close like a clamshell and open into a portal of work and play. I have a screen, keyboard, and battery all in one folding frame. What am I?",
        "hint_1": "A portable computer you rest on your lap or desk.",
        "hint_2": "Open clamshell computer with illuminated screen.",
    },
    {
        "yolo_class": "bowl",
        "object_name": "A Bowl",
        "riddle": "I am a smooth hollow hemisphere, keeping your soup, noodles, or morning cereal from spilling across the table. What am I?",
        "hint_1": "Deeper than a plate, perfect for liquids and salads.",
        "hint_2": "Ceramic or glass round dish in your kitchen cabinet.",
    },
    {
        "yolo_class": "potted plant",
        "object_name": "A Potted Plant",
        "riddle": "I live in earthen pottery, drinking sunlight and water. I purify your room's air with silent green leaves. What am I?",
        "hint_1": "A living houseplant or succulent resting in a pot.",
        "hint_2": "Green leaves growing inside a ceramic or plastic container near a window.",
    },
    {
        "yolo_class": "umbrella",
        "object_name": "An Umbrella",
        "riddle": "I stay thin and folded when the sun is bright, but when gray clouds weep, I bloom into a portable canvas roof over your head. What am I?",
        "hint_1": "Pops open with ribs and fabric to shield you from raindrops.",
        "hint_2": "Found by the entryway coat rack or closet—rain canopy.",
    },
]

# Supported classes for GenAI generation
ALLOWED_GENAI_CLASSES = [
    "cup", "bottle", "book", "cell phone", "mouse", "keyboard",
    "scissors", "clock", "chair", "backpack", "spoon", "fork",
    "banana", "apple", "remote", "toothbrush", "laptop", "bowl",
    "potted plant", "umbrella"
]

class RiddleEngine:
    def __init__(self):
        self.gemini_api_key = os.getenv("GEMINI_API_KEY", "")
        self.groq_api_key = os.getenv("GROQ_API_KEY", "")

    def set_api_key(self, provider: str, key: str) -> None:
        if provider.lower() == "gemini":
            self.gemini_api_key = key.strip()
        elif provider.lower() == "groq":
            self.groq_api_key = key.strip()

    def generate_with_gemini(self, target_class: str) -> Optional[Dict[str, Any]]:
        """Generates a riddle using Google Gemini free tier API."""
        if not self.gemini_api_key:
            return None

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={self.gemini_api_key}"
        prompt = (
            f"You are the game master for an AR scavenger hunt game. "
            f"Write a witty, poetic, clever riddle whose answer is a common everyday '{target_class}'. "
            f"Do NOT mention the word '{target_class}' in the riddle text. "
            f"Return ONLY valid JSON matching this exact format:\n"
            f'{{"yolo_class": "{target_class}", "object_name": "Friendly name of {target_class}", '
            f'"riddle": "Clever 2-3 sentence riddle", "hint_1": "Moderate contextual clue", "hint_2": "Direct visual/appearance clue"}}'
        )

        try:
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.8, "responseMimeType": "application/json"}
            }
            res = requests.post(url, json=payload, timeout=6)
            if res.status_code == 200:
                data = res.json()
                text = data["candidates"][0]["content"]["parts"][0]["text"]
                parsed = json.loads(text)
                parsed["yolo_class"] = target_class
                return parsed
        except Exception as e:
            logger.warning(f"Gemini riddle generation failed, falling back to curated: {e}")
        return None

    def generate_with_groq(self, target_class: str) -> Optional[Dict[str, Any]]:
        """Generates a riddle using Groq free tier API."""
        if not self.groq_api_key:
            return None

        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.groq_api_key}",
            "Content-Type": "application/json"
        }
        prompt = (
            f"Write a clever, engaging scavenger hunt riddle for finding an everyday '{target_class}'. "
            f"Do not give away the name '{target_class}' directly in the riddle. "
            f"Respond ONLY with raw JSON: {{\"yolo_class\": \"{target_class}\", \"object_name\": \"Name\", "
            f"\"riddle\": \"Riddle here\", \"hint_1\": \"Hint 1\", \"hint_2\": \"Hint 2\"}}"
        )

        try:
            payload = {
                "model": "llama-3.1-8b-instant",
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
                "temperature": 0.8
            }
            res = requests.post(url, headers=headers, json=payload, timeout=6)
            if res.status_code == 200:
                data = res.json()
                text = data["choices"][0]["message"]["content"]
                parsed = json.loads(text)
                parsed["yolo_class"] = target_class
                return parsed
        except Exception as e:
            logger.warning(f"Groq riddle generation failed, falling back to curated: {e}")
        return None

    def get_riddle_for_round(
        self,
        target_class: str,
        use_genai: bool = True
    ) -> Dict[str, Any]:
        """Fetches riddle via GenAI if available, or pulls from curated backup list."""
        if use_genai:
            if self.gemini_api_key:
                ai_riddle = self.generate_with_gemini(target_class)
                if ai_riddle:
                    return ai_riddle
            elif self.groq_api_key:
                ai_riddle = self.generate_with_groq(target_class)
                if ai_riddle:
                    return ai_riddle

        # Fallback to curated backup list
        matches = [r for r in CURATED_RIDDLES if r["yolo_class"] == target_class]
        if matches:
            chosen = dict(random.choice(matches))
            return chosen

        # Ultimate fallback
        return {
            "yolo_class": target_class,
            "object_name": f"A {target_class.capitalize()}",
            "riddle": f"Seek me in your immediate surroundings—I am a humble {target_class} waiting in plain sight.",
            "hint_1": f"Think about common tools or household items.",
            "hint_2": f"Find a {target_class} and frame it in your camera viewfinder.",
        }

    def generate_game_rounds(self, count: int = 5, use_genai: bool = True) -> List[Dict[str, Any]]:
        """Generates exactly `count` unique rounds for a game session."""
        all_classes = list(set([r["yolo_class"] for r in CURATED_RIDDLES]))
        random.shuffle(all_classes)
        selected_classes = all_classes[:count]

        rounds = []
        for idx, cls_name in enumerate(selected_classes, start=1):
            riddle_data = self.get_riddle_for_round(cls_name, use_genai=use_genai)
            riddle_data["round_number"] = idx
            rounds.append(riddle_data)

        return rounds

# Global singleton
riddle_engine = RiddleEngine()
