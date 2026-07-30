-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: kabysoft
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `activities_user`
--

DROP TABLE IF EXISTS `activities_user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `activities_user` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `type_activities_user` varchar(45) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `action` varchar(20) DEFAULT NULL,
  `resource` varchar(80) DEFAULT NULL,
  `resource_id` varchar(64) DEFAULT NULL,
  `method` varchar(10) DEFAULT NULL,
  `path` varchar(255) DEFAULT NULL,
  `status_code` int(11) DEFAULT NULL,
  `ip` varchar(64) DEFAULT NULL,
  `summary` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_1f922753e98c3c5cdb24765d1b` (`tenant_id`),
  KEY `IDX_activities_tenant_date` (`tenant_id`,`created_at`),
  KEY `FK_4d55ffda591371d19b946b6fca9` (`user_id`),
  CONSTRAINT `FK_4d55ffda591371d19b946b6fca9` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `ai_request_log`
--

DROP TABLE IF EXISTS `ai_request_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ai_request_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tenant_id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `total_ms` int(11) DEFAULT NULL,
  `first_token_ms` int(11) DEFAULT NULL,
  `llm_calls` int(11) NOT NULL DEFAULT 0,
  `estimated_prompt_tokens` int(11) NOT NULL DEFAULT 0,
  `output_chars` int(11) NOT NULL DEFAULT 0,
  `request_type` varchar(32) DEFAULT NULL,
  `intent` varchar(32) DEFAULT NULL,
  `model` varchar(128) DEFAULT NULL,
  `cache_hit` tinyint(4) NOT NULL DEFAULT 0,
  `status` varchar(32) NOT NULL DEFAULT 'started',
  PRIMARY KEY (`id`),
  KEY `IDX_ai_request_tenant_date` (`tenant_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `attachment`
--

DROP TABLE IF EXISTS `attachment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `attachment` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `fileName` varchar(255) NOT NULL,
  `filePath` varchar(255) NOT NULL,
  `fileSize` int(11) NOT NULL,
  `fileType` enum('image','document','video','audio','file') NOT NULL DEFAULT 'file',
  `mimeType` varchar(255) DEFAULT NULL,
  `cloudinaryPublicId` varchar(255) DEFAULT NULL,
  `fileUrl` varchar(255) DEFAULT NULL,
  `thumbnailPath` varchar(255) DEFAULT NULL,
  `thumbnailUrl` varchar(255) DEFAULT NULL,
  `isUploaded` tinyint(4) NOT NULL DEFAULT 0,
  `createdAt` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `messageId` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_c37237147a66e7edd1b569121b` (`tenant_id`),
  KEY `FK_5f4a6c0677b1f2b417e95c717f8` (`messageId`),
  CONSTRAINT `FK_5f4a6c0677b1f2b417e95c717f8` FOREIGN KEY (`messageId`) REFERENCES `message` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `audiences`
--

DROP TABLE IF EXISTS `audiences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `audiences` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `audience_date` date NOT NULL,
  `dossier_id` int(11) DEFAULT NULL,
  `audience_time` varchar(10) NOT NULL,
  `jurisdiction_id` int(11) NOT NULL DEFAULT 1,
  `room` varchar(50) DEFAULT NULL,
  `type` enum('0','1','2','3') NOT NULL DEFAULT '0',
  `status` enum('0','1','2','3') NOT NULL DEFAULT '0',
  `notes` text DEFAULT NULL,
  `step_id` int(11) DEFAULT NULL,
  `decision` text DEFAULT NULL,
  `postponed_to` timestamp NULL DEFAULT NULL,
  `reminder_sent` tinyint(4) NOT NULL DEFAULT 0,
  `reminder_sent_at` timestamp NULL DEFAULT NULL,
  `duration_minutes` int(11) DEFAULT NULL,
  `judge_name` varchar(255) DEFAULT NULL,
  `audience_type_id` int(11) DEFAULT 1,
  `outcome` varchar(100) DEFAULT NULL,
  `sub_stage_id` varchar(255) DEFAULT NULL,
  `sub_stage_visit_id` varchar(255) DEFAULT NULL,
  `stageVisit_id` varchar(255) DEFAULT NULL,
  `decision_text` text DEFAULT NULL,
  `decision_date` date DEFAULT NULL,
  `decision_outcome` varchar(50) DEFAULT NULL,
  `decision_notes` text DEFAULT NULL,
  `procedure_instance_id` varchar(255) DEFAULT NULL,
  `parent_audience_id` int(11) DEFAULT NULL,
  `report_content` text DEFAULT NULL,
  `report_date` timestamp NULL DEFAULT NULL,
  `report_author_id` varchar(64) DEFAULT NULL,
  `stage_id` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_9233f355517342258294c37aec` (`tenant_id`),
  KEY `FK_0e0fc0148e4ea44e412a5220b25` (`jurisdiction_id`),
  KEY `FK_6145a59a126ebf91adba3a45de1` (`audience_type_id`),
  KEY `FK_a9764ddf706056892113e812d34` (`step_id`),
  KEY `FK_a4857c68568371b92a5b03d5752` (`dossier_id`),
  KEY `FK_e0a300b589121381de7416866ec` (`sub_stage_visit_id`),
  KEY `FK_0c9d5b6d5518a603ec6ab1d2dba` (`stageVisit_id`),
  KEY `FK_eac7afefd69e6aba9c261464010` (`stage_id`),
  KEY `FK_8809f9e23063d6d0d1494a078ad` (`sub_stage_id`),
  KEY `FK_cb589344b903d3d7a7b19bbb974` (`procedure_instance_id`),
  KEY `FK_5eee8050a96fb731392161fccd5` (`parent_audience_id`),
  CONSTRAINT `FK_0c9d5b6d5518a603ec6ab1d2dba` FOREIGN KEY (`stageVisit_id`) REFERENCES `stage_visits` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_0e0fc0148e4ea44e412a5220b25` FOREIGN KEY (`jurisdiction_id`) REFERENCES `jurisdictions` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_5eee8050a96fb731392161fccd5` FOREIGN KEY (`parent_audience_id`) REFERENCES `audiences` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT `FK_6145a59a126ebf91adba3a45de1` FOREIGN KEY (`audience_type_id`) REFERENCES `audience_types` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_8809f9e23063d6d0d1494a078ad` FOREIGN KEY (`sub_stage_id`) REFERENCES `sub_stages` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_a4857c68568371b92a5b03d5752` FOREIGN KEY (`dossier_id`) REFERENCES `dossiers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_a9764ddf706056892113e812d34` FOREIGN KEY (`step_id`) REFERENCES `step` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_cb589344b903d3d7a7b19bbb974` FOREIGN KEY (`procedure_instance_id`) REFERENCES `procedure_instances` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_e0a300b589121381de7416866ec` FOREIGN KEY (`sub_stage_visit_id`) REFERENCES `sub_stage_visits` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_eac7afefd69e6aba9c261464010` FOREIGN KEY (`stage_id`) REFERENCES `stages` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `audience_types`
--

DROP TABLE IF EXISTS `audience_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `audience_types` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `category` enum('preliminary','hearing','judgment','conciliation','expertise','appeal','casation') NOT NULL DEFAULT 'hearing',
  `default_duration_minutes` int(11) NOT NULL DEFAULT 60,
  `is_public` tinyint(4) NOT NULL DEFAULT 1,
  `requires_lawyer` tinyint(4) NOT NULL DEFAULT 0,
  `allows_remote` tinyint(4) NOT NULL DEFAULT 0,
  `is_active` tinyint(4) NOT NULL DEFAULT 1,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata`)),
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_90e964302269b7a60234177811` (`tenant_id`,`code`),
  KEY `IDX_366752be856caba70ad64150cb` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `branch`
--

DROP TABLE IF EXISTS `branch`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `branch` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(10) NOT NULL,
  `name` varchar(100) NOT NULL,
  `location_city_id` int(11) DEFAULT NULL,
  `creation_date` timestamp NOT NULL DEFAULT current_timestamp(),
  `opening_hour` text NOT NULL,
  `closing_hour` text NOT NULL,
  `status` tinyint(4) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_8afe9ab2391994817fd4feee63` (`code`,`tenant_id`),
  KEY `IDX_1f1e36ce4e79451c44ce98c0ea` (`tenant_id`),
  KEY `FK_8b2cd14c683ccb9ef57cd4c965b` (`location_city_id`),
  CONSTRAINT `FK_8b2cd14c683ccb9ef57cd4c965b` FOREIGN KEY (`location_city_id`) REFERENCES `location_city` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `comptes_comptables`
--

DROP TABLE IF EXISTS `comptes_comptables`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `comptes_comptables` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `numero` varchar(10) NOT NULL,
  `libelle` varchar(255) NOT NULL,
  `typeCompte` enum('ACTIF','PASSIF','CHARGE','PRODUIT') NOT NULL,
  `classe` int(11) NOT NULL,
  `actif` tinyint(4) NOT NULL DEFAULT 1,
  `description` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_3fa69129c56349acac0dd63b59` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `conversation`
--

DROP TABLE IF EXISTS `conversation`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `conversation` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) DEFAULT NULL,
  `isGroup` tinyint(4) NOT NULL DEFAULT 0,
  `createdAt` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `lastMessageAt` datetime DEFAULT NULL,
  `lastMessageData` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`lastMessageData`)),
  PRIMARY KEY (`id`),
  KEY `IDX_77726325cecc7bc5d2442a7466` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `conversations_bot`
--

