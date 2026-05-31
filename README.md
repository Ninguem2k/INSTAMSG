# InstaMSG

Extensão para Chrome/Firefox que gera variações personalizadas de mensagens com IA e envia rapidamente no Instagram Web com `Ctrl+I`.

## Funcionalidades

- Gere múltiplas variações de uma mensagem base usando IA (DeepSeek, OpenAI, Gemini ou Ollama)
- Edite, adicione ou remova mensagens manualmente
- Pressione `Ctrl+I` no Instagram para copiar a próxima mensagem da lista (ciclo automático)
- Toast discreto na página indicando qual mensagem foi copiada
- Persistência local: suas mensagens e configurações ficam salvas no navegador
- Dark mode automático

## Instalação

### Chrome / Edge / Brave

1. Acesse `chrome://extensions`
2. Ative o **Modo do desenvolvedor** (toggle no canto superior direito)
3. Clique em **Carregar sem compactação**
4. Selecione a pasta `InstaMSG`
5. A extensão aparecerá na barra de ferramentas

### Firefox

1. Acesse `about:debugging#/runtime/this-firefox`
2. Clique em **Carregar extensão temporária...**
3. Selecione o arquivo `manifest.json` dentro da pasta `InstaMSG`
4. A extensão ficará ativa até reiniciar o Firefox

> Para instalação permanente no Firefox, é necessário empacotar como `.xpi` ou publicar na Mozilla Add-ons.

## Configuração

### 1. Escolher provedor de IA

| Provedor | Precisa de chave? | Custo |
|---|---|---|
| **DeepSeek** | Sim (`sk-...`) | Pago (créditos) |
| **OpenAI** | Sim (`sk-...`) | Pago |
| **Google Gemini** | Sim (`AIza...`) | Camada gratuita disponível |
| **Ollama** | Não | Grátis (roda local) |

### 2. Configurar chave de API (DeepSeek, OpenAI ou Gemini)

- **DeepSeek**: acesse [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)
- **OpenAI**: acesse [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Gemini**: acesse [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

Cole a chave no campo **Chave de API** dentro da extensão.

### 3. Ollama (opcional, sem chave)

1. Instale o [Ollama](https://ollama.com)
2. Baixe um modelo: `ollama pull llama3`
3. Confirme que está rodando em `http://localhost:11434`

## Uso

### Gerar variações

1. Clique no ícone da extensão na barra de ferramentas
2. Na aba **Config**, digite sua mensagem base:

   ```
   Olá, vi seu perfil e adorei seu estilo. Vamos marcar um café?
   ```

3. Ajuste o número de variações (2–10) e a criatividade (0 = conservador, 2 = criativo)
4. Clique em **Gerar variações com IA**
5. As variações aparecerão na aba **Mensagens**

### Editar mensagens

- Na aba **Mensagens**, edite qualquer variação diretamente no campo de texto
- Clique em **×** para remover uma mensagem
- Clique em **+ Adicionar** para incluir uma nova manualmente
- Clique em **Salvar lista** para persistir as alterações

### Enviar no Instagram

1. Abra o [Instagram](https://instagram.com) e vá até uma conversa (Direct)
2. Pressione **`Ctrl+I`**
3. A primeira mensagem da lista é copiada para a área de transferência
4. Cole com `Ctrl+V` e envie
5. Pressione `Ctrl+I` novamente → próxima mensagem
6. O ciclo recomeça automaticamente ao final da lista

Um toast aparece no canto inferior da tela confirmando qual mensagem foi copiada:

> InstaMSG: Mensagem 3 de 5 copiada

### Atalhos

| Atalho | Onde | Ação |
|---|---|---|
| `Ctrl+I` | Instagram Web | Copia próxima mensagem e avança o ciclo |

> O atalho **não** é ativado quando o cursor está em um campo de texto (input, textarea). Isso evita conflitos com a digitação normal.

## Estrutura do projeto

```
InstaMSG/
├── manifest.json       # Manifest V3 (Chrome + Firefox)
├── popup.html          # Interface do popup (3 abas)
├── popup.css           # Estilos com dark mode
├── popup.js            # Lógica do popup + chamadas às APIs de IA
├── content.js          # Script injetado no Instagram (Ctrl+I + toast)
├── toast.css           # Estilo do toast na página do Instagram
├── background.js       # Service worker (inicialização)
└── icons/              # Ícones 16x16, 48x48, 128x128
```

## Permissões

| Permissão | Motivo |
|---|---|
| `storage` | Salvar mensagens e configurações localmente |
| `clipboardWrite` | Copiar mensagens para a área de transferência |
| `scripting` | Comunicação entre popup e página do Instagram |
| `activeTab` | Acessar a aba ativa do Instagram |

## Solução de problemas

**"Erro HTTP 401" ao gerar variações**
- Chave de API inválida ou não configurada. Verifique na aba Config.

**"Erro HTTP 403" ou "Insufficient balance"**
- DeepSeek: créditos insuficientes. Recarregue em platform.deepseek.com.
- OpenAI: saldo zerado ou limite excedido.

**"Erro — Ollama está rodando?"**
- Ollama não está em execução. Rode `ollama serve` no terminal.

**Ctrl+I não funciona no Instagram**
- Verifique se a extensão está carregada e ativa.
- Recarregue a página do Instagram após instalar a extensão.
- Confirme que há mensagens salvas na lista.

**Lista de mensagens vazia após fechar o navegador**
- Clique em **Salvar lista** após editar as mensagens.
- Não limpe os dados de extensão nas configurações do navegador.
