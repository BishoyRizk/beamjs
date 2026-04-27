# Typesense JS SDK Documentation & Prompt Context

This document contains comprehensive examples and detailed schema references of how to use the Typesense JavaScript SDK (`typesense-js`). Use this as a reference or a prompt context for building applications with Typesense. It includes all attributes of every schema to serve as a complete reference.

---

## 1. Client Initialization & Configuration

The client can be initialized with multiple nodes for high availability, along with connection timeouts, retries, and API keys.

### Schema Reference (`ConfigurationOptions`)
```typescript
interface ConfigurationOptions {
  // Required: The API key for authentication. Use a search-only key on the frontend.
  apiKey: string;

  // Required: A list of nodes in your Typesense cluster.
  nodes: {
    host: string;      // The hostname or IP address (e.g., 'localhost' or 'xyz.typesense.net')
    port: number;      // The port (e.g., 8108 for HTTP, 443 for HTTPS)
    protocol: string;  // 'http' or 'https'
    path?: string;     // Optional base path (e.g., '/api')
    url?: string;      // Alternatively, the full URL can be provided
  }[];

  // Optional: Randomize the order of nodes to distribute load. Default: true
  randomizeNodes?: boolean; 

  // Optional: A specific node that the client will always try to use first before falling back to the 'nodes' array.
  // Useful for reducing latency if you have a distributed cluster and want to hit the geographically closest node first.
  nearestNode?: { host: string; port: number; protocol: string; path?: string; url?: string };

  // Optional: Timeout in seconds for establishing a connection to a node. Default: 5
  connectionTimeoutSeconds?: number; 

  // Optional: Interval in seconds to perform a health check on unhealthy nodes. Default: 60
  healthcheckIntervalSeconds?: number; 

  // Optional: Number of times to retry a request on failure. Default: 3
  numRetries?: number; 

  // Optional: Time in seconds to wait between retries. Default: 0.1
  retryIntervalSeconds?: number; 

  // Optional: Send API key as a query parameter instead of a header. Default: false
  sendApiKeyAsQueryParam?: boolean;

  // Optional: Use server-side caching for search results. Default: false
  useServerSideSearchCache?: boolean;

  // Optional: Cache search results locally on the client for a given number of seconds. Default: 0 (disabled)
  cacheSearchResultsForSeconds?: number;

  // Optional: Additional HTTP headers to send with every request.
  additionalHeaders?: Record<string, string>;

  // Optional: The log level for the client. Default: 'warn'
  logLevel?: "trace" | "debug" | "info" | "warn" | "error" | "silent";

  // Optional: Custom Node.js HTTP/HTTPS agents. Useful for enabling keepAlive.
  httpAgent?: HTTPAgent; 
  httpsAgent?: HTTPSAgent;

  // Optional: Custom Axios request adapter or parameter serializer for edge cases.
  axiosAdapter?: any;
  paramsSerializer?: any;
}
```

### Example
```javascript
const Typesense = require("typesense");

const client = new Typesense.Client({
  nodes: [
    { host: "127.0.0.1", port: "8108", protocol: "http" },
  ],
  apiKey: "xyz",
  numRetries: 3,
  connectionTimeoutSeconds: 10,
  logLevel: "debug",
});
```

---

## 2. Collections (Schema & CRUD)

A collection is a group of documents that share a similar schema.

