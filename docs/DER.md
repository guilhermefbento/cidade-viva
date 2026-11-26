# Modelo de dados do Cidade Viva

O esquema para novas instalações implementa dez entidades de negócio e uma tabela de apoio à autenticação. Os atributos e as restrições estão em [db/schema.sql](../db/schema.sql) e [db/upgrade.sql](../db/upgrade.sql).

Instalações anteriores mantêm a tabela `locais_verificados` até a migração administrativa. A migração copia e verifica os códigos antes de remover a tabela. Com o servidor parado, execute `node db/migrate-locations.mjs` a partir da raiz do projeto. Forneça as credenciais administrativas temporárias pelas variáveis `DB_MIGRATION_USER` e `DB_MIGRATION_PASSWORD`.

```mermaid
erDiagram
    USUARIOS ||--o{ OCORRENCIAS : registra
    CATEGORIAS ||--o{ OCORRENCIAS : classifica
    LOCAIS ||--o| OCORRENCIAS : localiza
    OCORRENCIAS ||--o| FOTOS : tem
    OCORRENCIAS ||--o{ CONFIRMACOES : recebe
    USUARIOS ||--o{ CONFIRMACOES : confirma
    OCORRENCIAS ||--|{ HISTORICO_STATUS : registra
    USUARIOS ||--o{ HISTORICO_STATUS : altera
    USUARIOS ||--o{ SESSOES : abre
    OCORRENCIAS ||--o{ ACOMPANHAMENTOS : recebe
    USUARIOS ||--o{ ACOMPANHAMENTOS : segue
    OCORRENCIAS ||--o{ COMENTARIOS : recebe
    USUARIOS ||--o{ COMENTARIOS : escreve
    OCORRENCIAS ||--o{ NOTIFICACOES : gera
    USUARIOS ||--o{ NOTIFICACOES : recebe
    USUARIOS {
      int id PK
      varchar email UK
      varchar papel
    }
    CATEGORIAS {
      int id PK
      varchar nome UK
      int peso
    }
    LOCAIS {
      int id PK
      varchar endereco
      double latitude
      double longitude
      int municipio_codigo
    }
    OCORRENCIAS {
      int id PK
      int autor_id FK
      int categoria_id FK
      int local_id FK,UK
      varchar titulo
      varchar descricao
      varchar status
    }
    FOTOS {
      int id PK
      int ocorrencia_id FK,UK
      varchar tipo
      mediumblob conteudo
    }
    CONFIRMACOES {
      int usuario_id PK,FK
      int ocorrencia_id PK,FK
      timestamp criado_em
    }
    HISTORICO_STATUS {
      int id PK
      int ocorrencia_id FK
      int usuario_id FK
      varchar status
      varchar nota
    }
    ACOMPANHAMENTOS {
      int usuario_id PK,FK
      int ocorrencia_id PK,FK
      timestamp criado_em
    }
    COMENTARIOS {
      int id PK
      int usuario_id FK
      int ocorrencia_id FK
      varchar texto
      timestamp criado_em
    }
    NOTIFICACOES {
      int id PK
      int usuario_id FK
      int ocorrencia_id FK
      varchar mensagem
      boolean lida
      timestamp criado_em
    }
    SESSOES {
      char token_hash PK
      int usuario_id FK
      timestamp expira_em
    }
```

- Todo relato tem um autor, uma categoria, um local e um primeiro registro de histórico. Cadastro do relato e primeiro histórico acontecem na mesma transação.
- O local exige endereço, coordenadas completas ou ambos. Uma ocorrência pode incluir uma foto.
- A chave composta de confirmações limita cada cidadão a uma confirmação por ocorrência. A API bloqueia a confirmação pelo autor ou em relato resolvido.
- A prioridade é calculada na visão SQL: **2 × peso da categoria + 2 × confirmações + até 6 pontos pela idade**, somando um ponto por dia completo. A ordenação por prioridade exibe ocorrências resolvidas depois das demais.
- As sessões expiram em sete dias. O banco armazena o hash da senha com scrypt e o hash do token de sessão.


- O local é verificado pelo polígono do IBGE. O código 3550308 é armazenado em `locais.municipio_codigo` quando o ponto está dentro de São Paulo. O código zero identifica locais antigos sem ponto válido no município.
- Acompanhamentos usam a chave composta de usuário e ocorrência. Mudanças de status geram um aviso ao autor e aos seguidores, com a mesma transação do histórico.
- Comentários guardam autor e ocorrência. O autor do comentário ou a administração pode excluí-lo.
