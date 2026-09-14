/* Banque de mots du Pictionary.
 *
 * Critère unique : ça doit se DESSINER. Pas d'abstractions, pas de mots dont
 * le dessin se réduit à écrire le mot. Trois niveaux, mélangés à parts égales
 * dans une partie.
 */
(function (global) {
  'use strict';

  var FACILE = [
    'soleil', 'maison', 'chat', 'chien', 'arbre', 'fleur', 'voiture', 'bateau',
    'avion', 'poisson', 'étoile', 'cœur', 'lune', 'parapluie', 'chapeau', 'clé',
    'livre', 'pomme', 'banane', 'gâteau', 'ballon', 'lunettes', 'échelle',
    'montre', 'ampoule', 'bougie', 'cadeau', 'porte', 'fenêtre', 'lit', 'chaise',
    'table', 'tasse', 'fourchette', 'couteau', 'nuage', 'pluie', 'montagne',
    'pont', 'escalier', 'tente', 'vélo', 'train', 'fusée', 'robot', 'fantôme',
    'serpent', 'papillon', 'abeille', 'araignée', 'tortue', 'éléphant', 'girafe',
    'oiseau', 'canard', 'cochon', 'vache', 'souris', 'crabe', 'pieuvre',
    'champignon', 'carotte', 'pizza', 'glace', 'bonbon', 'clown', 'couronne',
    'épée', 'drapeau', 'tambour', 'guitare', 'ciseaux', 'marteau', 'brosse',
    'crayon', 'valise', 'sac', 'chaussure', 'chaussette', 'pantalon', 'robe'
  ];

  var MOYEN = [
    'phare', 'moulin', 'château', 'igloo', 'cabane', 'gratte-ciel', 'ascenseur',
    'trampoline', 'balançoire', 'toboggan', 'manège', 'montgolfière',
    'sous-marin', 'hélicoptère', 'tracteur', 'grue', 'ambulance', 'caserne',
    'aquarium', 'cage', 'niche', 'ruche', 'nid', 'toile d’araignée', 'squelette',
    'momie', 'sorcière', 'dragon', 'licorne', 'sirène', 'pirate', 'chevalier',
    'astronaute', 'plongeur', 'pompier', 'cuisinier', 'facteur', 'jongleur',
    'funambule', 'magicien', 'boussole', 'télescope', 'microscope', 'sablier',
    'cadenas', 'trousseau', 'escargot', 'hérisson', 'kangourou', 'chauve-souris',
    'flamant rose', 'caméléon', 'hippocampe', 'méduse', 'requin', 'baleine',
    'dauphin', 'pingouin', 'autruche', 'paon', 'cactus', 'palmier', 'bambou',
    'tournesol', 'champ', 'vague', 'volcan', 'cascade', 'arc-en-ciel', 'iceberg',
    'désert', 'oasis', 'labyrinthe', 'échiquier', 'domino', 'cerf-volant',
    'moulinet', 'hamac', 'brouette', 'arrosoir', 'tondeuse', 'aspirateur',
    'machine à laver', 'grille-pain', 'réveil', 'boîte aux lettres', 'panneau stop',
    'feu rouge', 'passage piéton', 'banc public', 'lampadaire', 'fontaine'
  ];

  var DIFFICILE = [
    'déménagement', 'embouteillage', 'panne de courant', 'grasse matinée',
    'fou rire', 'chute de neige', 'coup de foudre', 'partie de cache-cache',
    'course-poursuite', 'concours de grimaces', 'bataille d’oreillers',
    'pique-nique raté', 'file d’attente', 'feu d’artifice', 'défilé',
    'chasse au trésor', 'saut en parachute', 'plongeon', 'marathon',
    'télésiège', 'escalade', 'camping sauvage', 'partie de pêche',
    'lever de soleil', 'marée basse', 'tempête de sable', 'éclipse',
    'atterrissage', 'décollage', 'réveil difficile', 'ménage de printemps',
    'anniversaire surprise', 'déguisement', 'photo de famille', 'selfie',
    'tour de magie', 'numéro d’équilibriste', 'orchestre', 'chorale',
    'discours', 'remise de médaille', 'arbitre sifflant', 'penalty',
    'panier à trois points', 'crevaison', 'lavage de voiture', 'péage',
    'déjeuner sur l’herbe', 'sieste au soleil', 'bain de minuit'
  ];

  var WORDS = FACILE.concat(MOYEN).concat(DIFFICILE);

  // déduplication de sécurité
  var seen = Object.create(null);
  WORDS = WORDS.filter(function (w) {
    var k = w.toLowerCase();
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  });

  global.PICTO_WORDS = WORDS;
  global.PICTO_LEVELS = { facile: FACILE, moyen: MOYEN, difficile: DIFFICILE };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WORDS: WORDS, FACILE: FACILE, MOYEN: MOYEN, DIFFICILE: DIFFICILE };
  }
})(typeof window !== 'undefined' ? window : globalThis);