### Schema Reference (`CollectionCreateSchema`)
```typescript
interface CollectionCreateSchema {
  // Required: The name of the collection
  name: string;

  // Required: The schema defining the structure of documents in this collection
  fields: CollectionFieldSchema[];

  // Optional: The default field to sort by if no sort_by parameter is provided during a search
  default_sorting_field?: string;

  // Optional: List of symbols (e.g., '-', '+') that should be indexed as standard characters instead of being treated as word separators.
  symbols_to_index?: string[];

  // Optional: List of characters that should be treated as token separators.
  token_separators?: string[];

  // Optional: Enable nested object and array fields indexing.
  enable_nested_fields?: boolean;

  // Optional: Store any arbitrary JSON metadata related to the collection.
  metadata?: object;

  // Optional: Configure a model for transcribing voice queries directly during search.
  voice_query_model?: { model_name?: string };

  // Optional: Associate specific synonym sets with this collection.
  synonym_sets?: string[];

  // Optional: Associate specific curation/override sets with this collection.
  curation_sets?: string[];
}

interface CollectionFieldSchema {
  // Required: The name of the field
  name: string;

  // Required: The data type of the field
  type: "string" | "int32" | "int64" | "float" | "bool" | "geopoint" | "geopolygon" 
        | "string[]" | "int32[]" | "int64[]" | "float[]" | "bool[]" 
        | "object" | "object[]" | "auto" | "string*" | "image";

  // Optional: Whether the field is optional (can be missing or null). Default: false
  optional?: boolean;

  // Optional: Whether the field can be used for faceting. Default: false
  facet?: boolean;

  // Optional: Whether the field should be indexed for searching. Default: true
  index?: boolean;

  // Optional: Whether the field can be used for sorting. Default: false for string, true for numerical/bool.
  sort?: boolean;

  // Optional: Set a specific locale for the field (e.g., 'ja' for Japanese).
  locale?: string;

  // Optional: Enable partial (infix) matching for this field. Default: false
  infix?: boolean;

  // Optional: Enable language-specific stemming. Default: false
  stem?: boolean;

  // Optional: Specify the number of dimensions for a vector embedding field (`float[]`).
  num_dim?: number; 

  // Optional: Whether to store the field on disk so it is returned in search results. Default: true
  store?: boolean;

  // Optional: Optimize the field for range queries.
  range_index?: boolean;
  
  // Optional: Configure automatic embedding generation for Vector Search (RAG).
  embed?: {
    // List of fields whose content should be concatenated and embedded.
    from: string[];
    // The model configuration details.
    model_config: {
      model_name: string;      // The model identifier (e.g., 'ts/all-MiniLM-L12-v2', 'openai/text-embedding-3-small')
      api_key?: string;        // API key if using an external provider like OpenAI, Cohere, etc.
      webhook_url?: string;    // Custom webhook endpoint to fetch embeddings
      access_token?: string;   // Access token for Google Cloud (GCP/Vertex AI)
      project_id?: string;     // Project ID for Google Cloud (GCP/Vertex AI)
    }
  };
}
```

### Collection Operations Example
```javascript
let schema = {
  name: "companies",
  fields: [
    { name: "company_name", type: "string", facet: false },
    { name: "num_employees", type: "int32", facet: false },
    { name: "country", type: "string", facet: true },
  ],
  default_sorting_field: "num_employees",
};

await client.collections().create(schema);
await client.collections("companies").retrieve();
await client.collections().retrieve();

// Update schema (e.g., making a field facet-able)
await client.collections("companies").update({
  fields: [{ name: "num_employees", drop: true }, { name: "num_employees", type: "int32", facet: true }],
});

await client.collections("companies").delete();
```

---

## 3. Documents (CRUD) & Bulk Operations

### Schema Reference (`DocumentImportParameters`)
```typescript
interface DocumentWriteParameters {
  // Control how data type mismatches are handled during import.
  // 'coerce_or_reject': Try to cast, reject document if impossible.
  // 'coerce_or_drop': Try to cast, drop field if impossible.
  // 'drop': Drop field if type doesn't match.
  // 'reject': Reject whole document if type doesn't match.
  dirty_values?: "coerce_or_reject" | "coerce_or_drop" | "drop" | "reject";

  // Action to perform: 'create' (default), 'update', 'upsert', 'emplace'.
  action?: "create" | "update" | "upsert" | "emplace";
}

interface DocumentImportParameters extends DocumentWriteParameters {
  // Batch size for breaking down large imports.
  batch_size?: number;

  // Batch size sent to external embedding services (e.g., OpenAI).
  remote_embedding_batch_size?: number;

  // Timeout in milliseconds for external embedding service requests.
  remote_embedding_timeout_ms?: number;

  // Number of retries for external embedding services.
  remote_embedding_num_tries?: number;

  // If true, returns the complete imported document in the response.
  return_doc?: boolean;

  // If true, returns the ID of the imported document.
  return_id?: boolean;

  // If true, throws an error if ANY document fails to import. Default: true
  throwOnFail?: boolean; 
}
```

