# bndes-info

Assistente que ajuda empresas a entender quais linhas de crédito do BNDES podem fazer sentido para sua necessidade. Não aprova crédito, não define taxa nem garante condições — apenas orienta com base em fontes oficiais.

Stack: backend Node/Express em TypeScript (`backend/`), frontend React + Vite em TypeScript (`frontend/`).

Consulte [ARCHITECTURE.md](DOCS/ARCHITECTURE.md) para uma explicação detalhada do fluxo, das responsabilidades de cada módulo e de como a aplicação usa a knowledge base e o OpenRouter.

Para publicar no Azure dentro das limitações dos planos gratuitos, consulte [docs/DEPLOYMENT_AZURE.md](docs/DEPLOYMENT_AZURE.md).

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

## Rodando localmente

### Pré-requisitos

- Windows com PowerShell, Node.js 20 ou superior e npm.
- Uma chave válida do OpenRouter.
- Um model ID disponível na sua conta OpenRouter.

Confirme as versões antes de começar:

```powershell
node --version
npm --version
```

### 1. Configurar o backend

Abra o PowerShell na raiz do repositório (`bndes-info`) e execute:

```powershell
Set-Location .\backend
npm install
Copy-Item .env.example .env
notepad .env
```

No arquivo `backend/.env`, preencha pelo menos:

```dotenv
OPENROUTER_API_KEY=sua-chave-real
OPENROUTER_MODEL_PRIMARY=seu-model-id-real
```

As demais variáveis já possuem valores locais adequados:

| Variável                    | Uso                                | Padrão                         |
| --------------------------- | ---------------------------------- | ------------------------------ |
| `OPENROUTER_API_KEY`        | Chave usada somente pelo backend   | obrigatório                    |
| `OPENROUTER_MODEL_PRIMARY`  | Modelo principal do OpenRouter     | obrigatório                    |
| `OPENROUTER_MODEL_FALLBACK` | Modelo usado se o principal falhar | opcional                       |
| `OPENROUTER_TIMEOUT_MS`     | Timeout de cada chamada            | `15000`                        |
| `OPENROUTER_BASE_URL`       | Endpoint do OpenRouter             | `https://openrouter.ai/api/v1` |
| `PORT`                      | Porta do backend                   | `3000`                         |
| `LOG_LEVEL`                 | Nível dos logs                     | `info`                         |
| `CORS_ORIGIN`               | Origem permitida pelo CORS         | `*` somente fora de produção   |

O backend carrega `.env` automaticamente ao iniciar. Nunca envie esse arquivo para o Git ou coloque a chave no frontend.

### 2. Configurar o frontend

Abra um segundo terminal na raiz do repositório e execute:

```powershell
Set-Location .\frontend
npm install
Copy-Item .env.example .env
```

Para desenvolvimento local, mantenha `VITE_API_URL` vazio:

```dotenv
VITE_API_URL=
```

Assim, o Vite encaminha `/chat` e `/health` para `http://localhost:3000`. Só preencha `VITE_API_URL` quando o frontend precisar chamar uma API publicada fora do proxy local.

### 3. Iniciar os serviços

No primeiro terminal, ainda em `backend`:

```powershell
npm run dev
```

No segundo terminal, ainda em `frontend`:

```powershell
npm run dev
```

Abra <http://localhost:5173> no navegador. O backend ficará disponível em <http://localhost:3000>.

Use exatamente `npm run dev` a partir da pasta correta. Neste ambiente Windows, passar `--host 127.0.0.1` pelo npm pode ser interpretado como um caminho pelo Vite e resultar em `404`.

### 4. Verificar a instalação

Com os dois serviços em execução, rode no PowerShell:

```powershell
Invoke-RestMethod http://localhost:3000/health
Invoke-RestMethod http://localhost:5173/health
```

Com uma chave configurada, as duas respostas devem indicar `status: ok` e `openRouterApiKey: present`. Sem a chave, o backend não inicia porque a configuração é validada no boot.

Para testar diretamente o endpoint de conversa:

```powershell
Invoke-RestMethod `
    -Uri http://localhost:3000/chat `
    -Method Post `
    -ContentType "application/json" `
    -Body '{"message":"Quero comprar uma máquina para minha empresa."}'
```

O resultado esperado é um JSON com `conversationId`, `message` e `citations`. A resposta pode pedir dados adicionais, como origem do equipamento e credenciamento BNDES.

### Testes e build

Backend:

```powershell
Set-Location .\backend
npm test
npm run build
```

Frontend:

```powershell
Set-Location .\frontend
npm run build
npm run preview
```

O `npm test` do backend não chama o OpenRouter real: os testes usam transportes mockados e cobrem Engine, Gateway, guardrails, orquestração e contratos HTTP.

### Problemas comuns

- **`OPENROUTER_API_KEY não configurada`**: confirme que `backend/.env` existe, está na pasta `backend` e contém uma chave não vazia.
- **`OPENROUTER_MODEL_PRIMARY não configurado`**: preencha um model ID válido no OpenRouter.
- **Frontend em branco ou `404`**: encerre o Vite, entre em `frontend` e execute apenas `npm run dev`.
- **Erro de conexão no chat**: confirme que o backend está rodando na porta `3000` e que `frontend/.env` mantém `VITE_API_URL=` vazio.
- **`CORS_ORIGIN deve ser configurada em produção`**: configure no App Service a URL exata do Static Web Apps, sem `/` no final.
- **Porta ocupada**: encerre o processo que usa `3000` ou `5173`, ou altere `PORT` no backend e o proxy em `frontend/vite.config.ts` de forma correspondente.
- **Timeout do OpenRouter**: verifique conectividade, validade da chave, disponibilidade do modelo e `OPENROUTER_TIMEOUT_MS`.

O frontend usa `VITE_API_URL` apenas para selecionar o destino HTTP. A chave do OpenRouter nunca deve ser configurada no frontend.

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
