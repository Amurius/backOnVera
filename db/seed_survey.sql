-- Script pour creer le sondage sur la desinformation
-- Executer avec: psql -U postgres -d sondage_db -f db/seed_survey.sql

-- Variables pour les IDs (utiliser des UUIDs fixes pour pouvoir re-executer le script)
-- Survey ID fixe
DO $$
DECLARE
  survey_uuid UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  user_uuid UUID := '34699f92-3f5a-44a7-9177-1bf79cf70a2a';
BEGIN

  -- Creer le sondage sur la desinformation
  INSERT INTO surveys (id, title, description, created_by, is_active)
  VALUES (
    survey_uuid,
    'Sondage sur la desinformation',
    'Un sondage pour mieux comprendre comment les jeunes percoivent et reagissent face a la desinformation sur les reseaux sociaux.',
    user_uuid,
    true
  ) ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

  -- Question 1: Reconnaissance de la desinformation
  INSERT INTO questions (id, survey_id, question_text, question_type, options, is_required, order_index)
  VALUES (
    'b1000000-0000-0000-0000-000000000001',
    survey_uuid,
    'Tu penses que tu sais reconnaitre la desinformation quand tu la vois ?',
    'multiple_choice',
    '["Oui, facilement", "Pas vraiment", "Je ne sais pas"]'::jsonb,
    true,
    1
  ) ON CONFLICT (id) DO UPDATE SET
    question_text = EXCLUDED.question_text,
    options = EXCLUDED.options;

  -- Question 2: Frequence d'exposition
  INSERT INTO questions (id, survey_id, question_text, question_type, options, is_required, order_index)
  VALUES (
    'b1000000-0000-0000-0000-000000000002',
    survey_uuid,
    'A quelle frequence penses-tu croiser des infos douteuses sur les reseaux ?',
    'multiple_choice',
    '["Tous les jours", "Souvent", "Rarement", "Je ne fais pas attention"]'::jsonb,
    true,
    2
  ) ON CONFLICT (id) DO UPDATE SET
    question_text = EXCLUDED.question_text,
    options = EXCLUDED.options;

  -- Question 3: Reaction face a l'info douteuse
  INSERT INTO questions (id, survey_id, question_text, question_type, options, is_required, order_index)
  VALUES (
    'b1000000-0000-0000-0000-000000000003',
    survey_uuid,
    'Quand tu tombes sur une info qui te parait bizarre, tu fais quoi ?',
    'multiple_choice',
    '["Je verifie la source", "Je scrolle", "Je partage quand meme", "Je demande a quelqu''un"]'::jsonb,
    true,
    3
  ) ON CONFLICT (id) DO UPDATE SET
    question_text = EXCLUDED.question_text,
    options = EXCLUDED.options;

  -- Question 4: Confiance dans les contenus
  INSERT INTO questions (id, survey_id, question_text, question_type, options, is_required, order_index)
  VALUES (
    'b1000000-0000-0000-0000-000000000004',
    survey_uuid,
    'Tu fais confiance a quel type de contenu ?',
    'multiple_choice',
    '["Videos explicatives", "Posts viraux", "Createurs que je suis", "Aucun, je verifie toujours"]'::jsonb,
    true,
    4
  ) ON CONFLICT (id) DO UPDATE SET
    question_text = EXCLUDED.question_text,
    options = EXCLUDED.options;

  -- Question 5: Vulnerabilite (experience personnelle)
  INSERT INTO questions (id, survey_id, question_text, question_type, options, is_required, order_index)
  VALUES (
    'b1000000-0000-0000-0000-000000000005',
    survey_uuid,
    'T''es deja tombe(e) sur une fake news sans t''en rendre compte ?',
    'multiple_choice',
    '["Oui", "Non", "Peut-etre"]'::jsonb,
    true,
    5
  ) ON CONFLICT (id) DO UPDATE SET
    question_text = EXCLUDED.question_text,
    options = EXCLUDED.options;

  -- Question 6: Besoins et attentes
  INSERT INTO questions (id, survey_id, question_text, question_type, options, is_required, order_index)
  VALUES (
    'b1000000-0000-0000-0000-000000000006',
    survey_uuid,
    'Qu''est-ce qui t''aiderait a mieux reperer la desinformation ?',
    'multiple_choice',
    '["Alertes / outils", "Explications simples", "Verification automatique", "Rien, je suis ok"]'::jsonb,
    true,
    6
  ) ON CONFLICT (id) DO UPDATE SET
    question_text = EXCLUDED.question_text,
    options = EXCLUDED.options;

  RAISE NOTICE 'Sondage et questions crees avec succes!';
  RAISE NOTICE 'Survey ID: %', survey_uuid;
  RAISE NOTICE 'User ID: %', user_uuid;

END $$;

-- Afficher un message de confirmation
SELECT
  s.id as "Survey ID",
  s.title as "Sondage cree",
  COUNT(q.id) as "Nombre de questions"
FROM surveys s
LEFT JOIN questions q ON s.id = q.survey_id
WHERE s.id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
GROUP BY s.id, s.title;
