import type { en } from "./en"

// Textos do painel em português do Brasil. Toda chave de en.ts precisa existir aqui.
export const pt: Record<keyof typeof en, string> = {
  "account.changePassword": "Trocar senha",
  "account.language": "Idioma",
  "account.signOut": "Sair",
  "account.theme": "Tema",

  "api.baseUrl": "URL base",
  "api.editHint":
    "Deixe a chave em branco para manter a atual. Salvar baixa a especificação de novo.",
  "api.header": "Cabeçalho da chave",
  "api.key": "Chave da API",
  "api.prefix": "Prefixo",
  "api.prefixHint":
    'Vai antes da chave: "Bearer " para Authorization, vazio quando o cabeçalho leva só a chave.',
  "api.spec": "Especificação OpenAPI (URL)",
  "api.specHint":
    "Cada operação vira uma ferramenta MCP que pode ser liberada por escopo. Sem especificação, a API só passa pela rota /api/proxy, inteira.",

  "common.cancel": "Cancelar",
  "common.copied": "Copiado",
  "common.copy": "Copiar",
  "common.create": "Criar",
  "common.delete": "Excluir",
  "common.done": "Concluir",
  "common.email": "E-mail",
  "common.keepCurrent": "manter o valor atual",
  "common.loading": "Carregando…",
  "common.more": "Mais ações",
  "common.name": "Nome",
  "common.password": "Senha",
  "common.rename": "Renomear",
  "common.save": "Salvar",
  "common.working": "Aguarde…",

  "connections.configure": "Configurar",
  "connections.connect": "Conectar",
  "connections.connected": "{name} conectado",
  "connections.deleteDescription":
    "Os consumidores perdem as ferramentas dela na hora. Não dá para desfazer.",
  "connections.deleteInScopes":
    'Ela sai destes escopos: {scopes}. Os tokens deles perdem as ferramentas dela até você incluí-la de novo. Para renovar a autorização, use "Reconectar".',
  "connections.deleteTitle": "Excluir {name}?",
  "connections.description":
    "Servidores MCP e APIs que o keyhall acessa em nome dos consumidores. As credenciais ficam cifradas aqui.",
  "connections.emptyDescription":
    "Adicione um servidor MCP remoto, uma API HTTP com especificação OpenAPI ou um comando MCP local.",
  "connections.emptyTitle": "Nenhuma conexão ainda",
  "connections.move": "Mover",
  "connections.moved": "{name} movida para {project}",
  "connections.moveDescription":
    "A conexão sai dos escopos do projeto atual. Escopos da organização continuam com ela.",
  "connections.moveTarget": "Projeto de destino",
  "connections.moveTitle": "Mover {name}",
  "connections.new": "Nova conexão",
  "connections.newIn": "Nova conexão em {project}",
  "connections.reconnect": "Reconectar",
  "connections.rename": "Renomear conexão",
  "connections.restart": "Reiniciar",
  "connections.slugHint":
    "Prefixo das ferramentas: {slug}__nome_da_ferramenta.",
  "connections.title": "Conexões",
  "connections.tools": "Ferramentas",
  "connections.type": "Tipo de conexão",
  "connections.updated": "{name} atualizada",
  "connections.url": "URL do servidor",

  "devices.description":
    "Aponte a câmera do celular para o código para entrar nele. Cada aparelho ganha uma sessão própria.",
  "devices.expired": "Código expirado. Toque para gerar outro",
  "devices.expiresIn": "Vale para um uso, por mais {n} segundos",
  "devices.expiresIn_one": "Vale para um uso, por mais 1 segundo",
  "devices.failed": "Não deu certo. Tente de novo.",
  "devices.linkFailed":
    "Este código de entrada é inválido ou expirou. Gere outro.",
  "devices.linked": "Novo aparelho conectado",
  "devices.localhost":
    "Este painel está aberto como localhost, que o celular não alcança. Abra-o por um endereço que o celular alcance e escaneie de novo.",
  "devices.menu": "Entrar no celular",
  "devices.oneUse": "Cada código funciona uma vez e expira em um minuto.",
  "devices.signOut": "Desconectar este aparelho",
  "devices.signedIn": "Aparelhos conectados",
  "devices.since": "Desde {date}",
  "devices.thisDevice": "Este aparelho",
  "devices.title": "Entrar no celular",

  "kind.api": "API HTTP",
  "kind.apiDescription":
    "API HTTP com chave fixa. A chave fica cifrada no keyhall e nunca chega aos consumidores.",
  "kind.mcp": "MCP remoto",
  "kind.mcpDescription":
    "Servidor MCP remoto (Streamable HTTP), autorizado por OAuth logo depois de criado.",
  "kind.stdio": "Local",
  "kind.stdioDescription":
    "Servidor MCP local (npx, node) que o keyhall roda e repassa. Use só pacotes em que você confia: o processo roda dentro do servidor do keyhall.",

  "login.description": "Entre com a sua conta de administrador.",
  "login.failed": "Não foi possível entrar",
  "login.pending": "Entrando…",
  "login.submit": "Entrar",
  "login.title": "Bem-vindo de volta",

  "nav.connections": "Conexões",
  "nav.manage": "Gerenciar",
  "nav.menu": "Abrir menu",
  "nav.scopes": "Escopos",
  "nav.tokens": "Tokens",

  "oauth.expired": "Autorização inválida ou expirada; tente de novo",
  "oauth.failed": "Falha ao autorizar {name}",
  "oauth.ok": "{name} conectado",

  "org.delete": "Excluir organização",
  "org.deleteDescription":
    "Só dá para excluir organizações vazias: remova os projetos e escopos dela antes.",
  "org.deleteTitle": "Excluir {name}?",
  "org.label": "Organização",
  "org.new": "Nova organização",
  "org.newDescription":
    "Organizações separam por completo projetos, conexões, escopos e tokens.",
  "org.plural": "Organizações",
  "org.rename": "Renomear organização",
  "org.slugHint": "Usado em URLs e identificadores; não muda depois.",
  "org.switch": "Trocar de organização",

  "password.changed": "Senha trocada. As outras sessões foram encerradas.",
  "password.confirm": "Confirme a nova senha",
  "password.current": "Senha atual",
  "password.description":
    "Pelo menos 8 caracteres. Outros navegadores conectados a esta conta serão desconectados.",
  "password.failed": "Não foi possível trocar a senha",
  "password.mismatch": "As novas senhas não conferem",
  "password.new": "Nova senha",
  "password.submit": "Trocar senha",

  "project.all": "Todos os projetos",
  "project.deleteDescription":
    "Só dá para excluir projetos vazios: mova ou exclua as conexões e os escopos dele antes.",
  "project.deleteTitle": "Excluir {name}?",
  "project.label": "Projeto",
  "project.new": "Novo projeto",
  "project.newDescription":
    "Conexões, escopos e tokens ficam separados por projeto.",
  "project.newIn": "Novo projeto em {org}",
  "project.plural": "Projetos",
  "project.rename": "Renomear projeto",
  "project.slugHint":
    "Aparece no nome das ferramentas em tokens da organização: {slug}__stripe__…",

  "rename.description":
    "Só o nome exibido muda; o identificador fica, então nomes de ferramentas e tokens continuam valendo.",

  "scopes.allTools": "Todas as ferramentas",
  "scopes.allToolsHint": "Inclusive as que a conexão ganhar depois",
  "scopes.chipAll": "todas",
  "scopes.chipCount": "{n} ferramentas",
  "scopes.chipCount_one": "1 ferramenta",
  "scopes.clear": "Limpar",
  "scopes.connections": "Conexões",
  "scopes.createConnectionFirst": "Crie uma conexão primeiro.",
  "scopes.deleteDescription":
    "Os tokens deste escopo param de funcionar na hora.",
  "scopes.deleteTitle": "Excluir {name}?",
  "scopes.descriptionOrg":
    "Escopos da organização podem juntar conexões de projetos diferentes; o projeto entra no nome das ferramentas.",
  "scopes.descriptionProject":
    "Um escopo é um conjunto escolhido de conexões e ferramentas de {project}. Cada token só enxerga o seu escopo.",
  "scopes.edit": "Editar ferramentas",
  "scopes.editorDescription":
    "Os consumidores deste escopo só enxergam as conexões e ferramentas marcadas.",
  "scopes.emptyDescription":
    "Crie um escopo para dar a um consumidor só as ferramentas de que ele precisa.",
  "scopes.emptyTitle": "Nenhum escopo ainda",
  "scopes.include": "Incluir conexão",
  "scopes.levelOrg": "Organização inteira",
  "scopes.levelProject": "Projeto {project}",
  "scopes.new": "Novo escopo",
  "scopes.noConnections": "Sem conexões",
  "scopes.noneSelected":
    "Nenhuma marcada: o escopo não verá ferramentas desta conexão.",
  "scopes.notIncluded": "Fora do escopo",
  "scopes.notIncludedHint": "{name} ainda não faz parte deste escopo.",
  "scopes.pickConnection":
    "Escolha uma conexão à esquerda para marcar as ferramentas dela.",
  "scopes.rename": "Renomear escopo",
  "scopes.selectAll": "Marcar todas",
  "scopes.selectedOf": "{n} de {total} marcadas",
  "scopes.slugHintOrg": "Escopo da organização {org}.",
  "scopes.slugHintProject": "Escopo do projeto {project}.",
  "scopes.summary": "{n} conexões neste escopo",
  "scopes.summary_one": "1 conexão neste escopo",
  "scopes.title": "Escopos",

  "setup.code": "Código de configuração",
  "setup.codeHint":
    "Aparece no log do servidor ao subir (docker logs keyhall).",
  "setup.description":
    "Crie a conta de administrador. Ela é a primeira e única que o cadastro aceita.",
  "setup.name": "Seu nome",
  "setup.signInFailed": "Conta criada, mas o login falhou",
  "setup.submit": "Criar conta",
  "setup.title": "Bem-vindo ao keyhall",

  "slug.label": "Identificador",
  "slug.placeholder": "gerado a partir do nome",
  "slug.taken": "Este identificador já está em uso.",

  "status.connected": "Conectado",
  "status.error": "Erro",
  "status.pending": "Pendente",

  "stdio.config": "Configuração (JSON)",
  "stdio.editHint":
    "Variáveis em branco mantêm o valor atual; tirar uma do JSON remove ela. Salvar reinicia o processo.",
  "stdio.envHint":
    "As variáveis ficam cifradas no keyhall e só o processo do servidor as recebe.",
  "stdio.hint":
    "Cole o trecho mcpServers que a documentação do servidor mostra para Claude Code, Claude Desktop ou Cursor.",
  "stdio.runs": "O keyhall roda: {command}",
  "stdio.secretInArgs":
    'Um argumento parece conter uma chave. Argumentos ficam sem cifra e aparecem no painel; passe a chave por uma variável em "env".',

  "theme.dark": "Escuro",
  "theme.light": "Claro",
  "theme.system": "Sistema",

  "tokens.access": "Acesso",
  "tokens.broadWarning":
    "Acesso total, inclusive a conexões e ferramentas criadas depois. Prefira uma validade.",
  "tokens.copyNow": "Copie agora: o keyhall não mostra este token de novo.",
  "tokens.create": "Criar token",
  "tokens.created": "Token criado",
  "tokens.createScopeFirst": "Crie um escopo primeiro.",
  "tokens.days": "{n} dias",
  "tokens.description":
    "Um token por consumidor (Claude Code, um bot…). Ele vale para a organização, um projeto ou um escopo.",
  "tokens.emptyDescription":
    "Crie um token e cole no seu cliente MCP junto com o endpoint.",
  "tokens.emptyTitle": "Nenhum token ainda",
  "tokens.endpoint": "Endpoint MCP",
  "tokens.endpointHint":
    "Todos os consumidores usam esta URL, cada um com o seu token.",
  "tokens.expires": "Expira",
  "tokens.expiry": "Validade",
  "tokens.lastUsed": "Último uso",
  "tokens.mode": "Ferramentas",
  "tokens.modeChanged":
    "Modo alterado. Os clientes veem a mudança na próxima vez que listarem as ferramentas.",
  "tokens.modeCode": "Code Mode",
  "tokens.modeCodeHint":
    "Duas ferramentas, search e execute: o agente busca o que precisa e chama por código. O contexto fica pequeno, não importa quantas conexões o token alcance.",
  "tokens.modeTools": "Todas as ferramentas",
  "tokens.modeToolsHint":
    "Cada ferramenta aparece para o cliente. Simples, mas cada conexão pesa no contexto.",
  "tokens.toCode": "Mudar para Code Mode",
  "tokens.toTools": "Listar todas as ferramentas",
  "tokens.levelOrg": "Organização",
  "tokens.levelOrgHint": "Tudo de {name}.",
  "tokens.levelProject": "Projeto",
  "tokens.levelProjectHint": "Tudo de um projeto.",
  "tokens.levelScope": "Escopo",
  "tokens.levelScopeHint": "Só as conexões e ferramentas de um escopo.",
  "tokens.never": "Nunca",
  "tokens.new": "Novo token",
  "tokens.newDescription":
    "Um token por consumidor, para poder revogar cada um separadamente.",
  "tokens.revoke": "Revogar",
  "tokens.revokeDescription":
    "Os consumidores que usam este token perdem o acesso na hora.",
  "tokens.revokeTitle": "Revogar {name}?",
  "tokens.scope": "Escopo",
  "tokens.targetOrg": "Organização {name}",
  "tokens.targetOtherOrg": "Outra organização",
  "tokens.targetProject": "Projeto {name}",
  "tokens.targetRemoved": "Escopo removido",
  "tokens.targetScope": "Escopo {name}",
  "tokens.title": "Tokens",
  "tokens.useIt": "Como usar",
  "tokens.year": "1 ano",

  "tools.count": "{n} ferramentas",
  "tools.count_one": "1 ferramenta",
  "tools.none": "Nenhuma ferramenta encontrada.",
  "tools.of": "Ferramentas de {name}",
  "tools.search": "Buscar ferramentas",
  "nav.secrets": "Secrets",
  "scopes.secretAgents": "Legível por agentes (MCP) e REST",
  "scopes.secretCount": "{n} secrets",
  "scopes.secretCount_one": "1 secret",
  "scopes.secretRest": "Legível por REST",
  "scopes.secrets": "Secrets",
  "vault.agents": "Legível por agentes (MCP)",
  "vault.agentsHint":
    "Acrescenta keyhall__get_secret às ferramentas MCP dos tokens que alcançam este secret",
  "vault.agentsPill": "Agentes",
  "vault.agentsWarning":
    "O valor entra no contexto do modelo, passa pelo provedor dele e pode aparecer em logs ou respostas. Prefira referenciar o secret numa conexão, assim ele nunca sai do keyhall.",
  "vault.clearRef": "Digitar um valor",
  "vault.current": "atual",
  "vault.deleteDescription":
    'As versões e o histórico de leituras também são apagados. Tokens que o liam passam a receber "não encontrado".',
  "vault.deleteTitle": "Excluir {name}?",
  "vault.description":
    "Chaves, senhas e certificados guardados cifrados no keyhall. Conexões referenciam, scripts leem por REST e agentes só quando você libera.",
  "vault.descriptionLabel": "Descrição",
  "vault.descriptionPlaceholder": "Para que serve, de quem é",
  "vault.detailsDescription":
    "O valor não muda aqui; para isso, use Novo valor.",
  "vault.editDetails": "Editar detalhes",
  "vault.emptyDescription":
    "Guarde uma chave uma vez e use em conexões, scripts e agentes.",
  "vault.emptyTitle": "Nenhum secret ainda",
  "vault.hide": "Ocultar",
  "vault.history": "Histórico",
  "vault.historyDescription":
    "Todas as versões e todas as leituras, pelo painel, REST ou MCP.",
  "vault.keyHint": "digite um valor ou escolha um secret",
  "vault.nameHint": "Use como {{secret:{name}}}; no formato env vira {name}=…",
  "vault.nameTaken": "Já existe um secret com este nome neste projeto.",
  "vault.new": "Novo secret",
  "vault.newDescription":
    "O valor é cifrado com uma chave própria, protegida pela chave mestra do servidor.",
  "vault.newValue": "Novo valor",
  "vault.noDescription": "Sem descrição",
  "vault.noneYet": "Nenhum secret nesta organização ainda",
  "vault.noReads": "Ninguém leu este secret ainda.",
  "vault.otherProjects": "Outros projetos",
  "vault.reads": "Leituras",
  "vault.reveal": "Revelar",
  "vault.rotate": "Novo valor",
  "vault.rotated": "{name} atualizado",
  "vault.rotateDescription":
    "Salvar cria a versão {version}. As conexões que o referenciam passam a usar o valor novo na hora; as versões anteriores ficam no histórico.",
  "vault.save": "Salvar secret",
  "vault.show": "Mostrar",
  "vault.title": "Secrets",
  "vault.usageDescription":
    "Um token lê os secrets da organização, do projeto ou os escolhidos no escopo dele.",
  "vault.usageEnv": "Como env",
  "vault.usageMcp":
    'Os agentes veem duas ferramentas, keyhall__list_secrets e keyhall__get_secret, só para secrets marcados como "Legível por agentes" e dentro do alcance do token. Toda leitura fica registrada.',
  "vault.usageOne": "Um secret",
  "vault.usageRefs":
    "Nas conexões, use o botão do cofre nos campos de chave ou digite {{secret:NOME}} ({{secret:projeto/NOME}} para outro projeto).",
  "vault.usageTitle": "Como ler os secrets",
  "vault.usedBy": "usado por {n} conexões",
  "vault.usedBy_one": "usado por 1 conexão",
  "vault.useSecret": "Usar um secret",
  "vault.value": "Valor",
  "vault.versions": "Versões",
  "vault.viaPanel": "Painel",
  "connections.connecting": "Conectando {name}…",
  "connections.connectingShort": "Conectando…",
  "connections.redirecting": "Abrindo a página de autorização de {name}…",
  "connections.restarting": "Reiniciando {name}…",
  "connections.restartingShort": "Reiniciando…",
  "tools.loadingFrom": "Carregando as ferramentas de {name}…",
  "tools.loadingHint":
    "Pedindo as ferramentas ao servidor. Servidores grandes podem levar alguns segundos.",
  "tools.matching": "{n} de {total} ferramentas",
  "tools.noDescription": "Esta ferramenta não tem descrição.",
  "tools.noParams": "Sem parâmetros.",
  "tools.params": "Parâmetros",
  "tools.required": "obrigatório",
}
