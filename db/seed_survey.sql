-- Script pour créer le sondage sur la désinformation
-- Exécuter avec: psql -U postgres -d sondage_db -f db/seed_survey.sql

-- Créer un utilisateur système pour être le créateur du sondage
INSERT INTO users (id, email, password, first_name, last_name, role)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'system@sondagevera.com',
  '$2a$10$XQNhYXnLQqYqYqYqYqYqYeO7YdYqYqYqYqYqYqYqYqYqYqYqYqYqY', -- hash bcrypt de 'system'
  'System',
  'Admin',
  'admin'
) ON CONFLICT (id) DO NOTHING;

-- Créer le sondage sur la désinformation
INSERT INTO surveys (id, title, description, created_by, is_active)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  'Sondage sur la désinformation',
  'Un sondage pour mieux comprendre comment les jeunes perçoivent et réagissent face à la désinformation sur les réseaux sociaux.',
  '00000000-0000-0000-0000-000000000001',
  true
) ON CONFLICT (id) DO NOTHING;

-- Question 1: Reconnaissance de la désinformation
INSERT INTO questions (id, survey_id, question_text, question_type, options, is_required, order_index)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Tu penses que tu sais reconnaître la désinformation quand tu la vois ?',
  'multiple_choice',
  '["Oui, facilement", "Pas vraiment", "Je ne sais pas"]'::jsonb,
  true,
  1
) ON CONFLICT (id) DO NOTHING;

-- Question 2: Fréquence d'exposition
INSERT INTO questions (id, survey_id, question_text, question_type, options, is_required, order_index)
VALUES (
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'À quelle fréquence penses-tu croiser des infos douteuses sur les réseaux ?',
  'multiple_choice',
  '["Tous les jours", "Souvent", "Rarement", "Je ne fais pas attention"]'::jsonb,
  true,
  2
) ON CONFLICT (id) DO NOTHING;

-- Question 3: Réaction face à l'info douteuse
INSERT INTO questions (id, survey_id, question_text, question_type, options, is_required, order_index)
VALUES (
  '20000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001',
  'Quand tu tombes sur une info qui te paraît bizarre, tu fais quoi ?',
  'multiple_choice',
  '["Je vérifie la source", "Je scrolle", "Je partage quand même", "Je demande à quelqu''un"]'::jsonb,
  true,
  3
) ON CONFLICT (id) DO NOTHING;

-- Question 4: Confiance dans les contenus
INSERT INTO questions (id, survey_id, question_text, question_type, options, is_required, order_index)
VALUES (
  '20000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000001',
  'Tu fais confiance à quel type de contenu ?',
  'multiple_choice',
  '["Vidéos explicatives", "Posts viraux", "Créateurs que je suis", "Aucun, je vérifie toujours"]'::jsonb,
  true,
  4
) ON CONFLICT (id) DO NOTHING;

-- Question 5: Vulnérabilité (expérience personnelle)
INSERT INTO questions (id, survey_id, question_text, question_type, options, is_required, order_index)
VALUES (
  '20000000-0000-0000-0000-000000000005',
  '10000000-0000-0000-0000-000000000001',
  'T''es déjà tombé(e) sur une fake news sans t''en rendre compte ?',
  'multiple_choice',
  '["Oui", "Non", "Peut-être"]'::jsonb,
  true,
  5
) ON CONFLICT (id) DO NOTHING;

-- Question 6: Besoins et attentes
INSERT INTO questions (id, survey_id, question_text, question_type, options, is_required, order_index)
VALUES (
  '20000000-0000-0000-0000-000000000006',
  '10000000-0000-0000-0000-000000000001',
  'Qu''est-ce qui t''aiderait à mieux repérer la désinformation ?',
  'multiple_choice',
  '["Alertes / outils", "Explications simples", "Vérification automatique", "Rien, je suis ok"]'::jsonb,
  true,
  6
) ON CONFLICT (id) DO NOTHING;

-- Afficher un message de confirmation
SELECT
  s.title as "Sondage créé",
  COUNT(q.id) as "Nombre de questions"
FROM surveys s
LEFT JOIN questions q ON s.id = q.survey_id
WHERE s.id = '10000000-0000-0000-0000-000000000001'
GROUP BY s.title;
