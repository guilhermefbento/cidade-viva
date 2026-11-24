CREATE TABLE IF NOT EXISTS locais_verificados (
 local_id integer PRIMARY KEY,
 municipio_codigo integer NOT NULL,
 FOREIGN KEY (local_id) REFERENCES locais(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS acompanhamentos (
 usuario_id integer NOT NULL,
 ocorrencia_id integer NOT NULL,
 criado_em timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (usuario_id, ocorrencia_id),
 FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
 FOREIGN KEY (ocorrencia_id) REFERENCES ocorrencias(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS comentarios (
 id integer AUTO_INCREMENT PRIMARY KEY,
 usuario_id integer NOT NULL,
 ocorrencia_id integer NOT NULL,
 texto varchar(1000) NOT NULL,
 criado_em timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
 FOREIGN KEY (ocorrencia_id) REFERENCES ocorrencias(id) ON DELETE CASCADE,
 INDEX comentario_ocorrencia (ocorrencia_id, id)
);
CREATE TABLE IF NOT EXISTS notificacoes (
 id integer AUTO_INCREMENT PRIMARY KEY,
 usuario_id integer NOT NULL,
 ocorrencia_id integer NOT NULL,
 mensagem varchar(250) NOT NULL,
 lida boolean NOT NULL DEFAULT false,
 criado_em timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
 FOREIGN KEY (ocorrencia_id) REFERENCES ocorrencias(id) ON DELETE CASCADE,
 INDEX notificacao_usuario (usuario_id, id)
);