### Example
```javascript
let document = {
  id: "124",
  company_name: "Stark Industries",
  num_employees: 5215,
  country: "USA",
};

// Single Operations
await client.collections("companies").documents().create(document);
await client.collections("companies").documents().upsert(document);
await client.collections("companies").documents("124").retrieve();
await client.collections("companies").documents("124").update({ num_employees: 5500 });
await client.collections("companies").documents("124").delete();

// Bulk Operations
let documents = [ document, { id: "125", company_name: "Acme Corp", num_employees: 1002, country: "France" } ];

// Bulk Import
await client.collections("companies").documents().import(documents, { action: "create", batch_size: 100 });
// Bulk Upsert
await client.collections("companies").documents().import(documents, { action: "upsert" });
// Bulk Delete
await client.collections("companies").documents().delete({ filter_by: "num_employees:>5000" });
```

---

## 4. Searching

### Schema Reference (`SearchParams` & `SearchResponse`)
```typescript
interface SearchParams {
  // Required: The search query string. Use '*' to match all documents.
  q?: string;

  // Required: Comma-separated list of fields to search against.
  query_by?: string | string[];

  // Optional: Relative weights for each field in `query_by` (e.g., '1,2,3').
  query_by_weights?: string | number[];

  // Optional: Whether to perform a prefix search. Can be boolean or array matching `query_by`. Default: true
  prefix?: string | boolean | boolean[];

  // Optional: Filter conditions (e.g., 'num_employees:>100 && country:USA').
  filter_by?: string;

  // Optional: Fields to sort by (e.g., 'num_employees:desc').
  sort_by?: string | string[];

  // Optional: Fields to facet by to get counts (e.g., 'country,category').
  facet_by?: string | string[];

  // Optional: Maximum number of facet values to return.
  max_facet_values?: number;

  // Optional: The page number to fetch. Default: 1
  page?: number;

  // Optional: Number of results per page. Default: 10
  per_page?: number;

  // Optional: Group results by a specific field (e.g., 'company_id').
  group_by?: string | string[];

  // Optional: Max hits to return per group.
  group_limit?: number;

  // Optional: Comma-separated list of fields to include in the response.
  include_fields?: string | string[];

  // Optional: Comma-separated list of fields to exclude from the response.
  exclude_fields?: string | string[];

  // Optional: Fields to highlight. Default: all queried fields.
  highlight_fields?: string | string[];

  // Optional: Threshold in characters before snippet generation kicks in.
  snippet_threshold?: number;

  // Optional: Number of typographical errors permitted. Default: 2
  num_typos?: string | number | number[];

  // Optional: Treat query as a vector query (`[0.12, 0.23, ...]`).
  vector_query?: string;

  // Optional: Force an exhaustive search (bypasses fast heuristics).
  exhaustive_search?: boolean;

  // Optional: Document IDs to unconditionally pin to the top of the results.
  pinned_hits?: string | string[];

  // Optional: Document IDs to hide from the results.
  hidden_hits?: string | string[];

  // Optional: Maximum time in milliseconds allowed for the search.
  search_cutoff_ms?: number;

  // Optional: Utilize server-side caching.
  use_cache?: boolean;
  
  // Vector & AI Search Parameters
  conversation?: boolean;               // Enable Conversational Search (RAG)
  conversation_model_id?: string;       // ID of the conversation model to use
  conversation_id?: string;             // Ongoing conversation ID context
  nl_query?: boolean;                   // Enable Natural Language Search
  nl_model_id?: string;                 // ID of the NL Search Model
  voice_query?: string;                 // Base64 encoded audio for voice search
}

interface SearchResponseHit<T> {
  document: T;
  highlight: Record<string, { matched_tokens?: string[]; snippet?: string; value?: string }>;
  text_match: number;
  text_match_info?: { best_field_score: string; best_field_weight: number; fields_matched: number; score: string; tokens_matched: number; };
  geo_distance_meters?: { location: number };
}

interface SearchResponse<T> {
  facet_counts?: { counts: { count: number; highlighted: string; value: string }[]; field_name: string; stats: any }[];
  found: number;
  out_of: number;
  page: number;
  search_time_ms: number;
  hits?: SearchResponseHit<T>[];
  grouped_hits?: { group_key: string[]; hits: SearchResponseHit<T>[]; found?: number; }[];
  
  // AI Responses
  conversation?: { answer: string; conversation_id: string; query: string; conversation_history: any };
  parsed_nl_query?: { generated_params: any; augmented_params: any; llm_response?: any };
}
```

