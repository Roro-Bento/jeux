/* Désamorçage — le manuel de l'expert.
 *
 * Les tableaux (séquence, mot de passe, fréquences, symboles) sont générés à
 * partir de games/desamorcage/modules.js : le manuel ne peut donc pas se
 * désynchroniser du code. Les règles en prose, elles, décrivent mot pour mot
 * ce que fait solve() dans chaque module.
 */
(function (global) {
  'use strict';

  var T = global.Modules.tables;

  function dot(color) { return '<span class="swatch sw-' + color + '"></span>'; }
  function colorName(c) { return dot(c) + ' ' + c; }

  // --------------------------------------------------------------- repères
  var reperes = {
    id: 'reperes',
    title: 'Les repères',
    emoji: '🔎',
    html:
      '<p>Trois informations sont écrites sur le boîtier. Le démineur te les lit, et plusieurs ' +
      'règles en dépendent — demande-les dès le début, ça fait gagner du temps.</p>' +
      '<ul class="rules-list">' +
        '<li><b>Le numéro de série</b> : six caractères. Ce qui compte, c’est son <b>dernier chiffre</b> ' +
        '(pair ou impair) et la présence d’une <b>voyelle</b> (A, E ou U).</li>' +
        '<li><b>Les piles</b> : de 0 à 5.</li>' +
        '<li><b>Les voyants</b> : trois étiquettes de trois lettres, chacune <b>allumée</b> ou <b>éteinte</b>. ' +
        'Seules celles qui sont allumées comptent.</li>' +
      '</ul>' +
      '<p class="note">Un module raté ne bloque rien : on peut le retenter. Mais chaque erreur ' +
      'fait <b>accélérer le chrono</b>, et change la table de la séquence lumineuse.</p>'
  };

  // ------------------------------------------------------------------ fils
  var fils = {
    id: 'fils',
    title: 'Les fils',
    emoji: '🔌',
    html:
      '<p>Le démineur t’annonce le <b>nombre</b> de fils puis leurs <b>couleurs dans l’ordre</b>. ' +
      'Un seul fil est à couper. Applique la première règle qui s’applique.</p>' +

      '<h4>3 fils</h4><ol class="rules-num">' +
        '<li>Aucun fil ' + colorName('rouge') + ' → couper le <b>2ᵉ</b>.</li>' +
        '<li>Sinon, si le dernier fil est ' + colorName('blanc') + ' → couper le <b>dernier</b>.</li>' +
        '<li>Sinon, s’il y a plus d’un fil ' + colorName('bleu') + ' → couper le <b>dernier fil bleu</b>.</li>' +
        '<li>Sinon → couper le <b>dernier</b>.</li>' +
      '</ol>' +

      '<h4>4 fils</h4><ol class="rules-num">' +
        '<li>Plus d’un fil ' + colorName('rouge') + ' <b>et</b> dernier chiffre du numéro de série <b>impair</b> → couper le <b>dernier fil rouge</b>.</li>' +
        '<li>Sinon, si le dernier fil est ' + colorName('jaune') + ' <b>et</b> qu’il n’y a aucun fil rouge → couper le <b>1er</b>.</li>' +
        '<li>Sinon, s’il y a exactement un fil ' + colorName('bleu') + ' → couper le <b>1er</b>.</li>' +
        '<li>Sinon, s’il y a plus d’un fil ' + colorName('jaune') + ' → couper le <b>dernier</b>.</li>' +
        '<li>Sinon → couper le <b>2ᵉ</b>.</li>' +
      '</ol>' +

      '<h4>5 fils</h4><ol class="rules-num">' +
        '<li>Le dernier fil est ' + colorName('noir') + ' <b>et</b> dernier chiffre <b>impair</b> → couper le <b>4ᵉ</b>.</li>' +
        '<li>Sinon, s’il y a exactement un fil ' + colorName('rouge') + ' <b>et</b> plus d’un fil ' + colorName('jaune') + ' → couper le <b>1er</b>.</li>' +
        '<li>Sinon, s’il n’y a aucun fil ' + colorName('noir') + ' → couper le <b>2ᵉ</b>.</li>' +
        '<li>Sinon → couper le <b>1er</b>.</li>' +
      '</ol>' +

      '<h4>6 fils</h4><ol class="rules-num">' +
        '<li>Aucun fil ' + colorName('jaune') + ' <b>et</b> dernier chiffre <b>impair</b> → couper le <b>3ᵉ</b>.</li>' +
        '<li>Sinon, s’il y a exactement un fil ' + colorName('jaune') + ' <b>et</b> plus d’un fil ' + colorName('blanc') + ' → couper le <b>4ᵉ</b>.</li>' +
        '<li>Sinon, s’il n’y a aucun fil ' + colorName('rouge') + ' → couper le <b>dernier</b>.</li>' +
        '<li>Sinon → couper le <b>4ᵉ</b>.</li>' +
      '</ol>'
  };

  // ---------------------------------------------------------------- bouton
  var bouton = {
    id: 'bouton',
    title: 'Le bouton',
    emoji: '🔘',
    html:
      '<p>Demande la <b>couleur</b> du bouton et le <b>mot écrit dessus</b>. Applique la première ' +
      'règle qui s’applique, puis suis les instructions.</p>' +
      '<ol class="rules-num">' +
        '<li>Bouton ' + colorName('bleu') + ' marqué « ABANDON » → <b>maintenir</b>.</li>' +
        '<li>Sinon, plus de 2 piles <b>et</b> bouton marqué « DÉTONER » → <b>appuyer et relâcher</b>.</li>' +
        '<li>Sinon, bouton ' + colorName('blanc') + ' <b>et</b> voyant <b>CAR</b> allumé → <b>maintenir</b>.</li>' +
        '<li>Sinon, plus de 3 piles <b>et</b> voyant <b>FRK</b> allumé → <b>appuyer et relâcher</b>.</li>' +
        '<li>Sinon, bouton ' + colorName('jaune') + ' → <b>maintenir</b>.</li>' +
        '<li>Sinon, bouton ' + colorName('rouge') + ' marqué « MAINTENIR » → <b>appuyer et relâcher</b>.</li>' +
        '<li>Sinon → <b>maintenir</b>.</li>' +
      '</ol>' +
      '<p class="note"><b>Appuyer et relâcher</b> : une pression brève, c’est tout.</p>' +
      '<p><b>Maintenir</b> : une bande lumineuse s’allume sur le côté. Le démineur t’annonce sa ' +
      'couleur, et il doit relâcher quand le chrono <b>affiche</b> le chiffre correspondant ' +
      '(n’importe où dans les minutes ou les secondes).</p>' +
      '<table class="man-table"><thead><tr><th>Bande</th><th>Relâcher quand le chrono affiche un…</th></tr></thead><tbody>' +
      T.BANDS.map(function (b) {
        return '<tr><td>' + colorName(b) + '</td><td class="big-digit">' + T.BAND_DIGIT[b] + '</td></tr>';
      }).join('') +
      '</tbody></table>'
  };

  // -------------------------------------------------------------- séquence
  function seqTableHtml() {
    var out = '';
    [['voyelle', 'Le numéro de série contient une voyelle (A, E ou U)'],
     ['sans', 'Le numéro de série ne contient aucune voyelle']].forEach(function (pair) {
      var key = pair[0];
      out += '<h4>' + pair[1] + '</h4>' +
        '<table class="man-table seq-table" data-vowel="' + key + '"><thead><tr>' +
        '<th>Erreurs</th>' + T.SEQ_COLORS.map(function (c) {
          return '<th>' + dot(c) + ' ' + c + ' →</th>';
        }).join('') +
        '</tr></thead><tbody>' +
        T.SEQ_TABLES[key].map(function (row, i) {
          return '<tr data-strikes="' + i + '"><td>' + (i === 2 ? '2 ou +' : i) + '</td>' +
            T.SEQ_COLORS.map(function (c) { return '<td>' + colorName(row[c]) + '</td>'; }).join('') +
            '</tr>';
        }).join('') +
        '</tbody></table>';
    });
    return out;
  }

  var sequence = {
    id: 'sequence',
    title: 'La séquence',
    emoji: '🚦',
    html:
      '<p>Quatre pastilles s’allument en boucle dans un certain ordre. Le démineur ne doit ' +
      '<b>pas</b> appuyer sur les mêmes couleurs : chaque couleur qui clignote se <b>traduit</b> ' +
      'par une autre, et la table de traduction dépend du numéro de série et du <b>nombre ' +
      'd’erreurs déjà commises</b>.</p>' +
      '<p class="note">Une erreur ici remet la séquence à zéro <b>et</b> change la table. ' +
      'Refais la traduction avant de relancer.</p>' +
      seqTableHtml()
  };

  // ---------------------------------------------------------- mot de passe
  var motdepasse = {
    id: 'motdepasse',
    title: 'Le mot de passe',
    emoji: '🔠',
    html:
      '<p>Cinq molettes de six lettres chacune. Un seul mot de cette liste peut être formé — ' +
      'fais-toi lire les lettres <b>de la première molette</b>, élimine, puis demande la suivante.</p>' +
      '<div class="word-grid">' +
      T.PASSWORDS.map(function (w) { return '<span>' + w + '</span>'; }).join('') +
      '</div>'
  };

  // ----------------------------------------------------------------- morse
  function morseAlphabetHtml() {
    return '<div class="morse-grid">' +
      Object.keys(T.MORSE).map(function (l) {
        return '<span><b>' + l.toUpperCase() + '</b> ' + T.MORSE[l].replace(/\./g, '·') + '</span>';
      }).join('') + '</div>';
  }

  var morse = {
    id: 'morse',
    title: 'Le morse',
    emoji: '📻',
    html:
      '<p>Une diode clignote en boucle : <b>court</b> = point, <b>long</b> = trait, et une pause ' +
      'sépare chaque lettre. Décode assez de lettres pour reconnaître le mot, puis donne la ' +
      'fréquence à composer.</p>' +
      '<table class="man-table"><thead><tr><th>Mot</th><th>Fréquence</th></tr></thead><tbody>' +
      T.MORSE_WORDS.map(function (w, i) {
        return '<tr><td>' + w + '</td><td>' + T.FREQS[i] + ' MHz</td></tr>';
      }).join('') +
      '</tbody></table>' +
      '<h4>Alphabet morse</h4>' + morseAlphabetHtml()
  };

  // -------------------------------------------------------------- symboles
  var symboles = {
    id: 'symboles',
    title: 'Le clavier',
    emoji: '🔣',
    html:
      '<p>Quatre symboles. Une <b>seule</b> colonne ci-dessous les contient tous les quatre : ' +
      'trouve-la, puis fais-les presser <b>dans l’ordre de la colonne</b>, de haut en bas.</p>' +
      '<p class="note">Une erreur remet le module à zéro, mais la colonne reste la même.</p>' +
      '<div class="sym-cols">' +
      T.SYMBOL_COLUMNS.map(function (col, i) {
        return '<div class="sym-col"><div class="sym-head">Colonne ' + (i + 1) + '</div>' +
          col.map(function (s) { return '<div class="sym">' + s + '</div>'; }).join('') + '</div>';
      }).join('') +
      '</div>'
  };

  var SECTIONS = [reperes, fils, bouton, sequence, motdepasse, morse, symboles];

  global.Manual = {
    sections: SECTIONS,
    byId: function (id) {
      for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].id === id) return SECTIONS[i];
      return SECTIONS[0];
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
