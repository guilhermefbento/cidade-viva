# Cidade Viva

Projeto acadêmico de Computação Aplicada para registrar e acompanhar problemas urbanos no município de São Paulo. É possível marcar um problema no mapa, anexar uma foto, confirmar relatos de outros moradores e acompanhar as mudanças de status.

## Como rodar no Windows

Você precisa de **Git**, **Node.js 22 ou superior** (com npm) e **MySQL Server 8.4**. Deixe o serviço do MySQL em execução antes de iniciar o site. Os passos abaixo usam o PowerShell, salvo o bloco SQL.

### 1. Baixe o projeto

```powershell
git clone https://github.com/guilhermefbento/cidade-viva.git
cd cidade-viva
npm.cmd ci
```

Se já baixou o ZIP pelo GitHub, extraia-o, abra o PowerShell na pasta que contém `package.json` e execute apenas `npm.cmd ci`.

### 2. Prepare o banco

Abra o MySQL Workbench ou o cliente `mysql` e conecte-se como administrador do MySQL (geralmente `root`). Execute o SQL abaixo, trocando `SUBSTITUA_PELA_SUA_SENHA` pela senha que o site vai usar para se conectar.

```sql
CREATE DATABASE cidade_viva CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'cidade_app'@'127.0.0.1' IDENTIFIED BY 'SUBSTITUA_PELA_SUA_SENHA';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, REFERENCES, CREATE VIEW, SHOW VIEW, DROP
  ON cidade_viva.* TO 'cidade_app'@'127.0.0.1';
```

### 3. Configure a senha e inicie

Na pasta do projeto, rode:

```powershell
Copy-Item .env.example .env
notepad .env
```

Na linha `DB_PASSWORD=`, coloque a senha escolhida no passo anterior. Use aspas duplas se ela contiver `#`, por exemplo `DB_PASSWORD="senha#exemplo"`. A porta padrão do MySQL é `3306`. Se sua instalação usa outra, ajuste `DB_PORT` no mesmo arquivo.

Salve o arquivo e execute:

```powershell
npm.cmd start
```

Mantenha o terminal aberto e acesse **[http://localhost:3333](http://localhost:3333)**. Na primeira execução, o servidor cria as tabelas e insere as categorias. A lista de ocorrências começa vazia.

No Windows, depois de configurar o banco, o `.env` e as dependências, você também pode abrir o site com **Iniciar Cidade Viva.cmd**.

### Se o site não abrir

| Mensagem | O que conferir |
| --- | --- |
| `Configure DB_USER e DB_PASSWORD` | Veja se o arquivo se chama `.env` (sem `.txt`) e se `DB_PASSWORD` foi preenchido. |
| `ECONNREFUSED` | Confira se o MySQL está em execução e se `DB_HOST` e `DB_PORT` correspondem à instalação. |
| `Access denied` | Confira se a senha do `.env` é a mesma de `cidade_app` e se o comando `GRANT` foi executado. |
| `EADDRINUSE` | A porta do site já está em uso. Altere `PORT` no `.env` e use a nova porta no navegador. |

Com o servidor rodando, a rota [http://localhost:3333/api/saude](http://localhost:3333/api/saude) confirma a conexão com o MySQL.

## O que testar

1. Na tela inicial, role para controlar o vídeo da Ponte Estaiada ou clique em **Explorar mapa**.
2. Crie uma conta e clique em **Registrar**. Busque um endereço ou marque um ponto no município de São Paulo, descreva o problema e, se quiser, anexe uma foto.
3. Encontre o relato em **Ocorrências** ou pelo protocolo em **Acompanhar**. Caso queira simular a participação de outro morador, entre com uma segunda conta para confirmar ou comentar.
4. Explore os relatos **Por perto** ou consulte **Indicadores** para ver os dados agregados e exportá-los em CSV.

A busca automática de endereços usa o Photon e precisa de internet. Se ela estiver indisponível, marque o ponto no mapa e informe um endereço ou referência. O servidor valida o ponto pelo limite municipal do IBGE. O mapa mantém dados locais para áreas de São Paulo e pode carregar outras áreas pelo OpenFreeMap. Com movimento reduzido, a abertura mostra o primeiro quadro do vídeo.

### Acesso de administrador

Cadastre a conta pelo site e, em outro terminal aberto na pasta do projeto, execute o comando com o e-mail da conta:

```powershell
npm.cmd run admin -- conta@exemplo.com
```

Saia da conta e entre de novo. Em **Gestão de ocorrências**, abra um relato e atualize seu status. A mudança entra no histórico e gera um aviso para o autor e quem acompanha o relato.

## Estrutura do projeto

- [`public/`](public/) reúne as páginas, os mapas e os arquivos de mídia.
- [`server/`](server/) contém a API Express, a autenticação e as regras do sistema.
- [`db/schema.sql`](db/schema.sql) e [`db/upgrade.sql`](db/upgrade.sql) definem as tabelas, as categorias e a visão que calcula a prioridade dos relatos.
- O [modelo de dados](docs/DER.md) documenta as 11 tabelas da instalação nova, incluindo sessões, e a visão `painel_ocorrencias`.

Dados do limite municipal do [IBGE](https://servicodados.ibge.gov.br/api/v3/malhas/municipios/3550308?formato=application/vnd.geo%2Bjson&qualidade=maxima). Cartografia do OpenStreetMap e OpenFreeMap.