### Example
```javascript
let searchResults = await client.collections("companies").documents().search({
  q: "Stark",
  query_by: "company_name",
  facet_by: "country",
  filter_by: "num_employees:<100",
  sort_by: "num_employees:desc",
});

// Multi-Search (Batching multiple queries in one HTTP request)
let multiSearchResults = await client.multiSearch.perform(
  { searches: [ { q: "Inc" }, { q: "Acme" } ] },
  { query_by: "company_name", collection: "companies" } // Global parameters
);
```

---

## 5. RAG & Conversations (Vector Search)

Typesense supports Retrieval-Augmented Generation (RAG) natively through **Conversation Models**. You can configure a variety of LLM pipelines (OpenAI, Anthropic, Gemini, local LLMs via vLLM, Cloudflare AI, etc.).

### Schema Reference (`ConversationModelCreateSchema`)
```typescript
interface ConversationModelCreateSchema {
  // Optional: Custom ID for the model.
  id?: string;

  // Required: The model identifier. Determines which provider to use.
  // Examples: 'openai/gpt-4o', 'anthropic/claude-3-opus', 'cloudflare/meta/llama-3-8b-instruct'
  model_name: string;           

  // Optional: The API key for the LLM provider.
  api_key?: string;             

  // Optional: System prompt that instructs the LLM how to behave as a search assistant.
  system_prompt?: string;       

  // Required: The maximum number of bytes of context to send to the LLM (from the search results).
  max_bytes: number;            

  // Optional: The name of a Typesense collection where conversation history should be stored.
  history_collection?: string;  

  // Optional: Cloudflare account ID if using a Cloudflare AI model.
  account_id?: string;          

  // Optional: Time-to-live (in seconds) for the conversation context.
  ttl?: number;                 

  // Optional: Custom URL for general endpoints.
  url?: string;                 

  // Custom Provider Configurations
  vllm_url?: string;            // Endpoint for vLLM compatible APIs (e.g., local Mistral/Llama instances)
  openai_url?: string;          // Custom OpenAI compatible endpoint (e.g., Azure OpenAI, LiteLLM)
  openai_path?: string;         // Custom path for OpenAI endpoints
}
```

### RAG Examples: Comprehensive Configurations

#### Example 1: OpenAI (GPT-4o) Configuration
```javascript
let openaiModel = await client.conversations().models().create({
  model_name: "openai/gpt-4o",
  api_key: "YOUR_OPENAI_API_KEY",
  system_prompt: "You are a helpful assistant for an e-commerce site. Keep answers under 3 sentences.",
  max_bytes: 16000,
  ttl: 3600, // Keep context alive for 1 hour
});
```

#### Example 2: Anthropic (Claude 3) Configuration
```javascript
let anthropicModel = await client.conversations().models().create({
  model_name: "anthropic/claude-3-sonnet",
  api_key: "YOUR_ANTHROPIC_API_KEY",
  max_bytes: 32000,
});
```

#### Example 3: Cloudflare Workers AI Configuration
```javascript
let cloudflareModel = await client.conversations().models().create({
  model_name: "cloudflare/meta/llama-3-8b-instruct",
  api_key: "YOUR_CLOUDFLARE_API_KEY",
  account_id: "YOUR_CLOUDFLARE_ACCOUNT_ID",
  max_bytes: 8192,
});
```

#### Example 4: Local LLM via vLLM (e.g., Mistral/Llama 3)
If you are hosting your own open-source model using vLLM:
```javascript
let localLLM = await client.conversations().models().create({
  model_name: "vllm/mistral-7b",
  vllm_url: "http://localhost:8000/v1/chat/completions", // Your self-hosted vLLM URL
  max_bytes: 8192,
});
```

#### Example 5: Azure OpenAI (Custom OpenAI URL)
```javascript
let azureOpenAI = await client.conversations().models().create({
  model_name: "openai/gpt-4",
  api_key: "YOUR_AZURE_OPENAI_KEY",
  openai_url: "https://your-resource-name.openai.azure.com",
  openai_path: "/openai/deployments/your-deployment-name/chat/completions?api-version=2024-02-15-preview",
  max_bytes: 16000,
});
```

