CREATE TABLE IF NOT EXISTS usuarios (
 id integer AUTO_INCREMENT PRIMARY KEY,
 nome varchar(100) NOT NULL,
 email varchar(254) UNIQUE NOT NULL CHECK (BINARY email = BINARY lower(email)),
 senha_hash text NOT NULL,
 papel varchar(12) NOT NULL DEFAULT 'cidadao' CHECK (papel IN ('cidadao','admin')),
 criado_em timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS categorias (
 id integer AUTO_INCREMENT PRIMARY KEY,
 nome varchar(100) UNIQUE NOT NULL,
 peso integer NOT NULL CHECK (peso BETWEEN 1 AND 5)
);
CREATE TABLE IF NOT EXISTS locais (
 id integer AUTO_INCREMENT PRIMARY KEY,
 endereco varchar(250),
 latitude double,
 longitude double,
 municipio_codigo integer,
 CHECK (endereco IS NOT NULL OR latitude IS NOT NULL),
 CHECK ((latitude IS NULL) = (longitude IS NULL)),
 CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
);
CREATE TABLE IF NOT EXISTS ocorrencias (
 id integer AUTO_INCREMENT PRIMARY KEY,
 autor_id integer NOT NULL, FOREIGN KEY (autor_id) REFERENCES usuarios(id),
 categoria_id integer NOT NULL, FOREIGN KEY (categoria_id) REFERENCES categorias(id),
 local_id integer UNIQUE NOT NULL, FOREIGN KEY (local_id) REFERENCES locais(id),
 titulo varchar(100) NOT NULL,
 descricao varchar(2000) NOT NULL,
 status varchar(12) NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','andamento','resolvida')),
 criado_em timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS fotos (
 id integer AUTO_INCREMENT PRIMARY KEY,
 ocorrencia_id integer UNIQUE NOT NULL, FOREIGN KEY (ocorrencia_id) REFERENCES ocorrencias(id) ON DELETE CASCADE,
 tipo varchar(20) NOT NULL CHECK (tipo IN ('image/png','image/jpeg','image/webp')),
 conteudo mediumblob NOT NULL CHECK (octet_length(conteudo) BETWEEN 1 AND 5242880)
);
CREATE TABLE IF NOT EXISTS confirmacoes (
 usuario_id integer NOT NULL,
 ocorrencia_id integer NOT NULL,
 criado_em timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (usuario_id, ocorrencia_id), FOREIGN KEY (usuario_id) REFERENCES usuarios(id), FOREIGN KEY (ocorrencia_id) REFERENCES ocorrencias(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS historico_status (
 id integer AUTO_INCREMENT PRIMARY KEY,
 ocorrencia_id integer NOT NULL, FOREIGN KEY (ocorrencia_id) REFERENCES ocorrencias(id) ON DELETE CASCADE,
 usuario_id integer NOT NULL, FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
 status varchar(12) NOT NULL CHECK (status IN ('aberta','andamento','resolvida')),
 nota varchar(500),
 criado_em timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessoes (
 token_hash char(64) PRIMARY KEY,
 usuario_id integer NOT NULL, FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
 expira_em timestamp NOT NULL
);
INSERT INTO categorias (nome, peso) VALUES
 ('Buraco na via',3), ('Lixo acumulado',2), ('Iluminação pública',3),
 ('Semáforo com defeito',5), ('Calçada danificada',2), ('Alagamento',5), ('Outro',1)
ON DUPLICATE KEY UPDATE peso = categorias.peso;
CREATE OR REPLACE VIEW painel_ocorrencias AS
SELECT o.*, c.nome AS categoria, c.peso, l.endereco, l.latitude, l.longitude, f.id AS foto_id,
 coalesce(v.total,0) AS confirmacoes,
 c.peso * 2 + coalesce(v.total,0) * 2 +
 least(6, greatest(0, timestampdiff(DAY, o.criado_em, now()))) AS prioridade
FROM ocorrencias o
JOIN categorias c ON c.id = o.categoria_id
JOIN locais l ON l.id = o.local_id
LEFT JOIN fotos f ON f.ocorrencia_id = o.id
LEFT JOIN (SELECT ocorrencia_id, count(*) AS total FROM confirmacoes GROUP BY ocorrencia_id) v ON v.ocorrencia_id = o.id;


