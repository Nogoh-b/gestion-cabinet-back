/*
 * Visionneuse d'export hors-ligne (format 1, cf. EXPORT_FORMAT.md).
 * JS vanilla, aucune dépendance, fonctionne en file://.
 * Tout le contenu issu des données est inséré via des nœuds texte (jamais
 * interprété comme du HTML).
 */
(function () {
  'use strict';

  var EXPORT = window.__EXPORT__ || { dossiers: [] };
  var manifest = EXPORT.manifest;
  var app = document.getElementById('app');
  var DASH = '—';

  /* ---------- Utilitaires DOM ---------- */

  function append(el, children) {
    children.flat(Infinity).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    });
  }

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    append(el, Array.prototype.slice.call(arguments, 2));
    return el;
  }

  /** Lien vers un fichier du ZIP : chemin relatif, jamais absolu ni remontant. */
  function fileHref(path) {
    if (typeof path !== 'string' || !path || path.charAt(0) === '/') return null;
    var parts = path.split('/');
    if (parts.indexOf('..') !== -1) return null;
    return parts.map(encodeURIComponent).join('/');
  }

  function fileLink(path, label, attrs) {
    var href = fileHref(path);
    if (!href) return label;
    return h('a', Object.assign({ href: href, target: '_blank', rel: 'noopener' }, attrs), label);
  }

  /* ---------- Formats ---------- */

  function txt(v) {
    return v === null || v === undefined || v === '' ? DASH : String(v);
  }

  function fmtDate(v) {
    if (!v) return DASH;
    var s = String(v);
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return m[3] + '/' + m[2] + '/' + m[1];
    var d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleDateString('fr-FR');
  }

  function fmtDateTime(v) {
    if (!v) return DASH;
    var s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return fmtDate(s);
    var d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function fmtMoney(n, currency) {
    if (n === null || n === undefined || n === '') return DASH;
    var value = Number(n);
    if (isNaN(value)) return String(n);
    try {
      return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currency || 'XAF' }).format(value);
    } catch (e) {
      return new Intl.NumberFormat('fr-FR').format(value) + (currency ? ' ' + currency : '');
    }
  }

  function fmtNumber(n) {
    if (n === null || n === undefined || n === '') return DASH;
    var value = Number(n);
    return isNaN(value) ? String(n) : new Intl.NumberFormat('fr-FR').format(value);
  }

  function fmtPercent(n) {
    return n === null || n === undefined ? DASH : fmtNumber(n) + ' %';
  }

  function fmtSize(n) {
    if (n === null || n === undefined) return DASH;
    var value = Number(n);
    if (isNaN(value)) return DASH;
    if (value < 1024) return value + ' o';
    if (value < 1048576) return (value / 1024).toFixed(1).replace('.', ',') + ' Ko';
    return (value / 1048576).toFixed(1).replace('.', ',') + ' Mo';
  }

  /** Minuscules sans accents, pour le filtre texte. */
  function norm(s) {
    return String(s === null || s === undefined ? '' : s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  }

  function badge(label, tone) {
    return label ? h('span', { class: 'badge' + (tone ? ' ' + tone : '') }, label) : null;
  }

  function sub(text) {
    return text ? h('span', { class: 'sub' }, text) : null;
  }

  function pre(text) {
    return text ? h('p', { class: 'pre' }, text) : null;
  }

  /* ---------- Filtre texte ---------- */

  /**
   * Barre de filtre : masque les éléments `.item` du conteneur dont le texte
   * affiché (ou `data-search`) ne contient pas tous les mots saisis.
   */
  function filterable(placeholder, content) {
    var input = h('input', { type: 'search', placeholder: placeholder, 'aria-label': placeholder, autocomplete: 'off' });
    var count = h('span', { class: 'count' });
    var empty = h('p', { class: 'notice', hidden: true }, 'Aucun résultat pour cette recherche.');
    var box = h('div', null, content, empty);

    function apply() {
      var terms = norm(input.value).split(/\s+/).filter(Boolean);
      var items = Array.prototype.slice.call(box.querySelectorAll('.item'));
      var shown = 0;
      items.forEach(function (el) {
        if (el._search === undefined) el._search = norm(el.getAttribute('data-search') || el.textContent);
        var ok = terms.every(function (t) { return el._search.indexOf(t) !== -1; });
        el.hidden = !ok;
        if (ok) shown++;
      });
      count.textContent = items.length
        ? (terms.length ? shown + ' sur ' + items.length : items.length + (items.length > 1 ? ' lignes' : ' ligne'))
        : '';
      empty.hidden = !(items.length && shown === 0);
    }

    input.addEventListener('input', apply);
    apply();
    return h('div', null, h('div', { class: 'toolbar' }, input, count), box);
  }

  /* ---------- Tableaux ---------- */

  /** columns : [{ label, cell(row) -> nœud|texte, num? }] ; chaque ligne est un `.item`. */
  function table(columns, rows, emptyText) {
    if (!rows || !rows.length) return h('p', { class: 'notice' }, emptyText || 'Aucune donnée.');
    return h('div', { class: 'table-wrap' },
      h('table', null,
        h('thead', null, h('tr', null, columns.map(function (c) {
          return h('th', { class: c.num ? 'num' : null }, c.label);
        }))),
        h('tbody', null, rows.map(function (row) {
          return h('tr', { class: 'item' }, columns.map(function (c) {
            return h('td', { class: c.num ? 'num' : null }, c.cell(row));
          }));
        }))));
  }

  function definitionList(pairs) {
    var shown = pairs.filter(function (p) { return p[1] !== null && p[1] !== undefined && p[1] !== ''; });
    return h('dl', { class: 'grid' }, shown.map(function (p) {
      return [h('dt', null, p[0]), h('dd', null, p[1])];
    }));
  }

  /* ---------- Chargement des données ---------- */

  var loading = {};

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Fichier introuvable : ' + src)); };
      document.head.append(s);
    });
  }

  function findDossier(id) {
    return (EXPORT.dossiers || []).filter(function (d) { return Number(d.id) === id; })[0] || null;
  }

  /** Charge `data/dossier-<id>.js` (chemin lu dans le manifeste) à la première ouverture. */
  function loadDossier(id) {
    var existing = findDossier(id);
    if (existing) return Promise.resolve(existing);
    var entry = (manifest.dossiers || []).filter(function (e) { return Number(e.id) === id; })[0];
    if (!entry) return Promise.resolve(null);
    var src = fileHref(entry.data);
    if (!src) return Promise.reject(new Error('Chemin de données invalide.'));
    if (!loading[id]) {
      loading[id] = loadScript(src).then(function () {
        var d = findDossier(id);
        if (!d) throw new Error('Données du dossier ' + id + ' illisibles.');
        return d;
      });
      loading[id].catch(function () { delete loading[id]; });
    }
    return loading[id];
  }

  /* ---------- Page d'accueil ---------- */

  function dossierHref(id, tab) {
    return '#/dossier/' + encodeURIComponent(id) + (tab ? '/' + tab : '');
  }

  function renderHome() {
    var entries = manifest.dossiers || [];
    document.title = (manifest.cabinet && manifest.cabinet.name ? manifest.cabinet.name + ' — ' : '') + 'Export de dossiers';
    var cabinet = manifest.cabinet || {};
    var intro = h('div', null,
      h('h1', null, cabinet.name || 'Export de dossiers'),
      h('p', { class: 'muted' },
        'Export du ' + fmtDateTime(manifest.generated_at) + ' · ' + entries.length + (entries.length > 1 ? ' dossiers' : ' dossier')),
      definitionList([
        ['Adresse', cabinet.address],
        ['E-mail', cabinet.email],
        ['Téléphone', cabinet.phone],
        ['Site web', cabinet.website],
      ]));

    var list = table([
      { label: 'Dossier', cell: function (e) { return h('a', { href: dossierHref(e.id) }, txt(e.dossier_number)); } },
      { label: 'Client', cell: function (e) { return txt(e.client); } },
      { label: 'Objet', cell: function (e) { return txt(e.object); } },
      { label: 'Statut', cell: function (e) { return badge(e.status) || DASH; } },
      { label: 'Ouverture', cell: function (e) { return fmtDate(e.opening_date); } },
    ], entries, 'Aucun dossier dans cet export.');
    // Recherche : numéro, client, objet.
    Array.prototype.forEach.call(list.querySelectorAll('tr.item'), function (tr, i) {
      var e = entries[i];
      tr.setAttribute('data-search', [e.dossier_number, e.client, e.object].join(' '));
    });
    app.replaceChildren(intro, filterable('Rechercher un numéro, un client, un objet…', list));
  }

  /* ---------- Page dossier ---------- */

  var TABS = [
    { key: 'fiche', label: 'Fiche', show: function () { return true; }, count: null, render: renderFiche },
    { key: 'actions', label: 'Actions', show: function (d) { return !!(d.access && d.access.actions) && Array.isArray(d.actions); },
      count: function (d) { return d.actions.length; }, render: renderActions },
    { key: 'facturation', label: 'Facturation', show: function (d) { return !!(d.access && d.access.billing) && !!d.billing; },
      count: null, render: renderBilling },
    { key: 'factures', label: 'Factures', show: function (d) { return !!(d.access && d.access.invoices) && Array.isArray(d.invoices); },
      count: function (d) { return d.invoices.length; }, render: renderInvoices },
    { key: 'audiences', label: 'Audiences', show: function () { return true; },
      count: function (d) { return (d.audiences || []).length; }, render: renderAudiences },
    { key: 'documents', label: 'Documents', show: function () { return true; },
      count: function (d) { return (d.documents || []).length; }, render: renderDocuments },
  ];

  function visibleTabs(d) {
    return TABS.filter(function (t) { return t.show(d); });
  }

  function docIndex(d) {
    var map = {};
    (d.documents || []).forEach(function (doc) { map[doc.id] = doc; });
    return map;
  }

  function docLink(d, id) {
    var doc = docIndex(d)[id];
    if (!doc) return 'Document #' + id;
    var label = doc.name || 'Document #' + id;
    return doc.path ? fileLink(doc.path, label) : label + ' (fichier absent)';
  }

  function docLinks(d, ids) {
    var seen = {};
    var list = (ids || []).filter(function (id) { return !seen[id] && (seen[id] = true); });
    return list.length ? h('div', { class: 'links' }, list.map(function (id) { return h('span', null, docLink(d, id)); })) : null;
  }

  function renderDossier(d, tabKey) {
    var tabs = visibleTabs(d);
    var tab = tabs.filter(function (t) { return t.key === tabKey; })[0];
    if (!tab) {
      location.replace(dossierHref(d.id));
      return;
    }
    var info = d.dossier || {};
    var client = info.client || {};
    var clientName = client.company_name || client.full_name;
    document.title = txt(d.dossier_number) + ' — ' + (manifest.cabinet && manifest.cabinet.name || 'Export');

    var nav = h('nav', { class: 'tabs', 'aria-label': 'Sections du dossier' }, tabs.map(function (t) {
      return h('a', { href: dossierHref(d.id, t.key), 'aria-current': t.key === tab.key ? 'page' : null },
        t.label, t.count ? h('span', { class: 'n' }, '(' + t.count(d) + ')') : null);
    }));

    var placeholder = tab.key === 'fiche' ? 'Filtrer les étapes et diligences…' : 'Filtrer les lignes de cet onglet…';
    app.replaceChildren(
      h('p', { class: 'crumb no-print' }, h('a', { href: '#/' }, '← Tous les dossiers')),
      h('h1', { class: 'dossier-title' }, txt(d.dossier_number) + (info.object ? ' — ' + info.object : '')),
      h('p', { class: 'dossier-meta' }, [clientName, info.status].filter(Boolean).join(' · ')),
      nav,
      filterable(placeholder, tab.render(d)));
  }

  /* Fiche */
  function renderFiche(d) {
    var info = d.dossier || {};
    var client = info.client || {};
    var stats = d.stats || {};
    var tabs = visibleTabs(d).map(function (t) { return t.key; });

    function tile(label, value, tab, tone) {
      if (value === null || value === undefined) return null;
      var attrs = { class: 'tile' + (tone ? ' ' + tone : '') };
      var body = [h('b', null, String(value)), h('span', null, label)];
      return tab && tabs.indexOf(tab) !== -1
        ? h('a', Object.assign({ href: dossierHref(d.id, tab) }, attrs), body)
        : h('div', attrs, body);
    }

    var totals = d.invoice_totals;
    var tiles = h('div', { class: 'tiles' },
      tile('Documents', stats.documents, 'documents'),
      tile('Audiences', stats.audiences, 'audiences'),
      tile('Étapes', stats.steps),
      tile('Diligences', stats.diligences),
      tile('Actions', stats.actions, 'actions'),
      tile('Factures', stats.invoices, 'factures'),
      tile('Paiements', stats.payments, 'factures'),
      totals ? tile('Facturé', fmtMoney(totals.total, currencyOf(d)), 'factures') : null,
      totals ? tile('Reste à payer', fmtMoney(totals.remaining, currencyOf(d)), 'factures', totals.remaining > 0 ? 'bad' : 'ok') : null);

    var general = h('section', { class: 'card' },
      h('h3', null, 'Dossier'),
      definitionList([
        ['Numéro', d.dossier_number],
        ['Objet', info.object],
        ['Statut', info.status],
        ['Issue', info.outcome],
        ['Phase', info.lifecycle_phase],
        ['Ouverture', info.opening_date ? fmtDate(info.opening_date) : null],
        ['Clôture', info.closing_date ? fmtDate(info.closing_date) : null],
        ['Priorité', info.priority_level],
        ['N° d\'affaire', info.case_number],
        ['Tribunal', info.court_name],
        ['Juridiction', info.jurisdiction && info.jurisdiction.name],
        ['Type de procédure', info.procedure_type && info.procedure_type.name],
        ['Avocat responsable', info.lawyer && info.lawyer.full_name],
        ['Partie adverse', info.opposing_party_name],
        ['Avocat adverse', info.opposing_party_lawyer],
        ['Demande initiale', info.initial_request ? pre(info.initial_request) : null],
        ['Décision finale', info.final_decision ? pre(info.final_decision) : null],
      ]));

    var clientCard = h('section', { class: 'card' },
      h('h3', null, 'Client'),
      definitionList([
        ['Nom', client.full_name],
        ['Société', client.company_name],
        ['Code client', client.customer_code],
        ['E-mail', client.email],
        ['Téléphone', client.phone],
        ['Adresse', client.address],
      ]));

    var sqlLink = d.sql ? h('p', { class: 'muted' }, 'Script SQL du dossier : ', fileLink(d.sql, d.sql)) : null;

    var steps = d.steps || [];
    var stepsTable = table([
      { label: 'Étape', cell: function (s) { return [txt(s.title), sub(s.description)]; } },
      { label: 'Type', cell: function (s) { return txt(s.type_label || s.type); } },
      { label: 'Statut', cell: function (s) { return badge(s.status_label) || DASH; } },
      { label: 'Prévue', cell: function (s) { return fmtDate(s.scheduled_date); } },
      { label: 'Terminée', cell: function (s) { return fmtDate(s.completed_date); } },
    ], steps, 'Aucune étape.');

    var diligences = d.diligences || [];
    var diligencesTable = table([
      { label: 'Diligence', cell: function (x) {
        return [txt(x.title), x.confidential ? badge('Confidentielle', 'warn') : null, diligenceDetails(x)];
      } },
      { label: 'Type', cell: function (x) { return txt(x.type); } },
      { label: 'Statut', cell: function (x) { return badge(x.status) || DASH; } },
      { label: 'Avocat', cell: function (x) { return txt(x.assigned_lawyer && x.assigned_lawyer.full_name); } },
      { label: 'Échéance', cell: function (x) { return fmtDate(x.deadline); } },
      { label: 'Heures', num: true, cell: function (x) {
        return x.actual_hours === undefined && x.budget_hours === undefined
          ? DASH : fmtNumber(x.actual_hours) + ' / ' + fmtNumber(x.budget_hours);
      } },
    ], diligences, 'Aucune diligence.');

    return h('div', null, tiles, general, clientCard, sqlLink,
      h('h2', null, 'Étapes'), stepsTable,
      h('h2', null, 'Diligences'), diligencesTable);
  }

  function diligenceDetails(x) {
    if (!x.scope && !x.findings_summary && !x.recommendations) return null;
    return h('details', null, h('summary', null, 'Détails'),
      h('div', { class: 'detail-body' },
        x.scope ? [h('strong', null, 'Périmètre'), pre(x.scope)] : null,
        x.findings_summary ? [h('strong', null, 'Constats'), pre(x.findings_summary)] : null,
        x.recommendations ? [h('strong', null, 'Recommandations'), pre(x.recommendations)] : null));
  }

  function currencyOf(d) {
    var first = (d.invoices || [])[0];
    return (first && first.currency) || (d.billing && d.billing.profile && d.billing.profile.currency) || 'XAF';
  }

  /* Actions */
  function renderActions(d) {
    var actions = d.actions || [];
    var byId = {};
    actions.forEach(function (a) { byId[a.id] = a; });
    var audiences = {};
    (d.audiences || []).forEach(function (a) { audiences[a.id] = a; });

    function details(a) {
      var docs = (a.documents || []).map(function (l) { return h('span', null, docLink(d, l.document_id), ' (' + txt(l.role) + ')'); });
      var auds = (a.audiences || []).map(function (l) {
        var au = audiences[l.audience_id];
        return h('span', null, 'Audience du ' + (au ? fmtDate(au.date) : '#' + l.audience_id), ' (' + txt(l.role) + ')');
      });
      var rels = (a.relations || []).map(function (l) {
        var other = byId[l.action_id];
        return h('span', null, (other ? txt(other.title) : 'Action ' + l.action_id), ' (' + txt(l.role) + ')');
      });
      if (!a.result_notes && !a.result_code && !a.billing_reason && !docs.length && !auds.length && !rels.length) return null;
      return h('details', null, h('summary', null, 'Détails'),
        h('div', { class: 'detail-body' },
          a.result_code ? h('p', null, h('strong', null, 'Résultat : '), a.result_code) : null,
          pre(a.result_notes),
          a.billing_reason ? h('p', null, h('strong', null, 'Motif de facturation : '), a.billing_reason) : null,
          docs.length ? h('p', null, h('strong', null, 'Documents : '), docs) : null,
          auds.length ? h('p', null, h('strong', null, 'Audiences : '), auds) : null,
          rels.length ? h('p', null, h('strong', null, 'Actions liées : '), rels) : null));
    }

    return table([
      { label: 'Action', cell: function (a) {
        return [txt(a.title), a.is_required ? badge('Obligatoire') : null, sub(a.definition_label), details(a)];
      } },
      { label: 'Statut', cell: function (a) { return badge(a.status_label || a.status, statusTone(a.status)) || DASH; } },
      { label: 'Priorité', cell: function (a) { return txt(a.priority_label || a.priority); } },
      { label: 'Responsable', cell: function (a) { return txt(a.responsible && a.responsible.full_name); } },
      { label: 'Prévue', cell: function (a) { return fmtDate(a.planned_at); } },
      { label: 'Échéance', cell: function (a) { return fmtDate(a.due_at); } },
      { label: 'Terminée', cell: function (a) { return fmtDate(a.completed_at); } },
      { label: 'Facturation', cell: function (a) { return txt(a.billing_decision_label || a.billing_decision); } },
    ], actions, 'Aucune action sur ce dossier.');
  }

  function statusTone(status) {
    if (status === 'COMPLETED') return 'ok';
    if (status === 'CANCELLED') return 'bad';
    return null;
  }

  /* Facturation */
  function renderBilling(d) {
    var billing = d.billing || {};
    var p = billing.profile;
    var cur = (p && p.currency) || currencyOf(d);
    var profile = p
      ? h('section', { class: 'card' }, h('h3', null, 'Profil de facturation'),
        definitionList([
          ['Mode', p.mode],
          ['Devise', p.currency],
          ['TVA', p.vat_rate !== null && p.vat_rate !== undefined ? fmtPercent(p.vat_rate) : null],
          ['Forfait', p.fixed_fee !== null && p.fixed_fee !== undefined ? fmtMoney(p.fixed_fee, cur) : null],
          ['Taux horaire', p.hourly_rate !== null && p.hourly_rate !== undefined ? fmtMoney(p.hourly_rate, cur) : null],
          ['Pourcentage', p.percentage_rate !== null && p.percentage_rate !== undefined ? fmtPercent(p.percentage_rate) : null],
          ['Base du pourcentage', p.percentage_base !== null && p.percentage_base !== undefined ? fmtMoney(p.percentage_base, cur) : null],
          ['Frais d\'ouverture', p.opening_fee_enabled ? fmtMoney(p.opening_fee, cur) : null],
          ['Vacation par défaut', p.default_vacation_rate !== null && p.default_vacation_rate !== undefined ? fmtMoney(p.default_vacation_rate, cur) : null],
          ['Honoraire de résultat', p.result_fee_enabled ? fmtPercent(p.result_fee_rate) : null],
          ['Refacturation des frais', p.rebill_expenses ? 'Oui' : 'Non'],
          ['Refacturation des débours', p.rebill_disbursements ? 'Oui' : 'Non'],
          ['Confirmé', p.is_confirmed ? 'Oui' : 'Non'],
        ]))
      : h('p', { class: 'notice' }, 'Aucun profil de facturation pour ce dossier.');

    var rules = table([
      { label: 'Code', cell: function (r) { return txt(r.code); } },
      { label: 'Type d\'honoraire', cell: function (r) { return txt(r.fee_type); } },
      { label: 'Déclencheur', cell: function (r) { return txt(r.trigger); } },
      { label: 'Catégorie', cell: function (r) { return txt(r.category); } },
      { label: 'Calcul', cell: function (r) { return txt(r.calculation_mode); } },
      { label: 'Taux', num: true, cell: function (r) { return r.rate === null || r.rate === undefined ? DASH : fmtNumber(r.rate); } },
      { label: 'Action liée', cell: function (r) { return txt(r.action_definition_code); } },
      { label: 'Active', cell: function (r) { return r.is_active ? 'Oui' : 'Non'; } },
    ], billing.rules || [], 'Aucune règle de facturation.');

    var items = table([
      { label: 'Élément', cell: function (i) { return [txt(i.label), sub(i.category + ' · ' + i.source_type)]; } },
      { label: 'Date', cell: function (i) { return fmtDate(i.occurred_at); } },
      { label: 'Quantité', num: true, cell: function (i) { return fmtNumber(i.quantity) + (i.unit_label ? ' ' + i.unit_label : ''); } },
      { label: 'Prix unitaire', num: true, cell: function (i) { return fmtMoney(i.unit_price, i.currency || cur); } },
      { label: 'HT', num: true, cell: function (i) { return fmtMoney(i.net_amount, i.currency || cur); } },
      { label: 'TVA', num: true, cell: function (i) { return fmtMoney(i.tax_amount, i.currency || cur); } },
      { label: 'TTC', num: true, cell: function (i) { return fmtMoney(i.gross_amount, i.currency || cur); } },
      { label: 'Statut', cell: function (i) { return badge(i.status, i.invoice_line_id ? 'ok' : null) || DASH; } },
      { label: 'Facturé', cell: function (i) { return i.invoice_line_id ? 'Oui' : 'Non'; } },
    ], billing.items || [], 'Aucun élément facturable.');

    return h('div', null, profile, h('h2', null, 'Règles'), rules, h('h2', null, 'Éléments facturables'), items);
  }

  /* Factures et paiements */
  function invoiceBadges(f) {
    return [
      f.draft ? badge('Brouillon', 'warn') : null,
      f.cancelled ? badge('Annulée', 'bad') : null,
      f.credit ? badge('Avoir') : null,
    ];
  }

  function paymentsTable(f) {
    var payments = f.payments || [];
    if (!payments.length) return h('p', { class: 'muted' }, 'Aucun paiement.');
    return h('div', { class: 'table-wrap' }, h('table', { class: 'mini' },
      h('thead', null, h('tr', null,
        ['Date', 'Mode', 'Référence', 'Statut', 'Montant'].map(function (c, i) { return h('th', { class: i === 4 ? 'num' : null }, c); }))),
      h('tbody', null, payments.map(function (p) {
        return h('tr', null,
          h('td', null, fmtDate(p.date)),
          h('td', null, txt(p.mode_label)),
          h('td', null, txt(p.reference || p.cheque_number)),
          h('td', null, badge(p.status_label, p.validated ? 'ok' : 'warn'), p.validated ? null : badge('non compté', 'warn')),
          h('td', { class: 'num' }, fmtMoney(p.amount, f.currency)));
      }))));
  }

  function renderInvoices(d) {
    var invoices = d.invoices || [];
    var t = d.invoice_totals;
    var cur = currencyOf(d);
    var tiles = t
      ? h('div', { class: 'tiles' },
        h('div', { class: 'tile' }, h('b', null, String(t.count)), h('span', null, 'Factures')),
        h('div', { class: 'tile' }, h('b', null, fmtMoney(t.total, cur)), h('span', null, 'Total facturé')),
        h('div', { class: 'tile ok' }, h('b', null, fmtMoney(t.paid, cur)), h('span', null, 'Payé')),
        h('div', { class: 'tile ' + (t.remaining > 0 ? 'bad' : 'ok') }, h('b', null, fmtMoney(t.remaining, cur)), h('span', null, 'Reste à payer')))
      : null;
    var notes = [];
    if (t && t.cancelled && t.cancelled.count) notes.push(t.cancelled.count + ' annulée(s) hors totaux');
    if (t && t.drafts && t.drafts.count) notes.push(t.drafts.count + ' brouillon(s) hors totaux');
    if (t && t.credits && t.credits.count) notes.push(t.credits.count + ' avoir(s) déduit(s)');
    notes.push('seuls les paiements validés sont comptés');

    var list = table([
      { label: 'Facture', cell: function (f) {
        return [h('a', { href: dossierHref(d.id, 'facture/' + encodeURIComponent(f.id)) }, txt(f.numero)),
          ' ', invoiceBadges(f), sub(f.label)];
      } },
      { label: 'Statut', cell: function (f) { return txt(f.status_label); } },
      { label: 'Date', cell: function (f) { return [fmtDate(f.date), f.due_date ? sub('Échéance ' + fmtDate(f.due_date)) : null]; } },
      { label: 'TTC', num: true, cell: function (f) { return fmtMoney(f.amount_ttc, f.currency); } },
      { label: 'Payé', num: true, cell: function (f) { return fmtMoney(f.paid, f.currency); } },
      { label: 'Reste', num: true, cell: function (f) { return fmtMoney(f.remaining, f.currency); } },
      { label: 'Paiements', cell: function (f) {
        var n = (f.payments || []).length;
        return n ? h('details', null, h('summary', null, n + (n > 1 ? ' paiements' : ' paiement')), paymentsTable(f)) : 'Aucun';
      } },
      { label: 'Document', cell: function (f) {
        return h('div', { class: 'btn-row' },
          h('a', { class: 'btn', href: dossierHref(d.id, 'facture/' + encodeURIComponent(f.id)) }, 'Voir / imprimer'),
          f.pdf ? fileLink(f.pdf, 'PDF', { class: 'btn' }) : null);
      } },
    ], invoices, 'Aucune facture sur ce dossier.');

    return h('div', null, tiles, h('p', { class: 'muted' }, 'Totaux : ' + notes.join(' · ') + '.'), list);
  }

  /* Facture imprimable */
  function renderInvoiceSheet(d, invoiceId) {
    var f = (d.invoices || []).filter(function (x) { return String(x.id) === invoiceId; })[0];
    if (!f || !d.access || !d.access.invoices) {
      location.replace(dossierHref(d.id, 'factures'));
      return;
    }
    var cabinet = manifest.cabinet || {};
    var info = d.dossier || {};
    var client = info.client || {};
    var cur = f.currency;
    var title = (f.credit ? 'Avoir' : 'Facture') + ' n° ' + txt(f.numero);
    document.title = title + ' — ' + txt(d.dossier_number);

    var lines = h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null,
        ['Désignation', 'Qté', 'Prix unitaire', 'HT', 'TVA', 'TTC'].map(function (c, i) { return h('th', { class: i ? 'num' : null }, c); }))),
      h('tbody', null, (f.lines || []).length
        ? f.lines.map(function (l) {
          return h('tr', null,
            h('td', null, txt(l.label), sub(l.category)),
            h('td', { class: 'num' }, fmtNumber(l.quantity) + (l.unit_label ? ' ' + l.unit_label : '')),
            h('td', { class: 'num' }, fmtMoney(l.unit_price, cur)),
            h('td', { class: 'num' }, fmtMoney(l.net_amount, cur)),
            h('td', { class: 'num' }, fmtMoney(l.tax_amount, cur)),
            h('td', { class: 'num' }, fmtMoney(l.gross_amount, cur)));
        })
        : h('tr', null, h('td', { colspan: 6 }, txt(f.label))))));

    var payments = h('section', null,
      h('h3', null, 'Paiements'),
      paymentsTable(f));

    function row(label, value, cls) {
      return h('div', { class: cls }, h('span', null, label), h('span', null, value));
    }

    app.replaceChildren(
      h('div', { class: 'invoice-bar' },
        h('a', { href: dossierHref(d.id, 'factures') }, '← Factures du dossier'),
        h('span', { class: 'spacer' }),
        f.pdf ? fileLink(f.pdf, 'Ouvrir le PDF', { class: 'btn' }) : null,
        h('button', { type: 'button', class: 'btn primary', onclick: function () { window.print(); } }, 'Imprimer / PDF')),
      h('article', { class: 'sheet' },
        h('div', { class: 'sheet-head' },
          h('div', { class: 'party' },
            h('h1', null, cabinet.name || 'Cabinet'),
            cabinet.address ? h('p', null, cabinet.address) : null,
            cabinet.phone ? h('p', null, cabinet.phone) : null,
            cabinet.email ? h('p', null, cabinet.email) : null),
          h('div', { class: 'party' },
            h('h3', null, title),
            h('p', null, 'Date : ' + fmtDate(f.date)),
            f.due_date ? h('p', null, 'Échéance : ' + fmtDate(f.due_date)) : null,
            h('p', null, 'Dossier : ' + txt(d.dossier_number)),
            h('p', null, invoiceBadges(f), ' ', badge(f.status_label)))),
        h('div', { class: 'sheet-head' },
          h('div', { class: 'party' },
            h('h3', null, 'Client'),
            h('p', null, txt(client.company_name || client.full_name)),
            client.address ? h('p', null, client.address) : null,
            client.email ? h('p', null, client.email) : null),
          info.object ? h('div', { class: 'party' }, h('h3', null, 'Objet'), h('p', null, info.object)) : null),
        f.label ? h('p', null, h('strong', null, f.label)) : null,
        lines,
        h('div', { class: 'totals' },
          row('Total HT', fmtMoney(f.amount_ht, cur)),
          row('TVA (' + fmtNumber(f.vat_rate) + ' %)', fmtMoney(f.vat_amount, cur)),
          row('Total TTC', fmtMoney(f.amount_ttc, cur), 'grand'),
          row('Payé', fmtMoney(f.paid, cur)),
          row('Reste à payer', fmtMoney(f.remaining, cur), 'due')),
        payments,
        h('p', { class: 'sheet-foot' }, 'Seuls les paiements validés sont déduits. Document extrait de l\'export du ' + fmtDateTime(manifest.generated_at) + '.')));
  }

  /* Audiences */
  function renderAudiences(d) {
    var audiences = d.audiences || [];
    if (!audiences.length) return h('p', { class: 'notice' }, 'Aucune audience sur ce dossier.');
    return h('div', null, audiences.map(function (a) {
      var hasDecision = a.decision || a.decision_text || a.decision_outcome || a.decision_notes || a.decision_date;
      var when = fmtDate(a.date) + (a.time ? ' à ' + String(a.time).slice(0, 5) : '');
      return h('section', { class: 'card item' },
        h('h3', null, 'Audience du ' + when, ' ', badge(a.type_label), ' ', badge(a.status_label)),
        definitionList([
          ['Juridiction', a.jurisdiction && a.jurisdiction.name],
          ['Salle', a.room],
          ['Juge', a.judge_name],
          ['Durée', a.duration_minutes ? a.duration_minutes + ' min' : null],
          ['Issue', a.outcome],
          ['Renvoyée au', a.postponed_to ? fmtDate(a.postponed_to) : null],
          ['Notes', pre(a.notes)],
        ]),
        hasDecision ? h('div', null, h('h3', null, 'Décision' + (a.decision_date ? ' du ' + fmtDate(a.decision_date) : '')),
          definitionList([
            ['Sens', a.decision],
            ['Issue', a.decision_outcome],
            ['Dispositif', pre(a.decision_text)],
            ['Notes', pre(a.decision_notes)],
            ['Documents', docLinks(d, a.decision_document_ids)],
          ])) : null,
        a.report_content || (a.report_document_ids || []).length
          ? h('div', null, h('h3', null, 'Rapport d\'audience' + (a.report_date ? ' du ' + fmtDate(a.report_date) : '')),
            pre(a.report_content), docLinks(d, a.report_document_ids))
          : null,
        (a.document_ids || []).length ? h('div', null, h('h3', null, 'Documents de l\'audience'), docLinks(d, a.document_ids)) : null);
    }));
  }

  /* Documents */
  function renderDocuments(d) {
    return table([
      { label: 'Document', cell: function (doc) {
        return doc.path ? fileLink(doc.path, txt(doc.name)) : [txt(doc.name), sub('Fichier absent de l\'export')];
      } },
      { label: 'Statut', cell: function (doc) { return txt(doc.status); } },
      { label: 'Type', cell: function (doc) { return txt(doc.mimetype); } },
      { label: 'Taille', num: true, cell: function (doc) { return fmtSize(doc.size); } },
      { label: 'Ajouté le', cell: function (doc) { return fmtDate(doc.created_at); } },
    ], d.documents || [], 'Aucun document sur ce dossier.');
  }

  /* ---------- Routage par hash ---------- */

  function showError(message) {
    app.replaceChildren(h('p', { class: 'notice error', role: 'alert' }, message),
      h('p', null, h('a', { href: '#/' }, '← Tous les dossiers')));
  }

  function route() {
    window.scrollTo(0, 0);
    var parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(function (p) {
      try { return decodeURIComponent(p); } catch (e) { return p; }
    });
    if (parts[0] !== 'dossier' || !parts[1]) {
      renderHome();
      return;
    }
    var id = Number(parts[1]);
    app.replaceChildren(h('p', { class: 'muted' }, 'Chargement…'));
    loadDossier(id).then(function (d) {
      // Une navigation plus récente a pu remplacer celle-ci pendant le chargement.
      if (location.hash.indexOf('/' + parts[1]) === -1) return;
      if (!d) return showError('Dossier introuvable dans cet export.');
      if (parts[2] === 'facture' && parts[3]) renderInvoiceSheet(d, parts[3]);
      else renderDossier(d, parts[2] || 'fiche');
    }).catch(function (e) {
      showError(e.message || 'Chargement impossible.');
    });
  }

  /* ---------- Démarrage ---------- */

  if (!manifest || !Array.isArray(manifest.dossiers)) {
    showError('Données de l\'export introuvables : le fichier data/index.js est absent ou illisible. Décompressez l\'archive complète avant d\'ouvrir cette page.');
    return;
  }
  var cab = manifest.cabinet;
  document.getElementById('brand').textContent = (cab && cab.name) || 'Export de dossiers';
  document.getElementById('brand-sub').textContent = 'Export du ' + fmtDateTime(manifest.generated_at);
  window.addEventListener('hashchange', route);
  route();
})();
