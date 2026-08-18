# bndes-info

Assistente que ajuda empresas a entender quais linhas de crédito do BNDES podem fazer sentido para sua necessidade. Não aprova crédito, não define taxa nem garante condições — apenas orienta com base em fontes oficiais.

Stack: backend Node/Express em TypeScript (`backend/`), frontend React + Vite em TypeScript (`frontend/`).

## Estrutura do repositório

```
bndes-info/
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example                  # copiar para .env e preencher localmente
│   ├── data/
│   │   └── linhas_credito.json       # as 4 linhas de crédito (nome, condições, fonte, data de consulta)
│   ├── tests/
│   │   └── eval_cases.json           # dataset de avaliação (8 casos do desafio + extras)
│   └── src/
│       ├── server.ts                 # ponto de entrada, sobe o servidor HTTP
│       ├── app.ts                    # instância do Express, middlewares e rotas
│       ├── api/routes/
│       │   ├── chat.routes.ts        # valida o contrato HTTP de POST /chat
│       │   └── health.routes.ts      # GET /health e estado da configuração
│       ├── core/
│       │   ├── config.ts             # carrega e valida variáveis de ambiente
│       │   └── logger.ts             # logging estruturado, sem PII/conversas completas
│       ├── modelGateway/
│       │   └── openRouterClient.ts   # único módulo que fala com a API do OpenRouter
│       ├── recommendationEngine/
│       │   └── rulesEngine.ts        # regras determinísticas de elegibilidade (sem LLM)
│       ├── knowledgeBase/
│       │   └── loadCreditLines.ts    # leitura e validação de linhas_credito.json
│       └── validators/
│           └── outputValidator.ts    # allow-list de fontes + bloqueio de frases proibidas
└── frontend/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── .env.example                  # VITE_API_URL opcional
    ├── index.html
    └── src/
        ├── main.tsx                  # monta <App /> no #root
        ├── App.tsx                   # componente raiz, chama a API do backend
        ├── index.css                 # estilos da aplicação
        └── components/
            ├── ChatWindow.tsx        # mensagens, sugestões e composer
            └── MessageBubble.tsx     # mensagem com citações oficiais
```

## Como instalar e rodar

Pré-requisitos: Node.js 20+.

```bash
# Backend
cd backend
npm install
npm run build
cp .env.example .env   # preencher OPENROUTER_API_KEY e OPENROUTER_MODEL_PRIMARY
npm run dev             # sobe a API local (ex: http://localhost:3000)

# Frontend (em outro terminal)
cd frontend
npm install
npm run build
npm run dev             # sobe o Vite dev server (ex: http://localhost:5173)
```

O frontend usa `VITE_API_URL`. Em desenvolvimento, deixe a variável vazia para usar o proxy do Vite para `http://localhost:3000`. Em produção, informe a URL pública do backend. A chave do OpenRouter é usada exclusivamente no backend.

## API

- `POST /chat`: recebe `message`, `conversationId` opcional e até 10 turnos em `conversationHistory`.
- `GET /health`: retorna `200` quando a configuração essencial está disponível e `503` quando a chave do OpenRouter está ausente.

As respostas incluem `conversationId`, mensagem e citações das fontes oficiais utilizadas. O sistema não aprova crédito, não promete taxas e não substitui a análise do agente financeiro.

## Technical Architecture

- `server.ts` carrega `.env` com `dotenv`, valida a configuração e inicializa o Express.
- `app.ts` registra JSON, CORS, logging, routers e o middleware de erro. `ChatService` é injetável para testes HTTP.
- `chat.routes.ts` valida o payload e encaminha a requisição ao `ChatService`. O serviço mantém o `conversationId`, limita o histórico e executa extração, regras, explicação e validação.
- `OpenRouterClient` concentra as chamadas externas, usa `fetch` nativo, timeout com `AbortController`, JSON estruturado, modelo fallback e `OpenRouterTransport` injetável nos testes.
- `rulesEngine.ts` recebe apenas um perfil tipado e decide candidatos e campos ausentes. `loadCreditLines.ts` carrega o JSON e exige fontes BNDES válidas.
- `outputValidator.ts` aplica allow-list de URLs e bloqueia promessas de aprovação ou taxa antes que a resposta chegue ao frontend.
- O frontend chama somente `/chat`; não conhece a chave do OpenRouter e renderiza mensagens, estados de erro, histórico e citações.

## Architecture Decisions

- **TypeScript em todo o projeto** (backend e frontend): o autor é dev Node/React, então a stack favorece produtividade e familiaridade em vez de introduzir uma linguagem nova (Python) só porque é comum em projetos de IA.
- **Sem LangChain/LangGraph**: o fluxo é simples o suficiente (poucos estados de conversa) para ser implementado em código puro, sem a camada de abstração e a dificuldade de debug que esses frameworks trazem. LangSmith fica como diferencial opcional para observabilidade, não como requisito.
- **Sem RAG com embeddings/vector DB**: com apenas 4 linhas de crédito, o conteúdo inteiro cabe no contexto do prompt. Optamos por "RAG sem vetor" — um JSON estruturado (`linhas_credito.json`) com retrieval determinístico por regras/metadados, não busca semântica. Evita infraestrutura e modos de falha desproporcionais ao volume de dados atual; a interface de leitura (`knowledgeBase/loadCreditLines.ts`) fica isolada para permitir trocar por retrieval semântico no futuro, se o número de linhas crescer muito.
- **Recommendation Engine determinístico separado do LLM**: o LLM nunca decide sozinho qual linha é elegível. Ele só (1) extrai a intenção do usuário em formato estruturado e (2) explica em português os candidatos já decididos pelo Engine (regras em código). Essa separação reduz a superfície de alucinação na origem, em vez de só tentar detectá-la depois na saída.
- **OpenRouter com modelo fixo**: em vez de usar o auto-router (`openrouter/free`), fixamos um model ID específico escolhido empiricamente após testar candidatos contra os casos de teste — resultado mais previsível e testável.
- **Fontes oficiais apenas do BNDES** (`bndes.gov.br`): cada linha registra URL da fonte e data de consulta; nenhuma afirmação de regra/condição entra no JSON sem verificação manual na página oficial.
- **Cloud: Azure** (Container Apps/App Service + Key Vault + Application Insights), por decisão explícita do autor, priorizando um serviço único para manter o deploy simples e reproduzível.