DROP TABLE IF EXISTS `conversations_bot`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `conversations_bot` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` varchar(36) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `status` enum('active','archived') NOT NULL DEFAULT 'active',
  PRIMARY KEY (`id`),
  KEY `IDX_732fdcc67ef4fe40cda13c0a4e` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `conversation_messages`
--

DROP TABLE IF EXISTS `conversation_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `conversation_messages` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `conversation_id` varchar(36) NOT NULL,
  `role` enum('system','user','assistant') NOT NULL,
  `content` longtext NOT NULL,
  `reasoning_content` text DEFAULT NULL,
  `tokens_used` int(11) NOT NULL DEFAULT 0,
  `conversationId` varchar(36) DEFAULT NULL,
  `references` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`references`)),
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata`)),
  PRIMARY KEY (`id`),
  KEY `IDX_12ae69a28377f0ff99c856e8bb` (`tenant_id`),
  KEY `FK_f5045a77718bdb593f309a1e258` (`conversationId`),
  CONSTRAINT `FK_f5045a77718bdb593f309a1e258` FOREIGN KEY (`conversationId`) REFERENCES `conversations_bot` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `customer`
--

DROP TABLE IF EXISTS `customer`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `customer` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `last_name` varchar(45) NOT NULL,
  `first_name` varchar(45) NOT NULL,
  `company_name` varchar(255) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `postal_code` varchar(20) DEFAULT NULL,
  `country` varchar(100) DEFAULT 'France',
  `billing_type` varchar(50) DEFAULT NULL,
  `professional_phone` varchar(45) DEFAULT NULL,
  `fax` varchar(45) DEFAULT NULL,
  `siret` varchar(14) DEFAULT NULL,
  `tva_number` varchar(20) DEFAULT NULL,
  `legal_form` varchar(100) DEFAULT NULL,
  `reference` varchar(100) DEFAULT NULL,
  `public_key` varchar(45) DEFAULT NULL,
  `private_key` varchar(45) DEFAULT NULL,
  `number_phone_1` varchar(45) DEFAULT NULL,
  `number_phone_2` varchar(45) DEFAULT NULL,
  `email` varchar(45) DEFAULT NULL,
  `cote` int(11) DEFAULT 0,
  `customer_code` varchar(45) NOT NULL,
  `branch_id` int(11) DEFAULT NULL,
  `created_from` int(11) DEFAULT 0,
  `nui` varchar(45) DEFAULT NULL,
  `rccm` varchar(45) DEFAULT NULL,
  `birthday` datetime DEFAULT NULL,
  `status` int(11) DEFAULT 1,
  `type_customer_id` int(11) DEFAULT NULL,
  `location_city_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_ca90eb4361711ae10f6753fcb5` (`customer_code`),
  KEY `IDX_6b93663c773c9910e12f5827f1` (`tenant_id`),
  KEY `FK_e8ff19b651ee2dfcb7837864dad` (`branch_id`),
  KEY `FK_e452e09bc9262a4c117f626df8e` (`type_customer_id`),
  KEY `FK_22bd495957d7b1491ac5714e025` (`location_city_id`),
  CONSTRAINT `FK_22bd495957d7b1491ac5714e025` FOREIGN KEY (`location_city_id`) REFERENCES `location_city` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_e452e09bc9262a4c117f626df8e` FOREIGN KEY (`type_customer_id`) REFERENCES `type_customer` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_e8ff19b651ee2dfcb7837864dad` FOREIGN KEY (`branch_id`) REFERENCES `branch` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `customer_communication`
--

DROP TABLE IF EXISTS `customer_communication`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `customer_communication` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `type` enum('email','phone','meeting','letter') NOT NULL,
  `subject` varchar(255) NOT NULL,
  `content` text DEFAULT NULL,
  `date` timestamp NOT NULL DEFAULT current_timestamp(),
  `status` enum('sent','received','planned','cancelled') NOT NULL DEFAULT 'sent',
  `duration` int(11) DEFAULT NULL,
  `participants` varchar(255) DEFAULT NULL,
  `customerId` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_52515dd2aa6fac0b0e4b700be1` (`tenant_id`),
  KEY `FK_a5107ed23a1bf05c2f5686b80e6` (`customerId`),
  CONSTRAINT `FK_a5107ed23a1bf05c2f5686b80e6` FOREIGN KEY (`customerId`) REFERENCES `customer` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `cycles`
--

DROP TABLE IF EXISTS `cycles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cycles` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` varchar(36) NOT NULL,
  `templateId` varchar(255) NOT NULL,
  `fromStageId` varchar(255) NOT NULL,
  `toStageId` varchar(255) NOT NULL,
  `label` text DEFAULT NULL,
  `condition` text DEFAULT NULL,
  `maxLoops` int(11) NOT NULL DEFAULT 1,
  `createdAt` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  PRIMARY KEY (`id`),
  KEY `IDX_7b796c19b80e4dc04bc8bbf9aa` (`tenant_id`),
  KEY `FK_09915dc2d47b1cbc76b5277c202` (`templateId`),
  KEY `FK_4f02ef2614c89adf5ecba7c4e39` (`fromStageId`),
  KEY `FK_09e519e4fb4fb9f6a936dfb83ee` (`toStageId`),
  CONSTRAINT `FK_09915dc2d47b1cbc76b5277c202` FOREIGN KEY (`templateId`) REFERENCES `procedure_templates` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `FK_09e519e4fb4fb9f6a936dfb83ee` FOREIGN KEY (`toStageId`) REFERENCES `stages` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `FK_4f02ef2614c89adf5ecba7c4e39` FOREIGN KEY (`fromStageId`) REFERENCES `stages` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `decisions`
--

DROP TABLE IF EXISTS `decisions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `decisions` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` varchar(36) NOT NULL,
  `instanceId` varchar(255) NOT NULL,
  `fromStageId` varchar(255) NOT NULL,
  `toStageId` varchar(255) NOT NULL,
  `userId` varchar(255) DEFAULT NULL,
  `comment` text DEFAULT NULL,
  `transitionId` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_400463fa41278fa7452b8f5ef4` (`tenant_id`),
  KEY `FK_6575e1ae80e974bde0ed50c2e5b` (`instanceId`),
  KEY `FK_b57e5abd1a8778aac53186c8dd8` (`fromStageId`),
  KEY `FK_9f120d5941094469d2559fe21de` (`transitionId`),
  CONSTRAINT `FK_6575e1ae80e974bde0ed50c2e5b` FOREIGN KEY (`instanceId`) REFERENCES `procedure_instances` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_9f120d5941094469d2559fe21de` FOREIGN KEY (`transitionId`) REFERENCES `transitions` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_b57e5abd1a8778aac53186c8dd8` FOREIGN KEY (`fromStageId`) REFERENCES `stages` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `diligences`
--

DROP TABLE IF EXISTS `diligences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `diligences` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `type` enum('acquisition','investment','ipo','compliance','litigation','contract') NOT NULL DEFAULT 'acquisition',
  `status` enum('draft','in_progress','review','completed','cancelled') NOT NULL DEFAULT 'draft',
  `priority` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `start_date` date NOT NULL,
  `deadline` date NOT NULL,
  `completion_date` date DEFAULT NULL,
  `dossier_id` int(11) NOT NULL,
  `assigned_lawyer_id` int(11) DEFAULT NULL,
  `client_reference` varchar(100) DEFAULT NULL,
  `budget_hours` int(11) DEFAULT NULL,
  `actual_hours` int(11) DEFAULT 0,
  `scope` text DEFAULT NULL,
  `findings_summary` text DEFAULT NULL,
  `recommendations` text DEFAULT NULL,
  `report_generated` tinyint(4) NOT NULL DEFAULT 0,
  `report_url` varchar(500) DEFAULT NULL,
  `confidential` tinyint(4) NOT NULL DEFAULT 1,
  `step_id` int(11) DEFAULT NULL,
  `sub_stage_id` varchar(255) DEFAULT NULL,
  `sub_stage_visit_id` varchar(255) DEFAULT NULL,
  `stageVisit_id` varchar(255) DEFAULT NULL,
  `procedure_instance_id` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_460f33869fedb87e6201b15f2b` (`tenant_id`),
  KEY `FK_a6123d92c35280fd4a9166540dd` (`dossier_id`),
  KEY `FK_7220e5f67df3e5f07b1c23e6c19` (`assigned_lawyer_id`),
  KEY `FK_1d3a16a1660bc0448e91866dae3` (`step_id`),
  KEY `FK_73f86b2972f4ba63357fee1e3f4` (`sub_stage_id`),
  KEY `FK_840c66480dc5454988c1b7e5429` (`sub_stage_visit_id`),
  KEY `FK_cac875fbce5d6649d1856c323b1` (`stageVisit_id`),
  KEY `FK_f226a74e8e82526a62604752a4d` (`procedure_instance_id`),
  CONSTRAINT `FK_1d3a16a1660bc0448e91866dae3` FOREIGN KEY (`step_id`) REFERENCES `step` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_7220e5f67df3e5f07b1c23e6c19` FOREIGN KEY (`assigned_lawyer_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_73f86b2972f4ba63357fee1e3f4` FOREIGN KEY (`sub_stage_id`) REFERENCES `sub_stages` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_840c66480dc5454988c1b7e5429` FOREIGN KEY (`sub_stage_visit_id`) REFERENCES `sub_stage_visits` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_a6123d92c35280fd4a9166540dd` FOREIGN KEY (`dossier_id`) REFERENCES `dossiers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_cac875fbce5d6649d1856c323b1` FOREIGN KEY (`stageVisit_id`) REFERENCES `stage_visits` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_f226a74e8e82526a62604752a4d` FOREIGN KEY (`procedure_instance_id`) REFERENCES `procedure_instances` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `document_categories`
--

