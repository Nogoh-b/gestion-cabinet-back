-- Compte MariaDB/MySQL en LECTURE SEULE pour l'assistant IA.
--
-- Les requêtes SQL générées par l'IA passent par ce compte quand AI_DB_USER
-- et AI_DB_PASSWORD sont renseignés dans l'environnement du backend. Même si
-- une requête échappait aux contrôles applicatifs, la base refuserait toute
-- écriture.
--
-- À exécuter une fois, avec un compte administrateur de la base, après avoir
-- remplacé :
--   kabysoft            → le nom de la base (DB_NAME)
--   CHANGER_CE_MOT_DE_PASSE → un mot de passe long et aléatoire
--   'localhost'         → l'hôte d'où se connecte le backend si la base est distante
--
-- Puis dans l'environnement du backend :
--   AI_DB_USER=kabysoft_ai_ro
--   AI_DB_PASSWORD=<le mot de passe choisi>

CREATE USER IF NOT EXISTS 'kabysoft_ai_ro'@'localhost'
  IDENTIFIED BY 'CHANGER_CE_MOT_DE_PASSE';

GRANT SELECT ON `kabysoft`.* TO 'kabysoft_ai_ro'@'localhost';

FLUSH PRIVILEGES;
