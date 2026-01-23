print("Hello from python")
import os
from dotenv import load_dotenv
load_dotenv()
print(f"API Key exists: {'GEMINI_API_KEY' in os.environ}")
