/**
 * Embedding generation for RAG search.
 *
 * Uses OpenAI embeddings API when OPENAI_API_KEY is available,
 * otherwise falls back to a deterministic hash-based vector
 * for development/testing purposes.
 */

const EMBEDDING_DIMENSION = 1536

/**
 * Generate an embedding vector for the given text.
 *
 * When OPENAI_API_KEY is set, calls the OpenAI embeddings endpoint.
 * Otherwise, generates a deterministic hash-based vector as a fallback
 * (not suitable for production, but allows development without an API key).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY

  if (apiKey) {
    return generateOpenAIEmbedding(text, apiKey)
  }

  return generateHashEmbedding(text)
}

async function generateOpenAIEmbedding(
  text: string,
  apiKey: string
): Promise<number[]> {
  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: text,
        model: "text-embedding-3-small",
        dimensions: EMBEDDING_DIMENSION,
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error(`[EMBEDDING_FALLBACK] OpenAI API error ${response.status}: ${error}. RAG quality degraded.`)
      return generateHashEmbedding(text)
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>
    }

    return data.data[0]!.embedding
  } catch (err) {
    console.error("[EMBEDDING_FALLBACK] OpenAI embeddings failed, RAG quality degraded:", err)
    return generateHashEmbedding(text)
  }
}

/**
 * Deterministic hash-based embedding fallback for development.
 * Produces consistent vectors for the same input text.
 * NOT suitable for production — similarity results will be poor.
 */
function generateHashEmbedding(text: string): number[] {
  const normalized = text.toLowerCase().trim()
  const vector = new Array<number>(EMBEDDING_DIMENSION)

  // Simple seeded PRNG based on text hash
  let seed = 0
  for (let i = 0; i < normalized.length; i++) {
    seed = (seed * 31 + normalized.charCodeAt(i)) | 0
  }

  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    // xorshift32
    seed ^= seed << 13
    seed ^= seed >> 17
    seed ^= seed << 5
    // Normalize to [-1, 1]
    vector[i] = (seed % 1000) / 1000
  }

  // L2 normalize
  const magnitude = Math.sqrt(
    vector.reduce((sum, v) => sum + v * v, 0)
  )
  if (magnitude > 0) {
    for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
      vector[i] = vector[i]! / magnitude
    }
  }

  return vector
}
