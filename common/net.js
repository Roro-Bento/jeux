/* Couche réseau — Mot de Passe coop
 *
 * Deux transports interchangeables :
 *   - "peer"  : WebRTC via PeerJS (broker public) → jeu à distance, 100 % statique
 *   - "local" : BroadcastChannel → deux onglets du même navigateur (dev / test)
 *               activé avec ?local=1 dans l'URL
 */
(function (global) {
  'use strict';

  var PREFIX = 'motdepasse-coop-v1-';

  /* Serveur de mise en relation.
   * Par défaut : le broker public gratuit de PeerJS (aucune config, aucun compte).
   * Si vous hébergez votre propre PeerServer, remplacez par :
   *   var PEER_OPTIONS = { host: 'peer.mondomaine.fr', port: 443, secure: true, path: '/' };
   * Rien d'autre à changer : le trafic de jeu reste en direct entre les deux joueurs. */
  var PEER_OPTIONS = { debug: 0 };

  function peerOpts(extra) {
    var o = {};
    for (var k in PEER_OPTIONS) o[k] = PEER_OPTIONS[k];
    for (var j in (extra || {})) o[j] = extra[j];
    return o;
  }
  var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I, O, 0, 1

  function makeCode(len) {
    len = len || 4;
    var out = '';
    var buf = new Uint32Array(len);
    if (global.crypto && global.crypto.getRandomValues) global.crypto.getRandomValues(buf);
    for (var i = 0; i < len; i++) {
      var r = buf[i] || Math.floor(Math.random() * 0xffffffff);
      out += ALPHABET[r % ALPHABET.length];
    }
    return out;
  }

  function normalizeCode(code) {
    return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  }

  // ------------------------------------------------------------ mode local
  function localConnection(role, code, h) {
    var chan = new BroadcastChannel(PREFIX + code);
    var open = false;
    var api = {
      role: role, code: code, mode: 'local',
      send: function (obj) { chan.postMessage({ from: role, payload: obj }); },
      close: function () { try { chan.postMessage({ from: role, bye: true }); chan.close(); } catch (e) {} }
    };
    chan.onmessage = function (ev) {
      var m = ev.data;
      if (!m || m.from === role) return;
      if (m.hello) {
        if (role === 'host') { chan.postMessage({ from: 'host', welcome: true }); }
        if (!open) { open = true; h.onPeerJoin && h.onPeerJoin(); }
        return;
      }
      if (m.welcome) {
        if (!open) { open = true; h.onPeerJoin && h.onPeerJoin(); }
        return;
      }
      if (m.bye) { h.onPeerLeave && h.onPeerLeave(); return; }
      if (m.payload) h.onData && h.onData(m.payload);
    };
    setTimeout(function () {
      h.onReady && h.onReady(code);
      if (role === 'guest') chan.postMessage({ from: 'guest', hello: true });
    }, 0);
    return api;
  }

  // ------------------------------------------------------------- mode PeerJS
  function ensurePeerJs() {
    return new Promise(function (resolve, reject) {
      if (global.Peer) return resolve();
      var tries = [
        'https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js',
        'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js',
        'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js'
      ];
      (function next(i) {
        if (i >= tries.length) return reject(new Error('peerjs'));
        var s = document.createElement('script');
        s.src = tries[i];
        s.onload = function () { global.Peer ? resolve() : next(i + 1); };
        s.onerror = function () { next(i + 1); };
        document.head.appendChild(s);
      })(0);
    });
  }

  function peerHost(code, h) {
    var api = { role: 'host', code: code, mode: 'peer', send: noop, close: noop };
    var conn = null, peer = null, attempts = 0;

    ensurePeerJs().then(boot).catch(function () {
      h.onError && h.onError('Impossible de charger PeerJS (connexion réseau ?).');
    });

    function boot() {
      var current = code;
      function tryId(id) {
        peer = new global.Peer(PREFIX + id, peerOpts());
        peer.on('open', function () {
          api.code = id;
          h.onReady && h.onReady(id);
        });
        peer.on('connection', function (c) {
          if (conn && conn.open) { c.close(); return; }
          conn = c;
          api.send = function (obj) { try { conn.send(obj); } catch (e) {} };
          c.on('open', function () { h.onPeerJoin && h.onPeerJoin(); });
          c.on('data', function (d) { h.onData && h.onData(d); });
          c.on('close', function () { h.onPeerLeave && h.onPeerLeave(); });
        });
        peer.on('error', function (err) {
          if (err && err.type === 'unavailable-id' && attempts < 4) {
            attempts++;
            try { peer.destroy(); } catch (e) {}
            current = makeCode(4);
            tryId(current);
            return;
          }
          if (err && err.type === 'peer-unavailable') return;
          h.onError && h.onError(peerErrorMessage(err));
        });
      }
      tryId(current);
      api.close = function () { try { peer && peer.destroy(); } catch (e) {} };
    }
    return api;
  }

  function peerGuest(code, h) {
    var api = { role: 'guest', code: code, mode: 'peer', send: noop, close: noop };
    var peer = null, conn = null, settled = false;

    ensurePeerJs().then(boot).catch(function () {
      h.onError && h.onError('Impossible de charger PeerJS (connexion réseau ?).');
    });

    function boot() {
      peer = new global.Peer(undefined, peerOpts());
      api.close = function () { try { peer && peer.destroy(); } catch (e) {} };
      peer.on('open', function () {
        h.onReady && h.onReady(code);
        conn = peer.connect(PREFIX + code, { reliable: true });
        api.send = function (obj) { try { conn.send(obj); } catch (e) {} };
        conn.on('open', function () { settled = true; h.onPeerJoin && h.onPeerJoin(); });
        conn.on('data', function (d) { h.onData && h.onData(d); });
        conn.on('close', function () { h.onPeerLeave && h.onPeerLeave(); });
        setTimeout(function () {
          if (!settled) h.onError && h.onError('Room introuvable. Vérifie le code.');
        }, 12000);
      });
      peer.on('error', function (err) {
        if (err && err.type === 'peer-unavailable') {
          h.onError && h.onError('Room introuvable. Vérifie le code.');
          return;
        }
        h.onError && h.onError(peerErrorMessage(err));
      });
    }
    return api;
  }

  function peerErrorMessage(err) {
    var t = err && err.type;
    if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') {
      return 'Connexion au serveur de mise en relation perdue.';
    }
    if (t === 'browser-incompatible') return 'Navigateur incompatible avec WebRTC.';
    if (t === 'webrtc') return 'La connexion directe a échoué (pare-feu / réseau restreint ?).';
    return 'Erreur réseau' + (t ? ' (' + t + ')' : '') + '.';
  }

  function noop() {}

  function isLocalMode() {
    try {
      return /(?:\?|&)local=1(?:&|$)/.test(global.location.search) &&
        typeof BroadcastChannel !== 'undefined';
    } catch (e) { return false; }
  }

  var API = {
    makeCode: makeCode,
    normalizeCode: normalizeCode,
    isLocalMode: isLocalMode,
    host: function (code, h) {
      return isLocalMode() ? localConnection('host', code, h) : peerHost(code, h);
    },
    join: function (code, h) {
      return isLocalMode() ? localConnection('guest', code, h) : peerGuest(code, h);
    }
  };

  global.Net = API;
})(typeof window !== 'undefined' ? window : globalThis);