DROP TABLE IF EXISTS `document_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `document_categories` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `icon` varchar(255) DEFAULT NULL,
  `color` varchar(255) NOT NULL DEFAULT '#4F46E5',
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(4) NOT NULL DEFAULT 1,
  `is_system` tinyint(4) NOT NULL DEFAULT 0,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata`)),
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_b918d9f8325f0ab52f0f00f461` (`tenant_id`,`code`),
  KEY `IDX_4871220b04ac2f46d7db74e5ed` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `document_customer`
--

DROP TABLE IF EXISTS `document_customer`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `document_customer` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `document_type_id` int(11) DEFAULT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `dossier_id` int(11) DEFAULT NULL,
  `uploaded_by_id` int(11) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `category_id` int(11) DEFAULT NULL,
  `status` enum('0','1','2','3','4') NOT NULL DEFAULT '1',
  `file_path` varchar(255) DEFAULT NULL,
  `file_url` varchar(255) DEFAULT NULL,
  `file_size` int(11) DEFAULT NULL,
  `file_mimetype` varchar(255) DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `is_current_version` tinyint(4) NOT NULL DEFAULT 1,
  `uploaded_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `last_modified` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `date_validation` datetime DEFAULT NULL,
  `date_ejected` datetime DEFAULT NULL,
  `date_expired` datetime DEFAULT NULL,
  `required_for_hearing` tinyint(4) NOT NULL DEFAULT 0,
  `is_confidential` tinyint(4) NOT NULL DEFAULT 0,
  `previous_version_id` int(11) DEFAULT NULL,
  `metadata` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_c55e07995d4b80257014105860` (`tenant_id`),
  KEY `FK_f1bf61d8b736b4f64043642f73e` (`document_type_id`),
  KEY `FK_4128c5de0cfd4d06eec081710b1` (`customer_id`),
  KEY `FK_3e97ba9905717d4209c243cdfb9` (`category_id`),
  KEY `FK_62480e02b1562fe861b9b1b3ebc` (`previous_version_id`),
  KEY `FK_732d317490a93acc9172ed67355` (`dossier_id`),
  KEY `FK_349b4ea39a2d1ef621b154109c8` (`uploaded_by_id`),
  CONSTRAINT `FK_349b4ea39a2d1ef621b154109c8` FOREIGN KEY (`uploaded_by_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_3e97ba9905717d4209c243cdfb9` FOREIGN KEY (`category_id`) REFERENCES `document_categories` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_4128c5de0cfd4d06eec081710b1` FOREIGN KEY (`customer_id`) REFERENCES `customer` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_62480e02b1562fe861b9b1b3ebc` FOREIGN KEY (`previous_version_id`) REFERENCES `document_customer` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_732d317490a93acc9172ed67355` FOREIGN KEY (`dossier_id`) REFERENCES `dossiers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_f1bf61d8b736b4f64043642f73e` FOREIGN KEY (`document_type_id`) REFERENCES `document_type` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `document_type`
--

DROP TABLE IF EXISTS `document_type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `document_type` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(100) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `validity_duration` int(11) DEFAULT NULL,
  `mimetype` varchar(255) DEFAULT 'image/',
  `max_size` varchar(255) DEFAULT '3145728',
  `document_category_id` int(11) DEFAULT NULL,
  `is_required` tinyint(4) NOT NULL DEFAULT 0,
  `status` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_5b8e266fa39b9f5abc84f44b5c` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `dossiers`
--

DROP TABLE IF EXISTS `dossiers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `dossiers` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `dossier_number` varchar(50) NOT NULL,
  `object` text NOT NULL,
  `jurisdiction_id` int(11) DEFAULT 1,
  `danger_level` enum('0','1','2','3') NOT NULL DEFAULT '1',
  `court_name` varchar(255) DEFAULT NULL,
  `case_number` varchar(100) DEFAULT NULL,
  `opposing_party_name` varchar(255) DEFAULT NULL,
  `opposing_party_lawyer` varchar(255) DEFAULT NULL,
  `opposing_party_contact` text DEFAULT NULL,
  `third_parties` text DEFAULT NULL,
  `description` text DEFAULT NULL,
  `is_archived` tinyint(4) NOT NULL DEFAULT 0,
  `initial_request` text DEFAULT NULL,
  `status` enum('0','1','2','3','4','5','6','7','8','9','10') NOT NULL DEFAULT '0',
  `opening_date` date NOT NULL,
  `closing_date` date DEFAULT NULL,
  `estimated_duration` int(11) DEFAULT NULL,
  `confidentiality_level` tinyint(4) NOT NULL DEFAULT 0,
  `priority_level` int(11) NOT NULL DEFAULT 0,
  `budget_estimate` decimal(10,2) DEFAULT NULL,
  `success_probability` int(11) DEFAULT NULL,
  `next_steps` text DEFAULT NULL,
  `conversation_id` int(11) DEFAULT NULL,
  `final_decision` text DEFAULT NULL,
  `appeal_decision` text DEFAULT NULL,
  `remand_jurisdiction` text DEFAULT NULL,
  `first_instance_decision` text DEFAULT NULL,
  `appeal_possibility` tinyint(4) NOT NULL DEFAULT 0,
  `appeal_deadline` date DEFAULT NULL,
  `client_id` int(11) NOT NULL,
  `lawyer_id` int(11) NOT NULL,
  `procedure_type_id` int(11) NOT NULL,
  `procedure_subtype_id` int(11) NOT NULL,
  `client_decision` enum('transaction','contentieux','abandon') DEFAULT NULL,
  `recommendation` enum('transaction','present_options','procedure') DEFAULT NULL,
  `analysis_date` date DEFAULT NULL,
  `analysis_notes` text DEFAULT NULL,
  `appeal_filed` tinyint(4) NOT NULL DEFAULT 0,
  `cassation_possibility` tinyint(4) NOT NULL DEFAULT 0,
  `current_decision_type` enum('FIRST_INSTANCE','APPEAL','CASSATION') DEFAULT NULL,
  `cassation_deadline` date DEFAULT NULL,
  `cassation_filed` tinyint(4) NOT NULL DEFAULT 0,
  `execution_date` date DEFAULT NULL,
  `settlement_amount` decimal(12,2) DEFAULT NULL,
  `settlement_terms` text DEFAULT NULL,
  `client_satisfaction` enum('very_satisfied','satisfied','neutral','dissatisfied','very_dissatisfied') NOT NULL DEFAULT 'neutral',
  `outcome` enum('won','lost','unknown','settled','abandoned') NOT NULL DEFAULT 'unknown',
  `outcome_date` date DEFAULT NULL,
  `outcome_notes` text DEFAULT NULL,
  `damages_awarded` decimal(12,2) DEFAULT NULL,
  `costs_awarded` decimal(12,2) DEFAULT NULL,
  `procedureInstanceId` varchar(255) DEFAULT NULL,
  `key_dates` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`key_dates`)),
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_d4463ab6224f4001e366eb8b59` (`dossier_number`),
  UNIQUE KEY `REL_ce52d13b979e54576f92f8460f` (`conversation_id`),
  UNIQUE KEY `REL_16281e6a9465dde693b59595b8` (`procedureInstanceId`),
  KEY `IDX_b562d1546f3e73fdfee9f12e74` (`tenant_id`),
  KEY `FK_acdcd4db547b518eb48e8ce02a1` (`client_id`),
  KEY `FK_a9d26c1ab3083d7897db896a693` (`lawyer_id`),
  KEY `FK_dd9fd64b85c01037bc63d0a8fbe` (`procedure_type_id`),
  KEY `FK_071b2e6177c368925f07b63ae92` (`jurisdiction_id`),
  KEY `FK_42a9a03bfe3f6bf096fddd8ac23` (`procedure_subtype_id`),
  CONSTRAINT `FK_071b2e6177c368925f07b63ae92` FOREIGN KEY (`jurisdiction_id`) REFERENCES `jurisdictions` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_16281e6a9465dde693b59595b8d` FOREIGN KEY (`procedureInstanceId`) REFERENCES `procedure_instances` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_42a9a03bfe3f6bf096fddd8ac23` FOREIGN KEY (`procedure_subtype_id`) REFERENCES `procedure_types` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_a9d26c1ab3083d7897db896a693` FOREIGN KEY (`lawyer_id`) REFERENCES `employee` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_acdcd4db547b518eb48e8ce02a1` FOREIGN KEY (`client_id`) REFERENCES `customer` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_ce52d13b979e54576f92f8460ff` FOREIGN KEY (`conversation_id`) REFERENCES `conversation` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_dd9fd64b85c01037bc63d0a8fbe` FOREIGN KEY (`procedure_type_id`) REFERENCES `procedure_types` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `dossier_referral`
--