#### Executing a Conversational Query
```javascript
// Step 1: Initial Question
let result = await client.collections("companies").documents().search({
  q: "What is the name of the company that Batman ran?",
  query_by: "embedding", // Search against your generated embeddings
  conversation: true,
  conversation_model_id: openaiModel.id,
});

console.log("LLM Answer:", result.conversation.answer);
console.log("Conversation ID:", result.conversation.conversation_id);

// Step 2: Follow-up question (maintaining context)
let followUpResult = await client.collections("companies").documents().search({
  q: "Where is it located?",
  query_by: "embedding",
  conversation: true,
  conversation_model_id: openaiModel.id,
  // Pass the ID to provide the LLM with previous chat history
  conversation_id: result.conversation.conversation_id, 
});
```

---

## 6. Natural Language Search Models (NL Query)

Translate free-form user sentences into structured Typesense query parameters automatically using LLMs.

### Schema Reference (`NLSearchModelCreateSchema`)
```typescript
interface NLSearchModelCreateSchema {
  // Optional: Custom ID for the model.
  id?: string;

  // Required: The model identifier (e.g., 'google/gemini-2.5-flash', 'openai/gpt-4', 'gcp/gemini-pro').
  model_name: string;          
  
  // Optional: API key for the provider.
  api_key?: string;

  // Optional: Custom endpoint URL.
  api_url?: string;            

  // Optional: Maximum bytes context size.
  max_bytes?: number;

  // Optional: Creativity parameter for the LLM. Default usually ~0.0 for deterministic outputs.
  temperature?: number;

  // Optional: Instructions for how the LLM should parse the query.
  system_prompt?: string;
  
  // Model Generation Parameters
  top_p?: number;               // Nucleus sampling parameter.
  top_k?: number;               // Top-K sampling parameter.
  stop_sequences?: string[];    // Strings that stop generation.
  max_output_tokens?: number;   // Maximum tokens the LLM can output.
  api_version?: string;         // Explicit API version.
  
  // GCP Vertex AI Specific configurations
  project_id?: string;          // Your GCP project ID.
  access_token?: string;        // OAuth access token.
  refresh_token?: string;       // OAuth refresh token.
  client_id?: string;           // OAuth client ID.
  client_secret?: string;       // OAuth client secret.
  region?: string;              // GCP Region (e.g., 'us-central1').
  
  // Cloudflare specific
  account_id?: string;          // Cloudflare account ID.
}
```

### Example: NL Search Configurations

#### Google Gemini via AI Studio
```javascript
const geminiModel = await client.nlSearchModels().create({
  id: "gemini-model",
  model_name: "google/gemini-2.5-flash",
  api_key: "YOUR_GOOGLE_AI_STUDIO_API_KEY",
  max_bytes: 16000,
  temperature: 0.0, // Keep at 0 to ensure strict JSON output from LLM
  system_prompt: "You are a helpful search assistant for an e-commerce store.",
});
```

#### Google Vertex AI (GCP) Configuration
```javascript
const vertexModel = await client.nlSearchModels().create({
  id: "vertex-model",
  model_name: "gcp/gemini-pro",
  project_id: "your-gcp-project-id",
  region: "us-central1",
  access_token: "YOUR_GCP_ACCESS_TOKEN",
  temperature: 0.1,
});
```

#### Executing an NL Query
```javascript
let searchResults = await client.collections("products").documents().search({
  q: "Find red shirts under $30 sorted by highest rating",
  nl_query: true,
  query_by: "name,description,color,category",
  nl_model_id: "gemini-model",
});

// Typesense will parse the query and automatically apply `filter_by: "color:red && price:<30"` and `sort_by: "rating:desc"`.
console.log(searchResults.parsed_nl_query); 
```

---

## 7. Synonyms, Aliases, Overrides & Stopwords

### Synonyms
Increase search recall by defining equivalent terms.
```javascript
// Multi-way Synonym: Searching for ANY of these words will match the others.
await client.collections("companies").synonyms().upsert("synonyms-doofenshmirtz", {
  synonyms: ["Doofenshmirtz", "Heinz", "Evil"],
});

// One-way Synonym: Searching for the root ('Evil') matches the synonyms. Searching for synonyms does NOT match root.
await client.collections("companies").synonyms().upsert("synonyms-evil", {
  root: "Evil",
  synonyms: ["Doofenshmirtz", "Heinz"],
});
```

