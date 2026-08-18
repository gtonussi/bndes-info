# Deploy no Azure com plano gratuito

## Limite de custo

Esta arquitetura usa Azure Static Web Apps Free para `frontend/` e Azure App Service Free (F1) para `backend/`. Esses planos nao possuem SLA e o App Service Free e destinado a desenvolvimento e testes, com quotas de CPU e sem escala. A disponibilidade do F1 depende da regiao e do sistema operacional exibidos no portal. Se o portal nao oferecer **Free F1**, nao selecione Basic, Standard ou qualquer SKU paga: com a exigencia de R$0, pare e escolha outra regiao ou aguarde disponibilidade.

O Azure nao cobra pelos planos Free, mas R$0 absoluto tambem depende de duas condicoes externas: usar somente um modelo OpenRouter que sua conta possa chamar sem custo e nao criar recursos cobrados, como Application Insights, Log Analytics, IP publico, banco de dados ou plano App Service pago. Configure um alerta de custo de R$0 para detectar criacao acidental de recursos faturaveis.

## Arquitetura publicada

```text
Navegador -> Azure Static Web Apps Free (React/Vite)
                 | HTTPS e CORS restrito
                 v
            Azure App Service Free (Node/Express) -> OpenRouter
```

`OPENROUTER_API_KEY` fica apenas no App Service. `VITE_API_URL` e uma URL publica e faz parte do JavaScript gerado pelo Vite; ela nao deve conter segredo.

## Antes de publicar

1. Confirme que o repositorio esta no GitHub e que `backend/.env` nao foi enviado ao Git.
2. Rode localmente:

```powershell
Set-Location .\backend
npm ci
npm test
npm run build

Set-Location ..\frontend
npm ci
npm run build
```

3. Crie no Portal Azure um grupo de recursos, por exemplo `bndes-info-rg`. Use apenas esse grupo para facilitar a revisao e exclusao de recursos.
4. Em **Cost Management > Budgets**, crie um budget de `R$0` (ou o menor valor aceito) e um alerta de previsao. Um budget alerta, mas nao bloqueia cobrancas: a protecao principal e nunca escolher uma SKU paga.

## 1. Publicar a API no App Service

1. No Portal Azure, abra **Create a resource > Web App**.
2. Informe a assinatura, o grupo `bndes-info-rg` e um nome globalmente unico, por exemplo `bndes-info-api-<sufixo>`. O endereco sera `https://bndes-info-api-<sufixo>.azurewebsites.net`.
3. Selecione **Publish: Code**, runtime **Node 20 LTS** e uma combinacao de sistema/regiao que ofereca o plano **Free F1**. Reveja a selecao antes de criar.
4. Depois de criada, abra **Settings > Environment variables > App settings** e cadastre:

| Nome                        | Valor                                            |
| --------------------------- | ------------------------------------------------ |
| `NODE_ENV`                  | `production`                                     |
| `OPENROUTER_API_KEY`        | sua chave real do OpenRouter                     |
| `OPENROUTER_MODEL_PRIMARY`  | o ID do modelo escolhido para o projeto          |
| `OPENROUTER_MODEL_FALLBACK` | opcional                                         |
| `OPENROUTER_TIMEOUT_MS`     | `15000`                                          |
| `OPENROUTER_BASE_URL`       | `https://openrouter.ai/api/v1`                   |
| `LOG_LEVEL`                 | `info`                                           |
| `CORS_ORIGIN`               | preencha na etapa 2 com a URL do Static Web Apps |

Nao cadastre `PORT`: o App Service fornece essa variavel. Os App Settings sao injetados como variaveis de ambiente e ficam criptografados em repouso. Restrinja no RBAC quem recebe `Contributor` ou permissao de alterar configuracao; essas pessoas podem ler ou substituir segredos. Para este projeto pequeno, nao use Key Vault: ele adiciona operacoes potencialmente faturaveis e nao melhora a seguranca materialmente frente a App Settings com RBAC minimo.

5. Em **Settings > Configuration > General settings**, defina o comando de inicializacao como `npm start`, habilite **HTTPS Only** e defina TLS minimo como `1.2` ou superior. Nao habilite Application Insights.
6. Em **Deployment Center**, conecte o repositorio GitHub. Configure o workflow para publicar a pasta `backend/`; o diretorio de trabalho do build deve ser `backend`, o build e `npm ci && npm run build`, e o inicio e `npm start`. Confirme que o artefato publicado contem `package.json`, `dist/` e as dependencias de producao.
7. Apos o deploy, acesse `https://<nome-da-api>.azurewebsites.net/health`. A resposta deve ser `status: ok`. Guarde essa URL: ela sera a unica configuracao publica do frontend.

## 2. Publicar o frontend no Static Web Apps

1. No Portal Azure, abra **Create a resource > Static Web App** e escolha o plano **Free**.
2. Conecte o repositorio GitHub e configure o build:

| Campo           | Valor       |
| --------------- | ----------- |
| App location    | `/frontend` |
| API location    | deixe vazio |
| Output location | `dist`      |
| Build preset    | React       |

3. Apos a criacao, copie a URL gerada, no formato `https://<nome>.azurestaticapps.net`.
4. Volte ao App Service e altere `CORS_ORIGIN` para essa URL exata, sem barra final. Salve para reiniciar a API. O backend se recusa a iniciar em producao se esse valor estiver ausente ou for `*`.
5. No GitHub, abra **Settings > Secrets and variables > Actions > Variables** e crie a variavel de repositorio `VITE_API_URL` com `https://<nome-da-api>.azurewebsites.net`. Nao use um Secret: esta URL e publica.
6. No workflow gerado pelo Static Web Apps, adicione a variavel de ambiente ao job que executa o build:

```yaml
jobs:
  build_and_deploy_job:
    env:
      VITE_API_URL: ${{ vars.VITE_API_URL }}
```

Mantenha o token `AZURE_STATIC_WEB_APPS_API_TOKEN` criado pelo Azure como GitHub Secret e nunca o coloque em `.env`, no codigo ou em logs. Faca commit do workflow atualizado e acompanhe a aba **Actions** ate o build terminar.

## 3. Verificar e operar

1. Abra a URL `azurestaticapps.net` e envie uma pergunta no chat.
2. No navegador, a requisicao `POST /chat` deve ir para `https://<nome-da-api>.azurewebsites.net/chat` e retornar `200`.
3. Confirme que uma origem diferente da Static Web App nao recebe `Access-Control-Allow-Origin` correspondente.
4. Para alterar o backend, envie uma mudanca para a branch conectada e acompanhe o deploy no Deployment Center. Para alterar a URL da API, atualize `VITE_API_URL` no GitHub e dispare novo build do frontend.

Nao exponha a chave do OpenRouter em variaveis `VITE_*`, no Static Web Apps, no GitHub Variables, no codigo React ou em issues. Se houver vazamento, revogue a chave no OpenRouter, gere outra e substitua apenas o App Setting do App Service.

## Remocao para garantir R$0

Quando o projeto nao for mais necessario, exclua o grupo `bndes-info-rg` inteiro no Portal Azure. Isso remove o App Service e o Static Web App juntos. Antes de confirmar, revise a lista de recursos para evitar apagar outro projeto.
