"""Test both Groq and Cerebras, verify tracking works."""
import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient

async def test():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    from services.groq_enrichment import get_groq_enrichment_service

    groq = get_groq_enrichment_service(db)
    print(f"Groq key: {'YES' if groq._api_key else 'NO'}")
    print(f"Cerebras key: {'YES' if groq._cerebras_key else 'NO'}")
    print(f"DB set: {groq.db is not None}")

    # Test generate_offer_section (uses Groq → fallback Cerebras)
    print("\nGenerating test section...")
    result = await groq.generate_offer_section("introduccion", "Empresa: Test SA. Objeto: Prueba de tracking AI.")
    print(f"Result: {len(result)} chars")
    print(f"Preview: {result[:100]}")

    # Check tracking
    count = await db.ai_usage.count_documents({})
    print(f"\nai_usage docs: {count}")
    docs = await db.ai_usage.find().sort("created_at", -1).limit(5).to_list(5)
    for d in docs:
        print(f"  {d.get('provider')} | {d.get('endpoint')} | {d.get('tokens')} tok")

    # Test Cerebras directly
    print("\nTesting Cerebras directly...")
    cerebras_result = await groq._cerebras_completion(
        [{"role": "user", "content": "Say hello in 3 words"}],
        max_tokens=10,
    )
    if cerebras_result:
        print(f"Cerebras OK: {cerebras_result}")
    else:
        print("Cerebras FAILED")

    # Final count
    count2 = await db.ai_usage.count_documents({})
    print(f"\nFinal ai_usage docs: {count2}")

asyncio.run(test())