DROP TABLE IF EXISTS `dossier_referral`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `dossier_referral` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `dossier_id` int(11) NOT NULL,
  `referrer_id` int(11) NOT NULL,
  `commission_rate` decimal(5,2) NOT NULL,
  `commission_basis` enum('invoiced_ht','invoiced_ttc','collected_ht','collected_ttc') NOT NULL DEFAULT 'collected_ht',
  `referral_date` date NOT NULL,
  `notes` text DEFAULT NULL,
  `commission_mode` enum('rate','fixed_amount') NOT NULL DEFAULT 'rate',
  `commission_amount` decimal(15,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_9bfeda796a0aaaa8c1e6dfb0ad` (`dossier_id`),
  KEY `IDX_d44e2de00d479897103fef04a9` (`tenant_id`),
  KEY `FK_f32c7549c90b34a2afe026f974f` (`referrer_id`),
  CONSTRAINT `FK_9bfeda796a0aaaa8c1e6dfb0ad6` FOREIGN KEY (`dossier_id`) REFERENCES `dossiers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_f32c7549c90b34a2afe026f974f` FOREIGN KEY (`referrer_id`) REFERENCES `referrer` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `ecritures_comptables`
--

DROP TABLE IF EXISTS `ecritures_comptables`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ecritures_comptables` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `numero` varchar(30) NOT NULL,
  `date_ecriture` date NOT NULL,
  `libelle` varchar(500) NOT NULL,
  `journal_id` int(11) NOT NULL,
  `exercice_id` int(11) NOT NULL,
  `source_module` enum('facture','paiement','supplier_invoice','expense_report','payslip','salary_advance','referral_commission','manuel') NOT NULL DEFAULT 'manuel',
  `source_id` varchar(100) DEFAULT NULL,
  `is_auto_generated` tinyint(4) NOT NULL DEFAULT 0,
  `is_locked` tinyint(4) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_cdf992f0bd7683089442fb6abc` (`numero`),
  KEY `IDX_61f0de93028936aa6583ae3376` (`tenant_id`),
  KEY `FK_d3acc7d4b201a20f9a6c7b69c61` (`journal_id`),
  KEY `FK_879d413f05a4f7b1db16b8a4092` (`exercice_id`),
  CONSTRAINT `FK_879d413f05a4f7b1db16b8a4092` FOREIGN KEY (`exercice_id`) REFERENCES `exercices_comptables` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_d3acc7d4b201a20f9a6c7b69c61` FOREIGN KEY (`journal_id`) REFERENCES `journaux_comptables` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `employee`
--

DROP TABLE IF EXISTS `employee`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `employee` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `branch_id` int(11) DEFAULT NULL,
  `position` enum('avocat','secretaire','assistant','stagiaire','huissier','administratif') NOT NULL,
  `hire_date` date NOT NULL,
  `status` tinyint(4) NOT NULL DEFAULT 1,
  `specialization` varchar(255) DEFAULT NULL,
  `bar_association_number` varchar(50) DEFAULT NULL,
  `bar_association_city` varchar(100) DEFAULT NULL,
  `years_of_experience` int(11) DEFAULT NULL,
  `hourly_rate` decimal(8,2) DEFAULT NULL,
  `is_available` tinyint(4) NOT NULL DEFAULT 1,
  `max_dossiers` int(11) NOT NULL DEFAULT 50,
  `bio` text DEFAULT NULL,
  `languages` text DEFAULT NULL,
  `expertise_areas` text DEFAULT NULL,
  `employee_number` varchar(50) DEFAULT NULL,
  `birth_date` date DEFAULT NULL,
  `professional_address` text DEFAULT NULL,
  `professional_phone` varchar(20) DEFAULT NULL,
  `siret_number` varchar(14) DEFAULT NULL,
  `tva_number` varchar(20) DEFAULT NULL,
  `salary` decimal(12,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_4d6b8f1dbb3881c01393d7eafd` (`employee_number`),
  KEY `IDX_b8915b658c2a78a0c1af5d3215` (`tenant_id`),
  KEY `FK_380241ef3c0ea0a87b9411f37ff` (`branch_id`),
  CONSTRAINT `FK_380241ef3c0ea0a87b9411f37ff` FOREIGN KEY (`branch_id`) REFERENCES `branch` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_3c2bc72f03fd5abbbc5ac169498` FOREIGN KEY (`id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `exercices_comptables`
--

DROP TABLE IF EXISTS `exercices_comptables`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `exercices_comptables` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `annee` int(11) NOT NULL,
  `date_debut` date NOT NULL,
  `date_fin` date NOT NULL,
  `statut` enum('OUVERT','CLOTURE') NOT NULL DEFAULT 'OUVERT',
  `date_cloture` date DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_0762b4da040120cf97869ea26b` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `expense_line`
--

DROP TABLE IF EXISTS `expense_line`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `expense_line` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `expense_report_id` int(11) NOT NULL,
  `expense_date` date NOT NULL,
  `description` varchar(500) NOT NULL,
  `category` enum('transport','accommodation','meal','bailiff','court_fees','office_supplies','other') NOT NULL,
  `amount_ht` decimal(10,2) NOT NULL,
  `tax_rate` decimal(5,2) NOT NULL DEFAULT 0.00,
  `amount_ttc` decimal(10,2) NOT NULL,
  `is_rebillable` tinyint(4) NOT NULL DEFAULT 0,
  `dossier_id` int(11) DEFAULT NULL,
  `attachment_url` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_5c9cdedeca7d1e7cb94f3f7fa8` (`tenant_id`),
  KEY `FK_5813cdae385558bf191b1547628` (`expense_report_id`),
  KEY `FK_04efbe4ee6b0962b6ba6da4c511` (`dossier_id`),
  CONSTRAINT `FK_04efbe4ee6b0962b6ba6da4c511` FOREIGN KEY (`dossier_id`) REFERENCES `dossiers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_5813cdae385558bf191b1547628` FOREIGN KEY (`expense_report_id`) REFERENCES `expense_report` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `expense_report`
--

DROP TABLE IF EXISTS `expense_report`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `expense_report` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `title` varchar(255) NOT NULL,
  `status` enum('draft','submitted','approved','rejected','reimbursed') NOT NULL DEFAULT 'draft',
  `total_amount` decimal(10,2) NOT NULL,
  `submission_date` date NOT NULL,
  `approved_by_id` int(11) DEFAULT NULL,
  `reimbursement_date` date DEFAULT NULL,
  `notes` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_0a048f49fcac2177bbfea068aa` (`tenant_id`),
  KEY `FK_fe3459a1ec3e7644ccc9f628740` (`employee_id`),
  KEY `FK_64963331b3fc9ee579a5cb04fda` (`approved_by_id`),
  CONSTRAINT `FK_64963331b3fc9ee579a5cb04fda` FOREIGN KEY (`approved_by_id`) REFERENCES `employee` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_fe3459a1ec3e7644ccc9f628740` FOREIGN KEY (`employee_id`) REFERENCES `employee` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `factures`
--

DROP TABLE IF EXISTS `factures`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `factures` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` varchar(36) NOT NULL,
  `dossier_id` int(11) NOT NULL,
  `client_id` int(11) NOT NULL,
  `step_id` int(11) DEFAULT NULL,
  `type` enum('0','1','2','3') NOT NULL DEFAULT '0',
  `numero` varchar(255) NOT NULL,
  `date_facture` date NOT NULL,
  `date_echeance` date NOT NULL,
  `montant_ht` decimal(10,2) NOT NULL,
  `taux_tva` decimal(5,2) NOT NULL,
  `montant_tva` decimal(10,2) NOT NULL,
  `montant_ttc` decimal(10,2) NOT NULL,
  `description` text DEFAULT NULL,
  `status` enum('0','1','2','3','4','5') NOT NULL DEFAULT '0',
  `notes_internes` text DEFAULT NULL,
  `sub_stage_id` varchar(255) DEFAULT NULL,
  `sub_stage_visit_id` varchar(255) DEFAULT NULL,
  `stageVisit_id` varchar(255) DEFAULT NULL,
  `procedure_instance_id` varchar(255) DEFAULT NULL,
  `invoice_type_id` int(11) DEFAULT NULL,
  `currency` varchar(10) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_f1c7842d8a90f22a49d66639d0` (`numero`),
  KEY `IDX_98a9b7507e8e25fed55b5be835` (`tenant_id`),
  KEY `FK_c3a81de6b0a3b9e51e67442263f` (`dossier_id`),
  KEY `FK_89996ba2503d6437e5755781aa5` (`client_id`),
  KEY `FK_f6bd54ba9e0ed3abd55402524f1` (`step_id`),
  KEY `FK_6904f271ee9bcbf65d888886418` (`invoice_type_id`),
  KEY `FK_533c73b5f40eea380ac5062ff8c` (`sub_stage_id`),
  KEY `FK_5c8000d4651f7cf8277dbc560cb` (`sub_stage_visit_id`),
  KEY `FK_6953b1e5651fa6f5af8d374341f` (`stageVisit_id`),
  KEY `FK_60abda2c6e3996ef24f2b281b23` (`procedure_instance_id`),
  CONSTRAINT `FK_533c73b5f40eea380ac5062ff8c` FOREIGN KEY (`sub_stage_id`) REFERENCES `sub_stages` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_5c8000d4651f7cf8277dbc560cb` FOREIGN KEY (`sub_stage_visit_id`) REFERENCES `sub_stage_visits` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_60abda2c6e3996ef24f2b281b23` FOREIGN KEY (`procedure_instance_id`) REFERENCES `procedure_instances` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_6904f271ee9bcbf65d888886418` FOREIGN KEY (`invoice_type_id`) REFERENCES `invoice_types` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_6953b1e5651fa6f5af8d374341f` FOREIGN KEY (`stageVisit_id`) REFERENCES `stage_visits` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_89996ba2503d6437e5755781aa5` FOREIGN KEY (`client_id`) REFERENCES `customer` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_c3a81de6b0a3b9e51e67442263f` FOREIGN KEY (`dossier_id`) REFERENCES `dossiers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_f6bd54ba9e0ed3abd55402524f1` FOREIGN KEY (`step_id`) REFERENCES `step` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `findings`
--

DROP TABLE IF EXISTS `findings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `findings` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `severity` enum('critical','high','medium','low','info') NOT NULL DEFAULT 'medium',
  `status` enum('identified','in_analysis','validated','resolved','waived') NOT NULL DEFAULT 'identified',
  `category` enum('corporate','contract','labor','tax','ip','litigation','real_estate','regulatory','compliance','financial','other') NOT NULL DEFAULT 'other',
  `diligence_id` int(11) NOT NULL,
  `document_id` int(11) DEFAULT NULL,
  `created_by_id` int(11) DEFAULT NULL,
  `validated_by_id` int(11) DEFAULT NULL,
  `validated_at` timestamp NULL DEFAULT NULL,
  `resolved_at` timestamp NULL DEFAULT NULL,
  `impact` text DEFAULT NULL,
  `recommendation` text DEFAULT NULL,
  `client_comment` text DEFAULT NULL,
  `legal_basis` text DEFAULT NULL,
  `estimated_risk_amount` decimal(15,2) DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `confidential` tinyint(4) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `IDX_6f591763aad6bdba00874319f7` (`tenant_id`),
  KEY `FK_da98ad98bab6ce3db92413a45de` (`diligence_id`),
  KEY `FK_acac4f138e7a63ecaee0e530d99` (`document_id`),
  KEY `FK_ecb63db63b81631c7e19e1e59b5` (`created_by_id`),
  KEY `FK_5985e4d8b3d4ef2f44e92f92cbe` (`validated_by_id`),
  CONSTRAINT `FK_5985e4d8b3d4ef2f44e92f92cbe` FOREIGN KEY (`validated_by_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_acac4f138e7a63ecaee0e530d99` FOREIGN KEY (`document_id`) REFERENCES `document_customer` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_da98ad98bab6ce3db92413a45de` FOREIGN KEY (`diligence_id`) REFERENCES `diligences` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_ecb63db63b81631c7e19e1e59b5` FOREIGN KEY (`created_by_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `history_entries`
--

DROP TABLE IF EXISTS `history_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `history_entries` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` varchar(36) NOT NULL,
  `instanceId` varchar(255) NOT NULL,
  `eventType` varchar(255) NOT NULL,
  `stageId` varchar(255) DEFAULT NULL,
  `subStageId` varchar(255) DEFAULT NULL,
  `userId` varchar(255) DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata`)),
  PRIMARY KEY (`id`),
  KEY `IDX_fe643f2a0d5a9ce4b7f082d0bb` (`tenant_id`),
  KEY `FK_3f60f69971d7bea6460ae9c7858` (`instanceId`),
  CONSTRAINT `FK_3f60f69971d7bea6460ae9c7858` FOREIGN KEY (`instanceId`) REFERENCES `procedure_instances` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `invoice_types`
--

DROP TABLE IF EXISTS `invoice_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `invoice_types` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `category` enum('legal_fees','expenses','advance','settlement','other') NOT NULL DEFAULT 'legal_fees',
  `default_tax_rate` enum('0','5.5','10','20') NOT NULL DEFAULT '20',
  `is_billable` tinyint(4) NOT NULL DEFAULT 1,
  `requires_approval` tinyint(4) NOT NULL DEFAULT 1,
  `default_payment_days` int(11) NOT NULL DEFAULT 30,
  `is_active` tinyint(4) NOT NULL DEFAULT 1,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata`)),
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_6d915b8a1d28b833ef51c52de9` (`tenant_id`,`code`),
  KEY `IDX_92ef5e9d7f6af1c0362cfbc9a7` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `journaux_comptables`
--

DROP TABLE IF EXISTS `journaux_comptables`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `journaux_comptables` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(10) NOT NULL,
  `libelle` varchar(255) NOT NULL,
  `typeJournal` enum('VENTES','ACHATS','CAISSE','BANQUE','OD') NOT NULL,
  `actif` tinyint(4) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `IDX_ace8b5667ec5617fdbdcce6f7a` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `jurisdictions`
--

DROP TABLE IF EXISTS `jurisdictions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `jurisdictions` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `level` enum('municipal','regional','national','international') NOT NULL DEFAULT 'regional',
  `jurisdiction_type` enum('civil','commercial','administrative','penal','labor','family') NOT NULL DEFAULT 'civil',
  `city` varchar(255) DEFAULT NULL,
  `region` varchar(255) DEFAULT NULL,
  `country` varchar(255) NOT NULL DEFAULT 'France',
  `address` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  `parent_id` int(11) DEFAULT NULL,
  `is_active` tinyint(4) NOT NULL DEFAULT 1,
  `created_by` int(11) DEFAULT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata`)),
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_18f84c35d77f9317f595e56f46` (`tenant_id`,`code`),
  KEY `IDX_d21b7ca0a345c3555fa8294bbf` (`tenant_id`),
  KEY `FK_c9013be826e2dda9833786caa8f` (`parent_id`),
  CONSTRAINT `FK_c9013be826e2dda9833786caa8f` FOREIGN KEY (`parent_id`) REFERENCES `jurisdictions` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `mails`
--

DROP TABLE IF EXISTS `mails`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `mails` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` varchar(36) NOT NULL,
  `deduplicationKey` varchar(255) DEFAULT NULL,
  `templateName` varchar(255) DEFAULT NULL,
  `to` text NOT NULL,
  `cc` text DEFAULT NULL,
  `bcc` text DEFAULT NULL,
  `subject` varchar(255) DEFAULT NULL,
  `html` longtext DEFAULT NULL,
  `text` longtext DEFAULT NULL,
  `status` enum('pending','sent','failed','cancelled') NOT NULL DEFAULT 'pending',
  `scheduledAt` datetime DEFAULT NULL,
  `sentAt` datetime DEFAULT NULL,
  `failedAt` datetime DEFAULT NULL,
  `errorMessage` text DEFAULT NULL,
  `retryCount` int(11) NOT NULL DEFAULT 0,
  `lastAttemptAt` datetime DEFAULT NULL,
  `context` text DEFAULT NULL,
  `attachments` text DEFAULT NULL,
  `metadata` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_351d32a445122228ddae676a96` (`deduplicationKey`),
  KEY `IDX_004bbde499f3bb970cf73ec1a9` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `mail_templates`
--

DROP TABLE IF EXISTS `mail_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `mail_templates` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(80) NOT NULL,
  `name` varchar(150) NOT NULL,
  `category` varchar(30) NOT NULL DEFAULT 'general',
  `audience` varchar(20) NOT NULL DEFAULT 'both',
  `description` text DEFAULT NULL,
  `subject` varchar(255) NOT NULL,
  `body_html` longtext NOT NULL,
  `variables` text DEFAULT NULL,
  `font_family` varchar(50) DEFAULT NULL,
  `header_block_id` int(11) DEFAULT NULL,
  `footer_block_id` int(11) DEFAULT NULL,
  `is_system` tinyint(4) NOT NULL DEFAULT 0,
  `is_active` tinyint(4) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_4750c72561ad8636bfeb98315f` (`tenant_id`,`code`),
  KEY `IDX_fb77a3d29ea84a4a01118f14b0` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `message`
--

DROP TABLE IF EXISTS `message`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `message` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `content` text NOT NULL,
  `hasAttachments` tinyint(4) NOT NULL DEFAULT 0,
  `createdAt` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `conversationId` int(11) NOT NULL,
  `senderId` int(11) DEFAULT NULL,
  `references` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`references`)),
  PRIMARY KEY (`id`),
  KEY `IDX_0a80d1aa3c9395260e27c1245c` (`tenant_id`),
  KEY `FK_7cf4a4df1f2627f72bf6231635f` (`conversationId`),
  KEY `FK_bc096b4e18b1f9508197cd98066` (`senderId`),
  CONSTRAINT `FK_7cf4a4df1f2627f72bf6231635f` FOREIGN KEY (`conversationId`) REFERENCES `conversation` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_bc096b4e18b1f9508197cd98066` FOREIGN KEY (`senderId`) REFERENCES `employee` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `message_read`
--

DROP TABLE IF EXISTS `message_read`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `message_read` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `isRead` tinyint(4) NOT NULL DEFAULT 0,
  `isReceive` tinyint(4) NOT NULL DEFAULT 0,
  `readAt` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `messageId` int(11) DEFAULT NULL,
  `readerId` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_e58f581822a6481d31cb556214` (`tenant_id`),
  KEY `FK_9799fb005881ecbe7f374fb8404` (`messageId`),
  KEY `FK_1e92988ffc3aa00a08f4da4ca8b` (`readerId`),
  CONSTRAINT `FK_1e92988ffc3aa00a08f4da4ca8b` FOREIGN KEY (`readerId`) REFERENCES `employee` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `FK_9799fb005881ecbe7f374fb8404` FOREIGN KEY (`messageId`) REFERENCES `message` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notifications` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `type` varchar(50) NOT NULL,
  `content` text DEFAULT NULL,
  `priority` varchar(20) NOT NULL DEFAULT 'normal',
  `read_at` timestamp NULL DEFAULT NULL,
  `is_read` tinyint(4) NOT NULL DEFAULT 0,
  `is_archived` tinyint(4) NOT NULL DEFAULT 0,
  `is_push_sent` tinyint(4) NOT NULL DEFAULT 1,
  `title` text NOT NULL,
  `link` text DEFAULT NULL,
  `image_url` text DEFAULT NULL,
  `data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`data`)),
  `actions` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`actions`)),
  PRIMARY KEY (`id`),
  KEY `IDX_d93ddd7e1b890535ecafbb334e` (`tenant_id`),
  KEY `IDX_9a8a82462cab47c73d25f49261` (`user_id`),
  KEY `IDX_310667f935698fcd8cb319113a` (`user_id`,`created_at`),
  KEY `IDX_5323ccd23482802bd9759e88ee` (`user_id`,`read_at`),
  CONSTRAINT `FK_9a8a82462cab47c73d25f49261f` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `paiements`