### Aliases (Zero-downtime Reindexing)
Point a common name to a versioned collection name.
```javascript
await client.aliases().upsert("books", { collection_name: "books_january" });

// Search using the alias instead of the real collection name.
let results = await client.collections("books").documents().search({ q: "hunger", query_by: "title" });
```

### Overrides (Merchandising / Curation)
Inject/Promote/Hide specific documents for specific queries.
```javascript
// Pin document '126' to position 1 for the exact query 'doofen'
await client.collections("companies").overrides().upsert("promote-doofenshmirtz", {
  rule: { query: "doofen", match: "exact" }, // `match` can be 'exact' or 'contains'
  includes: [{ id: "126", position: 1 }],
  // You can also completely exclude documents:
  // excludes: [{ id: "125" }]
});
```

### Stopwords
Ignore specific meaningless words during search.
```javascript
await client.stopwords().upsert("common-words", {
  stopwords: ["a", "an", "the", "are", "am"],
});

// Use the stopwords set during search
let results = await client.collections("companies").documents().search({
  q: "the acme", 
  query_by: "company_name", 
  stopwords: "common-words" // Will ignore 'the'
});
```

---

## 8. Key Management

Manage API keys securely. Use Scoped Search Keys for client-side search in multi-tenant apps.

```javascript
// 1. Generate an Unscoped Search-Only API Key (can access everything, but only read)
let searchKeyResponse = await client.keys().create({
  description: "Search-only key.",
  actions: ["documents:search"],
  collections: ["*"],
});

// 2. Generate a Scoped Search Key (SERVER-SIDE ONLY)
// Restricts the user to only search documents where company_id = 124.
// This is embedded with a HMAC signature and does not make an API call.
const scopedSearchKey = client.keys().generateScopedSearchKey(searchKeyResponse.value, {
  filter_by: "company_id:124",
});

// 3. Use Scoped Key on the client side
const scopedClient = new Typesense.Client({
  nodes: [{ host: "127.0.0.1", port: "8108", protocol: "http" }],
  apiKey: scopedSearchKey,
});

```



## Professional Prompt

Design and implement a fully structured database controller module that strictly follows the architecture, conventions, and patterns used in existing database controllers within the system.

---

## Core Architecture:
Create a well-defined folder structure:

- `index.js` as the main entry point.
- Dedicated folders per functionality (e.g., CRUD, query engine, RAG pipelines).
- Ensure modularity and separation of concerns aligned with existing controllers.

---

## Functional Requirements:

- Implement full CRUD operations (Create, Read, Update, Delete) with behavior consistent with other database controllers.
- Support multiple RAG pipelines, designed and integrated using the same patterns and abstractions already established.
- Provide full support for the query engine, ensuring compatibility and identical usage patterns with other controllers.

---

## Interface & Standards Compliance:

Strictly follow:

- The external controller interface.
- Schema definition patterns.
- Model creation and interaction conventions.
- Multi-tenancy design.

Maintain full compatibility with how models are defined, accessed, and manipulated across the system.

---

## Connection Management:

Implement full connection lifecycle handling, including:

- Initialization.
- Graceful disconnection.
- Real-time connection status tracking and exposure.

---

## Consistency & Conventions:

- Follow exact naming conventions used in existing controllers (they are the single source of truth).
- Register the controller using the same registration pattern adopted across other database controllers.
- Ensure all logic, structure, and behaviors mirror existing implementations.

---

## Security & Data Integrity (Mongoose-Aligned Practices):

Apply schema-based casting to neutralize NoSQL injection attempts by ensuring all inputs conform to schema-defined types.

Enforce built-in validation mechanisms, including:

- Required fields enforcement.
- Value constraints (e.g., min/max for numbers, enum and regex for strings).
- Custom validators for domain-specific logic (e.g., unique email checks).

Integrate query sanitization:

- Use a sanitization mechanism similar to `sanitizeFilter()` to remove or block dangerous operators (e.g., keys starting with `$`) from user-provided query objects.
- Ensure all query inputs handled by the query engine are validated and sanitized before execution.

---

## Constraints:

- Do not introduce new architectural patterns unless absolutely necessary.
- Maintain strict alignment with existing system design.
- Prioritize consistency, maintainability, and security.
- The final implementation should be indistinguishable in structure and behavior from existing database controllers.

 

