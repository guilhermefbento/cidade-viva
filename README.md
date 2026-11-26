# Cidade Viva

Sistema colaborativo para registrar, visualizar e acompanhar problemas urbanos no município de São Paulo. Projeto acadêmico de Computação Aplicada.

## Usar neste computador

Abra **Iniciar Cidade Viva.cmd** ou acesse **http://localhost:3333** se o projeto já estiver rodando. O inicializador usa o MySQL local configurado fora da pasta sincronizada, com o caminho indicado em `cidade-viva.local`.

A abertura usa um vídeo da Ponte Estaiada fornecido para o projeto. A rolagem controla o quadro do vídeo nos dois sentidos. Selecione **Explorar mapa** para chegar ao mapa diretamente. O mapa em perspectiva usa MapLibre e os dados de edifícios do OpenFreeMap. Use os botões do mapa para ver o município inteiro, voltar à ponte ou alternar para a visão 2D.

Crie uma conta e publique um relato selecionando o endereço da busca ou marcando um ponto dentro dos limites municipais. A busca do Photon usa dados do OpenStreetMap e precisa de internet. Ao marcar no mapa, o endereço sugerido é aproximado e o ponto selecionado permanece no lugar. Sem serviço de busca, é possível publicar pelas coordenadas e informar uma referência manualmente. O servidor verifica o ponto pela malha do IBGE (código 3550308), inclusive quando as coordenadas são digitadas manualmente. Ocorrências anteriores sem um ponto verificável na capital ficam guardadas no banco e saem da listagem pública. O aplicativo mantém o contorno municipal local. O entorno da Ponte Estaiada e o centro de São Paulo usam trechos cartográficos armazenados localmente. As demais áreas podem carregar dados do OpenFreeMap pela internet. Em modo simplificado, o mapa usa as vias principais e o limite municipal armazenados no projeto. Com a preferência por movimento reduzido, a abertura usa o primeiro quadro do vídeo. Em dispositivos sem WebGL, o mapa volta à visualização 2D.

Confirme ou comente relatos, acompanhe ocorrências e receba avisos dentro do site quando o status mudar. O painel tem áreas de relatos publicados, acompanhamentos, indicadores com exportação CSV e um quadro para a administração. 

Para promover uma conta já cadastrada a administrador, execute no terminal da pasta do projeto:

```powershell
npm.cmd run admin -- conta@exemplo.com
```

Na área **Gestão de ocorrências**, abra qualquer cartão para atualizar o status com uma observação. As mudanças aparecem no histórico público e geram avisos para o autor e os seguidores.

## Configurar em outro computador

Instale Node.js 22 ou mais recente e MySQL 8.4. Como usuário administrador do MySQL, crie a base e o usuário do aplicativo com uma senha própria:

```sql
CREATE DATABASE cidade_viva CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'cidade_app'@'localhost' IDENTIFIED BY 'SUBSTITUA_POR_UMA_SENHA_FORTE';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, REFERENCES, CREATE VIEW, SHOW VIEW, DROP
ON cidade_viva.* TO 'cidade_app'@'localhost';
```

No Windows, use os comandos abaixo. Preencha a senha e ajuste a porta do MySQL em `.env` antes de iniciar.

```powershell
Copy-Item .env.example .env
npm.cmd ci
npm.cmd start
```

O aplicativo cria as tabelas e carrega as categorias no primeiro início. A configuração padrão escuta apenas no próprio computador. Para compartilhar com a equipe, cada máquina pode configurar seu banco, ou a equipe pode hospedar o aplicativo e o banco em um ambiente compartilhado.

## Estrutura

- `public/` contém a experiência em HTML, CSS e JavaScript com MapLibre e Leaflet.
- `server/` contém a API Express, sessões, validação e regras do sistema.
- `db/schema.sql` contém as tabelas originais, categorias e cálculo de prioridade. O arquivo `db/upgrade.sql` adiciona as tabelas de verificação de território, comentários, acompanhamentos e notificações.
- [Modelo entidade relacionamento](docs/DER.md) com onze entidades de negócio e a tabela de sessões.
- As pastas `frontend/` e `back-end/` do projeto original contêm os protótipos anteriores.



Malha municipal de São Paulo fornecida pelo [IBGE](https://servicodados.ibge.gov.br/api/v3/malhas/municipios/3550308?formato=application/vnd.geo%2Bjson&qualidade=maxima). Cartografia e edifícios do mapa por OpenStreetMap e OpenFreeMap.