--

DROP TABLE IF EXISTS `paiements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `paiements` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` varchar(36) NOT NULL,
  `facture_id` varchar(255) NOT NULL,
  `montant` decimal(10,2) NOT NULL,
  `modePaiement` enum('0','1','2','3','4','5','6') NOT NULL DEFAULT '2',
  `date_paiement` date NOT NULL,
  `date_valeur` date NOT NULL,
  `reference` varchar(255) DEFAULT NULL,
  `numero_cheque` varchar(255) DEFAULT NULL,
  `banque` varchar(255) DEFAULT NULL,
  `titulaire` varchar(255) DEFAULT NULL,
  `status` enum('0','1','2','3') NOT NULL DEFAULT '1',
  `notes` text DEFAULT NULL,
  `preuve_paiement` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_d1aa0d502d1d50b937a978fef0` (`tenant_id`),
  KEY `FK_e94fd7532b4ac970abce08ed4ed` (`facture_id`),
  CONSTRAINT `FK_e94fd7532b4ac970abce08ed4ed` FOREIGN KEY (`facture_id`) REFERENCES `factures` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `partner`
--

DROP TABLE IF EXISTS `partner`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `partner` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `name` varchar(100) NOT NULL,
  `promo_code` varchar(50) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `saving_account_id` int(11) NOT NULL,
  `status` tinyint(4) NOT NULL DEFAULT 1,
  PRIMARY KEY (`promo_code`),
  UNIQUE KEY `IDX_79e2ca7abe3dba228d86fa1a10` (`promo_code`),
  UNIQUE KEY `IDX_8dcda87ee48904c926819d4512` (`customer_id`),
  KEY `IDX_bf9a6cd7454a8b646fe83e6f79` (`tenant_id`),
  CONSTRAINT `FK_8dcda87ee48904c926819d4512a` FOREIGN KEY (`customer_id`) REFERENCES `customer` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `payroll_contribution`
--

DROP TABLE IF EXISTS `payroll_contribution`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payroll_contribution` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `label` varchar(150) NOT NULL,
  `rate` decimal(10,4) NOT NULL,
  `base_type` enum('gross','taxable','fixed') NOT NULL DEFAULT 'gross',
  `payer` enum('employee','employer') NOT NULL,
  `ceiling` decimal(12,2) DEFAULT NULL,
  `account_number` varchar(20) DEFAULT NULL,
  `is_active` tinyint(4) NOT NULL DEFAULT 1,
  `sort_order` int(11) NOT NULL DEFAULT 100,
  PRIMARY KEY (`id`),
  KEY `IDX_3a9a6835d478819fb21b893969` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `payroll_period`
--

