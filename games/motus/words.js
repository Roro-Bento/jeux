/* Motus — banque de mots, rangee par longueur.
 *
 * Trois regles pour cette banque :
 *   - des mots courants au singulier — noms, quelques adjectifs — qu'on devine
 *     sans dictionnaire ;
 *   - ecrits SANS accent (le jeu se joue en lettres nues, comme a la tele :
 *     on tape FORET, pas FORÊT) ;
 *   - ni nom propre, ni pluriel, ni verbe conjugue.
 *
 * Elle est ecrite par games/motus/words.js et relue par test/motus.test.js, qui
 * verifie longueur, alphabet et doublons.
 */
(function (global) {
  'use strict';

  var WORDS = {
    4: [
      'AILE', 'AINE', 'AMIE', 'ANGE', 'ARME', 'AUBE', 'AVIS', 'BAIN', 'BANC', 'BRAS', 'CAGE',
      'CAMP', 'CAVE', 'CHAT', 'CHEF', 'CIEL', 'CIME', 'CLEF', 'COIN', 'COTE', 'COUP',
      'COUR', 'CUBE', 'CUIR', 'DAME', 'DATE', 'DENT', 'DOSE', 'DUEL', 'ECHO', 'ELAN', 'ETUI',
      'FACE', 'FAIT', 'FARD', 'FAUX', 'FIER', 'FILM', 'FILS', 'FOIN', 'FOIS', 'FOND', 'FOUR',
      'GANT', 'GARE', 'GOUT', 'GRAS', 'HAIE', 'HALO', 'HERO', 'HOTE', 'HUIT', 'IDEE', 'ILOT',
      'JOUE', 'JOUR', 'JUPE', 'LAIT', 'LAME', 'LION', 'LOUP', 'LUGE', 'LUNE',
      'MAIN', 'MAIS', 'MENU', 'MIEL', 'MINE', 'MOIS', 'MONT', 'MOTO', 'MULE', 'MURE', 'NAGE',
      'NEUF', 'NOIR', 'NOTE', 'NUIT', 'OEUF', 'ONDE', 'OURS', 'PAGE', 'PAIN', 'PAIX',
      'PARC', 'PARI', 'PATE', 'PEAU', 'PERE', 'PEUR', 'PIED', 'PILE', 'PION', 'PLAT', 'PLIE',
      'POIL', 'PONT', 'PORT', 'POSE', 'PUCE', 'QUAI', 'RAGE', 'RAIE', 'RAIL', 'RANG', 'RATE',
      'RIVE', 'ROBE', 'ROSE', 'ROUE', 'RUNE', 'SAUT', 'SEAU', 'SEIN', 'SENS', 'SEUL',
      'SOIE', 'SOIF', 'SOIR', 'SOLE', 'SORT', 'SUIE', 'TALC', 'TAXI', 'TETE', 'THON',
      'TIGE', 'TOIT', 'TOUR', 'TRIO', 'TROU', 'TUBE', 'VASE', 'VEAU', 'VELO', 'VENT', 'VERS',
      'VERT', 'VIDE', 'VOIE', 'VOIX', 'VRAI', 'ZONE'
    ],
    5: [
      'ACIER', 'AIGLE', 'ALBUM', 'ALLEE', 'AMOUR', 'ANNEE', 'APPEL', 'ARBRE', 'ARENE', 'ARRET',
      'ASILE', 'ATOME', 'AVION', 'BAGUE', 'BALAI', 'BANDE', 'BARBE', 'BARGE', 'BATON', 'BILLE',
      'BLANC', 'BLOND', 'BOEUF', 'BOITE', 'BOMBE', 'BOULE', 'BRAVO', 'BRUIT', 'BRUME', 'BUCHE',
      'BULLE', 'CABLE', 'CADRE', 'CALME', 'CANAL', 'CANNE', 'CARRE', 'CARTE', 'CAUSE', 'CHAIR',
      'CHAMP', 'CHANT', 'CHAUD', 'CHIEN', 'CHOIX', 'CHOSE', 'CIBLE', 'COEUR', 'COLLE', 'COMTE',
      'CONTE', 'CORDE', 'CORPS', 'COTON', 'COUDE', 'COURS', 'CRABE', 'CRAIE', 'CREME', 'CREUX',
      'CRISE', 'CROIX', 'CYGNE', 'DANSE', 'DATTE', 'DEBUT', 'DECOR', 'DELAI', 'DESIR', 'DETTE',
      'DIGUE', 'DINDE', 'DOIGT', 'DRAME', 'DROIT', 'ECOLE', 'ECRAN', 'EFFET', 'EGOUT', 'ELEVE',
      'EMAIL', 'ENFER', 'ENGIN', 'ENVIE', 'EPICE', 'EPINE', 'ETAGE', 'ETANG', 'EXODE', 'FAUTE',
      'FERME', 'FIBRE', 'FICHE', 'FIGUE', 'FILET', 'FLEUR', 'FLUTE', 'FOIRE', 'FONTE', 'FORCE',
      'FORET', 'FOULE', 'FOYER', 'FREIN', 'FRERE', 'FROID', 'FRUIT', 'FUMEE', 'GARDE', 'GEANT',
      'GENOU', 'GESTE', 'GIVRE', 'GLACE', 'GOMME', 'GORGE', 'GRAIN', 'GRAND', 'GRAVE', 'GRIVE',
      'GUIDE', 'HACHE', 'HERBE', 'HEURE', 'HIVER', 'HOTEL', 'HUILE', 'IDEAL', 'IMAGE', 'INDEX',
      'JAMBE', 'JAUNE', 'JETON', 'JEUNE', 'JOUET', 'JUPON', 'LAINE', 'LAMPE', 'LANCE', 'LAPIN',
      'LARGE', 'LARME', 'LEVRE', 'LIGNE', 'LIMON', 'LINGE', 'LISTE', 'LITRE', 'LIVRE', 'LOUPE',
      'LUEUR', 'LUTTE', 'LYCEE', 'MAGIE', 'MAIRE', 'MALLE', 'MARIN', 'MASSE', 'MATCH', 'MELON',
      'MERLE', 'METAL', 'METRE', 'MILAN', 'MINCE', 'MOINE', 'MONDE', 'MORSE', 'MOTIF', 'MOULE',
      'MUSEE', 'NAPPE', 'NAVET', 'NEIGE', 'NEVEU', 'NICHE', 'NOEUD', 'NORME', 'NOYAU', 'NOYER',
      'NUAGE', 'OASIS', 'OCEAN', 'OCTET', 'ODEUR', 'OFFRE', 'OGIVE', 'OLIVE', 'OMBRE', 'ONCLE',
      'ONGLE', 'OPERA', 'ORAGE', 'ORDRE', 'ORGUE', 'ORTIE', 'OUTIL', 'PAIRE', 'PANNE', 'PATIN',
      'PATTE', 'PAUME', 'PAUSE', 'PECHE', 'PEINE', 'PERLE', 'PESTE', 'PETIT', 'PHARE', 'PIANO',
      'PIECE', 'PIEGE', 'PINCE', 'PISTE', 'PLAGE', 'PLAIE', 'PLUIE', 'PLUME', 'POCHE', 'POEME',
      'POIDS', 'POING', 'POIRE', 'POMME', 'PORTE', 'POSTE', 'POUCE', 'POULE', 'PRISE', 'PROIE',
      'PRUNE', 'PUITS', 'QUEUE', 'RADIO', 'RAMPE', 'RATON', 'RAYON', 'REGLE', 'REINE', 'RENNE',
      'REPAS', 'RESTE', 'RHUME', 'RIVAL', 'ROBOT', 'ROCHE', 'ROMAN', 'RONCE', 'ROUGE', 'ROUTE',
      'RUBAN', 'RUCHE', 'RUINE', 'SABLE', 'SABOT', 'SABRE', 'SALLE', 'SALON', 'SAUCE', 'SAULE',
      'SAUNA', 'SAVON', 'SCENE', 'SELLE', 'SERRE', 'SIEGE', 'SIGNE', 'SIROP', 'SOEUR', 'SOLDE',
      'SOMME', 'SONGE', 'SOUCI', 'SOUPE', 'SPORT', 'STADE', 'STYLE', 'SUCRE', 'SUITE', 'TABLE',
      'TACHE', 'TALON', 'TAPIS', 'TASSE', 'TAUPE', 'TEMPS', 'TENTE', 'TERRE', 'TEXTE', 'THEME',
      'TIGRE', 'TISSU', 'TITRE', 'TOILE', 'TOMBE', 'TONNE', 'TORSE', 'TOTAL', 'TRACE', 'TRAIN',
      'TRAIT', 'TRIBU', 'TRONC', 'TRUIE', 'TUILE', 'USINE', 'VACHE', 'VAGUE', 'VALSE', 'VENIN',
      'VERBE', 'VERRE', 'VESTE', 'VIGNE', 'VILLE', 'VIRUS', 'VISON', 'VITRE', 'VOILE', 'VOLET',
      'ZEBRE'
    ],
    6: [
      'AMANDE', 'ANANAS', 'ANIMAL', 'ANNEAU', 'ARCHET', 'AUTEUR', 'AVENIR', 'BAGAGE', 'BALCON',
      'BALLON', 'BAMBOU', 'BANANE', 'BANQUE', 'BARQUE', 'BATEAU', 'BEURRE', 'BOUCLE', 'BOUGIE',
      'BOULET', 'BOUTON', 'BRIQUE', 'BROSSE', 'BUREAU', 'CACHET', 'CADEAU', 'CAHIER', 'CAMION',
      'CANARD', 'CAPOTE', 'CARAFE', 'CARTON', 'CASIER', 'CASQUE', 'CASTOR', 'CAVEAU', 'CERISE',
      'CHAINE', 'CHAISE', 'CHALET', 'CHANCE', 'CHARME', 'CHEMIN', 'CHEQUE', 'CHEVAL', 'CIMENT',
      'CINEMA', 'CIRAGE', 'CISEAU', 'CITRON', 'CLIENT', 'CLOCHE', 'COLERE', 'COMBAT', 'COMETE',
      'COMPAS', 'CONFIT', 'COPAIN', 'CORAIL', 'COTEAU', 'COUPLE', 'COURSE', 'COUSIN', 'CRAYON',
      'CRIQUE', 'CUISSE', 'CUIVRE', 'DANGER', 'DESERT', 'DESSIN', 'DETAIL', 'DIABLE', 'DINDON',
      'DOMINO', 'DOUANE', 'ECLAIR', 'ECURIE', 'EGLISE', 'EMPIRE', 'ENCLOS', 'ENFANT', 'ENIGME',
      'ENTREE', 'EPAULE', 'EPONGE', 'EQUIPE', 'ERREUR', 'ESCALE', 'ESPACE', 'ESPOIR', 'ETABLE',
      'ETOILE', 'FARINE', 'FAUCON', 'FESTIN', 'FIGURE', 'FLACON', 'FLECHE', 'FLEUVE', 'FORMAT',
      'FRAISE', 'FUSEAU', 'GARAGE', 'GARCON', 'GATEAU', 'GELULE', 'GIRAFE', 'GLACON', 'GOUTTE',
      'GRANGE', 'GRELON', 'GRILLE', 'GROTTE', 'GROUPE', 'GUIDON', 'HAMEAU', 'HANGAR', 'HARENG',
      'HELICE', 'HOMARD', 'IMPACT', 'JARDIN', 'JUMEAU', 'JUNGLE', 'LAITUE', 'LANGUE', 'LEGUME',
      'LETTRE', 'LEZARD', 'LIERRE', 'LIMACE', 'MAISON', 'MANCHE', 'MANEGE', 'MANGUE', 'MARBRE',
      'MARCHE', 'MASQUE', 'MENAGE', 'MENTON', 'MESURE', 'METIER', 'MEUBLE', 'MINUIT', 'MIROIR',
      'MOMENT', 'MOTEUR', 'MOUCHE', 'MOULIN', 'MOUSSE', 'MOUTON', 'NAVIRE', 'NECTAR', 'NOMBRE',
      'NOUGAT', 'OISEAU', 'ORANGE', 'ORTEIL', 'PALAIS', 'PANIER', 'PAPIER', 'PARENT', 'PARFUM',
      'PAROLE', 'PARTIE', 'PATRON', 'PEIGNE', 'PERSIL', 'PETALE', 'PIGEON', 'PILIER', 'PILOTE',
      'PIRATE', 'PLANTE', 'POIVRE', 'POTAGE', 'POULET', 'POUPEE', 'PRINCE', 'PROJET', 'PUZZLE',
      'QUARTZ', 'RACINE', 'RADEAU', 'RAISIN', 'RAMEAU', 'REGARD', 'REGION', 'RENARD', 'REQUIN',
      'RESEAU', 'REVEIL', 'RIDEAU', 'RIVAGE', 'ROCHER', 'ROSIER', 'SALADE', 'SAUMON', 'SAVANE',
      'SEANCE', 'SECRET', 'SEJOUR', 'SIRENE', 'SOLEIL', 'SOMMET', 'SORTIE', 'SOUPIR', 'SOURCE',
      'SOURIS', 'TAILLE', 'TENNIS', 'TIMBRE', 'TIROIR', 'TOMATE', 'TORTUE', 'TOURTE', 'TRAJET',
      'TRESOR', 'TROUPE', 'TULIPE', 'TUNNEL', 'VALISE', 'VALLEE', 'VEILLE', 'VERGER', 'VERNIS',
      'VIANDE', 'VIOLON', 'VIRAGE', 'VISAGE', 'VOISIN', 'VOLANT', 'VOYAGE'
    ],
    7: [
      'ABRICOT', 'AMPOULE', 'ANTENNE', 'ARDOISE', 'ARMOIRE', 'ARTICLE', 'ATELIER', 'BALEINE',
      'BANQUET', 'BISCUIT', 'BOUCHON', 'BOUQUET', 'BRANCHE', 'BRIQUET', 'CABANON', 'CADENAS',
      'CARAMEL', 'CAROTTE', 'CHAPEAU', 'CHARBON', 'CHARIOT', 'CHATEAU', 'CHEMISE', 'CHEVEUX',
      'CHIFFRE', 'CITERNE', 'CLAVIER', 'COLLINE', 'COLOMBE', 'CONCERT', 'CONFORT', 'CORBEAU',
      'COUPOLE', 'COURANT', 'COUTEAU', 'CRAVATE', 'CUISINE', 'CYMBALE', 'DAUPHIN', 'DIAMANT',
      'DIPLOME', 'DOSSIER', 'DRAPEAU', 'ECHARPE', 'ECHELLE', 'ECLIPSE', 'ETAGERE', 'FACTEUR',
      'FALAISE', 'FAMILLE', 'FANFARE', 'FANTOME', 'FENETRE', 'FEUILLE', 'FICELLE', 'FIGUIER',
      'FLAMANT', 'FORTUNE', 'FOUGERE', 'FROMAGE', 'GALERIE', 'GARDIEN', 'GAZELLE', 'GOELAND',
      'GOUFFRE', 'GRAVURE', 'GRENIER', 'GUEPARD', 'GUICHET', 'GUITARE', 'HAMSTER', 'HARICOT',
      'HORIZON', 'HORLOGE', 'JOURNAL', 'JUMELLE', 'LAITAGE', 'LEOPARD', 'LUMIERE', 'LUNETTE',
      'MACHINE', 'MAGASIN', 'MAILLOT', 'MANTEAU', 'MARMITE', 'MARTEAU', 'MATELAS', 'MELODIE',
      'MESSAGE', 'MOISSON', 'MONNAIE', 'MORCEAU', 'MOUETTE', 'MOUSSON', 'MUSIQUE', 'NOUILLE',
      'NOUVEAU', 'PALMIER', 'PANNEAU', 'PARASOL', 'PARQUET', 'PASSAGE', 'PAYSAGE', 'PECHEUR',
      'PELOUSE', 'PENDULE', 'PINCEAU', 'PISCINE', 'PLACARD', 'PLAFOND', 'PLANETE', 'PLATEAU',
      'POIVRON', 'POMMIER', 'POTAGER', 'POUSSIN', 'PRAIRIE', 'PRUNIER', 'RECOLTE', 'REPAIRE',
      'RIVIERE', 'ROULEAU', 'SARDINE', 'SEMELLE', 'SENTIER', 'SERPENT', 'SERVICE', 'SILENCE',
      'SOURIRE', 'SPATULE', 'SUCETTE', 'TABLEAU', 'TABLIER', 'TAMBOUR', 'TARTINE', 'TEMPETE',
      'TERRIER', 'TONNEAU', 'TORRENT', 'TOURNOI', 'TRUELLE', 'VELOURS', 'VERGLAS', 'VILLAGE',
      'VITRAIL', 'VOITURE'
    ]
  };

  // longueurs reellement jouables : il faut assez de mots pour ne pas tourner en rond
  var LENGTHS = Object.keys(WORDS).map(Number).filter(function (n) { return WORDS[n].length >= 30; });

  global.MOTUS_WORDS = WORDS;
  global.MOTUS_LENGTHS = LENGTHS;
  if (typeof module !== 'undefined' && module.exports) module.exports = { WORDS: WORDS, LENGTHS: LENGTHS };
})(typeof window !== 'undefined' ? window : globalThis);
