/* Banque de mots française — Mot de Passe coop
 * Noms communs concrets, adaptés au jeu de l'indice en un mot.
 * Modifiable librement : ajoutez / retirez des entrées, tout le reste suit.
 */
(function (global) {
  'use strict';

  var WORDS = [
    // — Animaux —
    'chat', 'chien', 'cheval', 'vache', 'mouton', 'chèvre', 'cochon', 'poule',
    'canard', 'lapin', 'souris', 'éléphant', 'girafe', 'lion', 'tigre', 'ours',
    'loup', 'renard', 'singe', 'serpent', 'grenouille', 'tortue', 'papillon',
    'abeille', 'fourmi', 'araignée', 'requin', 'baleine', 'dauphin', 'pingouin',
    'hibou', 'aigle', 'corbeau', 'pigeon', 'écureuil', 'hérisson', 'escargot',
    'crabe', 'poulpe', 'méduse', 'chameau', 'zèbre', 'kangourou', 'crocodile',
    'perroquet', 'hamster', 'taupe', 'chauve-souris', 'libellule', 'coccinelle',
    'castor', 'panda', 'koala', 'flamant', 'autruche', 'sanglier', 'biche',

    // — Maison & objets du quotidien —
    'maison', 'table', 'chaise', 'fenêtre', 'porte', 'escalier', 'toit',
    'cheminée', 'canapé', 'fauteuil', 'armoire', 'tiroir', 'placard', 'lit',
    'oreiller', 'couverture', 'matelas', 'rideau', 'tapis', 'miroir', 'lampe',
    'ampoule', 'bougie', 'horloge', 'réveil', 'téléphone', 'ordinateur',
    'clavier', 'écran', 'télévision', 'radio', 'aspirateur', 'balai', 'éponge',
    'serviette', 'savon', 'brosse', 'peigne', 'ciseaux', 'aiguille', 'bouton',
    'clé', 'serrure', 'cadenas', 'échelle', 'marteau', 'tournevis', 'perceuse',
    'poubelle', 'panier', 'valise', 'sac', 'parapluie', 'ventilateur', 'radiateur',
    'bouteille', 'verre', 'assiette', 'fourchette', 'couteau', 'cuillère',
    'casserole', 'poêle', 'four', 'frigo', 'bouilloire', 'théière', 'tasse',
    'nappe', 'bocal', 'entonnoir', 'passoire', 'ouvre-boîte', 'tire-bouchon',

    // — Nourriture —
    'pain', 'beurre', 'fromage', 'jambon', 'œuf', 'lait', 'yaourt', 'gâteau',
    'chocolat', 'bonbon', 'sucre', 'sel', 'poivre', 'huile', 'vinaigre',
    'moutarde', 'confiture', 'miel', 'farine', 'riz', 'pâtes', 'soupe',
    'salade', 'tomate', 'carotte', 'patate', 'oignon', 'ail', 'poireau',
    'courgette', 'aubergine', 'concombre', 'champignon', 'haricot', 'petit pois',
    'pomme', 'poire', 'banane', 'orange', 'citron', 'fraise', 'framboise',
    'cerise', 'raisin', 'pêche', 'abricot', 'ananas', 'melon', 'pastèque',
    'noix', 'amande', 'olive', 'pizza', 'sandwich', 'crêpe', 'glace', 'biscuit',
    'croissant', 'baguette', 'tarte', 'omelette', 'saucisse', 'steak', 'frite',

    // — Nature & météo —
    'soleil', 'lune', 'étoile', 'nuage', 'pluie', 'neige', 'grêle', 'orage',
    'éclair', 'tonnerre', 'vent', 'brouillard', 'arc-en-ciel', 'ciel', 'horizon',
    'mer', 'océan', 'plage', 'sable', 'vague', 'rivière', 'fleuve', 'lac',
    'cascade', 'source', 'montagne', 'colline', 'vallée', 'falaise', 'grotte',
    'volcan', 'désert', 'forêt', 'arbre', 'branche', 'feuille', 'racine',
    'fleur', 'rose', 'tulipe', 'marguerite', 'tournesol', 'herbe', 'mousse',
    'caillou', 'rocher', 'sapin', 'chêne', 'palmier', 'cactus', 'bambou',
    'île', 'marée', 'glacier', 'boue', 'poussière', 'flaque',

    // — Ville, lieux, transports —
    'ville', 'village', 'rue', 'route', 'autoroute', 'trottoir', 'carrefour',
    'pont', 'tunnel', 'gare', 'aéroport', 'port', 'hôpital', 'école', 'mairie',
    'église', 'château', 'musée', 'théâtre', 'cinéma', 'bibliothèque', 'piscine',
    'stade', 'marché', 'boulangerie', 'pharmacie', 'banque', 'hôtel', 'camping',
    'parc', 'jardin', 'zoo', 'ferme', 'usine', 'bureau', 'chantier', 'garage',
    'voiture', 'vélo', 'moto', 'camion', 'bus', 'train', 'métro', 'tramway',
    'bateau', 'voilier', 'sous-marin', 'avion', 'hélicoptère', 'fusée', 'montgolfière',
    'trottinette', 'ambulance', 'tracteur', 'téléphérique', 'ascenseur',

    // — Vêtements & accessoires —
    'chapeau', 'casquette', 'écharpe', 'gant', 'manteau', 'veste', 'pull',
    'chemise', 'pantalon', 'jupe', 'robe', 'short', 'chaussette', 'chaussure',
    'botte', 'sandale', 'ceinture', 'cravate', 'lunettes', 'montre', 'bague',
    'collier', 'bracelet', 'sac à main', 'portefeuille', 'pyjama', 'maillot',
    'tablier', 'bonnet', 'casque',

    // — Corps humain —
    'tête', 'cheveu', 'oreille', 'nez', 'bouche', 'dent', 'langue', 'lèvre',
    'joue', 'menton', 'front', 'sourcil', 'épaule', 'bras', 'coude', 'main',
    'doigt', 'ongle', 'poignet', 'dos', 'ventre', 'jambe', 'genou', 'pied',
    'talon', 'cœur', 'cerveau', 'poumon', 'estomac', 'squelette', 'muscle',

    // — Métiers & personnes —
    'médecin', 'infirmier', 'pompier', 'policier', 'facteur', 'boulanger',
    'cuisinier', 'serveur', 'coiffeur', 'plombier', 'électricien', 'jardinier',
    'agriculteur', 'pêcheur', 'chauffeur', 'pilote', 'marin', 'soldat',
    'professeur', 'élève', 'étudiant', 'journaliste', 'photographe', 'acteur',
    'chanteur', 'danseur', 'musicien', 'peintre', 'écrivain', 'architecte',
    'avocat', 'juge', 'vétérinaire', 'dentiste', 'astronaute', 'clown',
    'magicien', 'arbitre', 'bibliothécaire', 'fleuriste',

    // — Sports & loisirs —
    'football', 'basket', 'tennis', 'rugby', 'natation', 'course', 'ski',
    'patinage', 'escalade', 'randonnée', 'plongée', 'surf', 'judo', 'boxe',
    'gymnastique', 'équitation', 'pétanque', 'billard', 'échecs', 'puzzle',
    'carte', 'dé', 'ballon', 'raquette', 'filet', 'but', 'médaille', 'trophée',
    'vacances', 'pique-nique', 'anniversaire', 'mariage', 'carnaval', 'feu d\u2019artifice',

    // — Musique, art, école —
    'piano', 'guitare', 'violon', 'batterie', 'flûte', 'trompette', 'harpe',
    'accordéon', 'tambour', 'micro', 'chanson', 'concert', 'orchestre',
    'tableau', 'pinceau', 'peinture', 'crayon', 'stylo', 'gomme', 'règle',
    'cahier', 'livre', 'page', 'dictionnaire', 'journal', 'lettre', 'timbre',
    'enveloppe', 'carte postale', 'affiche', 'photo', 'appareil photo', 'caméra',

    // — Abstrait accessible —
    'amour', 'amitié', 'peur', 'colère', 'joie', 'tristesse', 'surprise',
    'courage', 'silence', 'bruit', 'secret', 'mensonge', 'vérité', 'rêve',
    'souvenir', 'aventure', 'voyage', 'histoire', 'mystère', 'chance',
    'liberté', 'patience', 'énergie', 'vitesse', 'ombre', 'lumière', 'couleur',
    'odeur', 'goût', 'chaleur', 'froid', 'temps', 'argent', 'travail', 'repos',

    // — Divers —
    'robot', 'fantôme', 'dragon', 'sorcière', 'pirate', 'trésor', 'couronne',
    'épée', 'bouclier', 'arc', 'flèche', 'cloche', 'drapeau', 'boussole',
    'plan', 'télescope', 'microscope', 'aimant', 'ressort', 'engrenage',
    'batterie', 'câble', 'prise', 'antenne', 'satellite', 'planète', 'galaxie',
    'météorite', 'squelette', 'momie', 'labyrinthe', 'énigme', 'code', 'alarme'
  ];

  // Déduplication (au cas où une édition manuelle crée un doublon)
  var seen = Object.create(null);
  WORDS = WORDS.filter(function (w) {
    var k = w.toLowerCase();
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  });

  global.WORDS = WORDS;
})(typeof window !== 'undefined' ? window : globalThis);