DROP TABLE IF EXISTS `payroll_period`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payroll_period` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `label` varchar(100) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `status` enum('draft','validated','paid','cancelled') NOT NULL DEFAULT 'draft',
  `branch_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_be70e9d3dcc27fbb1e6af77bfe` (`tenant_id`),
  KEY `FK_97a4ee57584a26bc71bf8b070fc` (`branch_id`),
  CONSTRAINT `FK_97a4ee57584a26bc71bf8b070fc` FOREIGN KEY (`branch_id`) REFERENCES `branch` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `payslip`
--

DROP TABLE IF EXISTS `payslip`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payslip` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `period_id` int(11) NOT NULL,
  `gross_amount` decimal(12,2) NOT NULL,
  `net_amount` decimal(12,2) NOT NULL,
  `status` enum('draft','validated','paid') NOT NULL DEFAULT 'draft',
  `payment_date` date DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `total_employer_charges` decimal(12,2) DEFAULT NULL,
  `snapshot` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`snapshot`)),
  PRIMARY KEY (`id`),
  KEY `IDX_e13820103c311f88ae8faec8ea` (`tenant_id`),
  KEY `FK_94d347ad255d78d004aa5c21398` (`employee_id`),
  KEY `FK_feebc8c170015670684271e3f62` (`period_id`),
  CONSTRAINT `FK_94d347ad255d78d004aa5c21398` FOREIGN KEY (`employee_id`) REFERENCES `employee` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_feebc8c170015670684271e3f62` FOREIGN KEY (`period_id`) REFERENCES `payroll_period` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `payslip_line`
--

DROP TABLE IF EXISTS `payslip_line`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payslip_line` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `payslip_id` int(11) NOT NULL,
  `line_type` enum('base_salary','bonus','internal_commission','deduction','advance_recovery','benefit','overtime') NOT NULL,
  `label` varchar(255) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `is_taxable` tinyint(4) NOT NULL DEFAULT 1,
  `dossier_id` int(11) DEFAULT NULL,
  `notes` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_69d19fbaba66eea7601be9a031` (`tenant_id`),
  KEY `FK_40fc287f903b91e92cf0719b42d` (`payslip_id`),
  KEY `FK_c2e93ce84f3c3fa2754156462ea` (`dossier_id`),
  CONSTRAINT `FK_40fc287f903b91e92cf0719b42d` FOREIGN KEY (`payslip_id`) REFERENCES `payslip` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_c2e93ce84f3c3fa2754156462ea` FOREIGN KEY (`dossier_id`) REFERENCES `dossiers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `pdf_templates`
--

DROP TABLE IF EXISTS `pdf_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pdf_templates` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(80) NOT NULL,
  `name` varchar(120) NOT NULL,
  `entity_type` varchar(40) NOT NULL,
  `variant` varchar(40) NOT NULL DEFAULT 'standard',
  `description` text DEFAULT NULL,
  `title` varchar(160) DEFAULT NULL,
  `body_html` longtext NOT NULL,
  `variables` text DEFAULT NULL,
  `orientation` varchar(20) NOT NULL DEFAULT 'portrait',
  `paper_size` varchar(10) NOT NULL DEFAULT 'a4',
  `font_family` varchar(50) DEFAULT NULL,
  `header_block_id` int(11) DEFAULT NULL,
  `footer_block_id` int(11) DEFAULT NULL,
  `is_system` tinyint(4) NOT NULL DEFAULT 0,
  `is_active` tinyint(4) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_82a1003b49f2e6c0eae6a2dd29` (`tenant_id`,`code`),
  KEY `IDX_5a773d1fbebd2ff07c81548ab4` (`tenant_id`),
  KEY `IDX_4c18a2b52a53902ca3275e714c` (`entity_type`,`variant`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `permission`
--

DROP TABLE IF EXISTS `permission`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `permission` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` smallint(5) unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `description` text DEFAULT NULL,
  `canChange` tinyint(4) DEFAULT 1,
  `status` tinyint(4) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_44ffbe8a7393682fea07f6b128` (`code`,`tenant_id`),
  KEY `IDX_abca7710360bff80fafb72fb0f` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `procedure_instances`
--

DROP TABLE IF EXISTS `procedure_instances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `procedure_instances` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` varchar(36) NOT NULL,
  `templateId` varchar(255) NOT NULL,
  `title` varchar(255) NOT NULL,
  `status` enum('active','suspended','closed','abandoned','completed','paused','in_progress') NOT NULL DEFAULT 'active',
  `currentStageId` varchar(255) NOT NULL,
  `completedSubStages` text DEFAULT NULL,
  `cycleUsageCount` text DEFAULT NULL,
  `subStageMetadata` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_21f3107d1475cd2b908eb1f99e` (`tenant_id`),
  KEY `FK_a85455d99755932a74b0149f073` (`templateId`),
  KEY `FK_94179f65771682946bec9ceb415` (`currentStageId`),
  CONSTRAINT `FK_94179f65771682946bec9ceb415` FOREIGN KEY (`currentStageId`) REFERENCES `stages` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_a85455d99755932a74b0149f073` FOREIGN KEY (`templateId`) REFERENCES `procedure_templates` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `procedure_templates`
--

DROP TABLE IF EXISTS `procedure_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `procedure_templates` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `isActive` tinyint(4) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_c77c0cc5d81addddb999ab9c26` (`tenant_id`,`name`),
  KEY `IDX_5a139b597e639f2b697e98344c` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `procedure_types`
--

DROP TABLE IF EXISTS `procedure_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `procedure_types` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `code` varchar(50) NOT NULL,
  `description` text DEFAULT NULL,
  `is_subtype` tinyint(4) NOT NULL DEFAULT 0,
  `parent_id` int(11) DEFAULT NULL,
  `hierarchy_level` int(11) NOT NULL DEFAULT 1,
  `is_active` tinyint(4) NOT NULL DEFAULT 1,
  `average_duration` int(11) DEFAULT NULL,
  `procedure_template_id` varchar(255) DEFAULT NULL,
  `required_documents` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`required_documents`)),
  `specific_jurisdictions` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`specific_jurisdictions`)),
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_2f3a80b95e49c0c66ca052d57f` (`tenant_id`,`code`),
  KEY `IDX_867b7f8d701356bdc55b47da76` (`tenant_id`),
  KEY `FK_acd30016449ab71f41623f87ba1` (`parent_id`),
  KEY `FK_0c01737454f0afec952e7a52016` (`procedure_template_id`),
  CONSTRAINT `FK_0c01737454f0afec952e7a52016` FOREIGN KEY (`procedure_template_id`) REFERENCES `procedure_templates` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_acd30016449ab71f41623f87ba1` FOREIGN KEY (`parent_id`) REFERENCES `procedure_types` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `referral_commission`
--

DROP TABLE IF EXISTS `referral_commission`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `referral_commission` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `dossier_referral_id` int(11) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `status` enum('calculated','approved','paid','cancelled') NOT NULL DEFAULT 'calculated',
  `calculation_date` date NOT NULL,
  `payment_date` date DEFAULT NULL,
  `payment_reference` varchar(255) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `facture_id` varchar(36) DEFAULT NULL,
  `paiement_id` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_4dc188562a6a1467aca7cd14a3` (`tenant_id`),
  KEY `FK_5c26d0659488a980dafb54040d8` (`dossier_referral_id`),
  KEY `FK_04301864edf5f7f34b8db6b6280` (`facture_id`),
  KEY `FK_16d36f2156a40166d75881e489f` (`paiement_id`),
  CONSTRAINT `FK_04301864edf5f7f34b8db6b6280` FOREIGN KEY (`facture_id`) REFERENCES `factures` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_16d36f2156a40166d75881e489f` FOREIGN KEY (`paiement_id`) REFERENCES `paiements` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_5c26d0659488a980dafb54040d8` FOREIGN KEY (`dossier_referral_id`) REFERENCES `dossier_referral` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `referrer`
--

DROP TABLE IF EXISTS `referrer`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `referrer` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `referrer_code` varchar(50) NOT NULL,
  `referrer_type` enum('lawyer','accountant','agency','client','employee','individual','other') NOT NULL,
  `is_internal` tinyint(4) NOT NULL DEFAULT 0,
  `employee_id` int(11) DEFAULT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `company_name` varchar(255) DEFAULT NULL,
  `contact_name` varchar(255) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `phone` varchar(45) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `default_commission_rate` decimal(5,2) DEFAULT NULL,
  `payment_method` enum('VIREMENT','CHEQUE','ESPECES','MOBILE_MONEY') DEFAULT NULL,
  `bank_name` varchar(255) DEFAULT NULL,
  `bank_account_holder` varchar(255) DEFAULT NULL,
  `bank_iban` varchar(100) DEFAULT NULL,
  `status` tinyint(4) NOT NULL DEFAULT 1,
  `notes` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_aeb1d6de991c16d90ff8d8cc42` (`referrer_code`),
  KEY `IDX_95865e2c93dbf5dba098a70de3` (`tenant_id`),
  KEY `FK_086e55dfe2d6a41d99cffdd0b57` (`employee_id`),
  KEY `FK_5cb9891a4e24a5ab8816c63f644` (`customer_id`),
  CONSTRAINT `FK_086e55dfe2d6a41d99cffdd0b57` FOREIGN KEY (`employee_id`) REFERENCES `employee` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_5cb9891a4e24a5ab8816c63f644` FOREIGN KEY (`customer_id`) REFERENCES `customer` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `ressource`
--

DROP TABLE IF EXISTS `ressource`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ressource` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ressource_type_id` int(11) NOT NULL,
  `savings_account_id` int(11) NOT NULL,
  `status` int(11) NOT NULL DEFAULT 1,
  `quantity` int(11) DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `IDX_b14b5b289c2e5e9fb5c4b94660` (`tenant_id`),
  KEY `FK_863760b82bd13d24521775a7878` (`ressource_type_id`),
  CONSTRAINT `FK_863760b82bd13d24521775a7878` FOREIGN KEY (`ressource_type_id`) REFERENCES `ressource_type` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `ressource_type`
--

DROP TABLE IF EXISTS `ressource_type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ressource_type` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `description` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `amount` int(11) NOT NULL,
  `quantity` int(11) NOT NULL,
  `code` varchar(255) NOT NULL,
  `swift_code` varchar(255) DEFAULT NULL,
  `bank_code` varchar(255) DEFAULT NULL,
  `account_number` varchar(255) DEFAULT NULL,
  `key` varchar(255) DEFAULT NULL,
  `iban` varchar(255) DEFAULT NULL,
  `account_label` varchar(255) DEFAULT NULL,
  `branch_code` varchar(20) DEFAULT NULL,
  `country_code` varchar(10) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_e04016995749051ab4e060a367` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `role_permission`
--

DROP TABLE IF EXISTS `role_permission`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `role_permission` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `role_id` tinyint(3) unsigned NOT NULL,
  `permission_id` smallint(5) unsigned NOT NULL,
  `status` tinyint(4) DEFAULT NULL,
  PRIMARY KEY (`role_id`,`permission_id`),
  KEY `IDX_0ca5e98ef4d104fac4021730b3` (`tenant_id`),
  KEY `FK_e3a3ba47b7ca00fd23be4ebd6cf` (`permission_id`),
  CONSTRAINT `FK_3d0a7155eafd75ddba5a7013368` FOREIGN KEY (`role_id`) REFERENCES `user_role` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `FK_e3a3ba47b7ca00fd23be4ebd6cf` FOREIGN KEY (`permission_id`) REFERENCES `permission` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `salary_advance`
--

DROP TABLE IF EXISTS `salary_advance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `salary_advance` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `recovered_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `date_granted` date NOT NULL,
  `status` enum('pending','approved','paid','recovered','cancelled') NOT NULL DEFAULT 'pending',
  `payment_date` date DEFAULT NULL,
  `reason` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_47ab5b610fba8c39f5d9c3666b` (`tenant_id`),
  KEY `FK_4334bdc4d65a8a86879ff4919c5` (`employee_id`),
  CONSTRAINT `FK_4334bdc4d65a8a86879ff4919c5` FOREIGN KEY (`employee_id`) REFERENCES `employee` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `stages`
--

DROP TABLE IF EXISTS `stages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `stages` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` varchar(36) NOT NULL,
  `templateId` varchar(255) NOT NULL,
  `order` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `canBeSkipped` tinyint(4) NOT NULL DEFAULT 0,
  `canBeReentered` tinyint(4) NOT NULL DEFAULT 1,
  `createdAt` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  PRIMARY KEY (`id`),
  KEY `IDX_36b1476d5a8c92831da5b0c4f1` (`tenant_id`),
  KEY `FK_f4768e28b5dd2c7a13e411d10bf` (`templateId`),
  CONSTRAINT `FK_f4768e28b5dd2c7a13e411d10bf` FOREIGN KEY (`templateId`) REFERENCES `procedure_templates` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `stage_configs`
--

DROP TABLE IF EXISTS `stage_configs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `stage_configs` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` varchar(36) NOT NULL,
  `stageId` varchar(255) NOT NULL,
  `allowDocuments` tinyint(4) NOT NULL DEFAULT 0,
  `allowDiligences` tinyint(4) NOT NULL DEFAULT 0,
  `allowInvoices` tinyint(4) NOT NULL DEFAULT 0,
  `allowHearings` tinyint(4) NOT NULL DEFAULT 0,
  `documentTypesAllowed` text DEFAULT NULL,
  `diligenceConfig` text DEFAULT NULL,
  `hearingConfig` text DEFAULT NULL,
  `invoiceConfig` text DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  PRIMARY KEY (`id`),
  KEY `IDX_ff8761aed2c0b91ecec44402c6` (`tenant_id`),
  KEY `FK_4d8cdff9c0ff267b6a93b7788aa` (`stageId`),
  CONSTRAINT `FK_4d8cdff9c0ff267b6a93b7788aa` FOREIGN KEY (`stageId`) REFERENCES `stages` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `stage_visits`
--

DROP TABLE IF EXISTS `stage_visits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `stage_visits` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` varchar(36) NOT NULL,
  `instanceId` varchar(255) NOT NULL,
  `stageId` varchar(255) NOT NULL,
  `visitNumber` int(11) NOT NULL,
  `currentSubStageVisitId` varchar(255) DEFAULT NULL,
  `enteredAt` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `exitedAt` datetime DEFAULT NULL,
  `updatedAt` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `completedSubStages` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`completedSubStages`)),
  `subStageMetadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`subStageMetadata`)),
  PRIMARY KEY (`id`),
  KEY `IDX_cdb3e6b16cb406670b45fb650d` (`tenant_id`),
  KEY `FK_90f304d1b8cc0ea6378e5563456` (`instanceId`),
  KEY `FK_4047ac62cd511d670b4c076c8f7` (`stageId`),
  KEY `FK_064445b152f98a5860cfe75cce2` (`currentSubStageVisitId`),
  CONSTRAINT `FK_064445b152f98a5860cfe75cce2` FOREIGN KEY (`currentSubStageVisitId`) REFERENCES `sub_stage_visits` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT `FK_4047ac62cd511d670b4c076c8f7` FOREIGN KEY (`stageId`) REFERENCES `stages` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `FK_90f304d1b8cc0ea6378e5563456` FOREIGN KEY (`instanceId`) REFERENCES `procedure_instances` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `step`
--

DROP TABLE IF EXISTS `step`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `step` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `type` enum('opening','amiable','contentious','decision','appeal','closure') NOT NULL,
  `status` int(11) NOT NULL DEFAULT -1,
  `title` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `dossier_id` int(11) DEFAULT NULL,
  `scheduledDate` date DEFAULT NULL,
  `completedDate` date DEFAULT NULL,
  `metadata` text DEFAULT NULL,
  `assignedToId` int(11) DEFAULT NULL,
  `metrics` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metrics`)),
  PRIMARY KEY (`id`),
  KEY `IDX_7306212f5deaf8dbfbbcd7c30e` (`tenant_id`),
  KEY `FK_67e8c91db02d35b90bb2b015c2e` (`dossier_id`),
  KEY `FK_06cc1a4aae809dab4d086fe4b41` (`assignedToId`),
  CONSTRAINT `FK_06cc1a4aae809dab4d086fe4b41` FOREIGN KEY (`assignedToId`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_67e8c91db02d35b90bb2b015c2e` FOREIGN KEY (`dossier_id`) REFERENCES `dossiers` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `step_action`
--

DROP TABLE IF EXISTS `step_action`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `step_action` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `type` enum('diligence','document','audience','facture') NOT NULL,
  `status` enum('pending','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
  `title` varchar(255) NOT NULL,
  `description` text NOT NULL,
  `tooltipMessage` text DEFAULT NULL,
  `scheduledDate` date DEFAULT NULL,
  `completedDate` date DEFAULT NULL,
  `result` text DEFAULT NULL,
  `stepId` int(11) DEFAULT NULL,
  `assignedToId` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_7e80f48f14bf045deeafa15f9e` (`tenant_id`),
  KEY `FK_f45daebb6a1dc108bf4d935b937` (`stepId`),
  KEY `FK_9de96df4352d24e8c34bdf9e6c2` (`assignedToId`),
  CONSTRAINT `FK_9de96df4352d24e8c34bdf9e6c2` FOREIGN KEY (`assignedToId`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_f45daebb6a1dc108bf4d935b937` FOREIGN KEY (`stepId`) REFERENCES `step` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `sub_stages`
--

DROP TABLE IF EXISTS `sub_stages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sub_stages` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` varchar(36) NOT NULL,
  `stageId` varchar(255) NOT NULL,
  `order` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `isMandatory` tinyint(4) NOT NULL DEFAULT 1,
  `createdAt` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  PRIMARY KEY (`id`),
  KEY `IDX_ea432d5b5bce0b0bcac0bfc583` (`tenant_id`),
  KEY `FK_d44760ac2a22ebda0b3b8ac3a47` (`stageId`),
  CONSTRAINT `FK_d44760ac2a22ebda0b3b8ac3a47` FOREIGN KEY (`stageId`) REFERENCES `stages` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `sub_stage_visits`
--

DROP TABLE IF EXISTS `sub_stage_visits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sub_stage_visits` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` varchar(36) NOT NULL,
  `stageVisitId` varchar(255) NOT NULL,
  `subStageId` varchar(255) NOT NULL,
  `isCompleted` tinyint(4) NOT NULL DEFAULT 0,
  `startedAt` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `completedAt` datetime DEFAULT NULL,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata`)),
  PRIMARY KEY (`id`),
  KEY `IDX_95ca3beb716f097cd00c4c6153` (`tenant_id`),
  KEY `FK_a7f6d9ed494b7713facada9437d` (`stageVisitId`),
  KEY `FK_4cb266b08ae3f73bcaf84aa9d5b` (`subStageId`),
  CONSTRAINT `FK_4cb266b08ae3f73bcaf84aa9d5b` FOREIGN KEY (`subStageId`) REFERENCES `sub_stages` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `FK_a7f6d9ed494b7713facada9437d` FOREIGN KEY (`stageVisitId`) REFERENCES `stage_visits` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `supplier`
