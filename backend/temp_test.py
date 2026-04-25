"""
Test script for the fine‑tuned CARA medical model hosted on Hugging Face Spaces.
No API key required — the Space is public.
"""
import requests
import json

HF_SPACE_URL = "https://kinghawk-cara-medical-api.hf.space/v1/chat/completions"

def test_cara(prompt: str, max_tokens: int = 64, temperature: float = 0.7):
    payload = {
        "model": "cara-medical",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }

    print(f"\n🧪 Testing prompt: {prompt}")
    try:
        response = requests.post(HF_SPACE_URL, json=payload, timeout=60)
        response.raise_for_status()
        result = response.json()
        content = result["choices"][0]["message"]["content"]
        print(f"✅ Response: {content}")
        return content
    except requests.exceptions.Timeout:
        print("❌ Request timed out (model may be sleeping — retry in a few seconds).")
    except requests.exceptions.HTTPError as e:
        print(f"❌ HTTP error: {e}")
        print(f"   Response: {e.response.text}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")

if __name__ == "__main__":
    # Test 1: Greeting
    test_cara(
        "You are CARA, a caring nurse. Generate a warm, short greeting for patient John on day 5 of cardiac recovery.",
        max_tokens=40
    )

    # Test 2: Clinical question
    test_cara(
        "You are CARA, a caring nurse. Patient John is on day 5 of cardiac recovery. He just reported feeling tired. Ask him a relevant follow‑up question about his energy or medication.",
        max_tokens=64
    )

    # Test 3: Empathetic acknowledgment
    test_cara(
        "You are CARA. Patient John says he missed his medication. Give a short empathetic acknowledgment and ask if he needs help remembering.",
        max_tokens=50
    )
