"""Check AI usage and test Groq availability."""
import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient

async def check():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

    # Check ai_usage collection
    count = await db.ai_usage.count_documents({})
    print(f"ai_usage documents: {count}")
    docs = await db.ai_usage.find().sort("created_at", -1).limit(10).to_list(10)
    for d in docs:
        provider = d.get("provider", "?")
        endpoint = d.get("endpoint", "?")
        tokens = d.get("tokens", 0)
        ts = d.get("created_at", "?")
        print(f"  {provider} | {endpoint} | {tokens} tok | {ts}")

    # Test Groq availability
    print("\nTesting Groq...")
    from services.groq_enrichment import get_groq_enrichment_service
    groq = get_groq_enrichment_service(db)
    try:
        client = groq._get_client()
        if client:
            resp = await asyncio.to_thread(
                client.chat.completions.create,
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": "Say hello in 3 words"}],
                max_tokens=10,
            )
            tokens = resp.usage.total_tokens if resp.usage else 0
            print(f"Groq OK: {resp.choices[0].message.content.strip()} ({tokens} tokens)")
        else:
            print("Groq: no client (no API key)")
    except Exception as e:
        print(f"Groq FAILED: {type(e).__name__}: {str(e)[:150]}")

    # Check ai_usage after test
    count2 = await db.ai_usage.count_documents({})
    print(f"\nai_usage after test: {count2}")

asyncio.run(check())