--

DROP TABLE IF EXISTS `supplier`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `supplier` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `supplier_code` varchar(50) NOT NULL,
  `company_name` varchar(255) NOT NULL,
  `contact_name` varchar(255) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `phone` varchar(45) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `tva_number` varchar(20) DEFAULT NULL,
  `category` enum('internet','electricity','rent','supplies','software','bailiff','insurance','maintenance','other') NOT NULL,
  `status` tinyint(4) NOT NULL DEFAULT 1,
  `branch_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_7f1a06837f963490d84ce48c86` (`supplier_code`),
  KEY `IDX_143dc0e7f2f449e4b04b1d5cc7` (`tenant_id`),
  KEY `FK_5c5472e065c0d0d31f8670e6ecc` (`branch_id`),
  CONSTRAINT `FK_5c5472e065c0d0d31f8670e6ecc` FOREIGN KEY (`branch_id`) REFERENCES `branch` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `supplier_invoice`
--

DROP TABLE IF EXISTS `supplier_invoice`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `supplier_invoice` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `supplier_id` int(11) NOT NULL,
  `invoice_number` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `invoice_date` date NOT NULL,
  `due_date` date NOT NULL,
  `amount_ht` decimal(10,2) NOT NULL,
  `tax_rate` decimal(5,2) NOT NULL DEFAULT 0.00,
  `amount_tva` decimal(10,2) NOT NULL,
  `amount_ttc` decimal(10,2) NOT NULL,
  `status` enum('received','approved','paid','cancelled','disputed') NOT NULL DEFAULT 'received',
  `payment_date` date DEFAULT NULL,
  `payment_method` enum('ESPECES','CHEQUE','VIREMENT','CARTE_BANCAIRE','PRELEVEMENT','MOBILE_MONEY') DEFAULT NULL,
  `attachment_url` varchar(500) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `branch_id` int(11) DEFAULT NULL,
  `created_by_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_c9500d48f9f08c827caa01a0e5` (`tenant_id`),
  KEY `FK_dded929421e6da224e186f96276` (`supplier_id`),
  KEY `FK_afe98088e97b5097dd448e0170d` (`branch_id`),
  KEY `FK_6c2eedffbe42701dfbc57afdd5d` (`created_by_id`),
  CONSTRAINT `FK_6c2eedffbe42701dfbc57afdd5d` FOREIGN KEY (`created_by_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_afe98088e97b5097dd448e0170d` FOREIGN KEY (`branch_id`) REFERENCES `branch` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_dded929421e6da224e186f96276` FOREIGN KEY (`supplier_id`) REFERENCES `supplier` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `tasks`
--

DROP TABLE IF EXISTS `tasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tasks` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` varchar(36) NOT NULL,
  `instanceId` varchar(255) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `dueDate` datetime DEFAULT NULL,
  `assignedTo` varchar(255) DEFAULT NULL,
  `status` enum('pending','in_progress','completed','overdue') NOT NULL DEFAULT 'pending',
  `completedAt` datetime DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  PRIMARY KEY (`id`),
  KEY `IDX_93edccfc42408754c4b5957105` (`tenant_id`),
  KEY `FK_da30619c8ad171ec5b9d677c2a7` (`instanceId`),
  CONSTRAINT `FK_da30619c8ad171ec5b9d677c2a7` FOREIGN KEY (`instanceId`) REFERENCES `procedure_instances` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `template_blocks`
--

DROP TABLE IF EXISTS `template_blocks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `template_blocks` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(80) NOT NULL,
  `name` varchar(150) NOT NULL,
  `channel` varchar(10) NOT NULL,
  `kind` varchar(10) NOT NULL,
  `description` text DEFAULT NULL,
  `body_html` longtext NOT NULL,
  `variables` text DEFAULT NULL,
  `is_default` tinyint(4) NOT NULL DEFAULT 0,
  `is_system` tinyint(4) NOT NULL DEFAULT 0,
  `is_active` tinyint(4) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_a0c0e6d79654ad440018f39c40` (`tenant_id`,`code`),
  KEY `IDX_80819828b0fbd42010a373bb42` (`tenant_id`),
  KEY `IDX_5611eb6eab280b226f904922b6` (`channel`,`kind`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `transitions`
--

DROP TABLE IF EXISTS `transitions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `transitions` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` varchar(36) NOT NULL,
  `fromStageId` varchar(255) NOT NULL,
  `toStageId` varchar(255) NOT NULL,
  `type` enum('automatic','manual') NOT NULL DEFAULT 'manual',
  `label` text DEFAULT NULL,
  `condition` text DEFAULT NULL,
  `triggerEvent` text DEFAULT NULL,
  `triggerCondition` text DEFAULT NULL,
  `templateId` varchar(255) DEFAULT NULL,
  `isDefault` tinyint(4) NOT NULL DEFAULT 0,
  `requiresDecision` tinyint(4) NOT NULL DEFAULT 1,
  `requiresValidation` tinyint(4) NOT NULL DEFAULT 0,
  `onTransition` text DEFAULT NULL,
  `expectsUserInput` tinyint(4) NOT NULL DEFAULT 0,
  `createdAt` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `userInputs` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`userInputs`)),
  `preTransitionActions` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`preTransitionActions`)),
  `postTransitionActions` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`postTransitionActions`)),
  PRIMARY KEY (`id`),
  KEY `IDX_011e08ba5515a00c83a78ab165` (`tenant_id`),
  KEY `FK_004a9a9acc8527e0adacdbf4e22` (`fromStageId`),
  KEY `FK_6524597362634105e581ac7a8ab` (`toStageId`),
  KEY `FK_1af677f02f3732012f4a9133ea4` (`templateId`),
  CONSTRAINT `FK_004a9a9acc8527e0adacdbf4e22` FOREIGN KEY (`fromStageId`) REFERENCES `stages` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `FK_1af677f02f3732012f4a9133ea4` FOREIGN KEY (`templateId`) REFERENCES `procedure_templates` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_6524597362634105e581ac7a8ab` FOREIGN KEY (`toStageId`) REFERENCES `stages` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `type_customer`
--

DROP TABLE IF EXISTS `type_customer`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `type_customer` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(45) DEFAULT NULL,
  `code` varchar(45) DEFAULT NULL,
  `status` tinyint(4) DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `IDX_f24d146ed895993b40c6abaa21` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `user`
--

DROP TABLE IF EXISTS `user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(45) NOT NULL,
  `status` tinyint(4) NOT NULL,
  `email` varchar(45) DEFAULT NULL,
  `fcmToken` varchar(100) DEFAULT NULL,
  `refreshToken` varchar(200) DEFAULT NULL,
  `password` char(60) DEFAULT NULL,
  `role` enum('admin','avocat','secretaire','client','stagiaire','huissier') NOT NULL DEFAULT 'avocat',
  `last_name` varchar(45) NOT NULL,
  `first_name` varchar(45) NOT NULL,
  `is_online` tinyint(4) NOT NULL DEFAULT 1,
  `lastSeen` timestamp NOT NULL DEFAULT current_timestamp(),
  `employeeId` int(11) DEFAULT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `mfa_enabled` tinyint(4) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `REL_ab4a80281f1e8d524714e00f38` (`employeeId`),
  KEY `IDX_ae07d48a61ca20ab3586d397a7` (`tenant_id`),
  KEY `FK_d72eb2a5bbff4f2533a5d4caff9` (`customer_id`),
  CONSTRAINT `FK_ab4a80281f1e8d524714e00f38f` FOREIGN KEY (`employeeId`) REFERENCES `employee` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_d72eb2a5bbff4f2533a5d4caff9` FOREIGN KEY (`customer_id`) REFERENCES `customer` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `user_notifications`
--

DROP TABLE IF EXISTS `user_notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_notifications` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `notification_id` int(11) NOT NULL,
  `is_read` tinyint(4) NOT NULL DEFAULT 0,
  `read_at` timestamp NULL DEFAULT NULL,
  `is_archived` tinyint(4) NOT NULL DEFAULT 0,
  `is_push_sent` tinyint(4) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `IDX_14c3aac4fa45210bfd61640e67` (`tenant_id`),
  KEY `IDX_ae9b1d1f1fe780ef8e3e7d0c0f` (`user_id`),
  KEY `IDX_0916e1b2f06a900a62ffcb9f59` (`user_id`,`created_at`),
  KEY `IDX_9241723912a3e93d910a4ab303` (`user_id`,`is_read`),
  KEY `FK_944431ae979397c8b56a99bf024` (`notification_id`),
  CONSTRAINT `FK_944431ae979397c8b56a99bf024` FOREIGN KEY (`notification_id`) REFERENCES `notifications` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_ae9b1d1f1fe780ef8e3e7d0c0f6` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `user_role`
