// Node catalog — mirrors the categories in Lamatic Studio's "Insert step" picker.
export const CATEGORIES = ['AI', 'Data', 'Logic', 'Apps'];

export const NODE_CATALOG = {
  generateText: { label: 'Generate Text', category: 'AI', icon: '✦', defaults: { model: 'gpt-4o-mini', systemPrompt: 'You are an AI assistant.', userPrompt: '{{trigger.chatMessage}}' } },
  generateJSON: { label: 'Generate JSON', category: 'AI', icon: '{}', defaults: { model: 'gpt-4o-mini', userPrompt: 'Extract the intent as JSON', schema: '{"intent":"string","confidence":"number"}' } },
  rag:          { label: 'RAG', category: 'AI', icon: '⌕', defaults: { index: 'docs-index', topK: 3 } },
  vectorSearch: { label: 'Vector Search', category: 'Data', icon: '⋮', defaults: { index: 'docs-index', topK: 5 } },
  condition:    { label: 'Condition', category: 'Logic', icon: '◇', defaults: { expression: 'input.length > 0' } },
  code:         { label: 'Code', category: 'Logic', icon: '</>', defaults: { code: 'return input;' } },
  wait:         { label: 'Wait', category: 'Logic', icon: '⏱', defaults: { ms: 500 } },
  slack:        { label: 'Slack', category: 'Apps', icon: '#', defaults: { channel: '#alerts' } },
  apiRequest:   { label: 'API', category: 'Apps', icon: '⇄', defaults: { url: 'https://example.com', method: 'GET' } },
};

// Fixed nodes, like Lamatic's trigger and response nodes.
export const SYSTEM_NODES = {
  trigger:  { label: 'Chat Widget', category: 'Trigger', icon: '⚡' },
  response: { label: 'Chat Response', category: 'Response', icon: '💬', defaults: { redactPII: true } },
};

export const nodeMeta = (kind) => NODE_CATALOG[kind] || SYSTEM_NODES[kind];