--

DROP TABLE IF EXISTS `user_role`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_role` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` tinyint(3) unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(20) NOT NULL,
  `name` varchar(45) NOT NULL,
  `description` text DEFAULT NULL,
  `is_system_role` tinyint(4) NOT NULL DEFAULT 0,
  `status` tinyint(4) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_bfa132218c14efd7e6a0dda31b` (`code`,`tenant_id`),
  KEY `IDX_45a949df1819b8e0040aace0ed` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `user_role_assignment`
--

DROP TABLE IF EXISTS `user_role_assignment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_role_assignment` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `user_id` int(11) NOT NULL,
  `role_id` tinyint(3) unsigned NOT NULL,
  `assigned_at` datetime NOT NULL DEFAULT current_timestamp(),
  `assigned_by` int(11) DEFAULT NULL,
  `status` tinyint(4) DEFAULT NULL,
  PRIMARY KEY (`user_id`,`role_id`),
  KEY `IDX_49afa54c285163be2863f766bc` (`tenant_id`),
  KEY `FK_046365d571408b448f2d0dd43d5` (`role_id`),
  CONSTRAINT `FK_046365d571408b448f2d0dd43d5` FOREIGN KEY (`role_id`) REFERENCES `user_role` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `FK_57177e1785f82f1f628182ec14d` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--


--
-- Table structure for table `user_settings`
--

DROP TABLE IF EXISTS `user_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_settings` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `tenant_id` int(11) NOT NULL DEFAULT 1,
  `id` varchar(36) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `user_theme` varchar(10) NOT NULL DEFAULT 'system',
  `user_font_size` varchar(5) NOT NULL DEFAULT 'md',
  `user_language` varchar(10) NOT NULL DEFAULT 'fr',
  `user_notifications_enabled` tinyint(4) NOT NULL DEFAULT 1,
  `user_email_notifications` tinyint(4) NOT NULL DEFAULT 1,
  `user_in_app_notifications` tinyint(4) NOT NULL DEFAULT 1,
  `user_sidebar_collapsed` tinyint(4) NOT NULL DEFAULT 0,
  `user_items_per_page` int(11) NOT NULL DEFAULT 10,
  `user_default_dashboard` varchar(255) NOT NULL DEFAULT '/dashboard',
  `user_signature` text DEFAULT NULL,
  `user_avatar` text DEFAULT NULL,
  `user_phone` varchar(50) NOT NULL DEFAULT '',
  `notification_preferences` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`notification_preferences`)),
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_4ed056b9344e6f7d8d46ec4b30` (`user_id`),
  UNIQUE KEY `REL_4ed056b9344e6f7d8d46ec4b30` (`user_id`),
  KEY `IDX_15232ccfa286f53cb415abba2f` (`tenant_id`),
  CONSTRAINT `FK_4ed056b9344e6f7d8d46ec4b302` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--

/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-26 18:18:34